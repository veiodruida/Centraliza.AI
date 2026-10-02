/**
 * configAdvisor.ts
 * Lógica de estimativa de impacto de "Context Size" e "GPU Layers" no hardware
 * do cliente (Centraliza.AI).
 *
 * Baseia-se em:
 *  - /api/system-info  → VRAM, RAM total/livre, nome da GPU
 *  - /api/gguf/meta    → metadados reais do modelo (camadas, dims, quantização)
 *
 * As estimativas são heurísticas educativas (marcadas como tal na UI), calibradas
 * com valores reais conhecidos de llama.cpp (banda de memória → tokens/s).
 */

export const GB = 1024 ** 3;
export const MB = 1024 ** 2;

export interface SysInfo {
  totalRam: number;
  freeRam: number;
  vram: number;
  gpuName: string;
  cpuModel: string;
}

export interface GGUFMeta {
  ok: boolean;
  error?: string;
  version?: number;
  arch?: string | null;
  nLayers?: number | null;
  nCtxMax?: number | null;
  nEmb?: number | null;
  nKVHeads?: number | null;
  headDim?: number | null;
  fileType?: number | null;
  quantVersion?: number | null;
  quantName?: string | null;
  bytesPerWeight?: number | null;
  paramsEstimate?: number | null;
  fileSizeBytes?: number;
}

export type SpeedClass = 'fast' | 'good' | 'slow' | 'very-slow' | 'unknown';
export type IssueLevel = 'warn' | 'danger';

export interface Issue {
  level: IssueLevel;
  text: string;
}

export interface ContextClass {
  label: string;
  hint: string;
}

export interface ImpactInput {
  sys: SysInfo | null;
  meta: GGUFMeta | null;
  ctxSize: number;
  gpuLayers: number;
  /** Bytes por elemento K/V da cache de contexto (f16=2 · q8_0=1 · q4_0≈0.5). */
  kvBytesPerElement?: number;
}

export interface ImpactEstimate {
  hasMeta: boolean;
  sysOk: boolean;
  /** Tokens por segundo estimados (geração/decode). */
  tps: number | null;
  speedClass: SpeedClass;
  vramUsedGB: number;
  vramAvailGB: number;
  ramUsedGB: number;
  ramAvailGB: number;
  kvCacheGB: number;
  kvBytesPerTokenKB: number;
  ctxClass: ContextClass;
  ctxExceedsModel: boolean;
  issues: Issue[];
  rec: { ctx: number; gpuLayers: number } | null;
  nLayers: number;
  gpuLayersCapped: number;
  modelSizeGB: number;
  quantLabel: string;
}

/** Valores "redondos" de contexto para onde as recomendações são encaixadas. */
export const NICE_CTX_VALUES = [1024, 2048, 4096, 8192, 16384, 32768, 65536, 131072, 262144, 524288, 1000000, 1048576];

/** Teto absoluto do seletor de contexto (1M tokens). */
export const MAX_CTX_LIMIT = 1048576;

export function formatGB(bytes: number): string {
  if (!bytes || bytes <= 0) return '0';
  return (bytes / GB).toFixed(1);
}

export function formatTokens(n: number): string {
  return n.toLocaleString('pt-PT');
}

