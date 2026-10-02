// scripts/verify-speed.mjs — move os sliders e lê a velocidade estimada
import { chromium } from 'playwright';

const BASE = process.env.BASE_URL || 'http://localhost:4001';
const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext({ viewport: { width: 1440, height: 1100 } });
const page = await ctx.newPage();
page.setDefaultTimeout(20000);

await page.goto(`${BASE}/coder`, { waitUntil: 'load' });
await page.waitForTimeout(3000);
const select = page.locator('select').first();
const options = await select.locator('option').all();
for (const o of options) {
  const v = (await o.getAttribute('value')) || '';
  if (v.toLowerCase().includes('.gguf')) { await select.selectOption(v); break; }
}
await page.waitForTimeout(1500);
await page.locator('button[title="Configurações do Motor"]').click();
await page.waitForTimeout(2000);

const ctxSlider = page.locator('input[type="range"]').nth(0);
const gpuSlider = page.locator('input[type="range"]').nth(1);

const readSpeed = async () => {
  const txt = await page.locator('text=Velocidade estimada').first().locator('xpath=ancestor::div[contains(@class,"p-4")][1]').innerText().catch(() => 'n/a');
  return txt.replace(/\n+/g, ' | ');
};

const setRange = (locator, val) => locator.evaluate((el, v) => {
  const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
  setter.call(el, String(v));
  el.dispatchEvent(new Event('input', { bubbles: true }));
  el.dispatchEvent(new Event('change', { bubbles: true }));
}, val);

const readChips = async () => {
  const chips = await page.locator('span.text-xs.font-mono.font-bold').allInnerTexts();
  return chips.join('/');
};

console.log('estado inicial:', await readSpeed(), '| chips:', await readChips());
console.log('ctx max slider:', await ctxSlider.getAttribute('max'), '| gpu max:', await gpuSlider.getAttribute('max'));

// mover contexto para valores extremos
for (const v of ['8192', '65536', '262144']) {
  await setRange(ctxSlider, v);
  await page.waitForTimeout(600);
  console.log(`ctx=${v} →`, await readSpeed(), '| chips:', await readChips());
}

// mover GPU layers
for (const v of ['64', '20', '0']) {
  await setRange(gpuSlider, v);
  await page.waitForTimeout(600);
  console.log(`gpu=${v} →`, await readSpeed(), '| chips:', await readChips());
}

await browser.close();
