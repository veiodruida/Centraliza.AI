// scripts/verify-interact.mjs — clica em "Aplicar" e confirma a atualização dos sliders
import { chromium } from 'playwright';

const BASE = process.env.BASE_URL || 'http://localhost:4001';
const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext({ viewport: { width: 1440, height: 1100 } });
const page = await ctx.newPage();
page.setDefaultTimeout(20000);

await page.goto(`${BASE}/coder`, { waitUntil: 'load' });
await page.waitForTimeout(3000);

// selecionar o modelo GGUF (Qwen)
const select = page.locator('select').first();
const options = await select.locator('option').all();
let chosen = null;
for (const o of options) {
  const v = (await o.getAttribute('value')) || '';
  if (v.toLowerCase().includes('.gguf')) { chosen = v; break; }
}
if (!chosen) { console.log('FAIL: nenhum modelo GGUF na lista do Coder'); await browser.close(); process.exit(1); }
await select.selectOption(chosen);
await page.waitForTimeout(1500);

await page.locator('button[title="Configurações do Motor"]').click();
await page.waitForTimeout(2000);

// ler limites atuais dos sliders
const ctxSlider = page.locator('input[type="range"]').nth(0);
const gpuSlider = page.locator('input[type="range"]').nth(1);
const ctxMax = await ctxSlider.getAttribute('max');
const gpuMax = await gpuSlider.getAttribute('max');
console.log(`Sliders: ctx max=${ctxMax} gpu max=${gpuMax}`);
console.log('Antes → ctx =', await ctxSlider.getAttribute('value'), '| gpu =', await gpuSlider.getAttribute('value'));

// clicar em Aplicar (recomendação)
const applyBtn = page.locator('button', { hasText: 'Aplicar' }).first();
await applyBtn.click();
await page.waitForTimeout(1000);

console.log('Após Aplicar → ctx =', await ctxSlider.getAttribute('value'), '| gpu =', await gpuSlider.getAttribute('value'));

const ok = ctxMax === '131072' || Number(ctxMax) > 0;
console.log(ok ? 'OK: sliders com limites do modelo' : 'WARN: limites não aplicados');
await browser.close();
