/* ═══════════════════════════════════════════════════════════════
   ISS LIVE TELEMETRY SERVICE
   Polls wheretheiss.at (keyless, CORS-enabled) for the real ISS
   position. When unreachable — or when Time Travel is engaged —
   consumers fall back to SGP4 propagation from the TLE service.
   ═══════════════════════════════════════════════════════════════ */

const ISSService = (() => {
  const API = 'https://api.wheretheiss.at/v1/satellites/25544';
  const FRESH_MS = 30000;
  let last = null; // { lat, lon, altKm, ts }
  let listeners = [];

  async function poll() {
    try {
      const r = await fetch(API, { signal: AbortSignal.timeout(8000) });
      if (!r.ok) throw new Error(String(r.status));
      const j = await r.json();
      last = { lat: j.latitude, lon: j.longitude, altKm: j.altitude, ts: Date.now() };
    } catch {
      last = null;
    }
    listeners.forEach((fn) => fn(isLive()));
  }

  function isLive() {
    return !!(last && Date.now() - last.ts < FRESH_MS);
  }

  return {
    start() { poll(); setInterval(poll, 10000); },
    /* live fix if fresh and we're viewing "now", else null */
    position(offsetHours) {
      return offsetHours === 0 && isLive() ? last : null;
    },
    isLive,
    onUpdate(fn) { listeners.push(fn); },
  };
})();
