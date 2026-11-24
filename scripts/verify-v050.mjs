/**
 * Verificação funcional da v0.5.0 nos 5 módulos alterados.
 * - recolhe erros de consola
 * - confirma textos/controlos novos
 * - mede o campo de busca do Hub em 2560px (RF-001)
 * - guarda screenshots em screenshots/v050
 */
import { chromium } from 'playwright';
import { existsSync, mkdirSync } from 'fs';
import path from 'path';

const BASE = 'http://127.0.0.1:4000';
const OUT = path.join(process.cwd(), 'screenshots', 'v050');
if (!existsSync(OUT)) mkdirSync(OUT, { recursive: true });

const results = [];
let failures = 0;

function check(name, ok, detail = '') {
  results.push({ name, ok, detail });
  if (!ok) failures++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ' — ' + detail : ''}`);
}

const browser = await chromium.launch();

// --- 1. Páginas a 1440x900: sem erros e com os elementos novos ---
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const consoleErrors = [];
page.on('console', (msg) => { if (msg.type() === 'error') consoleErrors.push(msg.text()); });
page.on('pageerror', (err) => consoleErrors.push('pageerror: ' + err.message));

const expectText = async (url, label, needles) => {
  consoleErrors.length = 0;
  await page.goto(BASE + url, { waitUntil: 'networkidle', timeout: 45000 }).catch(() => {});
  await page.waitForTimeout(1800);
  const body = await page.evaluate(() => document.body.innerText);
  for (const needle of needles) {
    check(`${label}: "${needle}"`, body.toLowerCase().includes(needle.toLowerCase()));
  }
  check(`${label}: sem erros de consola`, consoleErrors.length === 0, consoleErrors.slice(0, 2).join(' | '));
  await page.screenshot({ path: path.join(OUT, `${label}-1440.png`), fullPage: false });
};

await expectText('/explore', 'hub', ['Abliterated', 'Uncensored', 'modelos']);
await expectText('/centralize', 'centralize', ['Espaço total dos modelos', 'Espaço por localização', 'Localizações']);
await expectText('/test', 'test', ['Motores detetados', 'Ações do motor', 'Abrir UI web']);
await expectText('/coder', 'coder', ['Agente DeepSeek', 'Atualizações da aplicação', 'Editores']);
await expectText('/extensions', 'extensions', ['Extensões & Integrações', 'Continue.dev', 'Roo Code', 'Teste de fumo']);

// --- 2. Campo de busca do Hub em 2560px (RF-001) ---
await page.setViewportSize({ width: 2560, height: 1440 });
await page.goto(BASE + '/explore', { waitUntil: 'networkidle' }).catch(() => {});
await page.waitForTimeout(1500);
const search = page.locator('input[type="text"][aria-label]').first();
const box = await search.boundingBox();
const metrics = await search.evaluate((el) => {
  const cs = getComputedStyle(el);
  const container = el.closest('header') || document.body;
  return {
    fontSize: parseFloat(cs.fontSize),
    color: cs.color,
    containerWidth: container.getBoundingClientRect().width,
    value: el.value
  };
});
check('Hub 2560px: campo de busca encontrado', !!box);
if (box && metrics) {
  const ratio = box.width / metrics.containerWidth;
  check('Hub 2560px: busca ≥ 40% da largura do conteúdo', ratio >= 0.4, `${(ratio * 100).toFixed(0)}% (${Math.round(box.width)}px)`);
  check('Hub 2560px: texto ≥ 16px', metrics.fontSize >= 16, `${metrics.fontSize}px`);
  check('Hub 2560px: input dentro do viewport', box.x >= 0 && box.x + box.width <= 2560 + 1);
}
await search.click();
await search.type('qwen abliterated', { delay: 15 });
const typed = await search.inputValue();
check('Hub: texto digitado aceite', typed === 'qwen abliterated', typed);
const after = await search.evaluate((el) => {
  const r = el.getBoundingClientRect();
  return { scrollWidth: el.scrollWidth, clientWidth: el.clientWidth, right: r.right, vw: window.innerWidth };
});
check('Hub: sem corte horizontal do valor', after.right <= after.vw + 1);
await page.screenshot({ path: path.join(OUT, 'hub-2560-typing.png') });

// --- 3. Mobile 360px nas páginas alteradas ---
await page.setViewportSize({ width: 360, height: 640 });
for (const [url, label] of [['/explore', 'hub'], ['/centralize', 'centralize'], ['/test', 'test'], ['/coder', 'coder'], ['/extensions', 'extensions']]) {
  await page.goto(BASE + url, { waitUntil: 'networkidle' }).catch(() => {});
  await page.waitForTimeout(1200);
  const overflow = await page.evaluate(() => ({
    doc: document.documentElement.scrollWidth > window.innerWidth + 2,
    body: document.body.scrollWidth > window.innerWidth + 2
  }));
  check(`${label}: sem overflow horizontal a 360px`, !overflow.doc && !overflow.body, JSON.stringify(overflow));
  await page.screenshot({ path: path.join(OUT, `${label}-360.png`) });
}

await browser.close();

console.log(`\n${failures === 0 ? 'TODOS OS CHECKS PASSARAM' : failures + ' CHECK(S) FALHARAM'} (${results.length} checks)`);
process.exit(failures === 0 ? 0 : 1);
