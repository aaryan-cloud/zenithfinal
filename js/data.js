/* ═══════════════════════════════════════════════════════════════
   ZENITH DATA · tracked objects, cities, continents, sky events
   ═══════════════════════════════════════════════════════════════ */

const COLORS = {
  station: '#4ade80',
  satellite: '#4cc9ff',
  planet: '#ffd166',
  constellation: '#a855f7',
};

/* LEO orbit models (inclination °, period min, altitude km,
   RAAN/phase seeds chosen so tracks are deterministic and distinct) */
const SAT_PARAMS = {
  iss:      { inc: 51.64, periodMin: 92.9,  altKm: 420,   raan0: 12,  u0: 80,  raanRate: -5.0 },
  tiangong: { inc: 41.47, periodMin: 92.2,  altKm: 390,   raan0: 210, u0: 10,  raanRate: -5.4 },
  hubble:   { inc: 28.47, periodMin: 95.4,  altKm: 535,   raan0: 116, u0: 200, raanRate: -6.6 },
  starlink: { inc: 53.0,  periodMin: 95.0,  altKm: 550,   raan0: 305, u0: 140, raanRate: -5.0 },
  noaa:     { inc: 98.7,  periodMin: 102.1, altKm: 870,   raan0: 64,  u0: 300, raanRate: 0.99 },
};

