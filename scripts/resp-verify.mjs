/**
 * Final verification:
 * 1. No horizontal page overflow.
 * 2. .num-fluid numbers on /hardware fully visible (scrollWidth <= clientWidth, inside card).
 * 3. Any genuinely-clipped text (nowrap + overflow hidden + scrollW>clientW) WITHOUT a title tooltip.
 */
import { chromium } from 'playwright';

const BASE = 'http://localhost:4000';
const VIEWPORTS = [
  { w: 360, h: 640, label: '360' },
  { w: 500, h: 700, label: '500' },
  { w: 768, h: 1024, label: '768' },
  { w: 1024, h: 768, label: '1024' },
  { w: 1100, h: 700, label: '1100' },
  { w: 1280, h: 800, label: '1280' },
  { w: 1440, h: 900, label: '1440' },
  { w: 1920, h: 1080, label: '1920' },
  { w: 2560, h: 1440, label: '2560' },
];
const PAGES = [
  '/', '/hardware', '/models', '/explore', '/centralize', '/test', '/coder', '/settings', '/extensions'
];

const browser = await chromium.launch({ headless: true });
let problems = 0;

for (const vp of VIEWPORTS) {
  const ctx = await browser.newContext({ viewport: { width: vp.w, height: vp.h } });
  const page = await ctx.newPage();
  for (const route of PAGES) {
    await page.goto(BASE + route, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(route === '/hardware' || route === '/explore' ? 2600 : 1800);
    const res = await page.evaluate(() => {
      const issues = [];
      const vw = window.innerWidth;
      if (document.documentElement.scrollWidth > vw + 1) {
        issues.push(`PAGE-H-OVERFLOW(${document.documentElement.scrollWidth}>${vw})`);
      }
      // num-fluid fully visible
      for (const el of document.querySelectorAll('.num-fluid, .num-fluid-hero')) {
        if (el.scrollWidth > el.clientWidth + 1) {
          issues.push(`NUM-CLIPPED "${el.textContent.trim()}" scrollW=${el.scrollWidth} clientW=${el.clientWidth}`);
        }
      }
      // genuinely clipped text without title affordance
      for (const el of document.querySelectorAll('body *')) {
        const st = getComputedStyle(el);
        if (st.display === 'none' || st.visibility === 'hidden') continue;
        if (st.position === 'absolute' && (isNaN(parseFloat(st.opacity)) || parseFloat(st.opacity) < 0.15)) continue;
        if (st.overflowX === 'hidden' && st.whiteSpace === 'nowrap' && el.scrollWidth > el.clientWidth + 2 && el.clientWidth > 0) {
          if (!el.hasAttribute('title') && !el.closest('[title]')) {
            const txt = (el.textContent || '').trim().slice(0, 50);
            if (txt) issues.push(`CLIPPED-NO-TITLE <${el.tagName.toLowerCase()}> "${txt}" ${el.scrollWidth}>${el.clientWidth}`);
          }
        }
      }
      return issues;
    });
    if (res.length) {
      problems += res.length;
      console.log(`❌ ${route.padEnd(11)} @ ${vp.label.padEnd(5)} ${res.join(' | ')}`);
    }
  }
  await ctx.close();
}

await browser.close();
console.log(problems === 0 ? '\n✅ ALL CLEAN' : `\n⚠ ${problems} issue(s) found`);
