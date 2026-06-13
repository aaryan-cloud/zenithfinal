/* ═══════════════════════════════════════════════════════════════
   EPHEMERIS SERVICE
   Positions of the Sun, Moon and planets.

   Primary engine:  astronomy-engine (VSOP87-class accuracy, vendored)
   Fallback engine: js/astro.js — the hand-built Keplerian engine —
                    keeps every feature alive even if the vendor
                    bundle fails to load.

   The same interface also serves fixed-RA/Dec targets
   (constellation anchor stars).
   ═══════════════════════════════════════════════════════════════ */

const EphemerisService = (() => {
  const hasEngine = typeof Astronomy !== 'undefined';
  const AU_KM = 149597870.7;

  const BODY_MAP = hasEngine ? {
    sun: Astronomy.Body.Sun,
    moon: Astronomy.Body.Moon,
    mercury: Astronomy.Body.Mercury,
    venus: Astronomy.Body.Venus,
    mars: Astronomy.Body.Mars,
    jupiter: Astronomy.Body.Jupiter,
    saturn: Astronomy.Body.Saturn,
  } : {};

  /* alt/az + distance of a solar-system body */
  function body(name, date, lat, lon) {
    if (hasEngine) {
      const obs = new Astronomy.Observer(lat, lon, 0);
      const eq = Astronomy.Equator(BODY_MAP[name], date, obs, true, true);
      const hor = Astronomy.Horizon(date, obs, eq.ra, eq.dec, 'normal');
      return { alt: hor.altitude, az: hor.azimuth, distKm: eq.dist * AU_KM, distAU: eq.dist, ra: eq.ra * 15, dec: eq.dec };
    }
    // fallback engine
    let p;
    if (name === 'sun') p = { ...Astro.sunPos(date), distKm: Astro.sunPos(date).distAU * AU_KM };
    else if (name === 'moon') { p = Astro.moonPos(date); p.distAU = p.distKm / AU_KM; }
    else { p = Astro.planetPos(name, date); p.distKm = p.distAU * AU_KM; }
    const aa = Astro.raDecToAltAz(p.ra, p.dec, lat, lon, date);
    return { alt: aa.alt, az: aa.az, distKm: p.distKm, distAU: p.distAU ?? p.distKm / AU_KM, ra: p.ra, dec: p.dec };
  }

  /* alt/az of a fixed celestial coordinate (constellation anchors) */
  function fixed(ra, dec, date, lat, lon) {
    return Astro.raDecToAltAz(ra, dec, lat, lon, date);
  }

  /* next rise above the horizon; null if it never rises */
  function nextRise(name, date, lat, lon) {
    if (hasEngine) {
      const obs = new Astronomy.Observer(lat, lon, 0);
      try {
        const t = Astronomy.SearchRiseSet(BODY_MAP[name], obs, +1, date, 2);
        return t ? t.date : null;
      } catch { return null; }
    }
    const getter = (d) => {
      if (name === 'sun') return Astro.sunPos(d);
      if (name === 'moon') return Astro.moonPos(d);
      return Astro.planetPos(name, d);
    };
    return Astro.nextRise(getter, lat, lon, date);
  }

  function nextRiseFixed(ra, dec, date, lat, lon) {
    return Astro.nextRise(() => ({ ra, dec }), lat, lon, date);
  }

  function moonPhase(date) {
    if (hasEngine) {
      const illum = Astronomy.Illumination(Astronomy.Body.Moon, date);
      const angle = Astronomy.MoonPhase(date);
      let name;
      if (angle < 22.5 || angle >= 337.5) name = 'New Moon';
      else if (angle < 67.5) name = 'Waxing Crescent';
      else if (angle < 112.5) name = 'First Quarter';
      else if (angle < 157.5) name = 'Waxing Gibbous';
      else if (angle < 202.5) name = 'Full Moon';
      else if (angle < 247.5) name = 'Waning Gibbous';
      else if (angle < 292.5) name = 'Last Quarter';
      else name = 'Waning Crescent';
      let nextFull = null, nextNew = null;
      try {
        nextFull = Astronomy.SearchMoonPhase(180, date, 40)?.date || null;
        nextNew = Astronomy.SearchMoonPhase(0, date, 40)?.date || null;
      } catch { /* phase dates are decorative */ }
      return { name, illum: Math.round(illum.phase_fraction * 100), nextFull, nextNew };
    }
    return { ...Astro.moonPhase(date), nextFull: null, nextNew: null };
  }

  /* sub-solar point for the globe's day/night terminator */
  function sunSubpoint(date) {
    return Astro.sunSubpoint(date);
  }

  return {
    body, fixed, nextRise, nextRiseFixed, moonPhase, sunSubpoint,
    engineName: hasEngine ? 'astronomy-engine (VSOP87)' : 'internal Keplerian engine',
    usingVendor: hasEngine,
  };
})();
