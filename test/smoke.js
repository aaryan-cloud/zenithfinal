/* Headless smoke test: load the page, capture console errors,
   exercise the main interactions, take screenshots. */
const { chromium } = require('playwright');
const http = require('http');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const MIME = { '.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript', '.svg': 'image/svg+xml' };

const server = http.createServer((req, res) => {
  const file = path.join(root, req.url === '/' ? 'index.html' : decodeURIComponent(req.url.split('?')[0]));
  fs.readFile(file, (err, data) => {
    if (err) { res.writeHead(404); res.end(); return; }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'text/plain' });
    res.end(data);
  });
});

(async () => {
  await new Promise((r) => server.listen(8901, r));
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const errors = [];
  // external APIs (live ISS, geocoding, fonts) are expected to be
  // unreachable in CI sandboxes — the app falls back gracefully
  page.on('console', (m) => {
    if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) errors.push(m.text());
  });
  page.on('pageerror', (e) => errors.push(String(e)));

  await page.goto('http://localhost:8901/', { waitUntil: 'networkidle', timeout: 30000 }).catch(() => {});
  await page.waitForTimeout(2500);
  await page.screenshot({ path: 'test/shot-hero.png' });

  // sanity: computed values present
  const visible = await page.textContent('#statVisible');
  const lst = await page.textContent('#locLST');
  const cards = await page.locator('.obj-card').count();
  console.log('visible objects:', visible, '| LST:', lst, '| cards:', cards);
  console.log('zenith banner:', (await page.textContent('#zenithBanner')).replace(/\s+/g, ' ').trim().slice(0, 110));
  console.log('data status:', (await page.textContent('#dataStatus')).replace(/\s+/g, ' ').trim());

  // globe click-to-pick: click upper-left of the globe sphere
  await page.locator('#globeCanvas').scrollIntoViewIfNeeded();
  await page.waitForTimeout(400);
  const globe = await page.locator('#globeCanvas').boundingBox();
  await page.mouse.click(globe.x + globe.width / 2 - globe.height * 0.15, globe.y + globe.height / 2 - globe.height * 0.15);
  await page.waitForTimeout(900);
  console.log('place after globe click:', await page.textContent('#locName'));

  // globe + search interaction
  await page.click('a[href="#skymap"]');
  await page.fill('#citySearch', 'tokyo');
  await page.waitForTimeout(700);
  const results = await page.locator('.search-results button').count();
  console.log('search results for "tokyo":', results);
  if (results) await page.locator('.search-results button').first().click();
  await page.waitForTimeout(1500);
  console.log('place after search:', await page.textContent('#locName'));
  await page.locator('#skymap').screenshot({ path: 'test/shot-globe.png' });

  // radar
  await page.locator('#radar').scrollIntoViewIfNeeded();
  await page.waitForTimeout(1200);
  await page.locator('#radar').screenshot({ path: 'test/shot-radar.png' });

  // filter tab
  await page.click('[data-filter="planet"]');
  await page.waitForTimeout(400);
  console.log('planet cards:', await page.locator('.obj-card').count());
  await page.click('[data-filter="all"]');

  // modal
  await page.locator('.obj-card').first().click();
  await page.waitForTimeout(900);
  console.log('modal name:', await page.textContent('#modalName'));
  await page.screenshot({ path: 'test/shot-modal.png' });
  await page.click('#modalClose');

  // orbits + guide
  await page.locator('#orbits').scrollIntoViewIfNeeded();
  await page.waitForTimeout(1500);
  await page.locator('#orbits').screenshot({ path: 'test/shot-orbits.png' });
  await page.locator('#guide').scrollIntoViewIfNeeded();
  await page.waitForTimeout(3500);
  const guide = await page.textContent('#guideText');
  console.log('guide text:', guide.slice(0, 220).replace(/\n/g, ' '));

  // time travel: preset buttons + slider
  await page.locator('#timetravel').scrollIntoViewIfNeeded();
  await page.click('.tt-preset[data-h="6"]');
  await page.waitForTimeout(1200);
  console.log('tt mode (+6h preset):', await page.textContent('#ttMode'), '|', await page.textContent('#ttTime'));
  await page.click('.tt-preset[data-h="24"]');
  await page.waitForTimeout(600);
  console.log('tt mode (Tomorrow):', await page.textContent('#ttMode'));
  await page.locator('#timetravel').screenshot({ path: 'test/shot-timetravel.png' });
  await page.click('#ttReset');

  // events
  await page.locator('#events').scrollIntoViewIfNeeded();
  await page.waitForTimeout(800);
  console.log('iss events:', (await page.textContent('#issEvents')).trim().slice(0, 120).replace(/\s+/g, ' '));
  console.log('conjunctions:', (await page.textContent('#conjEvents')).trim().slice(0, 140).replace(/\s+/g, ' '));
  console.log('sky conditions:', (await page.textContent('#skyEvents')).trim().slice(0, 160).replace(/\s+/g, ' '));
  await page.locator('#events').screenshot({ path: 'test/shot-events.png' });
  await page.locator('#blueprint').scrollIntoViewIfNeeded();
  await page.waitForTimeout(800);
  await page.locator('#blueprint').screenshot({ path: 'test/shot-blueprint.png' });

  // mobile viewport
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('http://localhost:8901/', { waitUntil: 'load' });
  await page.waitForTimeout(2000);
  await page.screenshot({ path: 'test/shot-mobile.png' });

  console.log('\nCONSOLE/PAGE ERRORS:', errors.length ? errors : 'none');
  await browser.close();
  server.close();
  process.exit(errors.length ? 1 : 0);
})();