/* The tracked catalogue. type: station | satellite | planet | constellation */
const OBJECTS = [
  {
    id: 'iss', name: 'ISS (Zarya)', type: 'station', kind: 'Space Station',
    sat: 'iss',
    fact: 'The ISS travels at 27,600 km/h — it sees 16 sunrises every day.',
    desc: 'The International Space Station is humanity’s outpost in low-Earth orbit, continuously crewed since November 2000. It is the brightest artificial object in the sky and easily visible to the naked eye at dusk and dawn.',
    orbit: 'LEO · 51.6° inclination · ~420 km · one lap of Earth every 93 minutes',
  },
  {
    id: 'tiangong', name: 'Tiangong', type: 'station', kind: 'Space Station',
    sat: 'tiangong',
    fact: '“Tiangong” means Heavenly Palace — its core module is named Tianhe, “Harmony of the Heavens”.',
    desc: 'China’s modular space station, completed in 2022. Roughly one-fifth the mass of the ISS, it hosts rotating crews of three taikonauts conducting microgravity research.',
    orbit: 'LEO · 41.5° inclination · ~390 km · period 92 minutes',
  },
  {
    id: 'hubble', name: 'Hubble Telescope', type: 'satellite', kind: 'Space Telescope',
    sat: 'hubble',
    fact: 'Hubble’s mirror is so precise that, scaled to the width of the USA, its largest bump would be 5 cm tall.',
    desc: 'Launched in 1990, the Hubble Space Telescope re-wrote astronomy textbooks: dark energy, exoplanet atmospheres, the deepest images of the universe ever taken — all from a bus-sized observatory in low orbit.',
    orbit: 'LEO · 28.5° inclination · ~535 km · period 95 minutes',
  },
  {
    id: 'starlink', name: 'Starlink-30142', type: 'satellite', kind: 'Comms Satellite',
    sat: 'starlink',
    fact: 'Starlink satellites use krypton and argon ion thrusters — the propulsion of science fiction, flying today.',
    desc: 'One of 6,000+ Starlink broadband satellites. Shortly after launch they form spectacular “trains” of moving lights, one of the most reported UFO look-alikes in the sky.',
    orbit: 'LEO · 53° shell · ~550 km · period 95 minutes',
  },
  {
    id: 'noaa', name: 'NOAA-19', type: 'satellite', kind: 'Weather Satellite',
    sat: 'noaa',
    fact: 'NOAA-19 crosses both poles every orbit — anyone with a cheap radio can receive its live weather imagery.',
    desc: 'A polar-orbiting environmental satellite that photographs the entire planet twice a day, feeding global weather models and search-and-rescue beacons.',
    orbit: 'Sun-synchronous polar · 98.7° · ~870 km · period 102 minutes',
  },
  {
    id: 'sun', name: 'The Sun', type: 'planet', kind: 'Star', body: 'sun',
    fact: 'The Sun converts 4 million tonnes of matter into pure energy every second.',
    desc: 'Our home star — a 4.6-billion-year-old G-type dwarf containing 99.86% of the solar system’s mass. Never observe it directly without certified solar filters.',
    orbit: 'Center of the solar system · 1 AU from Earth · light takes 8 min 20 s to reach us',
  },
  {
    id: 'moon', name: 'The Moon', type: 'planet', kind: 'Natural Satellite', body: 'moon',
    fact: 'The Moon drifts 3.8 cm farther from Earth every year — dinosaurs saw much bigger full moons.',
    desc: 'Earth’s only natural satellite and the only world beyond Earth that humans have walked on. Its gravity drives our tides and stabilises Earth’s axial tilt.',
    orbit: 'Geocentric orbit · 384,400 km mean distance · sidereal period 27.3 days',
  },
  {
    id: 'mercury', name: 'Mercury', type: 'planet', kind: 'Planet', body: 'mercury',
    fact: 'A year on Mercury lasts 88 days, but one solar day there lasts 176 Earth days — the day is longer than the year.',
    desc: 'The smallest planet and closest to the Sun, Mercury is a cratered, airless world of extremes: 430 °C in sunlight, −180 °C in shadow.',
    orbit: 'Heliocentric · 0.39 AU · period 88 days · best seen at twilight near the horizon',
  },
  {
    id: 'venus', name: 'Venus', type: 'planet', kind: 'Planet', body: 'venus',
    fact: 'Venus spins backwards, so its Sun rises in the west — once every 243 Earth days.',
    desc: 'The brightest natural object after the Sun and Moon. Beneath dazzling clouds lies a runaway-greenhouse furnace hot enough to melt lead.',
    orbit: 'Heliocentric · 0.72 AU · period 225 days · the “Morning/Evening Star”',
  },
  {
    id: 'mars', name: 'Mars', type: 'planet', kind: 'Planet', body: 'mars',
    fact: 'Mars hosts Olympus Mons, a volcano three times taller than Everest with a footprint the size of France.',
    desc: 'The rust-red planet, currently home to a small fleet of robotic explorers. Its distinctive colour comes from iron-oxide dust covering the surface.',
    orbit: 'Heliocentric · 1.52 AU · period 687 days · visibly red to the naked eye',
  },
  {
    id: 'jupiter', name: 'Jupiter', type: 'planet', kind: 'Planet', body: 'jupiter',
    fact: 'Jupiter is so massive that the Sun–Jupiter barycentre lies outside the Sun itself.',
    desc: 'The giant of the solar system — 2.5× the mass of every other planet combined. Binoculars reveal its four Galilean moons shifting night to night.',
    orbit: 'Heliocentric · 5.2 AU · period 11.9 years · usually the 4th brightest object in the sky',
  },
  {
    id: 'saturn', name: 'Saturn', type: 'planet', kind: 'Planet', body: 'saturn',
    fact: 'Saturn’s rings are 280,000 km wide but in places only 10 metres thick — proportionally thinner than paper.',
    desc: 'The ringed jewel of the night sky. Even a small telescope shows the rings, made of countless ice fragments orbiting in perfect formation.',
    orbit: 'Heliocentric · 9.5 AU · period 29.5 years · golden hue to the naked eye',
  },
  {
    id: 'orion', name: 'Orion', type: 'constellation', kind: 'Constellation',
    star: { ra: 83.82, dec: 5.39 }, // near the belt / M42 region
    fact: 'Betelgeuse, Orion’s shoulder, could go supernova “any time” — astronomically, that means within 100,000 years.',
    desc: 'The Hunter — the most recognisable constellation on Earth, visible from every inhabited latitude. Its “sword” hides the Orion Nebula, a stellar nursery 1,344 light-years away.',
    orbit: 'Fixed on the celestial sphere · crosses your sky once per sidereal day',
    dist: '243 – 1,360 ly (member stars)',
  },
  {
    id: 'ursaminor', name: 'Ursa Minor', type: 'constellation', kind: 'Constellation',
    star: { ra: 37.95, dec: 89.26 }, // Polaris
    fact: 'Polaris hasn’t always been the pole star — in 3000 BCE it was Thuban, and in 12,000 years it will be Vega.',
    desc: 'The Little Bear carries Polaris, the North Star, at the tip of its tail. For northern observers it never sets, anchoring the sky’s daily rotation.',
    orbit: 'Circumpolar for northern latitudes · pivot point of the northern sky',
    dist: '433 ly (Polaris)',
  },
  {
    id: 'crux', name: 'Crux', type: 'constellation', kind: 'Constellation',
    star: { ra: 186.65, dec: -63.10 }, // Acrux
    fact: 'Crux is the smallest of all 88 constellations, yet it appears on five national flags.',
    desc: 'The Southern Cross — the southern hemisphere’s compass. Its long axis points toward the south celestial pole, guiding navigators for centuries.',
    orbit: 'Circumpolar for southern latitudes',
    dist: '88 – 364 ly (member stars)',
  },
  {
    id: 'scorpius', name: 'Scorpius', type: 'constellation', kind: 'Constellation',
    star: { ra: 247.35, dec: -26.43 }, // Antares
    fact: 'Antares means “rival of Mars” — its red glare is so strong the Greeks thought it competed with the planet.',
    desc: 'A sprawling summer scorpion whose heart, the red supergiant Antares, is so large it would swallow the orbit of Mars if placed at the Sun.',
    orbit: 'Zodiacal constellation · best in southern-sky evenings',
    dist: '554 ly (Antares)',
  },
  {
    id: 'lyra', name: 'Lyra', type: 'constellation', kind: 'Constellation',
    star: { ra: 279.23, dec: 38.78 }, // Vega
    fact: 'Vega was the first star ever photographed (1850) and the calibration zero-point for stellar brightness.',
    desc: 'A compact harp-shaped constellation anchored by brilliant Vega, one corner of the Summer Triangle and a future pole star.',
    orbit: 'High northern sky · summit of the Summer Triangle',
    dist: '25 ly (Vega)',
  },
  {
    id: 'taurus', name: 'Taurus', type: 'constellation', kind: 'Constellation',
    star: { ra: 68.98, dec: 16.51 }, // Aldebaran
    fact: 'The Pleiades cluster in Taurus appears in art from 17,000-year-old cave paintings to the Subaru logo.',
    desc: 'The Bull charges across the winter sky with the orange eye of Aldebaran and two famous star clusters: the Hyades and the Pleiades.',
    orbit: 'Zodiacal constellation · winter evenings in the north',
    dist: '65 ly (Aldebaran)',
  },
];

