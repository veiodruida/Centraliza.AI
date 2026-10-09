/**
 * Live-resize test: simulates dragging the window from big → small → big,
 * checking for page overflow, clipped numbers and clipped text at every step.
 */
import { chromium } from 'playwright';

const BASE = 'http://localhost:4000';
const ROUTES = ['/hardware', '/explore', '/models', '/centralize', '/dashboard', '/test'];

const SIZES = [
  { w: 1920, h: 1080 }, { w: 1600, h: 900 }, { w: 1440, h: 900 }, { w: 1366, h: 768 },
  { w: 1280, h: 800 }, { w: 1100, h: 700 }, { w: 1024, h: 768 }, { w: 900, h: 700 },
  { w: 768, h: 1024 }, { w: 640, h: 480 }, { w: 500, h: 700 }, { w: 414, h: 896 }, { w: 360, h: 640 },
];

const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext({ viewport: { width: 1920, height: 1080 } });
const page = await ctx.newPage();
let problems = 0;

for (const route of ROUTES) {
  const pageLabel = route.replace('/', '') || 'dashboard';
  await page.goto(BASE + route, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(route === '/hardware' || route === '/explore' ? 2500 : 1800);

  // Shrink
  for (const s of SIZES) {
    await page.setViewportSize({ width: s.w, height: s.h });
    await page.waitForTimeout(120);
    const issues = await page.evaluate(() => {
      const out = [];
      const vw = window.innerWidth;
      if (document.documentElement.scrollWidth > vw + 1) out.push(`PAGE-OVERFLOW(${document.documentElement.scrollWidth}>${vw})`);
      for (const el of document.querySelectorAll('.num-fluid, .num-fluid-hero')) {
        if (el.scrollWidth > el.clientWidth + 1) out.push(`NUM-CLIPPED "${el.textContent.trim()}"`);
      }
      for (const el of document.querySelectorAll('body *')) {
        const st = getComputedStyle(el);
        if (st.display === 'none' || st.visibility === 'hidden') continue;
        if (st.position === 'absolute' && (isNaN(parseFloat(st.opacity)) || parseFloat(st.opacity) < 0.15)) continue;
        if (st.overflowX === 'hidden' && st.whiteSpace === 'nowrap' && el.scrollWidth > el.clientWidth + 2 && el.clientWidth > 0) {
          if (!el.hasAttribute('title') && !el.closest('[title]')) {
            const txt = (el.textContent || '').trim().slice(0, 40);
            if (txt) out.push(`CLIPPED "${txt}"`);
          }
        }
      }
      return out;
    });
    if (issues.length) {
      problems += issues.length;
      console.log(`❌ ${pageLabel.padEnd(11)} shrink→ ${s.w}x${s.h} ${issues.join(' | ')}`);
    }
  }
  // Grow back
  for (const s of [...SIZES].reverse()) {
    await page.setViewportSize({ width: s.w, height: s.h });
    await page.waitForTimeout(120);
    const issues = await page.evaluate(() => {
      const out = [];
      const vw = window.innerWidth;
      if (document.documentElement.scrollWidth > vw + 1) out.push(`PAGE-OVERFLOW`);
      for (const el of document.querySelectorAll('.num-fluid, .num-fluid-hero')) {
        if (el.scrollWidth > el.clientWidth + 1) out.push(`NUM-CLIPPED "${el.textContent.trim()}"`);
      }
      return out;
    });
    if (issues.length) {
      problems += issues.length;
      console.log(`❌ ${pageLabel.padEnd(11)} grow→ ${s.w}x${s.h} ${issues.join(' | ')}`);
    }
  }
  console.log(`✅ ${pageLabel} resize cycle done`);
}

await browser.close();
console.log(problems === 0 ? '\n✅ RESIZE TEST: ALL CLEAN' : `\n⚠ ${problems} issue(s) during resize`);