/** Largura de banda de memória da GPU em GB/s (heurística por VRAM + nome). */
export function gpuBandwidthGBps(gpuName: string, vramBytes: number): number {
  const n = gpuName || '';
  const overrides: Array<[RegExp, number]> = [
    [/rtx\s*4090/i, 1008], [/rtx\s*5090/i, 1792], [/rtx\s*5080/i, 960],
    [/rtx\s*4080/i, 717], [/rtx\s*4070\s*ti/i, 672], [/rtx\s*4070/i, 504],
    [/rtx\s*4060\s*ti/i, 288], [/rtx\s*4060/i, 272],
    [/rtx\s*3090/i, 936], [/rtx\s*3080/i, 760], [/rtx\s*3070/i, 448],
    [/rtx\s*3060\s*ti/i, 448], [/rtx\s*3060/i, 360], [/rtx\s*3050/i, 224],
    [/rtx\s*2080/i, 448], [/rtx\s*2070/i, 448], [/rtx\s*2060/i, 336],
    [/gtx\s*1080/i, 320], [/gtx\s*1060/i, 192], [/gtx\s*1660/i, 192],
    [/arc\s*a770/i, 560], [/arc\s*a750/i, 512], [/arc\s*a380/i, 186],
    [/radeon\s*rx\s*7900/i, 800], [/radeon\s*rx\s*7800/i, 576],
    [/radeon\s*rx\s*7700/i, 432], [/radeon\s*rx\s*6700/i, 384],
    [/radeon\s*rx\s*6600/i, 224],
    [/iris\s*xe/i, 68], [/uhd\s*graphics/i, 50], [/radeon.*vega/i, 100],
    [/apple\s*m[1234]/i, 100], [/apple\s*m[1234]\s*pro/i, 150], [/apple\s*m[1234]\s*max/i, 200],
  ];
  for (const [re, bw] of overrides) if (re.test(n)) return bw;

  const tiers: Array<[number, number]> = [
    [48, 1100], [40, 1000], [32, 900], [24, 800], [20, 700], [16, 600],
    [12, 460], [10, 400], [8, 340], [6, 260], [4, 160], [2, 90], [0, 50],
  ];
  const vramGB = vramBytes / GB;
  for (const [min, bw] of tiers) if (vramGB >= min) return bw;
  return 50;
}

/** Largura de banda de memória do CPU em GB/s (heurística por RAM livre). */
export function cpuBandwidthGBps(freeRamBytes: number): number {
  const gb = freeRamBytes / GB;
  if (gb >= 64) return 55;
  if (gb >= 32) return 40;
  if (gb >= 16) return 28;
  if (gb >= 8) return 20;
  return 12;
}

/** Classificação de uso consoante o tamanho de contexto escolhido. */
export function contextClassFor(ctxSize: number): ContextClass {
  if (ctxSize <= 4096) {
    return { label: 'Chat rápido', hint: 'Respostas curtas e instantâneas · consumo mínimo de memória' };
  }
  if (ctxSize <= 16384) {
    return { label: 'Uso geral / Programação', hint: 'Bom equilíbrio entre memória e raciocínio' };
  }
  if (ctxSize <= 65536) {
    return { label: 'Programação / Documentos', hint: 'Agentes de código e análise de ficheiros longos' };
  }
  if (ctxSize <= 262144) {
    return { label: 'Documentos longos / RAG', hint: 'Análise massiva — a cache de contexto exige muita VRAM/RAM' };
  }
  return { label: 'Contexto extremo (1M)', hint: 'Só para modelos com suporte nativo — a cache KV pode exigir dezenas de GB de memória' };
}

/** Encaixa um valor de contexto no valor "redondo" mais próximo (por baixo). */
export function snapCtxToNice(ctx: number): number {
  const v = Math.max(1024, Math.floor(ctx || 1024));
  let best = 1024;
  for (const nice of NICE_CTX_VALUES) {
    if (nice <= v) best = nice;
    else break;
  }
  return best;
}

/** Bytes por token da cache KV (K+V) para o modelo dado. */
export function kvBytesPerToken(meta: GGUFMeta | null, kvBytesPerElement = 0.5): number {
  const nLayers = meta?.nLayers || 0;
  const nKVHeads = meta?.nKVHeads || 8;
  const headDim = meta?.headDim || 128;
  if (!nLayers) return 2 * 32 * 8 * 128 * kvBytesPerElement; // fallback genérico (~8B)
  return 2 * nLayers * nKVHeads * headDim * kvBytesPerElement;
}

