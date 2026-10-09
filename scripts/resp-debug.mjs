/**
 * Deep diagnostic: find descendants whose right edge exceeds the root element's right edge.
 * Usage: node scripts/resp-debug.mjs <path> <width> <height> [selector]
 */
import { chromium } from 'playwright';

const BASE = 'http://localhost:4000';
const route = process.argv[2] || '/explore';
const width = Number(process.argv[3] || 1280);
const height = Number(process.argv[4] || 800);
const rootSel = process.argv[5] || '';

const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext({ viewport: { width, height } });
const page = await ctx.newPage();
await page.goto(BASE + route, { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(2800);

const res = await page.evaluate((rootSel) => {
  const roots = rootSel ? Array.from(document.querySelectorAll(rootSel)) : [document.body];
  const results = [];
  for (const root of roots) {
    const rootRect = root.getBoundingClientRect();
    const walk = (el, depth) => {
      if (depth > 14) return;
      const r = el.getBoundingClientRect();
      const style = getComputedStyle(el);
      if (style.display === 'none' || style.visibility === 'hidden') return;
      const over = r.right - (rootRect.right - 1);
      if (over > 2 && r.width > 0) {
        results.push({
          tag: el.tagName.toLowerCase(),
          cls: (typeof el.className === 'string' ? el.className : '').slice(0, 120),
          right: Math.round(r.right),
          rootRight: Math.round(rootRect.right),
          over: Math.round(over),
          w: Math.round(r.width),
          text: (el.textContent || '').trim().slice(0, 60),
          depth
        });
      }
      for (const c of el.children) walk(c, depth + 1);
    };
    for (const c of root.children) walk(c, 0);
  }
  const seen = new Set();
  return results.filter(o => {
    const k = o.cls + '|' + o.text;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  }).slice(0, 30);
}, rootSel);

console.log(`\n=== ${route} @ ${width}x${height} root="${rootSel || 'body'}" ===`);
if (!res.length) console.log('  (no descendants overflow the root)');
for (const o of res) {
  console.log(`  <${o.tag}> over=${o.over}px right=${o.right} w=${o.w} depth=${o.depth}`);
  console.log(`    cls=[${o.cls}]`);
  console.log(`    text="${o.text}"`);
}
await browser.close();
