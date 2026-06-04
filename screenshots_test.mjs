import { chromium } from 'playwright';
import { existsSync, mkdirSync } from 'fs';

const BASE = 'http://localhost:4000';
const OUT = 'c:/Users/veio_/Documents/Projetos/Centraliza.AI/screenshots';

if (!existsSync(OUT)) mkdirSync(OUT, { recursive: true });

const VIEWPORTS = [
  { w: 1024, h: 768, label: '1024' },
  { w: 1280, h: 800, label: '1280' },
  { w: 1440, h: 900, label: '1440' },
];

const PAGES = [
  { path: '/', label: 'dashboard', wait: 2000 },
  { path: '/hardware', label: 'hardware', wait: 3000 },
  { path: '/explore', label: 'hub_modelos', wait: 3000 },
  { path: '/centralize', label: 'centralizacao', wait: 2000 },
];

const browser = await chromium.launch({ headless: true });

for (const vp of VIEWPORTS) {
  const ctx = await browser.newContext({ viewport: { width: vp.w, height: vp.h } });
  const page = await ctx.newPage();

  for (const pg of PAGES) {
    await page.goto(BASE + pg.path);
    await page.waitForTimeout(pg.wait);
    const file = `${OUT}/${pg.label}_${vp.label}.png`;
    await page.screenshot({ path: file, fullPage: false });
    console.log(`✓ ${file}`);
  }

  await ctx.close();
}

await browser.close();
console.log('Done.');