/** Recomendação de contexto + camadas GPU para o hardware do cliente. */
export function recommendParams(input: ImpactInput): { ctx: number; gpuLayers: number } | null {
  const { sys, meta } = input;
  if (!sys || !meta?.ok || !meta.nLayers || !meta.fileSizeBytes) return null;

  const vram = sys.vram || 0;
  const freeRam = sys.freeRam || 0;
  const nLayers = meta.nLayers;
  const fileSize = meta.fileSizeBytes;
  const kvt = kvBytesPerToken(meta, input.kvBytesPerElement ?? 0.5);
  const computeBuf = 512 * MB;
  const headroomVram = vram * 0.85;
  const headroomRam = freeRam * 0.85;
  const ctxNow = Math.max(1024, input.ctxSize || 2048);

  // 1) Máximas camadas GPU que cabem na VRAM (pesos + KV cache + buffer) com o contexto atual.
  let recLayers = 0;
  for (let L = nLayers; L >= 0; L--) {
    const frac = L / nLayers;
    const gw = fileSize * frac;
    const kvG = kvt * ctxNow * frac;
    if (gw * 1.03 + kvG + computeBuf <= headroomVram) { recLayers = L; break; }
  }

  // 2) Contexto máximo com essas camadas (respeitando VRAM, RAM livre e máximo do modelo).
  const frac = recLayers / nLayers;
  const gw = fileSize * frac;
  let maxCtxByVram = Infinity;
  if (kvt * frac > 0) maxCtxByVram = (headroomVram - gw * 1.03 - computeBuf) / (kvt * frac);
  let maxCtxByRam = Infinity;
  const kvCpuPerToken = kvt * (1 - frac);
  const cpuWeights = fileSize - gw;
  if (kvCpuPerToken > 0) maxCtxByRam = (headroomRam - cpuWeights) / kvCpuPerToken;

  let maxCtx = Math.min(maxCtxByVram, maxCtxByRam, meta.nCtxMax ?? Infinity, MAX_CTX_LIMIT);
  if (!isFinite(maxCtx) || isNaN(maxCtx)) maxCtx = MAX_CTX_LIMIT;
  maxCtx = Math.max(1024, Math.floor(maxCtx));
  return { ctx: snapCtxToNice(maxCtx), gpuLayers: recLayers };
}