/* ── offline city index (instant search, no network needed) ── */
const CITIES = [
  ['New Delhi', 'India', 28.6139, 77.209], ['Mumbai', 'India', 19.076, 72.8777],
  ['Bengaluru', 'India', 12.9716, 77.5946], ['Kolkata', 'India', 22.5726, 88.3639],
  ['Chennai', 'India', 13.0827, 80.2707], ['Hyderabad', 'India', 17.385, 78.4867],
  ['London', 'United Kingdom', 51.5074, -0.1278], ['Paris', 'France', 48.8566, 2.3522],
  ['Berlin', 'Germany', 52.52, 13.405], ['Madrid', 'Spain', 40.4168, -3.7038],
  ['Rome', 'Italy', 41.9028, 12.4964], ['Reykjavik', 'Iceland', 64.1466, -21.9426],
  ['Moscow', 'Russia', 55.7558, 37.6173], ['Istanbul', 'Türkiye', 41.0082, 28.9784],
  ['Dubai', 'UAE', 25.2048, 55.2708], ['Singapore', 'Singapore', 1.3521, 103.8198],
  ['Tokyo', 'Japan', 35.6762, 139.6503], ['Seoul', 'South Korea', 37.5665, 126.978],
  ['Beijing', 'China', 39.9042, 116.4074], ['Shanghai', 'China', 31.2304, 121.4737],
  ['Bangkok', 'Thailand', 13.7563, 100.5018], ['Jakarta', 'Indonesia', -6.2088, 106.8456],
  ['Sydney', 'Australia', -33.8688, 151.2093], ['Melbourne', 'Australia', -37.8136, 144.9631],
  ['Auckland', 'New Zealand', -36.8509, 174.7645], ['New York', 'USA', 40.7128, -74.006],
  ['Los Angeles', 'USA', 34.0522, -118.2437], ['Chicago', 'USA', 41.8781, -87.6298],
  ['Houston', 'USA', 29.7604, -95.3698], ['San Francisco', 'USA', 37.7749, -122.4194],
  ['Seattle', 'USA', 47.6062, -122.3321], ['Toronto', 'Canada', 43.6532, -79.3832],
  ['Vancouver', 'Canada', 49.2827, -123.1207], ['Mexico City', 'Mexico', 19.4326, -99.1332],
  ['São Paulo', 'Brazil', -23.5505, -46.6333], ['Rio de Janeiro', 'Brazil', -22.9068, -43.1729],
  ['Buenos Aires', 'Argentina', -34.6037, -58.3816], ['Santiago', 'Chile', -33.4489, -70.6693],
  ['Lima', 'Peru', -12.0464, -77.0428], ['Bogotá', 'Colombia', 4.711, -74.0721],
  ['Cairo', 'Egypt', 30.0444, 31.2357], ['Lagos', 'Nigeria', 6.5244, 3.3792],
  ['Nairobi', 'Kenya', -1.2921, 36.8219], ['Cape Town', 'South Africa', -33.9249, 18.4241],
  ['Johannesburg', 'South Africa', -26.2041, 28.0473], ['Casablanca', 'Morocco', 33.5731, -7.5898],
  ['Tehran', 'Iran', 35.6892, 51.389], ['Riyadh', 'Saudi Arabia', 24.7136, 46.6753],
  ['Karachi', 'Pakistan', 24.8607, 67.0011], ['Dhaka', 'Bangladesh', 23.8103, 90.4125],
  ['Kathmandu', 'Nepal', 27.7172, 85.324], ['Colombo', 'Sri Lanka', 6.9271, 79.8612],
  ['Honolulu', 'USA', 21.3069, -157.8583], ['Anchorage', 'USA', 61.2181, -149.9003],
  ['Oslo', 'Norway', 59.9139, 10.7522], ['Stockholm', 'Sweden', 59.3293, 18.0686],
  ['Helsinki', 'Finland', 60.1699, 24.9384], ['Athens', 'Greece', 37.9838, 23.7275],
  ['Lisbon', 'Portugal', 38.7223, -9.1393], ['Amsterdam', 'Netherlands', 52.3676, 4.9041],
];

