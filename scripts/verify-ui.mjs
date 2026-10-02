// scripts/verify-ui.mjs
// Verificação visual do painel "Impacto no Hardware" (ConfigImpact):
//  - ModelTester (/test): modo llama.cpp + painel de definições
//  - Coder (/coder): motor GGUF + painel de definições
// Uso: node scripts/verify-ui.mjs  (servidor a correr na porta $env:PORT ou 4001)
import { chromium } from 'playwright';
import { existsSync, mkdirSync } from 'fs';

const BASE = process.env.BASE_URL || 'http://localhost:4001';
const OUT = process.env.OUT_DIR || 'C:/Users/veio_/Documents/Projetos/Centraliza.AI/screenshots';
if (!existsSync(OUT)) mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext({ viewport: { width: 1440, height: 1100 } });
const page = await ctx.newPage();
page.setDefaultTimeout(20000);

const results = [];

// ---------------------------------------------------------------- ModelTester
try {
  await page.goto(`${BASE}/test`, { waitUntil: 'load' });
  await page.waitForTimeout(2500);

  // Mudar para o motor llama.cpp
  const llamaBtn = page.locator('button', { hasText: 'llama.cpp' }).first();
  await llamaBtn.click();
  await page.waitForTimeout(1000);

  // Selecionar um modelo GGUF representativo (preferir Qwen/TurboFCFusion)
  const sidebarList = page.locator('div.no-scrollbar').first();
  const qwen = sidebarList.locator('button', { hasText: /Qwen|TurboFCFusion|NEO-CODER/i }).first();
  let modelBtn = qwen;
  if (await qwen.count() === 0) modelBtn = sidebarList.locator('button').first();
  await modelBtn.click();
  await page.waitForTimeout(3000); // espera pelos metadados GGUF

  // Abrir as definições avançadas
  await page.locator('button[title="Advanced Settings"]').click();
  await page.waitForTimeout(1500);

  const impact = page.locator('text=Impacto no Hardware').first();
  await impact.scrollIntoViewIfNeeded();
  await page.waitForTimeout(1200);
  const f2 = `${OUT}/impact_test_model.png`;
  await page.screenshot({ path: f2 });
  console.log(`OK ${f2}`);
  results.push(f2);

  // Screenshot completo do painel
  const panel = page.locator('text=Impacto no Hardware').locator('xpath=ancestor::div[contains(@class,"space-y-4")][1]');
  const f2b = `${OUT}/impact_test_panel.png`;
  await panel.screenshot({ path: f2b }).catch(async () => {
    await page.screenshot({ path: f2b });
  });
  console.log(`OK ${f2b}`);
  results.push(f2b);
} catch (e) {
  console.error('ModelTester step failed:', e.message);
}

// --------------------------------------------------------------------- Coder
try {
  await page.goto(`${BASE}/coder`, { waitUntil: 'load' });
  await page.waitForTimeout(3000);

  // Garantir um modelo GGUF selecionado
  const select = page.locator('select').first();
  const options = await select.locator('option').all();
  let chosen = null;
  for (const o of options) {
    const v = (await o.getAttribute('value')) || '';
    if (v.toLowerCase().includes('.gguf')) { chosen = v; break; }
  }
  if (chosen) {
    await select.selectOption(chosen);
    await page.waitForTimeout(800);
  }

  // Abrir configurações do motor
  await page.locator('button[title="Configurações do Motor"]').click();
  await page.waitForTimeout(1800);

  const impact = page.locator('text=Impacto no Hardware').first();
  await impact.scrollIntoViewIfNeeded();
  await page.waitForTimeout(1200);
  const f3 = `${OUT}/impact_coder.png`;
  await page.screenshot({ path: f3 });
  console.log(`OK ${f3}`);
  results.push(f3);

  const panel = page.locator('text=Impacto no Hardware').locator('xpath=ancestor::div[contains(@class,"space-y-4")][1]');
  const f3b = `${OUT}/impact_coder_panel.png`;
  await panel.screenshot({ path: f3b }).catch(async () => { await page.screenshot({ path: f3b }); });
  console.log(`OK ${f3b}`);
  results.push(f3b);
} catch (e) {
  console.error('Coder step failed:', e.message);
}

await browser.close();
console.log('Done:', results.join(', '));