/** Estimativa completa do impacto da configuração atual. */
export function estimateImpact(input: ImpactInput): ImpactEstimate {
  const { sys, meta, ctxSize, gpuLayers, kvBytesPerElement = 0.5 } = input;
  const hasMeta = !!meta && meta.ok === true && !!meta.nLayers && !!meta.fileSizeBytes;
  const sysOk = !!sys && !!sys.totalRam && !!sys.freeRam;
  const vram = sys?.vram || 0;
  const freeRam = sys?.freeRam || 0;
  const fileSize = meta?.fileSizeBytes || 0;
  const nLayers = meta?.nLayers || 0;
  const issues: Issue[] = [];

  // --- Cache de contexto (KV) ---
  const kvt = kvBytesPerToken(hasMeta ? meta : null, kvBytesPerElement);
  const kvCacheBytes = kvt * Math.max(0, ctxSize || 0);

  // --- Distribuição pesos / KV entre GPU e CPU ---
  const gpuLayersCapped = hasMeta ? Math.min(Math.max(0, Math.round(gpuLayers)), nLayers) : gpuLayers;
  const frac = hasMeta && nLayers > 0 ? gpuLayersCapped / nLayers : gpuLayers > 0 ? 0.9 : 0;
  const gpuWeights = fileSize * frac;
  const cpuWeights = fileSize - gpuWeights;
  const kvOnGpu = kvCacheBytes * frac;
  const kvOnCpu = kvCacheBytes - kvOnGpu;

  const computeBuf = 512 * MB;
  const vramUsed = gpuWeights * 1.03 + kvOnGpu + computeBuf;
  const ramUsed = cpuWeights + kvOnCpu;

  // --- Velocidade estimada (decode) ---
  let tps: number | null = null;
  let speedClass: SpeedClass = 'unknown';
  if (sysOk && fileSize > 0) {
    const gpuBw = gpuBandwidthGBps(sys!.gpuName, vram);
    const cpuBw = cpuBandwidthGBps(freeRam);
    const totalW = gpuWeights + cpuWeights;
    const effBw = totalW > 0 ? (gpuWeights * gpuBw + cpuWeights * cpuBw) / totalW : gpuBw;
    // Eficiência realista (~55% do pico). Estourar a VRAM derruba brutalmente
    // o desempenho (cópias constantes CPU↔GPU ou swap).
    let eff = 0.55;
    if (vram > 0 && vramUsed > vram * 1.05) eff *= 0.18;
    else if (vram > 0 && vramUsed > vram * 0.9) eff *= 0.45;
    // A atenção lê a cache KV completa a cada token gerado (com flash-attn,
    // aproximadamente metade) e a parte da KV que ficou na RAM do CPU é lida
    // em cada passo — por isso a velocidade cai à medida que o contexto cresce.
    const kvReadPerToken = kvCacheBytes * 0.5;
    const bytesPerToken = Math.max(1, totalW + kvReadPerToken + kvOnCpu);
    tps = (eff * effBw * 1e9) / bytesPerToken;
    // Teto realista: modelos minúsculos não atingem milhares de t/s (existe
    // overhead fixo por token); acima de 1000 t/s o número perde significado.
    if (tps > 1000) tps = 1000;
    speedClass = tps >= 25 ? 'fast' : tps >= 10 ? 'good' : tps >= 4 ? 'slow' : 'very-slow';
  }

  // --- Avisos ---
  if (vram > 0) {
    if (vramUsed > vram * 1.05) {
      issues.push({
        level: 'danger',
        text: `A configuração precisa de ~${formatGB(vramUsed)} de VRAM, mas o teu GPU só tem ${formatGB(vram)}. O motor vai usar RAM do sistema como suporte e ficar MUITO mais lento — reduz o contexto ou as camadas GPU.`
      });
    } else if (vramUsed > vram * 0.9) {
      issues.push({
        level: 'warn',
        text: `VRAM quase cheia (${Math.round((vramUsed / vram) * 100)}%). Considera reduzir o contexto ou as camadas GPU para evitar lentidão.`
      });
    }
  }
  if (freeRam > 0 && ramUsed > freeRam * 0.9) {
    issues.push({
      level: 'danger',
      text: `RAM livre insuficiente (precisas de ~${formatGB(ramUsed)}, tens ${formatGB(freeRam)}). Risco de falha ao carregar o modelo ou uso de disco (swap) — extremamente lento.`
    });
  }
  if (hasMeta && meta.nCtxMax && ctxSize > meta.nCtxMax) {
    issues.push({
      level: 'danger',
      text: `O contexto escolhido (${formatTokens(ctxSize)}) excede o máximo do modelo (${formatTokens(meta.nCtxMax)}). O motor pode recusar ou degradar-se.`
    });
  }
  if (frac === 0 && ctxSize > 8192) {
    issues.push({
      level: 'warn',
      text: 'Em CPU puro (0 camadas GPU), contextos grandes deixam a geração muito lenta. Usa ≤ 8K ou ativa algumas camadas GPU.'
    });
  }

  const ctxClass = contextClassFor(ctxSize);
  const rec = recommendParams(input);

  return {
    hasMeta,
    sysOk,
    tps,
    speedClass,
    vramUsedGB: vramUsed / GB,
    vramAvailGB: vram / GB,
    ramUsedGB: ramUsed / GB,
    ramAvailGB: freeRam / GB,
    kvCacheGB: kvCacheBytes / GB,
    kvBytesPerTokenKB: kvt / 1024,
    ctxClass,
    ctxExceedsModel: !!(hasMeta && meta.nCtxMax && ctxSize > meta.nCtxMax),
    issues,
    rec,
    nLayers,
    gpuLayersCapped,
    modelSizeGB: fileSize / GB,
    quantLabel: hasMeta && meta.quantName ? meta.quantName : ''
  };
}

export const SPEED_CLASS_META: Record<SpeedClass, { label: string; tone: 'emerald' | 'blue' | 'amber' | 'red' | 'slate' }> = {
  fast: { label: 'Muito rápido', tone: 'emerald' },
  good: { label: 'Bom', tone: 'blue' },
  slow: { label: 'Lento', tone: 'amber' },
  'very-slow': { label: 'Muito lento', tone: 'red' },
  unknown: { label: '—', tone: 'slate' },
};
