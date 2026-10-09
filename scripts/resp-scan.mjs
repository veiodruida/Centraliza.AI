/**
 * Responsiveness scanner: checks every page at multiple viewports for
 * horizontal overflow, clipped content (overflow:hidden with wider content)
 * and elements sticking out of the right edge. Saves screenshots too.
 */
import { chromium } from 'playwright';
import { existsSync, mkdirSync, writeFileSync } from 'fs';
import path from 'path';

const BASE = 'http://localhost:4000';
const OUT = path.join(process.cwd(), 'screenshots', 'resp-scan');
const REPORT = path.join(process.cwd(), 'screenshots', 'resp-report.json');

if (!existsSync(OUT)) mkdirSync(OUT, { recursive: true });

const VIEWPORTS = [
  { w: 360,  h: 640,  label: '360x640' },
  { w: 414,  h: 896,  label: '414x896' },
  { w: 500,  h: 700,  label: '500x700' },
  { w: 640,  h: 480,  label: '640x480' },
  { w: 768,  h: 1024, label: '768x1024' },
  { w: 820,  h: 1180, label: '820x1180' },
  { w: 1024, h: 768,  label: '1024x768' },
  { w: 1100, h: 700,  label: '1100x700' },
  { w: 1280, h: 800,  label: '1280x800' },
  { w: 1366, h: 768,  label: '1366x768' },
  { w: 1440, h: 900,  label: '1440x900' },
  { w: 1920, h: 1080, label: '1920x1080' },
  { w: 2560, h: 1440, label: '2560x1440' },
];

const PAGES = [
  { path: '/',          label: 'dashboard', wait: 2000 },
  { path: '/hardware',  label: 'hardware',  wait: 2800 },
  { path: '/models',    label: 'models',    wait: 2200 },
  { path: '/explore',   label: 'explore',   wait: 2800 },
  { path: '/centralize',label: 'centralize',wait: 2200 },
  { path: '/test',      label: 'test',      wait: 2000 },
  { path: '/coder',     label: 'coder',     wait: 2200 },
  { path: '/settings',  label: 'settings',  wait: 2200 },
  { path: '/extensions',label: 'extensions',wait: 1800 },
];

function DETECT_JS() {
  const results = [];
  const vw = window.innerWidth;
  const vh = window.innerHeight;

  // 1) Page-level horizontal overflow
  const docOverflow = document.documentElement.scrollWidth > vw + 1;
  const bodyOverflow = document.body ? document.body.scrollWidth > vw + 1 : false;

  // 2) Elements sticking out of the right edge
  const outOfViewport = [];
  const all = Array.from(document.querySelectorAll('body *'));
  for (const el of all) {
    const style = getComputedStyle(el);
    if (style.position === 'fixed' && (el.closest('[data-tooltip]') || el.classList.contains('react-tooltip'))) continue;
    if (style.display === 'none' || style.visibility === 'hidden') continue;
    // Skip invisible decorative absolute elements (blurs / ghost icons)
    if (style.position === 'absolute') {
      const op = parseFloat(style.opacity);
      if (isNaN(op) || op < 0.15) continue;
    }
    const r = el.getBoundingClientRect();
    if (r.width === 0 && r.height === 0) continue;
    // Ignore tiny decorative absolutes and pseudo-like elements
    if (r.right > vw + 1 && r.left < vw) {
      // skip svg decorations intentionally positioned off-card
      const txt = (el.textContent || '').trim().slice(0, 60);
      outOfViewport.push({
        tag: el.tagName.toLowerCase(),
        cls: (el.className && typeof el.className === 'string' ? el.className : '').slice(0, 120),
        right: Math.round(r.right),
        left: Math.round(r.left),
        width: Math.round(r.width),
        text: txt
      });
    }
  }
  // Dedupe by class+text
  const seen = new Set();
  const outDeduped = outOfViewport.filter(o => {
    const k = o.cls + '|' + o.text;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  }).slice(0, 25);

  // 3) Clipped content: overflow hidden/auto/scroll elements with scrollWidth > clientWidth
  const clipped = [];
  for (const el of all) {
    const style = getComputedStyle(el);
    if (style.display === 'none' || style.visibility === 'hidden') continue;
    // Skip invisible decorative absolutely-positioned elements (blurs, ghost icons)
    if (style.position === 'absolute') {
      const op = parseFloat(style.opacity);
      if (isNaN(op) || op < 0.15) continue;
    }
    const ov = style.overflowX;
    if (ov !== 'hidden' && ov !== 'auto' && ov !== 'scroll' && ov !== 'clip') continue;
    if (el.scrollWidth > el.clientWidth + 2 && el.clientWidth > 0) {
      const r = el.getBoundingClientRect();
      if (r.width === 0) continue;
      // Only care when content actually overflows the box horizontally
      const isTextEl = el.children.length === 0 || /^(H1|H2|H3|H4|H5|H6|P|SPAN|BUTTON|A|CODE|PRE|LABEL|INPUT)$/i.test(el.tagName);
      clipped.push({
        tag: el.tagName.toLowerCase(),
        cls: (el.className && typeof el.className === 'string' ? el.className : '').slice(0, 120),
        scrollW: el.scrollWidth,
        clientW: el.clientWidth,
        text: (el.textContent || '').trim().slice(0, 60),
        isText: isTextEl
      });
    }
  }
  const seenC = new Set();
  const clippedDeduped = clipped.filter(o => {
    const k = o.cls + '|' + o.text + '|' + o.tag;
    if (seenC.has(k)) return false;
    seenC.add(k);
    return true;
  }).slice(0, 25);

  return { vw, vh, docOverflow, bodyOverflow, outOfViewport: outDeduped, clipped: clippedDeduped };
}

