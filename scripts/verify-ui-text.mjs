// scripts/verify-ui-text.mjs — imprime o texto renderizado do painel de impacto
import { chromium } from 'playwright';

const BASE = process.env.BASE_URL || 'http://localhost:4001';
const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext({ viewport: { width: 1440, height: 1100 } });
const page = await ctx.newPage();
page.setDefaultTimeout(20000);

// ------- ModelTester -------
await page.goto(`${BASE}/test`, { waitUntil: 'load' });
await page.waitForTimeout(2500);
await page.locator('button', { hasText: 'llama.cpp' }).first().click();
await page.waitForTimeout(1000);
await page.locator('div.no-scrollbar').first().locator('button').first().click();
await page.waitForTimeout(3000);
await page.locator('button[title="Advanced Settings"]').click();
await page.waitForTimeout(1500);
const impact = page.locator('text=Impacto no Hardware').first();
await impact.scrollIntoViewIfNeeded();
await page.waitForTimeout(800);
const panel = impact.locator('xpath=ancestor::div[contains(@class,"space-y-4")][1]');
console.log('========== ModelTester panel text ==========');
console.log((await panel.innerText()).replace(/\n{2,}/g, '\n'));

// ------- Coder -------
await page.goto(`${BASE}/coder`, { waitUntil: 'load' });
await page.waitForTimeout(3000);
const select = page.locator('select').first();
const options = await select.locator('option').all();
for (const o of options) {
  const v = (await o.getAttribute('value')) || '';
  if (v.toLowerCase().includes('.gguf')) { await select.selectOption(v); break; }
}
await page.waitForTimeout(800);
await page.locator('button[title="Configurações do Motor"]').click();
await page.waitForTimeout(2000);
const impact2 = page.locator('text=Impacto no Hardware').first();
await impact2.scrollIntoViewIfNeeded();
await page.waitForTimeout(1000);
const panel2 = impact2.locator('xpath=ancestor::div[contains(@class,"space-y-4")][1]');
console.log('========== Coder panel text ==========');
console.log((await panel2.innerText()).replace(/\n{2,}/g, '\n'));

await browser.close();
