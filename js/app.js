/* ═══════════════════════════════════════════════════════════════
   PROJECT ZENITH · application orchestrator
   Wires the service layer (SGP4 TLE propagation, dual ephemeris
   engines, live ISS telemetry) into the UI: location pipeline,
   radar dashboard, near-zenith detection, AI guide, time travel,
   events calendar and the detail modal.
   ═══════════════════════════════════════════════════════════════ */

(() => {
  const $ = (sel) => document.querySelector(sel);
  const COMPASS = ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE', 'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW'];
  const compass = (az) => COMPASS[Math.round(az / 22.5) % 16];
  const DIR_WORDS = { N: 'northern', E: 'eastern', S: 'southern', W: 'western' };
  const dirWord = (az) => {
    const c = COMPASS[Math.round(az / 45) * 2 % 16]; // snap to 8-wind
    return c.length === 1 ? DIR_WORDS[c] : `${DIR_WORDS[c[0]]?.slice(0, -3)}-${DIR_WORDS[c[1]]}`;
  };

  /* ── state ────────────────────────────────────────────────── */
  const state = {
    lat: 28.6139,
    lon: 77.209,
    place: 'New Delhi, India',
    offsetHours: 0,
    objects: [],
    filter: 'all',
    sunAlt: 0,
  };
  const now = () => new Date(Date.now() + state.offsetHours * 3600000);

  /* ── formatting helpers ───────────────────────────────────── */
  const fmtTime = (d) => d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  const fmtDeg = (v) => `${v.toFixed(1)}°`;
  function fmtDay(d, ref = new Date()) {
    const dd = new Date(d); dd.setHours(0, 0, 0, 0);
    const rr = new Date(ref); rr.setHours(0, 0, 0, 0);
    const diff = Math.round((dd - rr) / 86400000);
    if (diff === 0) return 'Today';
    if (diff === 1) return 'Tomorrow';
    return d.toLocaleDateString([], { month: 'short', day: 'numeric' });
  }
  function fmtIn(ms) {
    if (ms < 0) return 'now';
    const h = Math.floor(ms / 3600000), m = Math.round((ms % 3600000) / 60000);
    return h > 0 ? `in ${h}h ${m}m` : `in ${m}m`;
  }
  const fmtKm = (km) => km >= 1e6 ? `${(km / 1e6).toFixed(2)} M km` : `${Math.round(km).toLocaleString()} km`;

  function toast(msg) {
    const el = $('#toast');
    el.textContent = msg;
    el.classList.add('is-show');
    clearTimeout(el._t);
    el._t = setTimeout(() => el.classList.remove('is-show'), 3200);
  }

  /* ── satellite helpers (SGP4 with legacy-model fallback) ──── */
  function satObserve(id, when) {
    const o = TLEService.has(id) ? TLEService.observe(id, when, state.lat, state.lon) : null;
    if (o) return { ...o, source: `SGP4 · ${TLEService.getSource() === 'celestrak-live' ? 'CelesTrak live TLE' : 'CelesTrak TLE (cached)'}` };
    // ultra-fallback: circular-orbit model from the internal engine
    const sub = Astro.satSubpoint(SAT_PARAMS[id], when);
    const aa = Astro.satAltAz(sub, state.lat, state.lon);
    return { ...sub, ...aa, source: 'internal circular-orbit model' };
  }

  const passCache = new Map();
  function satNextPass(id, when) {
    const key = `${id}|${state.lat.toFixed(2)}|${state.lon.toFixed(2)}|${Math.floor(when.getTime() / 600000)}`;
    if (passCache.has(key)) return passCache.get(key);
    const pass = TLEService.has(id)
      ? TLEService.findPasses(id, state.lat, state.lon, when, 24, 10, 1)[0] || null
      : Astro.findPasses(SAT_PARAMS[id], state.lat, state.lon, when, 24, 10, 1)[0] || null;
    if (passCache.size > 200) passCache.clear();
    passCache.set(key, pass);
    return pass;
  }

  function issSubpoint(when) {
    const live = ISSService.position(state.offsetHours);
    if (live) return live;
    return satObserve('iss', when);
  }

  let trackCache = { key: '', track: [] };
  function issGroundTrack(when) {
    const key = `${state.offsetHours}|${Math.floor(when.getTime() / 60000)}`;
    if (trackCache.key === key) return trackCache.track;
    const track = [];
    for (let m = -46; m <= 46; m += 2) {
      const p = satObserve('iss', new Date(when.getTime() + m * 60000));
      track.push({ lat: p.lat, lon: p.lon });
    }
    trackCache = { key, track };
    return track;
  }

  /* ── per-object ephemeris snapshot ────────────────────────── */
  function computeObject(obj, when, sunAlt) {
    const o = { ...obj, color: COLORS[obj.type] };

    if (obj.sat) {
      const s = satObserve(obj.sat, when);
      o.alt = s.alt; o.az = s.az; o.rangeKm = s.rangeKm; o.sub = s;
      o.source = obj.sat === 'iss' && ISSService.position(state.offsetHours)
        ? 'wheretheiss.at live telemetry + SGP4' : s.source;
      if (o.alt > 10) o.status = sunAlt < -6 ? ['Visible now', 'visible'] : ['Overhead in daylight', 'daylight'];
      else if (o.alt > 0) o.status = ['Low on horizon', 'low'];
      else o.status = ['Below horizon', 'hidden'];
      const pass = satNextPass(obj.sat, when);
      o.next = pass ? `${fmtDay(pass.start, when)} ${fmtTime(pass.start)} · max ${Math.round(pass.maxEl)}°` : 'No pass in 24 h';
      o.nextDate = pass ? pass.start : null;
      o.nextPassEl = pass ? pass.maxEl : 0;
      o.distText = `${fmtKm(s.rangeKm ?? 0)} from you · orbit ${Math.round(s.altKm)} km`;
    } else if (obj.body) {
      const b = EphemerisService.body(obj.body, when, state.lat, state.lon);
      o.alt = b.alt; o.az = b.az;
      o.source = EphemerisService.engineName;
      if (obj.id === 'sun') {
        o.status = o.alt > 0 ? ['Daylight source', 'daylight'] : ['Below horizon · night', 'hidden'];
      } else if (o.alt > 10) {
        o.status = sunAlt < -3 ? ['Visible now', 'visible']
          : obj.id === 'moon' ? ['Above horizon', 'low'] : ['Up in daylight', 'daylight'];
      } else if (o.alt > 0) o.status = ['Low on horizon', 'low'];
      else o.status = ['Below horizon', 'hidden'];
      if (o.alt <= 0) {
        const rise = EphemerisService.nextRise(obj.body, when, state.lat, state.lon);
        o.next = rise ? `Rises ${fmtDay(rise, when)} ${fmtTime(rise)}` : 'Not visible from this latitude';
        o.nextDate = rise;
      } else {
        o.next = `Above horizon · ${compass(o.az)} sky`;
        o.nextDate = null;
      }
      o.distText = obj.id === 'moon' ? fmtKm(b.distKm) : `${b.distAU.toFixed(2)} AU (${fmtKm(b.distKm)})`;
    } else {
      // constellation anchor star (fixed RA/Dec)
      const aa = EphemerisService.fixed(obj.star.ra, obj.star.dec, when, state.lat, state.lon);
      o.alt = aa.alt; o.az = aa.az;
      o.source = 'Hipparcos catalogue · fixed J2000 coordinates';
      if (o.alt > 10) o.status = sunAlt < -9 ? ['Visible now', 'visible'] : ['Up in daylight', 'daylight'];
      else if (o.alt > 0) o.status = ['Low on horizon', 'low'];
      else o.status = ['Below horizon', 'hidden'];
      if (o.alt <= 0) {
        const rise = EphemerisService.nextRiseFixed(obj.star.ra, obj.star.dec, when, state.lat, state.lon);
        o.next = rise ? `Rises ${fmtDay(rise, when)} ${fmtTime(rise)}` : 'Not visible from this latitude';
        o.nextDate = rise;
      } else {
        o.next = `Above horizon · ${compass(o.az)} sky`;
        o.nextDate = null;
      }
      o.distText = obj.dist;
    }

    o.zenithDist = 90 - o.alt; // angular distance from zenith
    return o;
  }

  function recompute() {
    const t = now();
    const sun = EphemerisService.body('sun', t, state.lat, state.lon);
    state.sunAlt = sun.alt;
    state.objects = OBJECTS.map((o) => computeObject(o, t, sun.alt));
    updateLocatorCard(t, sun);
    updateCards();
    updateZenithList();
    updateZenithBanner();
    $('#statVisible').textContent = state.objects.filter((o) => o.alt > 0).length;
  }

  /* ── locator card ─────────────────────────────────────────── */
  function updateLocatorCard(t, sun) {
    $('#locName').textContent = state.place;
    $('#locLat').textContent = `${state.lat.toFixed(4)}°`;
    $('#locLon').textContent = `${state.lon.toFixed(4)}°`;
    const lst = Astro.norm360(Astro.gmst(t) + state.lon) / 15;
    const lh = Math.floor(lst), lm = Math.floor((lst - lh) * 60);
    $('#locLST').textContent = `${String(lh).padStart(2, '0')}h ${String(lm).padStart(2, '0')}m`;
    const s = sun.alt;
    $('#locSun').textContent =
      s > 0 ? `Day · +${s.toFixed(0)}°`
      : s > -6 ? 'Civil twilight'
      : s > -12 ? 'Nautical twilight'
      : s > -18 ? 'Astro twilight'
      : 'Night';
  }

  /* ── near-zenith detection ────────────────────────────────── */
  function updateZenithBanner() {
    const above = state.objects.filter((o) => o.alt > 0);
    const el = $('#zenithBanner');
    if (!above.length) {
      el.innerHTML = `<span class="zenith-banner__label">NEAREST ZENITH OBJECT</span>
        <strong>—</strong><span class="zenith-banner__meta">nothing above the horizon right now</span>`;
      return;
    }
    const best = above.reduce((a, b) => (a.zenithDist < b.zenithDist ? a : b));
    el.innerHTML = `<span class="zenith-banner__label">NEAREST ZENITH OBJECT</span>
      <strong>${best.name}</strong>
      <span class="zenith-banner__meta">${best.zenithDist.toFixed(1)}° from zenith · ${compass(best.az)} sky</span>`;
  }

  /* ── object cards (patched in place to avoid flicker) ─────── */
  function cardHTML(o) {
    return `
      <div class="obj-card__top">
        <div><span class="obj-card__type">${o.kind}</span><h4>${o.name}</h4></div>
        <span class="obj-card__status status--${o.status[1]}" data-f="status">${o.status[0]}</span>
      </div>
      <div class="obj-card__data">
        <div><span>ALTITUDE</span><strong data-f="alt">${fmtDeg(o.alt)}</strong></div>
        <div><span>AZIMUTH</span><strong data-f="az">${fmtDeg(o.az)} ${compass(o.az)}</strong></div>
        <div><span>FROM ZENITH</span><strong data-f="zd">${fmtDeg(o.zenithDist)}</strong></div>
        <div><span>NEXT PASS / RISE</span><strong data-f="next">${o.next}</strong></div>
      </div>
      <div class="obj-card__fact">${o.fact}</div>`;
  }

  function updateCards() {
    const grid = $('#cardsGrid');
    const wanted = state.objects.filter((o) => state.filter === 'all' || o.type === state.filter);
    const existing = new Map([...grid.children].map((el) => [el.dataset.id, el]));
    for (const [id, el] of existing) if (!wanted.find((o) => o.id === id)) { el.remove(); existing.delete(id); }
    wanted.forEach((o, i) => {
      let el = existing.get(o.id);
      if (!el) {
        el = document.createElement('article');
        el.className = 'obj-card';
        el.dataset.id = o.id;
        el.style.setProperty('--accent', o.color);
        el.style.animationDelay = `${Math.min(i * 0.05, 0.5)}s`;
        el.innerHTML = cardHTML(o);
        el.addEventListener('click', () => openModal(o.id));
        grid.appendChild(el);
      } else {
        el.querySelector('[data-f="status"]').textContent = o.status[0];
        el.querySelector('[data-f="status"]').className = `obj-card__status status--${o.status[1]}`;
        el.querySelector('[data-f="alt"]').textContent = fmtDeg(o.alt);
        el.querySelector('[data-f="az"]').textContent = `${fmtDeg(o.az)} ${compass(o.az)}`;
        el.querySelector('[data-f="zd"]').textContent = fmtDeg(o.zenithDist);
        el.querySelector('[data-f="next"]').textContent = o.next;
      }
    });
  }

  $('#filterTabs').addEventListener('click', (e) => {
    const btn = e.target.closest('.filter-tab');
    if (!btn) return;
    state.filter = btn.dataset.filter;
    document.querySelectorAll('.filter-tab').forEach((b) => b.classList.toggle('is-active', b === btn));
    $('#cardsGrid').innerHTML = '';
    updateCards();
  });

  /* ── zenith HUD list (orbit section) ──────────────────────── */
  function updateZenithList() {
    const ul = $('#zenithList');
    const high = state.objects.filter((o) => o.alt > 55).sort((a, b) => b.alt - a.alt).slice(0, 5);
    ul.innerHTML = high.length
      ? high.map((o) => `<li><span>${o.name}</span><small>${fmtDeg(o.alt)} ${compass(o.az)}</small></li>`).join('')
      : '<li class="muted">Nothing near zenith right now</li>';
  }

  /* ── data-source status chips ─────────────────────────────── */
  function updateDataStatus() {
    const tleLive = TLEService.getSource() === 'celestrak-live';
    const issLive = ISSService.isLive();
    $('#dataStatus').innerHTML = `
      <span class="chip ${tleLive ? 'chip--live' : ''}">TLE · ${tleLive ? 'CelesTrak live' : 'cached set · offline-ready'}</span>
      <span class="chip chip--live">EPHEMERIS · ${EphemerisService.usingVendor ? 'astronomy-engine' : 'internal engine'}</span>
      <span class="chip ${issLive ? 'chip--live' : ''}">ISS · ${issLive ? 'live telemetry' : 'SGP4 propagation'}</span>`;
    $('#issChip').innerHTML = issLive
      ? '<span class="pulse-dot"></span> ISS · LIVE TELEMETRY'
      : '<span class="pulse-dot pulse-dot--purple"></span> ISS · SGP4 PROPAGATION';
  }

  /* ── visuals wiring ───────────────────────────────────────── */
  Visuals.createStarfield($('#starfield'));

  Visuals.createGlobe($('#globeCanvas'), () => {
    const t = now();
    return {
      lat: state.lat, lon: state.lon,
      sun: EphemerisService.sunSubpoint(t),
      iss: issSubpoint(t),
      issTrack: issGroundTrack(t),
    };
  }, (lat, lon) => {
    setLocation(lat, lon, `Picked point · ${lat.toFixed(2)}°, ${lon.toFixed(2)}°`);
    reverseGeocode(lat, lon);
  });

  Visuals.createRadar($('#radarCanvas'), () =>
    state.objects
      .filter((o) => o.alt > 0)
      .map((o) => ({ name: o.name, alt: o.alt, az: o.az, color: o.color, big: o.type === 'station' })),
  );

  Visuals.createOrbitView($('#orbitCanvas'), () => {
    const t = now();
    const tDays = Astro.d2000(t);
    const sats = Object.entries(SAT_PARAMS).map(([id, p]) => {
      const obj = state.objects.find((o) => o.sat === id);
      return {
        id,
        name: obj ? obj.name.split(' ')[0] : id,
        color: obj ? obj.color : '#4cc9ff',
        inc: p.inc,
        raan: Astro.norm360(p.raan0 + p.raanRate * tDays),
        u: Astro.norm360(p.u0 + 360 * tDays * (1440 / p.periodMin)),
        altKm: p.altKm,
        nearZenith: !!obj && obj.alt > 55,
      };
    });
    const moon = state.objects.find((o) => o.id === 'moon');
    return { sats, moonAngle: ((moon ? moon.az : 0) - 90) * Math.PI / 180 };
  });

  /* ── trajectory modal ─────────────────────────────────────── */
  const traj = Visuals.createTrajectory($('#trajCanvas'));

  function trajectorySamples(obj) {
    const t = now();
    const out = [];
    for (let m = -360; m <= 360; m += 6) {
      const when = new Date(t.getTime() + m * 60000);
      let alt;
      if (obj.sat) alt = satObserve(obj.sat, when).alt;
      else if (obj.body) alt = EphemerisService.body(obj.body, when, state.lat, state.lon).alt;
      else alt = EphemerisService.fixed(obj.star.ra, obj.star.dec, when, state.lat, state.lon).alt;
      out.push({ t: m / 60, alt: Math.max(-20, alt) });
    }
    return out;
  }

  function openModal(id) {
    const o = state.objects.find((x) => x.id === id);
    if (!o) return;
    $('#modalType').textContent = o.kind.toUpperCase();
    $('#modalName').textContent = o.name;
    const st = $('#modalStatus');
    st.textContent = o.status[0];
    st.className = `obj-card__status status--${o.status[1]}`;
    $('#modalDesc').textContent = o.desc;
    $('#modalDist').textContent = o.distText || '—';
    $('#modalAlt').textContent = `${fmtDeg(o.alt)} ${o.alt > 0 ? 'above' : 'below'} horizon · ${fmtDeg(o.zenithDist)} from zenith`;
    $('#modalAz').textContent = `${fmtDeg(o.az)} · ${compass(o.az)}`;
    $('#modalNext').textContent = o.next;
    $('#modalOrbit').textContent = o.orbit;
    $('#modalSource').textContent = o.source;
    $('#modalFact').textContent = o.fact;
    traj.setSamples(trajectorySamples(o));
    $('#modal').classList.add('is-open');
    document.body.style.overflow = 'hidden';
    traj.start();
  }
  function closeModal() {
    $('#modal').classList.remove('is-open');
    document.body.style.overflow = '';
    traj.stop();
  }
  $('#modalClose').addEventListener('click', closeModal);
  $('#modalBackdrop').addEventListener('click', closeModal);
  document.addEventListener('keydown', (e) => e.key === 'Escape' && closeModal());

  /* ── location pipeline ────────────────────────────────────── */
  function setLocation(lat, lon, place) {
    state.lat = Math.max(-90, Math.min(90, lat));
    state.lon = Astro.norm180(lon);
    state.place = place || `${lat.toFixed(3)}°, ${lon.toFixed(3)}°`;
    $('#latInput').value = state.lat.toFixed(4);
    $('#lonInput').value = state.lon.toFixed(4);
    recompute();
    renderISSEvents();
    renderSkyConditions();
    refreshGuide();
    updateTTChips();
    toast(`🔭 Eye locked on ${state.place}`);
  }

  async function reverseGeocode(lat, lon) {
    try {
      const r = await fetch(`https://api.bigdatacloud.net/data/reverse-geocode-client?latitude=${lat}&longitude=${lon}&localityLanguage=en`, { signal: AbortSignal.timeout(6000) });
      const j = await r.json();
      const name = j.city || j.locality || j.principalSubdivision;
      if (name && Math.abs(state.lat - lat) < 0.01 && Math.abs(state.lon - lon) < 0.01) {
        state.place = `${name}, ${j.countryName || ''}`.replace(/, $/, '');
        $('#locName').textContent = state.place;
      }
    } catch { /* picked-point label stays */ }
  }

  // city search: instant offline index + Open-Meteo geocoding when online
  const results = $('#searchResults');
  let searchTimer = null;
  function renderResults(list) {
    if (!list.length) { results.classList.remove('is-open'); results.innerHTML = ''; return; }
    results.innerHTML = list.slice(0, 7).map((c, i) =>
      `<button data-i="${i}"><span>${c.name}, ${c.country}</span><small>${c.lat.toFixed(2)}°, ${c.lon.toFixed(2)}°</small></button>`).join('');
    results.classList.add('is-open');
    results._list = list;
  }
  results.addEventListener('click', (e) => {
    const btn = e.target.closest('button');
    if (!btn) return;
    const c = results._list[+btn.dataset.i];
    setLocation(c.lat, c.lon, `${c.name}, ${c.country}`);
    $('#citySearch').value = `${c.name}, ${c.country}`;
    results.classList.remove('is-open');
  });
  $('#citySearch').addEventListener('input', (e) => {
    const q = e.target.value.trim().toLowerCase();
    clearTimeout(searchTimer);
    if (q.length < 2) { renderResults([]); return; }
    const local = CITIES
      .filter(([n]) => n.toLowerCase().includes(q))
      .map(([name, country, lat, lon]) => ({ name, country, lat, lon }));
    renderResults(local);
    searchTimer = setTimeout(async () => {
      try {
        const r = await fetch(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(q)}&count=6&language=en`, { signal: AbortSignal.timeout(6000) });
        const j = await r.json();
        if (!j.results) return;
        const remote = j.results.map((x) => ({ name: x.name, country: x.country || x.country_code || '', lat: x.latitude, lon: x.longitude }));
        const merged = [...local];
        for (const c of remote) {
          if (!merged.some((m) => m.name === c.name && Math.abs(m.lat - c.lat) < 0.5)) merged.push(c);
        }
        if ($('#citySearch').value.trim().toLowerCase() === q) renderResults(merged);
      } catch { /* offline — local index already shown */ }
    }, 350);
  });
  document.addEventListener('click', (e) => {
    if (!e.target.closest('.field__search') && !e.target.closest('.search-results')) results.classList.remove('is-open');
  });

  $('#applyCoords').addEventListener('click', () => {
    const lat = parseFloat($('#latInput').value);
    const lon = parseFloat($('#lonInput').value);
    if (Number.isNaN(lat) || Number.isNaN(lon) || Math.abs(lat) > 90 || Math.abs(lon) > 180) {
      toast('⚠ Coordinates out of range (lat ±90, lon ±180)');
      return;
    }
    setLocation(lat, lon, `Custom · ${lat.toFixed(3)}°, ${lon.toFixed(3)}°`);
  });

  $('#useMyLocation').addEventListener('click', () => {
    if (!navigator.geolocation) { toast('⚠ Geolocation not supported by this browser'); return; }
    toast('📡 Acquiring your position…');
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const { latitude: lat, longitude: lon } = pos.coords;
        setLocation(lat, lon, 'Your Location');
        reverseGeocode(lat, lon);
      },
      () => toast('⚠ Location permission denied — search a city instead'),
      { timeout: 10000 },
    );
  });

  /* ── AI Cosmic Guide ──────────────────────────────────────── */
  let typeTimer = null;
  function typeSegments(el, segs) {
    clearInterval(typeTimer);
    el.innerHTML = '';
    const caret = document.createElement('span');
    caret.className = 'guide__caret';
    el.appendChild(caret);
    let si = 0, ci = 0, span = null;
    typeTimer = setInterval(() => {
      if (si >= segs.length) { clearInterval(typeTimer); return; }
      const seg = segs[si];
      if (!span) {
        span = document.createElement('span');
        if (seg.c) span.className = seg.c;
        el.insertBefore(span, caret);
      }
      ci = Math.min(ci + 2, seg.t.length);
      span.textContent = seg.t.slice(0, ci);
      if (ci >= seg.t.length) { si++; ci = 0; span = null; }
    }, 18);
  }

  function buildGuideSegments() {
    const t = now();
    const segs = [];
    const push = (t_, c) => segs.push({ t: t_, c });
    const s = state.sunAlt;
    const hour = t.getHours();
    const greeting = hour < 5 ? 'Deep-night report' : hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';
    const skyDesc = s > 0 ? 'The Sun is up, so only the brightest wanderers punch through the blue. '
      : s > -12 ? 'Twilight is falling — satellite-spotting prime time, when spacecraft still catch sunlight against a darkening sky. '
      : 'The sky is fully dark. Perfect hunting conditions. ';
    push(`${greeting} — above `); push(state.place, 'hl-b'); push(`. ${skyDesc}`);

    const iss = state.objects.find((o) => o.id === 'iss');
    if (iss) {
      if (iss.alt > 10) {
        push('Right now, the ');
        push('ISS is passing above your selected location', 'hl-g');
        push(` — look ${iss.alt > 70 ? 'straight up' : `toward the ${compass(iss.az)}`}, ${Math.round(iss.alt)}° high, racing at 7.66 km/s. `);
      } else if (iss.nextDate) {
        const mins = Math.round((iss.nextDate - t) / 60000);
        if (iss.nextPassEl > 55 && mins < 120) {
          push('The '); push('ISS will pass close to zenith', 'hl-g');
          push(` in ${mins} minutes — climbing to ${Math.round(iss.nextPassEl)}° elevation. `);
        } else {
          push('The '); push('ISS', 'hl-g');
          push(` is below your horizon at the moment; its next pass begins ${fmtIn(iss.nextDate - t)} (${fmtDay(iss.nextDate, t)} ${fmtTime(iss.nextDate)}). `);
        }
      }
    }

    const visiblePlanets = state.objects.filter((o) => o.type === 'planet' && o.id !== 'moon' && o.id !== 'sun' && o.alt > 10);
    if (visiblePlanets.length) {
      const parts = visiblePlanets.slice(0, 3).map((p) => `${p.name} ${p.alt > 60 ? 'almost overhead' : `toward the ${dirWord(p.az)} sky`}`);
      push(parts.length > 1 ? 'Planet-wise, ' : '');
      push(parts.join(', '), 'hl-b');
      push(` ${visiblePlanets.length > 1 ? 'are' : 'is'} ${s > 0 ? 'above the horizon (waiting for dusk)' : 'visible'}. `);
    }

    const moonObj = state.objects.find((o) => o.id === 'moon');
    if (moonObj && moonObj.alt > 0 && moonObj.alt < 25) {
      push('The Moon is rising', 'hl-p');
      push(` in the ${dirWord(moonObj.az)} sky. `);
    }

    const risingSoon = state.objects
      .filter((o) => (o.type === 'constellation' || (o.type === 'planet' && o.id !== 'sun')) && o.alt <= 0 && o.nextDate && o.nextDate - t < 9 * 3600000)
      .sort((a, b) => a.nextDate - b.nextDate)[0];
    if (risingSoon) {
      push(`${risingSoon.name}`, 'hl-p');
      push(` will climb above your horizon ${fmtIn(risingSoon.nextDate - t)} — worth waiting up for. `);
    }

    const phase = EphemerisService.moonPhase(t);
    push(`The Moon is a ${phase.name.toLowerCase()} at ${phase.illum}% illumination`);
    push(phase.illum > 70 ? ', so faint objects will fight its glare tonight.' : ' — kind skies for deep-sky hunting.');

    return segs;
  }

  function refreshGuide() {
    $('#guideContext').textContent = `ephemeris for ${state.place} · ${fmtTime(now())}`;
    typeSegments($('#guideText'), buildGuideSegments());
  }
  $('#regenGuide').addEventListener('click', refreshGuide);

  /* ── time travel ──────────────────────────────────────────── */
  const ttSlider = $('#ttSlider');
  function applyOffset(h) {
    state.offsetHours = h;
    ttSlider.value = h;
    document.querySelectorAll('.tt-preset').forEach((b) =>
      b.classList.toggle('is-active', parseFloat(b.dataset.h) === h));
    updateTT();
    recompute();
    updateTTChips();
  }
  function updateTT() {
    const h = state.offsetHours;
    const mode = $('#ttMode');
    mode.textContent = h === 0 ? 'NOW' : h < 0 ? `PAST · ${Math.abs(h)} H AGO` : `FUTURE · +${h} H`;
    mode.className = 'timetravel__mode' + (h < 0 ? ' is-past' : h > 0 ? ' is-future' : '');
    const t = now();
    $('#ttTime').textContent = t.toLocaleString([], { weekday: 'short', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
  }
  function updateTTChips() {
    const box = $('#ttChips');
    const interesting = state.objects
      .filter((o) => o.alt > 5)
      .sort((a, b) => b.alt - a.alt)
      .slice(0, 4)
      .map((o) => `<span class="tt-chip"><strong>${o.name}</strong> · ${fmtDeg(o.alt)} high in the ${compass(o.az)}</span>`);
    const hidden = state.objects.filter((o) => o.alt <= 0).length;
    box.innerHTML = interesting.join('') + `<span class="tt-chip">${hidden} objects below horizon</span>`;
  }
  ttSlider.addEventListener('input', () => applyOffset(parseFloat(ttSlider.value)));
  ttSlider.addEventListener('change', () => { refreshGuide(); renderISSEvents(); });
  $('#ttPresets').addEventListener('click', (e) => {
    const btn = e.target.closest('.tt-preset');
    if (!btn) return;
    applyOffset(parseFloat(btn.dataset.h));
    refreshGuide();
    renderISSEvents();
  });
  $('#ttReset').addEventListener('click', () => {
    applyOffset(0);
    refreshGuide();
    renderISSEvents();
  });

  /* ── events panel ─────────────────────────────────────────── */
  function renderISSEvents() {
    const t = now();
    const passes = TLEService.has('iss')
      ? TLEService.findPasses('iss', state.lat, state.lon, t, 48, 10, 4)
      : Astro.findPasses(SAT_PARAMS.iss, state.lat, state.lon, t, 48, 10, 4);
    $('#issEvents').innerHTML = passes.length
      ? passes.map((p) => `
        <li>
          <div class="ev-when">${fmtDay(p.start, t)} · ${fmtTime(p.start)}</div>
          <div class="ev-name">Pass to ${Math.round(p.maxEl)}° elevation</div>
          <div class="ev-meta">${Math.round(p.durMin)} min · look ${compass(p.maxAz)} · ${fmtIn(p.start - t)}</div>
        </li>`).join('')
      : '<li class="muted">No visible passes in the next 48 h</li>';
  }

  function renderMeteors() {
    const today = new Date();
    const upcoming = METEOR_SHOWERS.map((m) => {
      let d = new Date(today.getFullYear(), m.month, m.day);
      if (d < today) d = new Date(today.getFullYear() + 1, m.month, m.day);
      return { ...m, date: d };
    }).sort((a, b) => a.date - b.date).slice(0, 4);
    $('#meteorEvents').innerHTML = upcoming.map((m) => `
      <li>
        <div class="ev-when">${m.date.toLocaleDateString([], { month: 'short', day: 'numeric' })} peak</div>
        <div class="ev-name">${m.name} · ~${m.rate}/h</div>
        <div class="ev-meta">${m.note}</div>
      </li>`).join('');
  }

  function renderConjunctions() {
    // ephemeris scan is fast but deferred off the first paint
    setTimeout(() => {
      const evs = Astro.findConjunctions(new Date(), 60).slice(0, 4);
      $('#conjEvents').innerHTML = evs.length
        ? evs.map((e) => `
          <li>
            <div class="ev-when">${e.date.toLocaleDateString([], { month: 'short', day: 'numeric' })}</div>
            <div class="ev-name">${e.a} ✕ ${e.b}</div>
            <div class="ev-meta">closest approach ≈ ${e.sep.toFixed(1)}° apart</div>
          </li>`).join('')
        : '<li class="muted">No close pairings in the next 60 days</li>';
    }, 80);
  }

  function renderEclipses() {
    const today = new Date().toISOString().slice(0, 10);
    const next = ECLIPSES.filter((e) => e.date >= today).slice(0, 3);
    $('#eclipseEvents').innerHTML = next.map((e) => {
      const d = new Date(e.date + 'T12:00:00');
      const days = Math.round((d - Date.now()) / 86400000);
      return `
        <li>
          <div class="ev-when">${d.toLocaleDateString([], { year: 'numeric', month: 'short', day: 'numeric' })} · in ${days} days</div>
          <div class="ev-name">${e.name}</div>
          <div class="ev-meta">${e.meta}</div>
        </li>`;
    }).join('');
  }

  /* moon phase + best dark-sky window for the selected location */
  function renderSkyConditions() {
    setTimeout(() => {
      const t = now();
      const phase = EphemerisService.moonPhase(t);
      const items = [];
      items.push(`
        <li>
          <div class="ev-when">Moon phase</div>
          <div class="ev-name">${phase.name} · ${phase.illum}% lit</div>
          <div class="ev-meta">${phase.nextFull ? `Full moon ${fmtDay(phase.nextFull, t)} · new moon ${fmtDay(phase.nextNew, t)}` : 'Lower illumination = darker skies'}</div>
        </li>`);

      // scan 24 h for the next astronomically dark window (sun < −12°)
      let darkStart = null, darkEnd = null;
      for (let m = 0; m <= 1440 && !darkEnd; m += 10) {
        const when = new Date(t.getTime() + m * 60000);
        const sunAlt = EphemerisService.body('sun', when, state.lat, state.lon).alt;
        if (sunAlt < -12 && !darkStart) darkStart = when;
        if (sunAlt >= -12 && darkStart) darkEnd = when;
      }
      if (darkStart) {
        items.push(`
          <li>
            <div class="ev-when">Best viewing window</div>
            <div class="ev-name">${fmtTime(darkStart)} → ${darkEnd ? fmtTime(darkEnd) : 'beyond 24 h'}</div>
            <div class="ev-meta">${phase.illum > 70 ? 'Bright moon — favour planets and the ISS' : 'Dark skies — deep-sky objects are on the menu'}</div>
          </li>`);
      } else {
        items.push(`
          <li>
            <div class="ev-when">Best viewing window</div>
            <div class="ev-name">No full darkness in 24 h</div>
            <div class="ev-meta">High-latitude summer twilight — satellites still shine</div>
          </li>`);
      }
      $('#skyEvents').innerHTML = items.join('');
    }, 60);
  }

  /* ── chrome: nav clock, burger, reveal-on-scroll ──────────── */
  setInterval(() => {
    $('#navClock').textContent = new Date().toISOString().slice(11, 19);
  }, 1000);

  $('#navBurger').addEventListener('click', () => $('#navLinks').classList.toggle('is-open'));
  $('#navLinks').addEventListener('click', () => $('#navLinks').classList.remove('is-open'));

  const observer = new IntersectionObserver(
    (entries) => entries.forEach((e) => e.isIntersecting && e.target.classList.add('is-visible')),
    { threshold: 0.12 },
  );
  document.querySelectorAll('.section__head, .blueprint__card, .events__col, .guide__panel, .timetravel__panel').forEach((el) => {
    el.classList.add('reveal');
    observer.observe(el);
  });

  $('#heroObjCount').textContent = OBJECTS.length;

  /* ── boot ─────────────────────────────────────────────────── */
  ISSService.onUpdate(updateDataStatus);
  ISSService.start();
  TLEService.refreshLive().then(updateDataStatus);

  recompute();
  updateTT();
  updateTTChips();
  refreshGuide();
  updateDataStatus();
  renderISSEvents();
  renderMeteors();
  renderConjunctions();
  renderEclipses();
  renderSkyConditions();
  setInterval(recompute, 2000);

  // dismiss the boot loader once the first frame of data is live
  setTimeout(() => {
    const loader = $('#bootLoader');
    loader.classList.add('is-done');
    setTimeout(() => loader.remove(), 700);
  }, 600);
})();
