/* ═══════════════════════════════════════════════════════════════
   TLE SERVICE
   Satellite orbital elements for SGP4 propagation (satellite.js).

   Strategy:
   1. Try live TLEs from CelesTrak (free, keyless).
   2. Fall back to the cached element set below — the app stays
      fully functional offline.

   The cached set stores structured mean elements and builds
   checksum-correct TLE lines at runtime, so the catalogue is easy
   to update and immune to column-alignment mistakes.
   ═══════════════════════════════════════════════════════════════ */

const TLEService = (() => {
  const CELESTRAK_URL = 'https://celestrak.org/NORAD/elements/gp.php?FORMAT=tle&CATNR=';

  /* cached mean elements · epoch 2026-05-30 (day 150 of 2026) */
  const CACHED_ELEMENTS = {
    iss:      { num: 25544, intl: '98067A', epoch: '26150.50000000', inc: 51.6416, raan: 247.4627, ecc: '0006703', argp: 130.536, ma: 325.0288, mm: '15.50103472' },
    tiangong: { num: 48274, intl: '21035A', epoch: '26150.50000000', inc: 41.4742, raan: 210.13, ecc: '0006543', argp: 84.21, ma: 276.01, mm: '15.61585823' },
    hubble:   { num: 20580, intl: '90037B', epoch: '26150.50000000', inc: 28.4699, raan: 116.55, ecc: '0002439', argp: 88.43, ma: 271.7, mm: '15.09299865' },
    starlink: { num: 44713, intl: '19074A', epoch: '26150.50000000', inc: 53.0539, raan: 305.41, ecc: '0001450', argp: 96.32, ma: 263.8, mm: '15.06391212' },
    noaa:     { num: 33591, intl: '09005A', epoch: '26150.50000000', inc: 99.1372, raan: 64.92, ecc: '0013800', argp: 110.55, ma: 249.71, mm: '14.12501077' },
  };

  function checksum(line) {
    let sum = 0;
    for (const ch of line) {
      if (ch >= '0' && ch <= '9') sum += +ch;
      else if (ch === '-') sum += 1;
    }
    return String(sum % 10);
  }

  /* build a column-exact TLE pair from structured elements */
  function buildTLE(e) {
    const f = (v, w, d) => v.toFixed(d).padStart(w);
    let l1 = `1 ${String(e.num).padStart(5, '0')}U ${e.intl.padEnd(8)} ${e.epoch}  .00010000  00000-0  10000-3 0  9990`;
    let l2 = `2 ${String(e.num).padStart(5, '0')} ${f(e.inc, 8, 4)} ${f(e.raan, 8, 4)} ${e.ecc} ${f(e.argp, 8, 4)} ${f(e.ma, 8, 4)} ${e.mm.padStart(11)}123450`;
    l1 = l1.slice(0, 68) + checksum(l1.slice(0, 68));
    l2 = l2.slice(0, 68) + checksum(l2.slice(0, 68));
    return [l1, l2];
  }

  const satrecs = {};   // id → satellite.js satrec
  let source = 'cached';

  function loadCached() {
    for (const [id, el] of Object.entries(CACHED_ELEMENTS)) {
      const [l1, l2] = buildTLE(el);
      const rec = satellite.twoline2satrec(l1, l2);
      if (rec.error === 0) satrecs[id] = rec;
    }
  }

  /* attempt a live refresh; silently keeps the cache on failure */
  async function refreshLive() {
    try {
      const updates = await Promise.all(
        Object.entries(CACHED_ELEMENTS).map(async ([id, el]) => {
          const r = await fetch(CELESTRAK_URL + el.num, { signal: AbortSignal.timeout(8000) });
          if (!r.ok) throw new Error(String(r.status));
          const lines = (await r.text()).trim().split('\n').map((s) => s.trim());
          if (lines.length < 3) throw new Error('bad TLE response');
          return [id, satellite.twoline2satrec(lines[1], lines[2])];
        }),
      );
      for (const [id, rec] of updates) if (rec.error === 0) satrecs[id] = rec;
      source = 'celestrak-live';
    } catch {
      source = 'cached';
    }
    return source;
  }

  /* sub-satellite point + look angles from an observer, via SGP4 */
  function observe(id, date, obsLatDeg, obsLonDeg) {
    const rec = satrecs[id];
    if (!rec) return null;
    const pv = satellite.propagate(rec, date);
    if (!pv.position) return null;
    const gmst = satellite.gstime(date);
    const geo = satellite.eciToGeodetic(pv.position, gmst);
    const obsGd = {
      latitude: obsLatDeg * (Math.PI / 180),
      longitude: obsLonDeg * (Math.PI / 180),
      height: 0.05,
    };
    const look = satellite.ecfToLookAngles(obsGd, satellite.eciToEcf(pv.position, gmst));
    return {
      lat: satellite.degreesLat(geo.latitude),
      lon: satellite.degreesLong(geo.longitude),
      altKm: geo.height,
      alt: look.elevation * (180 / Math.PI),
      az: look.azimuth * (180 / Math.PI),
      rangeKm: look.rangeSat,
    };
  }

  /* scan ahead for passes above minAlt — SGP4 is fast enough to
     brute-force 48 h at 30 s resolution in a few milliseconds */
  function findPasses(id, lat, lon, from, hours = 48, minAlt = 10, maxCount = 4) {
    const passes = [];
    let inPass = false, start = null, maxEl = 0, maxAz = 0;
    for (let t = 0; t <= hours * 3600000; t += 30000) {
      const when = new Date(from.getTime() + t);
      const o = observe(id, when, lat, lon);
      if (!o) break;
      if (o.alt > minAlt) {
        if (!inPass) { inPass = true; start = when; maxEl = 0; }
        if (o.alt > maxEl) { maxEl = o.alt; maxAz = o.az; }
      } else if (inPass) {
        inPass = false;
        passes.push({ start, end: when, maxEl, maxAz, durMin: (when - start) / 60000 });
        if (passes.length >= maxCount) break;
      }
    }
    return passes;
  }

  loadCached();

  return {
    observe,
    findPasses,
    refreshLive,
    getSource: () => source,
    has: (id) => !!satrecs[id],
  };
})();
