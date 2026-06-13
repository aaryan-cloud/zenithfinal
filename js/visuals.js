/* ═══════════════════════════════════════════════════════════════
   ZENITH VISUALS · canvas renderers
   starfield · holographic globe · radar sweep · orbit theatre ·
   trajectory chart — all hand-rolled, 60 fps, zero dependencies
   ═══════════════════════════════════════════════════════════════ */

const Visuals = (() => {
  const TAU = Math.PI * 2;
  const RAD = Math.PI / 180;

  function fitCanvas(canvas) {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const rect = canvas.getBoundingClientRect();
    const w = Math.max(1, Math.round(rect.width * dpr));
    const h = Math.max(1, Math.round(rect.height * dpr));
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w;
      canvas.height = h;
    }
    return { w, h, dpr };
  }

  /* ── animated starfield + shooting stars ──────────────────── */
  function createStarfield(canvas) {
    const ctx = canvas.getContext('2d');
    let stars = [];
    let meteors = [];

    function seed() {
      const { w, h } = fitCanvas(canvas);
      const count = Math.floor((w * h) / 5500);
      stars = Array.from({ length: count }, () => ({
        x: Math.random() * w,
        y: Math.random() * h,
        r: Math.random() * 1.3 + 0.25,
        tw: Math.random() * TAU,
        sp: 0.4 + Math.random() * 1.4,
        hue: Math.random() < 0.18 ? 'rgba(168,85,247,' : Math.random() < 0.4 ? 'rgba(76,201,255,' : 'rgba(232,237,255,',
      }));
    }

    function frame(t) {
      const { w, h } = fitCanvas(canvas);
      ctx.clearRect(0, 0, w, h);
      // base gradient
      const g = ctx.createLinearGradient(0, 0, 0, h);
      g.addColorStop(0, '#04060f');
      g.addColorStop(0.5, '#060a18');
      g.addColorStop(1, '#04050d');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, w, h);

      for (const s of stars) {
        const a = 0.35 + 0.65 * (0.5 + 0.5 * Math.sin(s.tw + t * 0.001 * s.sp));
        ctx.fillStyle = s.hue + a.toFixed(3) + ')';
        ctx.beginPath();
        ctx.arc(s.x, s.y, s.r, 0, TAU);
        ctx.fill();
      }

      // occasional shooting star
      if (Math.random() < 0.006 && meteors.length < 2) {
        meteors.push({
          x: Math.random() * w, y: Math.random() * h * 0.4,
          vx: 6 + Math.random() * 5, vy: 2.5 + Math.random() * 2, life: 1,
        });
      }
      meteors = meteors.filter((m) => m.life > 0);
      for (const m of meteors) {
        ctx.strokeStyle = `rgba(180,220,255,${m.life * 0.9})`;
        ctx.lineWidth = 1.6;
        ctx.beginPath();
        ctx.moveTo(m.x, m.y);
        ctx.lineTo(m.x - m.vx * 9, m.y - m.vy * 9);
        ctx.stroke();
        m.x += m.vx; m.y += m.vy; m.life -= 0.022;
      }
      requestAnimationFrame(frame);
    }

    seed();
    window.addEventListener('resize', seed);
    requestAnimationFrame(frame);
  }

  /* ── holographic wireframe globe ──────────────────────────── */
  /* getState() → { lat, lon, sun:{lat,lon}, iss:{lat,lon}, issTrack:[{lat,lon}] }
     onPick(lat, lon) — fired when the user clicks (not drags) a point */
  function createGlobe(canvas, getState, onPick) {
    const ctx = canvas.getContext('2d');
    let rotLon = 0, tilt = -18, autoSpin = true;
    let dragging = false, lastX = 0, lastY = 0, idleTimer = null;
    let downX = 0, downY = 0;
    let geom = { cx: 0, cy: 0, R: 1 };

    // precompute land dots from the rough continent polygons
    const landDots = [];
    const inPoly = (lat, lon, poly) => {
      let inside = false;
      for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
        const [yi, xi] = poly[i], [yj, xj] = poly[j];
        if ((yi > lat) !== (yj > lat) && lon < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) inside = !inside;
      }
      return inside;
    };
    for (let lat = -56; lat <= 78; lat += 2.6) {
      const step = 2.6 / Math.max(0.25, Math.cos(lat * RAD));
      for (let lon = -180; lon <= 180; lon += step) {
        if (CONTINENTS.some((p) => inPoly(lat, lon, p))) landDots.push([lat, lon]);
      }
    }

    function project(lat, lon, R, cx, cy) {
      const la = lat * RAD, lo = (lon + rotLon) * RAD, ti = tilt * RAD;
      let px = Math.cos(la) * Math.cos(lo);
      const py = Math.cos(la) * Math.sin(lo);
      let pz = Math.sin(la);
      const px2 = px * Math.cos(ti) + pz * Math.sin(ti);
      pz = -px * Math.sin(ti) + pz * Math.cos(ti);
      px = px2;
      return { x: cx + py * R, y: cy - pz * R, front: px > 0, depth: px };
    }

    /* inverse orthographic projection: screen point → lat/lon */
    function unproject(sx, sy) {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const rect = canvas.getBoundingClientRect();
      const py = ((sx - rect.left) * dpr - geom.cx) / geom.R;
      const pz2 = (geom.cy - (sy - rect.top) * dpr) / geom.R;
      const s = py * py + pz2 * pz2;
      if (s > 1) return null; // clicked off the sphere
      const px2 = Math.sqrt(1 - s);
      const ti = tilt * RAD;
      const px1 = px2 * Math.cos(ti) - pz2 * Math.sin(ti);
      const pz = px2 * Math.sin(ti) + pz2 * Math.cos(ti);
      const lat = Math.asin(Math.max(-1, Math.min(1, pz))) / RAD;
      let lon = Math.atan2(py, px1) / RAD - rotLon;
      lon = ((lon + 540) % 360) - 180;
      return { lat, lon };
    }

    canvas.addEventListener('pointerdown', (e) => {
      dragging = true; autoSpin = false; lastX = e.clientX; lastY = e.clientY;
      downX = e.clientX; downY = e.clientY;
      canvas.setPointerCapture(e.pointerId);
      clearTimeout(idleTimer);
    });
    canvas.addEventListener('pointermove', (e) => {
      if (!dragging) return;
      rotLon += (e.clientX - lastX) * 0.4;
      tilt = Math.max(-70, Math.min(70, tilt - (e.clientY - lastY) * 0.3));
      lastX = e.clientX; lastY = e.clientY;
    });
    const release = (e) => {
      if (dragging && e.type === 'pointerup' && onPick
          && Math.hypot(e.clientX - downX, e.clientY - downY) < 6) {
        const hit = unproject(e.clientX, e.clientY);
        if (hit) onPick(hit.lat, hit.lon);
      }
      dragging = false;
      clearTimeout(idleTimer);
      idleTimer = setTimeout(() => { autoSpin = true; }, 4000);
    };
    canvas.addEventListener('pointerup', release);
    canvas.addEventListener('pointercancel', release);

    function frame() {
      const { w, h } = fitCanvas(canvas);
      const cx = w / 2, cy = h / 2;
      const R = Math.min(w, h) * 0.40;
      geom = { cx, cy, R };
      if (autoSpin) rotLon += 0.06;
      const st = getState();

      ctx.clearRect(0, 0, w, h);

      // atmosphere glow
      let g = ctx.createRadialGradient(cx, cy, R * 0.85, cx, cy, R * 1.35);
      g.addColorStop(0, 'rgba(76,201,255,0.16)');
      g.addColorStop(1, 'rgba(76,201,255,0)');
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.arc(cx, cy, R * 1.35, 0, TAU); ctx.fill();

      // sphere body
      g = ctx.createRadialGradient(cx - R * 0.3, cy - R * 0.35, R * 0.1, cx, cy, R);
      g.addColorStop(0, 'rgba(23,37,84,0.85)');
      g.addColorStop(1, 'rgba(5,8,22,0.95)');
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.arc(cx, cy, R, 0, TAU); ctx.fill();
      ctx.strokeStyle = 'rgba(76,201,255,0.5)';
      ctx.lineWidth = 1.2;
      ctx.stroke();

      // graticule
      ctx.lineWidth = 0.55;
      ctx.strokeStyle = 'rgba(89,134,255,0.22)';
      for (let lat = -60; lat <= 60; lat += 30) {
        ctx.beginPath();
        let started = false;
        for (let lon = -180; lon <= 180; lon += 4) {
          const p = project(lat, lon, R, cx, cy);
          if (p.front) { started ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y); started = true; }
          else started = false;
        }
        ctx.stroke();
      }
      for (let lon = -180; lon < 180; lon += 30) {
        ctx.beginPath();
        let started = false;
        for (let lat = -88; lat <= 88; lat += 4) {
          const p = project(lat, lon, R, cx, cy);
          if (p.front) { started ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y); started = true; }
          else started = false;
        }
        ctx.stroke();
      }

      // land dots, shaded by day/night
      const sl = st.sun.lat * RAD, so = st.sun.lon * RAD;
      const sx = Math.cos(sl) * Math.cos(so), sy = Math.cos(sl) * Math.sin(so), sz = Math.sin(sl);
      for (const [lat, lon] of landDots) {
        const p = project(lat, lon, R, cx, cy);
        if (!p.front) continue;
        const la = lat * RAD, lo = lon * RAD;
        const day = Math.cos(la) * Math.cos(lo) * sx + Math.cos(la) * Math.sin(lo) * sy + Math.sin(la) * sz > 0;
        const a = (day ? 0.85 : 0.3) * (0.45 + 0.55 * p.depth);
        ctx.fillStyle = day ? `rgba(96,210,255,${a})` : `rgba(99,118,200,${a})`;
        ctx.fillRect(p.x - 0.9, p.y - 0.9, 1.8, 1.8);
      }

      // ISS ground track
      if (st.issTrack && st.issTrack.length) {
        ctx.beginPath();
        let started = false;
        for (const pt of st.issTrack) {
          const p = project(pt.lat, pt.lon, R * 1.045, cx, cy);
          if (p.front) { started ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y); started = true; }
          else started = false;
        }
        ctx.strokeStyle = 'rgba(76,201,255,0.65)';
        ctx.lineWidth = 1.3;
        ctx.setLineDash([5, 5]);
        ctx.stroke();
        ctx.setLineDash([]);
      }

      // ISS marker
      if (st.iss) {
        const p = project(st.iss.lat, st.iss.lon, R * 1.045, cx, cy);
        if (p.front) {
          ctx.fillStyle = '#4ade80';
          ctx.shadowColor = '#4ade80'; ctx.shadowBlur = 12;
          ctx.beginPath(); ctx.arc(p.x, p.y, 3.6, 0, TAU); ctx.fill();
          ctx.shadowBlur = 0;
          ctx.fillStyle = 'rgba(74,222,128,0.95)';
          ctx.font = `600 ${Math.max(10, R * 0.055)}px Space Grotesk, sans-serif`;
          ctx.fillText('ISS', p.x + 8, p.y + 4);
        }
      }

      // selected location marker (pulsing beacon)
      const lp = project(st.lat, st.lon, R, cx, cy);
      if (lp.front) {
        const pulse = 0.5 + 0.5 * Math.sin(performance.now() * 0.004);
        ctx.strokeStyle = `rgba(168,85,247,${0.85 - pulse * 0.5})`;
        ctx.lineWidth = 1.6;
        ctx.beginPath(); ctx.arc(lp.x, lp.y, 6 + pulse * 9, 0, TAU); ctx.stroke();
        ctx.fillStyle = '#e879f9';
        ctx.shadowColor = '#a855f7'; ctx.shadowBlur = 14;
        ctx.beginPath(); ctx.arc(lp.x, lp.y, 4, 0, TAU); ctx.fill();
        ctx.shadowBlur = 0;
      }

      requestAnimationFrame(frame);
    }
    requestAnimationFrame(frame);
  }

  /* ── radar sweep ──────────────────────────────────────────── */
  /* getBlips() → [{name, alt, az, color, big}] (alt > 0 only) */
  function createRadar(canvas, getBlips) {
    const ctx = canvas.getContext('2d');
    let sweep = 0;

    function frame() {
      const { w, h } = fitCanvas(canvas);
      const cx = w / 2, cy = h / 2;
      const R = Math.min(w, h) * 0.44;
      ctx.clearRect(0, 0, w, h);

      // dish glow
      let g = ctx.createRadialGradient(cx, cy, 0, cx, cy, R);
      g.addColorStop(0, 'rgba(17,34,80,0.55)');
      g.addColorStop(1, 'rgba(5,8,22,0.2)');
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.arc(cx, cy, R, 0, TAU); ctx.fill();

      // rings: 0° / 30° / 60° altitude
      ctx.strokeStyle = 'rgba(76,201,255,0.3)';
      ctx.fillStyle = 'rgba(147,160,199,0.75)';
      ctx.font = `${Math.max(9, R * 0.052)}px Space Grotesk, sans-serif`;
      ctx.textAlign = 'left';
      [[1, '0°'], [2 / 3, '30°'], [1 / 3, '60°']].forEach(([f, lab]) => {
        ctx.lineWidth = f === 1 ? 1.4 : 0.7;
        ctx.beginPath(); ctx.arc(cx, cy, R * f, 0, TAU); ctx.stroke();
        ctx.fillText(lab, cx + R * f * 0.7071 + 3, cy - R * f * 0.7071 - 3);
      });
      // cross-hairs
      ctx.lineWidth = 0.6;
      ctx.beginPath();
      ctx.moveTo(cx - R, cy); ctx.lineTo(cx + R, cy);
      ctx.moveTo(cx, cy - R); ctx.lineTo(cx, cy + R);
      ctx.stroke();
      // compass labels
      ctx.fillStyle = 'rgba(76,201,255,0.9)';
      ctx.font = `700 ${Math.max(11, R * 0.075)}px Orbitron, sans-serif`;
      ctx.textAlign = 'center';
      ctx.fillText('N', cx, cy - R - 8);
      ctx.fillText('S', cx, cy + R + 18);
      ctx.textAlign = 'left'; ctx.fillText('E', cx + R + 7, cy + 5);
      ctx.textAlign = 'right'; ctx.fillText('W', cx - R - 7, cy + 5);

      // zenith mark
      ctx.fillStyle = 'rgba(255,209,102,0.9)';
      ctx.beginPath(); ctx.arc(cx, cy, 2.2, 0, TAU); ctx.fill();

      // sweep beam
      sweep = (sweep + 0.9) % 360;
      const sw = (sweep - 90) * RAD;
      g = ctx.createConicGradient ? ctx.createConicGradient(sw, cx, cy) : null;
      if (g) {
        g.addColorStop(0, 'rgba(76,201,255,0.30)');
        g.addColorStop(0.10, 'rgba(76,201,255,0)');
        g.addColorStop(1, 'rgba(76,201,255,0)');
        ctx.fillStyle = g;
        ctx.beginPath(); ctx.moveTo(cx, cy); ctx.arc(cx, cy, R, sw - 0.9, sw + 0.02); ctx.closePath();
        ctx.fill();
      }
      ctx.strokeStyle = 'rgba(76,201,255,0.85)';
      ctx.lineWidth = 1.6;
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.lineTo(cx + Math.cos(sw) * R, cy + Math.sin(sw) * R);
      ctx.stroke();

      // blips
      ctx.textAlign = 'left';
      for (const b of getBlips()) {
        const r = ((90 - b.alt) / 90) * R;
        const a = (b.az - 90) * RAD;
        const x = cx + Math.cos(a) * r;
        const y = cy + Math.sin(a) * r;
        // glow stronger just after sweep passes
        let diff = (sweep - b.az + 360) % 360;
        const hot = Math.max(0, 1 - diff / 70);
        const size = (b.big ? 4.5 : 3.2) + hot * 2.2;
        ctx.shadowColor = b.color; ctx.shadowBlur = 8 + hot * 14;
        ctx.fillStyle = b.color;
        ctx.beginPath(); ctx.arc(x, y, size, 0, TAU); ctx.fill();
        ctx.shadowBlur = 0;
        ctx.fillStyle = `rgba(232,237,255,${0.55 + hot * 0.45})`;
        ctx.font = `${Math.max(9.5, R * 0.052)}px Space Grotesk, sans-serif`;
        ctx.fillText(b.name, x + 7, y + 3.5);
      }
      requestAnimationFrame(frame);
    }
    requestAnimationFrame(frame);
  }

  /* ── orbit theatre ────────────────────────────────────────── */
  /* getData() → { sats: [{id,name,color,inc,raan,u,altKm,nearZenith}], moonAngle } */
  function createOrbitView(canvas, getData) {
    const ctx = canvas.getContext('2d');
    const camTilt = -62 * RAD;
    const bgStars = Array.from({ length: 110 }, () => [Math.random(), Math.random(), Math.random() * 1.2 + 0.3]);
    const trails = {};

    function p3d(u, inc, raan, r, cx, cy) {
      const cu = Math.cos(u * RAD), su = Math.sin(u * RAD);
      const ci = Math.cos(inc * RAD), si = Math.sin(inc * RAD);
      const co = Math.cos(raan * RAD), so = Math.sin(raan * RAD);
      // orbital plane → inertial
      const x = (cu * co - su * ci * so) * r;
      const y = (cu * so + su * ci * co) * r;
      const z = su * si * r;
      // camera tilt about x-axis
      const y2 = y * Math.cos(camTilt) - z * Math.sin(camTilt);
      const z2 = y * Math.sin(camTilt) + z * Math.cos(camTilt);
      return { x: cx + x, y: cy + y2, depth: z2 };
    }

    function frame() {
      const { w, h } = fitCanvas(canvas);
      const cx = w / 2, cy = h / 2;
      const eR = Math.min(w, h) * 0.13;
      ctx.clearRect(0, 0, w, h);

      for (const [fx, fy, r] of bgStars) {
        ctx.fillStyle = 'rgba(232,237,255,0.5)';
        ctx.fillRect(fx * w, fy * h, r, r);
      }

      const data = getData();

      // earth glow + body
      let g = ctx.createRadialGradient(cx, cy, eR * 0.6, cx, cy, eR * 2.4);
      g.addColorStop(0, 'rgba(56,130,246,0.28)');
      g.addColorStop(1, 'rgba(56,130,246,0)');
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.arc(cx, cy, eR * 2.4, 0, TAU); ctx.fill();

      // orbit paths + sats behind earth first, then earth, then front
      const layers = { back: [], front: [] };
      for (const s of data.sats) {
        const r = eR * (1.7 + s.altKm / 520);
        // path
        ctx.beginPath();
        for (let u = 0; u <= 360; u += 4) {
          const p = p3d(u, s.inc, s.raan, r, cx, cy);
          u === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y);
        }
        ctx.strokeStyle = s.nearZenith ? 'rgba(255,209,102,0.5)' : 'rgba(89,134,255,0.28)';
        ctx.lineWidth = s.nearZenith ? 1.4 : 0.8;
        ctx.stroke();
        const p = p3d(s.u, s.inc, s.raan, r, cx, cy);
        (p.depth < 0 ? layers.back : layers.front).push({ s, p });
        // trail
        const tr = (trails[s.id] = trails[s.id] || []);
        tr.push([p.x, p.y]);
        if (tr.length > 26) tr.shift();
      }

      const drawSat = ({ s, p }) => {
        const tr = trails[s.id] || [];
        for (let i = 1; i < tr.length; i++) {
          ctx.strokeStyle = `${s.nearZenith ? 'rgba(255,209,102,' : 'rgba(76,201,255,'}${(i / tr.length) * 0.5})`;
          ctx.lineWidth = 1;
          ctx.beginPath(); ctx.moveTo(tr[i - 1][0], tr[i - 1][1]); ctx.lineTo(tr[i][0], tr[i][1]); ctx.stroke();
        }
        const col = s.nearZenith ? '#ffd166' : s.color;
        ctx.shadowColor = col; ctx.shadowBlur = s.nearZenith ? 18 : 9;
        ctx.fillStyle = col;
        ctx.beginPath(); ctx.arc(p.x, p.y, s.nearZenith ? 5 : 3.4, 0, TAU); ctx.fill();
        ctx.shadowBlur = 0;
        if (s.nearZenith) {
          const pulse = 0.5 + 0.5 * Math.sin(performance.now() * 0.005);
          ctx.strokeStyle = `rgba(255,209,102,${0.8 - pulse * 0.5})`;
          ctx.beginPath(); ctx.arc(p.x, p.y, 8 + pulse * 7, 0, TAU); ctx.stroke();
        }
        ctx.fillStyle = 'rgba(232,237,255,0.85)';
        ctx.font = '11px Space Grotesk, sans-serif';
        ctx.fillText(s.name, p.x + 9, p.y - 6);
      };

      layers.back.forEach(drawSat);

      // earth
      g = ctx.createRadialGradient(cx - eR * 0.3, cy - eR * 0.3, eR * 0.1, cx, cy, eR);
      g.addColorStop(0, '#2f5fd0');
      g.addColorStop(0.55, '#15296b');
      g.addColorStop(1, '#080d24');
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.arc(cx, cy, eR, 0, TAU); ctx.fill();
      ctx.strokeStyle = 'rgba(96,210,255,0.55)';
      ctx.lineWidth = 1; ctx.stroke();
      // equator hint
      ctx.strokeStyle = 'rgba(96,210,255,0.3)';
      ctx.beginPath(); ctx.ellipse(cx, cy, eR, eR * 0.32, 0, 0, TAU); ctx.stroke();

      layers.front.forEach(drawSat);

      // moon, far out
      const mr = Math.min(w, h) * 0.46;
      const mx = cx + Math.cos(data.moonAngle) * mr;
      const my = cy + Math.sin(data.moonAngle) * mr * 0.36;
      ctx.fillStyle = '#cbd5f5';
      ctx.shadowColor = '#cbd5f5'; ctx.shadowBlur = 10;
      ctx.beginPath(); ctx.arc(mx, my, 5, 0, TAU); ctx.fill();
      ctx.shadowBlur = 0;
      ctx.fillStyle = 'rgba(203,213,245,0.7)';
      ctx.font = '11px Space Grotesk, sans-serif';
      ctx.fillText('Moon', mx + 9, my + 4);

      requestAnimationFrame(frame);
    }
    requestAnimationFrame(frame);
  }

  /* ── modal trajectory chart (altitude vs time, animated) ──── */
  function createTrajectory(canvas) {
    const ctx = canvas.getContext('2d');
    let samples = []; // [{t(-6..6), alt}]
    let cursor = 0, raf = null;

    function frame() {
      const { w, h } = fitCanvas(canvas);
      ctx.clearRect(0, 0, w, h);
      const pad = 14;
      const x = (t) => pad + ((t + 6) / 12) * (w - pad * 2);
      const y = (alt) => h - pad - ((alt + 20) / 110) * (h - pad * 2);

      // horizon line
      ctx.strokeStyle = 'rgba(147,160,199,0.4)';
      ctx.setLineDash([4, 5]);
      ctx.beginPath(); ctx.moveTo(pad, y(0)); ctx.lineTo(w - pad, y(0)); ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = 'rgba(147,160,199,0.6)';
      ctx.font = '10px Space Grotesk, sans-serif';
      ctx.fillText('HORIZON', pad + 2, y(0) - 4);
      ctx.fillText('−6h', pad, h - 3);
      ctx.fillText('now', w / 2 - 9, h - 3);
      ctx.fillText('+6h', w - pad - 18, h - 3);

      if (samples.length) {
        // path
        const grad = ctx.createLinearGradient(0, 0, w, 0);
        grad.addColorStop(0, '#4cc9ff'); grad.addColorStop(1, '#a855f7');
        ctx.strokeStyle = grad;
        ctx.lineWidth = 2;
        ctx.shadowColor = 'rgba(76,201,255,0.6)'; ctx.shadowBlur = 7;
        ctx.beginPath();
        samples.forEach((s, i) => (i === 0 ? ctx.moveTo(x(s.t), y(s.alt)) : ctx.lineTo(x(s.t), y(s.alt))));
        ctx.stroke();
        ctx.shadowBlur = 0;

        // "now" marker
        ctx.strokeStyle = 'rgba(255,209,102,0.5)';
        ctx.beginPath(); ctx.moveTo(x(0), pad); ctx.lineTo(x(0), h - pad); ctx.stroke();

        // animated dot
        cursor = (cursor + 0.0025) % 1;
        const idx = cursor * (samples.length - 1);
        const i0 = Math.floor(idx), f = idx - i0;
        const s0 = samples[i0], s1 = samples[Math.min(i0 + 1, samples.length - 1)];
        const dx = x(s0.t + (s1.t - s0.t) * f);
        const dy = y(s0.alt + (s1.alt - s0.alt) * f);
        ctx.fillStyle = '#ffd166';
        ctx.shadowColor = '#ffd166'; ctx.shadowBlur = 12;
        ctx.beginPath(); ctx.arc(dx, dy, 4, 0, TAU); ctx.fill();
        ctx.shadowBlur = 0;
      }
      raf = requestAnimationFrame(frame);
    }

    return {
      setSamples(s) { samples = s; cursor = 0; },
      start() { if (!raf) raf = requestAnimationFrame(frame); },
      stop() { cancelAnimationFrame(raf); raf = null; },
    };
  }

  return { createStarfield, createGlobe, createRadar, createOrbitView, createTrajectory, fitCanvas };
})();
