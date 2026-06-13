# ✦ Project Zenith — The Celestial Eye

**Real-time cosmic radar for any location on Earth.**
Pick any point on the planet — click the globe, search a city, type coordinates, or use your GPS — and watch the ISS, satellites, Sun, Moon, planets and constellations pass overhead. Live, in the past, or in the future.

## 🚀 Quick start

```bash
npm install
npm run dev      # → http://localhost:3000
```

That's it. No build step, no API keys, no environment variables required.
(You can even skip npm entirely and open `index.html` directly — the app is fully static.)

```bash
npm test         # headless-browser smoke test (installs Playwright browsers on first run)
```

## 🔑 Environment variables

**None are required.** Every data source used is keyless:

| Variable | Status | Notes |
|---|---|---|
| `PORT` | optional | Dev-server port (default `3000`) |
| `NASA_API_KEY` | future | Reserved for the NASA Horizons upgrade path described in the in-app Blueprint — the service files in `js/services/` are structured so it can be wired in without touching UI code |

## ▲ Deploy to Vercel

The project is a static site — deployment takes under a minute:

1. Push this repository to GitHub.
2. Go to [vercel.com/new](https://vercel.com/new) and import the repo.
3. Framework preset: **Other** · Build command: *(leave empty)* · Output directory: `./`
4. Deploy. The included `vercel.json` adds immutable caching for the vendored astronomy libraries.

CLI alternative: `npx vercel --prod` from the project root.
Also works on GitHub Pages, Netlify, Cloudflare Pages — any static host.

## 🌌 Feature tour

| Feature | What it does |
|---|---|
| **Interactive Earth** | Drag-to-rotate holographic globe with day/night terminator. **Click any point** to relocate the Eye; search 60+ offline cities (plus live geocoding), enter lat/lon manually, or use browser GPS. Pulsing marker on the selected site |
| **Celestial radar** | Sweeping polar radar of everything above your horizon — zenith at the bullseye, horizon at the rim |
| **18-object dashboard** | ISS, Tiangong, Hubble, Starlink, NOAA-19, Sun, Moon, Mercury→Saturn, 6 constellations — each card shows altitude, azimuth, **distance from zenith**, visibility status, next pass/rise time and an educational fact |
| **Near-zenith detection** | A gold banner always names the object closest to straight-up, with its angular distance from zenith |
| **Live orbit theatre** | Animated satellite trails and ISS ground track; objects near *your* zenith glow gold |
| **AI Cosmic Guide** | Rule-based narration grounded in the live ephemeris — e.g. *"The ISS will pass close to zenith in 43 minutes"*. No paid AI API |
| **Time Travel Sky** | Slider plus presets (−24 h · Now · +30 m · +1 h · +6 h · Tomorrow) — radar, cards, globe and guide all follow |
| **Space events** | Computed ISS flyovers and planet conjunctions for your location, meteor showers, eclipse alerts, moon phase and tonight's best dark-sky viewing window |
| **Object detail modal** | Description, computed distance, orbit data, **data source used**, fun fact, and an animated ±6 h sky-trajectory chart |

## 🔭 Data & accuracy

| Layer | Engine | Source |
|---|---|---|
| Satellites | **satellite.js** — real SGP4/NORAD propagation | CelesTrak TLEs (live fetch) with a **cached element set** shipped in the bundle |
| Sun/Moon/planets | **astronomy-engine** — VSOP87-class, refraction-corrected | Vendored, runs fully offline |
| Fallback | Hand-built Keplerian engine (`js/astro.js`) | Takes over seamlessly if a vendor bundle ever fails to load |
| ISS live fix | wheretheiss.at telemetry | Polled every 10 s; SGP4 covers outages and Time Travel |
| Geocoding | Open-Meteo + BigDataCloud (keyless) | 60-city offline index as fallback |

**Nothing depends on a live API** — every network call is a progressive enhancement with a local fallback, and the status chips in the Radar section always show which source is active.

Validation: select Tokyo (35.7° N) and the Ursa Minor card reads ≈35.5° altitude — Polaris sits at your latitude, exactly as the sky demands. 🎯

## 🗂 Project structure

```
index.html              single-page app shell
css/style.css           dark space theme · glassmorphism · responsive
js/astro.js             hand-built ephemeris engine (fallback + conjunction scanner)
js/data.js              object catalogue, cities, continents, sky events
js/services/
  tle-service.js        SGP4 propagation · CelesTrak live + cached TLEs
  ephemeris-service.js  astronomy-engine wrapper with engine fallback
  iss-service.js        live ISS telemetry poller
js/visuals.js           canvas renderers: starfield, globe, radar, orbits, trajectory
js/app.js               UI orchestrator
js/vendor/              vendored satellite.js + astronomy-engine (offline-ready)
server.js               zero-dependency dev server
test/smoke.js           Playwright end-to-end smoke test
```

## 🗺 Production blueprint

The in-app **Blueprint** section covers the full scale-up plan for judges: NASA JPL Horizons + CelesTrak ingestion, the Next.js/TypeScript/CesiumJS/Tailwind migration path, a 4-week feasibility timeline, the accuracy approach, the offline strategy, and future scope (AR Sky View, pass push-alerts).

---
*Built for the stars, rendered for the judges.*
