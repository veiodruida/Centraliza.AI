// scripts/verify-live.mjs — verifica atualização automática ao arrastar sliders (página /test e /coder)
import { chromium } from 'playwright';

const BASE = process.env.BASE_URL || 'http://localhost:4001';
const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext({ viewport: { width: 1440, height: 1200 } });
const page = await ctx.newPage();
page.setDefaultTimeout(20000);

async function readPanel(label) {
  const impact = page.locator('text=Impacto no Hardware').first();
  const panel = impact.locator('xpath=ancestor::div[contains(@class,"space-y-4")][1]');
  const txt = (await panel.innerText()).replace(/\n+/g, ' | ');
  // extrai só as partes relevantes
  const speed = (txt.match(/VELOCIDADE ESTIMADA \| [^|]* \| [\d.]+ \| T\/S/) || ['n/a'])[0];
  const ctx = (txt.match(/CONTEXTO DE CONVERSA \| [^|]* \| [\d\s]+ TOKENS/) || ['n/a'])[0];
  const kv = (txt.match(/Cache KV ≈ [^|]*/) || ['n/a'])[0];
  console.log(`${label} → ${speed} | ${ctx} | ${kv}`);
}

// ---------------- ModelTester ----------------
await page.goto(`${BASE}/test`, { waitUntil: 'load' });
await page.waitForTimeout(2500);
await page.locator('button', { hasText: 'llama.cpp' }).first().click();
await page.waitForTimeout(1000);
// selecionar Qwen
const list = page.locator('div.no-scrollbar').first();
const qwen = list.locator('button', { hasText: /Qwen|TurboFCFusion|NEO-CODER/i }).first();
await (await qwen.count() ? qwen : list.locator('button').first()).click();
await page.waitForTimeout(3000);
await page.locator('button[title="Advanced Settings"]').click();
await page.waitForTimeout(1500);

const ctxSlider = page.locator('input[type="range"]').nth(3); // Temperatura(0) TopP(1) TopK(2) → Context(3) GPU(4)
const gpuSlider = page.locator('input[type="range"]').nth(4);

await readPanel('test inicial');
await ctxSlider.focus();
for (let i = 0; i < 12; i++) { await page.keyboard.press('ArrowRight'); await page.waitForTimeout(80); }
await readPanel('test ctx+12');
for (let i = 0; i < 20; i++) { await page.keyboard.press('ArrowLeft'); await page.waitForTimeout(60); }
await readPanel('test ctx-20');
await gpuSlider.focus();
for (let i = 0; i < 10; i++) { await page.keyboard.press('ArrowLeft'); await page.waitForTimeout(80); }
await readPanel('test gpu-10');
await gpuSlider.focus();
for (let i = 0; i < 30; i++) { await page.keyboard.press('ArrowRight'); await page.waitForTimeout(50); }
await readPanel('test gpu+30');

// ---------------- Coder ----------------
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
const cctx = page.locator('input[type="range"]').nth(0);
const cgpu = page.locator('input[type="range"]').nth(1);
await readPanel('coder inicial');
await cctx.focus();
for (let i = 0; i < 15; i++) { await page.keyboard.press('ArrowRight'); await page.waitForTimeout(60); }
await readPanel('coder ctx+15');
await cgpu.focus();
for (let i = 0; i < 25; i++) { await page.keyboard.press('ArrowRight'); await page.waitForTimeout(50); }
await readPanel('coder gpu+25');

await browser.close();