const browser = await chromium.launch({ headless: true });
const report = { generatedAt: new Date().toISOString(), pages: [] };

for (const vp of VIEWPORTS) {
  const ctx = await browser.newContext({ viewport: { width: vp.w, height: vp.h } });
  const page = await ctx.newPage();
  for (const pg of PAGES) {
    try {
      await page.goto(BASE + pg.path, { waitUntil: 'domcontentloaded', timeout: 20000 });
      await page.waitForTimeout(pg.wait);
      const det = await page.evaluate(DETECT_JS);
      const issues = [];
      if (det.docOverflow) issues.push('PAGE-H-OVERFLOW');
      if (det.bodyOverflow) issues.push('BODY-H-OVERFLOW');
      if (det.outOfViewport.length) issues.push('OUT-OF-VIEWPORT:' + det.outOfViewport.length);
      if (det.clipped.some(c => c.isText)) issues.push('CLIPPED-TEXT:' + det.clipped.filter(c => c.isText).length);
      const entry = { page: pg.path, viewport: vp.label, ...det, issues };
      report.pages.push(entry);
      const flag = issues.length ? '❌' : '✅';
      console.log(`${flag} ${pg.label.padEnd(12)} ${vp.label.padEnd(11)} ${issues.join(' | ') || 'ok'}`);

      // Screenshots only for a few key viewports to keep disk small
      if (['360x640', '500x700', '1024x768', '1100x700', '1280x800', '1440x900', '1920x1080'].includes(vp.label)) {
        const file = path.join(OUT, `${pg.label}_${vp.label}.png`);
        await page.screenshot({ path: file, fullPage: false });
      }
    } catch (e) {
      console.log(`⚠  ${pg.label} ${vp.label} ERROR: ${String(e).slice(0, 120)}`);
    }
  }
  await ctx.close();
}

await browser.close();
writeFileSync(REPORT, JSON.stringify(report, null, 2));
console.log('\nReport: ' + REPORT);

// Summary counts
const totals = {};
for (const r of report.pages) {
  for (const i of r.issues) {
    const key = i.split(':')[0];
    totals[key] = (totals[key] || 0) + 1;
  }
}
console.log('Summary:', totals);
