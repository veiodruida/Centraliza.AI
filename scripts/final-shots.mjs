import { chromium } from 'playwright';
import { mkdirSync } from 'fs';

const OUT = 'screenshots/final';
mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch({ headless: true });

const jobs = [
  ['/hardware', [[360, 640, '360'], [500, 700, '500'], [768, 1024, '768'], [1024, 768, '1024'], [1280, 800, '1280'], [1440, 900, '1440'], [1920, 1080, '1920']]],
  ['/', [[1280, 800, '1280'], [360, 640, '360']]],
  ['/explore', [[1280, 800, '1280'], [360, 640, '360'], [1024, 768, '1024']]],
  ['/centralize', [[1280, 800, '1280'], [360, 640, '360']]],
  ['/models', [[1280, 800, '1280'], [360, 640, '360']]],
  ['/test', [[1024, 768, '1024'], [1280, 800, '1280']]],
];

for (const [route, vps] of jobs) {
  for (const [w, h, label] of vps) {
    const ctx = await browser.newContext({ viewport: { width: w, height: h } });
    const page = await ctx.newPage();
    await page.goto('http://localhost:4000' + route, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(route === '/hardware' || route === '/explore' ? 2600 : 1800);
    const name = (route.replace('/', '') || 'dashboard') + '_' + label + '.png';
    await page.screenshot({ path: OUT + '/' + name });
    console.log('✓', name);
    await ctx.close();
  }
}

await browser.close();