/* ── very low-res continent outlines for the wireframe globe ── */
const CONTINENTS = [
  // North America
  [[71,-156],[70,-128],[72,-95],[66,-82],[58,-94],[51,-80],[47,-71],[45,-60],[40,-74],[35,-77],[30,-81],[25,-80],[29,-90],[26,-97],[18,-96],[15,-92],[16,-99],[23,-110],[32,-117],[40,-124],[48,-125],[58,-137],[60,-146],[59,-154],[66,-166],[70,-162]],
  // Greenland
  [[83,-35],[80,-18],[70,-22],[60,-43],[65,-52],[76,-62],[81,-60]],
  // South America
  [[11,-72],[9,-60],[5,-52],[0,-50],[-5,-35],[-13,-38],[-23,-41],[-30,-50],[-35,-57],[-39,-62],[-47,-66],[-54,-69],[-53,-72],[-46,-75],[-37,-73],[-23,-70],[-14,-76],[-5,-81],[1,-80],[7,-78],[9,-75]],
  // Europe
  [[71,27],[68,40],[60,30],[57,22],[54,13],[49,2],[44,-2],[43,-9],[37,-9],[36,-5],[39,0],[43,4],[44,10],[41,17],[37,15],[40,19],[38,24],[41,27],[45,30],[47,32],[50,32],[55,28],[60,28],[63,21],[60,17],[63,10],[68,15],[70,22]],
  // Africa
  [[35,-6],[37,10],[33,11],[31,20],[31,32],[27,34],[15,39],[12,43],[11,51],[2,46],[-5,39],[-15,40],[-22,35],[-27,33],[-34,26],[-34,19],[-29,16],[-22,14],[-15,12],[-8,13],[-1,9],[4,9],[6,3],[5,-4],[7,-13],[12,-17],[15,-17],[21,-17],[25,-15],[31,-10],[33,-7]],
  // Asia
  [[68,45],[70,68],[73,85],[76,105],[73,125],[71,140],[67,170],[64,178],[62,164],[59,155],[54,142],[47,138],[43,132],[39,126],[37,122],[31,122],[28,116],[22,110],[18,108],[12,109],[8,105],[10,99],[14,98],[16,94],[21,92],[22,89],[16,82],[10,80],[8,77],[15,74],[21,70],[24,68],[25,62],[27,57],[26,52],[30,48],[30,40],[36,36],[37,30],[41,29],[42,35],[41,42],[42,48],[45,53],[42,55],[45,60],[50,55],[55,55],[60,50],[66,42]],
  // Australia
  [[-11,131],[-12,136],[-15,141],[-11,142],[-16,146],[-21,149],[-25,153],[-32,153],[-37,150],[-39,146],[-38,141],[-35,137],[-32,134],[-33,127],[-34,122],[-33,116],[-29,114],[-23,113],[-20,116],[-18,122],[-14,126],[-13,130]],
];

