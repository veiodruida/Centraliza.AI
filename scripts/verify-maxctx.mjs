// scripts/verify-maxctx.mjs — confirma o máximo de contexto no slider + painel
import { chromium } from 'playwright';

const BASE = process.env.BASE_URL || 'http://localhost:4001';
const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext({ viewport: { width: 1440, height: 1100 } });
const page = await ctx.newPage();
page.setDefaultTimeout(20000);

await page.goto(`${BASE}/coder`, { waitUntil: 'load' });
await page.waitForTimeout(3000);
const sel = page.locator('select').first();
for (const o of await sel.locator('option').all()) {
  const v = (await o.getAttribute('value')) || '';
  if (v.toLowerCase().includes('.gguf')) { await sel.selectOption(v); break; }
}
await page.waitForTimeout(1500);
await page.locator('button[title="Configurações do Motor"]').click();
await page.waitForTimeout(2000);

const ctxSlider = page.locator('input[type="range"]').nth(0);
console.log('Qwen: ctx slider max =', await ctxSlider.getAttribute('max'));

await ctxSlider.evaluate((el) => {
  const s = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
  s.call(el, el.max);
  el.dispatchEvent(new Event('input', { bubbles: true }));
  el.dispatchEvent(new Event('change', { bubbles: true }));
});
await page.waitForTimeout(800);

const panel = page.locator('text=Impacto no Hardware').first().locator('xpath=ancestor::div[contains(@class,"space-y-4")][1]');
console.log('Painel no contexto máximo:');
console.log((await panel.innerText()).replace(/\n+/g, ' | ').slice(0, 600));

await browser.close();
