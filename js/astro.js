/* ═══════════════════════════════════════════════════════════════
   ZENITH ASTRO ENGINE
   Compact in-browser ephemeris: sidereal time, Sun/Moon/planet
   positions (Keplerian elements, Schlyter method), alt/az
   transforms, LEO ground-track propagation, pass prediction,
   rise/set search and conjunction scanning.
   Accuracy ≈ 0.5–1° — ideal for sky-radar visualisation.
   ═══════════════════════════════════════════════════════════════ */

const Astro = (() => {
  const RAD = Math.PI / 180;
  const DEG = 180 / Math.PI;
  const sin = (x) => Math.sin(x * RAD);
  const cos = (x) => Math.cos(x * RAD);
  const tan = (x) => Math.tan(x * RAD);
  const asin = (x) => Math.asin(Math.max(-1, Math.min(1, x))) * DEG;
  const atan2 = (y, x) => Math.atan2(y, x) * DEG;
  const norm360 = (x) => ((x % 360) + 360) % 360;
  const norm180 = (x) => { const v = norm360(x); return v > 180 ? v - 360 : v; };

  const EARTH_R = 6371; // km

  /* days since J2000.0 epoch (2000 Jan 1 12:00 UT) */
  function d2000(date) {
    return (date.getTime() - Date.UTC(2000, 0, 1, 12)) / 86400000;
  }

  /* Greenwich mean sidereal time, degrees */
  function gmst(date) {
    return norm360(280.46061837 + 360.98564736629 * d2000(date));
  }

  /* equatorial RA/Dec (deg) → local alt/az (deg, az from N clockwise) */
  function raDecToAltAz(ra, dec, lat, lon, date) {
    const lst = norm360(gmst(date) + lon);
    const ha = norm360(lst - ra);
    const alt = asin(sin(dec) * sin(lat) + cos(dec) * cos(lat) * cos(ha));
    let az = atan2(sin(ha), cos(ha) * sin(lat) - tan(dec) * cos(lat)) + 180;
    return { alt, az: norm360(az) };
  }

  function eclToEq(xg, yg, zg, d) {
    const ecl = 23.4393 - 3.563e-7 * d;
    const xe = xg;
    const ye = yg * cos(ecl) - zg * sin(ecl);
    const ze = yg * sin(ecl) + zg * cos(ecl);
    return {
      ra: norm360(atan2(ye, xe)),
      dec: atan2(ze, Math.sqrt(xe * xe + ye * ye)),
      dist: Math.sqrt(xg * xg + yg * yg + zg * zg),
    };
  }

  function keplerE(M, e) {
    let E = M + e * DEG * sin(M) * (1 + e * cos(M));
    for (let k = 0; k < 6; k++) {
      E = E - (E - e * DEG * sin(E) - M) / (1 - e * cos(E));
    }
    return E;
  }

  /* ── Sun (geocentric) ─────────────────────────────────────── */
  function sunPos(date) {
    const d = d2000(date);
    const w = 282.9404 + 4.70935e-5 * d;
    const e = 0.016709 - 1.151e-9 * d;
    const M = norm360(356.047 + 0.9856002585 * d);
    const E = keplerE(M, e);
    const xv = cos(E) - e;
    const yv = Math.sqrt(1 - e * e) * sin(E);
    const v = atan2(yv, xv);
    const r = Math.sqrt(xv * xv + yv * yv);
    const lon = norm360(v + w);
    const xs = r * cos(lon);
    const ys = r * sin(lon);
    const eq = eclToEq(xs, ys, 0, d);
    return { ra: eq.ra, dec: eq.dec, distAU: r, eclLon: lon, xs, ys };
  }

  /* sub-solar point on Earth (for the globe's day/night shading) */
  function sunSubpoint(date) {
    const s = sunPos(date);
    return { lat: s.dec, lon: norm180(s.ra - gmst(date)) };
  }

  /* ── Moon (geocentric, main perturbation terms) ───────────── */
  function moonPos(date) {
    const d = d2000(date);
    const N = norm360(125.1228 - 0.0529538083 * d);
    const i = 5.1454;
    const w = norm360(318.0634 + 0.1643573223 * d);
    const a = 60.2666; // Earth radii
    const e = 0.0549;
    const M = norm360(115.3654 + 13.0649929509 * d);
    const E = keplerE(M, e);
    const xv = a * (cos(E) - e);
    const yv = a * Math.sqrt(1 - e * e) * sin(E);
    const v = atan2(yv, xv);
    let r = Math.sqrt(xv * xv + yv * yv);
    const u = v + w;
    const xh = r * (cos(N) * cos(u) - sin(N) * sin(u) * cos(i));
    const yh = r * (sin(N) * cos(u) + cos(N) * sin(u) * cos(i));
    const zh = r * sin(u) * sin(i);
    let lon = norm360(atan2(yh, xh));
    let lat = atan2(zh, Math.sqrt(xh * xh + yh * yh));

    // main perturbations (evection, variation, yearly equation)
    const Ms = norm360(356.047 + 0.9856002585 * d);
    const Ls = norm360(Ms + 282.9404 + 4.70935e-5 * d);
    const Lm = norm360(N + w + M);
    const D = norm360(Lm - Ls);
    const F = norm360(Lm - N);
    lon += -1.274 * sin(M - 2 * D) + 0.658 * sin(2 * D) - 0.186 * sin(Ms)
         - 0.059 * sin(2 * M - 2 * D) - 0.057 * sin(M - 2 * D + Ms);
    lat += -0.173 * sin(F - 2 * D);
    r += -0.58 * cos(M - 2 * D) - 0.46 * cos(2 * D);

    const xg = r * cos(lon) * cos(lat);
    const yg = r * sin(lon) * cos(lat);
    const zg = r * sin(lat);
    const eq = eclToEq(xg, yg, zg, d);
    return { ra: eq.ra, dec: eq.dec, distKm: r * EARTH_R, eclLon: norm360(lon) };
  }

  function moonPhase(date) {
    const elong = norm360(moonPos(date).eclLon - sunPos(date).eclLon);
    const illum = (1 - cos(elong)) / 2;
    let name;
    if (elong < 22.5 || elong >= 337.5) name = 'New Moon';
    else if (elong < 67.5) name = 'Waxing Crescent';
    else if (elong < 112.5) name = 'First Quarter';
    else if (elong < 157.5) name = 'Waxing Gibbous';
    else if (elong < 202.5) name = 'Full Moon';
    else if (elong < 247.5) name = 'Waning Gibbous';
    else if (elong < 292.5) name = 'Last Quarter';
    else name = 'Waning Crescent';
    return { name, illum: Math.round(illum * 100) };
  }

  /* ── Planets (heliocentric Keplerian elements, Schlyter) ──── */
  const PLANET_ELEMENTS = {
    mercury: { N: [48.3313, 3.24587e-5], i: [7.0047, 5.0e-8], w: [29.1241, 1.01444e-5], a: 0.387098, e: [0.205635, 5.59e-10], M: [168.6562, 4.0923344368] },
    venus:   { N: [76.6799, 2.4659e-5],  i: [3.3946, 2.75e-8], w: [54.891, 1.38374e-5],  a: 0.72333,  e: [0.006773, -1.302e-9], M: [48.0052, 1.6021302244] },
    mars:    { N: [49.5574, 2.11081e-5], i: [1.8497, -1.78e-8], w: [286.5016, 2.92961e-5], a: 1.523688, e: [0.093405, 2.516e-9], M: [18.6021, 0.5240207766] },
    jupiter: { N: [100.4542, 2.76854e-5], i: [1.303, -1.557e-7], w: [273.8777, 1.64505e-5], a: 5.20256, e: [0.048498, 4.469e-9], M: [19.895, 0.0830853001] },
    saturn:  { N: [113.6634, 2.3898e-5], i: [2.4886, -1.081e-7], w: [339.3939, 2.97661e-5], a: 9.55475, e: [0.055546, -9.499e-9], M: [316.967, 0.0334442282] },
  };

  function planetPos(name, date) {
    const el = PLANET_ELEMENTS[name];
    const d = d2000(date);
    const N = norm360(el.N[0] + el.N[1] * d);
    const i = el.i[0] + el.i[1] * d;
    const w = norm360(el.w[0] + el.w[1] * d);
    const e = el.e[0] + el.e[1] * d;
    const M = norm360(el.M[0] + el.M[1] * d);
    const E = keplerE(M, e);
    const xv = el.a * (cos(E) - e);
    const yv = el.a * Math.sqrt(1 - e * e) * sin(E);
    const v = atan2(yv, xv);
    const r = Math.sqrt(xv * xv + yv * yv);
    const u = v + w;
    const xh = r * (cos(N) * cos(u) - sin(N) * sin(u) * cos(i));
    const yh = r * (sin(N) * cos(u) + cos(N) * sin(u) * cos(i));
    const zh = r * sin(u) * sin(i);
    // heliocentric → geocentric: add the Sun's geocentric position
    const s = sunPos(date);
    const eq = eclToEq(xh + s.xs, yh + s.ys, zh, d);
    return { ra: eq.ra, dec: eq.dec, distAU: eq.dist };
  }

  /* ── LEO satellites: circular-orbit ground-track model ────── */
  /* params: { inc, periodMin, altKm, raan0, u0, raanRate(deg/day) } */
  function satSubpoint(p, date) {
    const tDays = d2000(date);
    const u = norm360(p.u0 + 360 * tDays * (1440 / p.periodMin));
    const raan = norm360(p.raan0 + p.raanRate * tDays);
    const lat = asin(sin(p.inc) * sin(u));
    const lonEci = atan2(cos(p.inc) * sin(u), cos(u)) + raan;
    const lon = norm180(lonEci - gmst(date));
    return { lat, lon, altKm: p.altKm };
  }

  function ecef(lat, lon, r) {
    return {
      x: r * cos(lat) * cos(lon),
      y: r * cos(lat) * sin(lon),
      z: r * sin(lat),
    };
  }

  /* topocentric alt/az/range of a satellite from an observer */
  function satAltAz(sub, obsLat, obsLon) {
    const o = ecef(obsLat, obsLon, EARTH_R);
    const s = ecef(sub.lat, sub.lon, EARTH_R + sub.altKm);
    const dx = s.x - o.x, dy = s.y - o.y, dz = s.z - o.z;
    const slat = sin(obsLat), clat = cos(obsLat);
    const slon = sin(obsLon), clon = cos(obsLon);
    const e = -slon * dx + clon * dy;
    const n = -slat * clon * dx - slat * slon * dy + clat * dz;
    const up = clat * clon * dx + clat * slon * dy + slat * dz;
    const range = Math.sqrt(dx * dx + dy * dy + dz * dz);
    return { alt: asin(up / range), az: norm360(atan2(e, n)), rangeKm: range };
  }

  /* find upcoming passes (alt > minAlt) of a LEO sat over a site */
  function findPasses(p, lat, lon, from, hours = 24, minAlt = 10, maxCount = 4) {
    const passes = [];
    const stepMs = 30000;
    let inPass = false, start = null, maxEl = 0, maxAz = 0;
    for (let t = 0; t <= hours * 3600000; t += stepMs) {
      const when = new Date(from.getTime() + t);
      const aa = satAltAz(satSubpoint(p, when), lat, lon);
      if (aa.alt > minAlt) {
        if (!inPass) { inPass = true; start = when; maxEl = 0; }
        if (aa.alt > maxEl) { maxEl = aa.alt; maxAz = aa.az; }
      } else if (inPass) {
        inPass = false;
        passes.push({ start, end: when, maxEl, maxAz, durMin: (when - start) / 60000 });
        if (passes.length >= maxCount) break;
      }
    }
    return passes;
  }

  /* next horizon-rise of an RA/Dec-producing body */
  function nextRise(getRaDec, lat, lon, from, hours = 26) {
    let prev = null;
    for (let t = 0; t <= hours * 3600000; t += 600000) {
      const when = new Date(from.getTime() + t);
      const p = getRaDec(when);
      const alt = raDecToAltAz(p.ra, p.dec, lat, lon, when).alt;
      if (prev !== null && prev <= 0 && alt > 0) {
        // refine to ~1 min
        let lo = t - 600000, hi = t;
        for (let k = 0; k < 9; k++) {
          const mid = (lo + hi) / 2;
          const w = new Date(from.getTime() + mid);
          const pm = getRaDec(w);
          if (raDecToAltAz(pm.ra, pm.dec, lat, lon, w).alt > 0) hi = mid; else lo = mid;
        }
        return new Date(from.getTime() + hi);
      }
      prev = alt;
    }
    return null;
  }

  function angularSep(ra1, dec1, ra2, dec2) {
    const c = sin(dec1) * sin(dec2) + cos(dec1) * cos(dec2) * cos(ra1 - ra2);
    return Math.acos(Math.max(-1, Math.min(1, c))) * DEG;
  }

  /* scan upcoming close approaches between bright bodies */
  function findConjunctions(from, days = 60) {
    const bodies = [
      { id: 'moon', name: 'Moon', pos: (d) => moonPos(d), limit: 5 },
      { id: 'venus', name: 'Venus', pos: (d) => planetPos('venus', d), limit: 3 },
      { id: 'mars', name: 'Mars', pos: (d) => planetPos('mars', d), limit: 3 },
      { id: 'jupiter', name: 'Jupiter', pos: (d) => planetPos('jupiter', d), limit: 3 },
      { id: 'saturn', name: 'Saturn', pos: (d) => planetPos('saturn', d), limit: 3 },
      { id: 'mercury', name: 'Mercury', pos: (d) => planetPos('mercury', d), limit: 3 },
    ];
    // daily samples of separations per pair → pick local minima under limit
    const samples = [];
    for (let day = 0; day <= days; day++) {
      const when = new Date(from.getTime() + day * 86400000);
      samples.push(bodies.map((b) => b.pos(when)));
    }
    const events = [];
    for (let a = 0; a < bodies.length; a++) {
      for (let b = a + 1; b < bodies.length; b++) {
        const limit = Math.max(bodies[a].limit, bodies[b].limit);
        for (let day = 1; day < days; day++) {
          const sep = angularSep(samples[day][a].ra, samples[day][a].dec, samples[day][b].ra, samples[day][b].dec);
          const sepPrev = angularSep(samples[day - 1][a].ra, samples[day - 1][a].dec, samples[day - 1][b].ra, samples[day - 1][b].dec);
          const sepNext = angularSep(samples[day + 1][a].ra, samples[day + 1][a].dec, samples[day + 1][b].ra, samples[day + 1][b].dec);
          if (sep < limit && sep <= sepPrev && sep <= sepNext) {
            events.push({
              date: new Date(from.getTime() + day * 86400000),
              a: bodies[a].name, b: bodies[b].name, sep,
            });
          }
        }
      }
    }
    events.sort((x, y) => x.date - y.date);
    return events;
  }

  return {
    EARTH_R, d2000, gmst, norm360, norm180,
    raDecToAltAz, sunPos, sunSubpoint, moonPos, moonPhase, planetPos,
    satSubpoint, satAltAz, findPasses, nextRise, angularSep, findConjunctions,
  };
})();