/* ── curated annual sky events (next occurrence auto-selected) ─ */
const METEOR_SHOWERS = [
  { name: 'Quadrantids', month: 0, day: 3, rate: 110, note: 'Sharp 6-hour peak, deep-blue fireballs' },
  { name: 'Lyrids', month: 3, day: 22, rate: 18, note: 'Debris of Comet Thatcher, occasional outbursts' },
  { name: 'Eta Aquariids', month: 4, day: 5, rate: 50, note: 'Dust of Halley’s Comet, best pre-dawn' },
  { name: 'Perseids', month: 7, day: 12, rate: 100, note: 'The summer classic — fast, bright, abundant' },
  { name: 'Orionids', month: 9, day: 21, rate: 20, note: 'Halley’s Comet debris, swift meteors' },
  { name: 'Leonids', month: 10, day: 17, rate: 15, note: 'Famous for historic meteor storms' },
  { name: 'Geminids', month: 11, day: 14, rate: 150, note: 'The strongest shower of the year' },
];

const ECLIPSES = [
  { date: '2026-08-12', name: 'Total Solar Eclipse', meta: 'Totality across Greenland, Iceland and northern Spain' },
  { date: '2026-08-28', name: 'Partial Lunar Eclipse', meta: 'Visible from the Americas, Europe and Africa' },
  { date: '2027-02-06', name: 'Annular Solar Eclipse', meta: '“Ring of fire” over the South Atlantic' },
  { date: '2027-08-02', name: 'Total Solar Eclipse', meta: '6 min 23 s of totality over Egypt — longest until 2114' },
];
