import { describe, it, expect } from 'vitest';
import {
  estimateImpact,
  recommendParams,
  contextClassFor,
  snapCtxToNice,
  kvBytesPerToken,
  NICE_CTX_VALUES,
  type SysInfo,
  type GGUFMeta,
} from '../utils/configAdvisor';

const GB = 1024 ** 3;

const sys: SysInfo = {
  totalRam: 32 * GB,
  freeRam: 20 * GB,
  vram: 12 * GB,
  gpuName: 'NVIDIA GeForce RTX 3060',
  cpuModel: 'Intel',
};

const meta: GGUFMeta = {
  ok: true,
  arch: 'qwen35',
  nLayers: 64,
  nCtxMax: 262144,
  nEmb: 5120,
  nKVHeads: 4,
  headDim: 64,
  fileType: 12,
  quantName: 'Q4_K',
  bytesPerWeight: 0.56,
  paramsEstimate: 64 * (12 * 5120 * 5120 + 13 * 5120),
  fileSizeBytes: 18 * GB,
};

describe('configAdvisor', () => {
  it('classifica o contexto consoante o tamanho', () => {
    expect(contextClassFor(2048).label).toBe('Chat rápido');
    expect(contextClassFor(8192).label).toBe('Uso geral / Programação');
    expect(contextClassFor(32768).label).toBe('Programação / Documentos');
    expect(contextClassFor(131072).label).toBe('Documentos longos / RAG');
  });

  it('calcula bytes/token da cache KV (q4_0 → 0.5 B/elemento)', () => {
    expect(kvBytesPerToken(meta, 0.5)).toBe(2 * 64 * 4 * 64 * 0.5);
    expect(kvBytesPerToken(meta, 2)).toBe(2 * 64 * 4 * 64 * 2);
  });

  it('encaixa valores de contexto nos valores redondos', () => {
    expect(snapCtxToNice(30000)).toBe(16384);
    expect(snapCtxToNice(70000)).toBe(65536);
    expect(NICE_CTX_VALUES).toContain(snapCtxToNice(500));
  });

  it('CPU puro: pesos e KV vão para RAM, sem overflow de VRAM', () => {
    const est = estimateImpact({ sys, meta, ctxSize: 16384, gpuLayers: 0, kvBytesPerElement: 0.5 });
    expect(est.hasMeta).toBe(true);
    expect(est.gpuLayersCapped).toBe(0);
    expect(est.ramUsedGB).toBeGreaterThan(18); // pesos inteiros na RAM
    expect(est.vramUsedGB).toBeLessThan(1);   // só o buffer de compute
    expect(est.tps).not.toBeNull();
    expect(est.ctxClass.label).toBe('Uso geral / Programação');
    expect(est.issues.some(i => i.level === 'warn' && i.text.includes('CPU puro'))).toBe(true);
  });

  it('camadas GPU a mais num modelo maior que a VRAM geram aviso de perigo', () => {
    const est = estimateImpact({ sys, meta, ctxSize: 8192, gpuLayers: 99, kvBytesPerElement: 0.5 });
    expect(est.gpuLayersCapped).toBe(64); // limitado ao nº real de camadas
    expect(est.issues.some(i => i.level === 'danger' && i.text.includes('VRAM'))).toBe(true);
    expect(est.vramUsedGB).toBeGreaterThan(est.vramAvailGB);
  });

  it('recomenda camadas GPU e contexto compatíveis com o hardware', () => {
    const rec = recommendParams({ sys, meta, ctxSize: 32768, gpuLayers: 99, kvBytesPerElement: 0.5 });
    expect(rec).not.toBeNull();
    expect(rec!.gpuLayers).toBeGreaterThanOrEqual(0);
    expect(rec!.gpuLayers).toBeLessThanOrEqual(64);
    expect(NICE_CTX_VALUES).toContain(rec!.ctx);
    expect(rec!.ctx).toBeGreaterThanOrEqual(1024);
  });

  it('sem metadados do modelo devolve estimativa degradada mas não rebenta', () => {
    const est = estimateImpact({ sys, meta: null, ctxSize: 4096, gpuLayers: 99, kvBytesPerElement: 0.5 });
    expect(est.hasMeta).toBe(false);
    expect(est.rec).toBeNull();
    expect(est.sysOk).toBe(true);
  });
});
