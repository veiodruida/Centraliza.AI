'use strict';

/**
 * Importação de workflows ComfyUI a partir de um ficheiro Markdown (v0.6.0).
 *
 * O Markdown "Model Links" dos templates do ComfyUI lista as pastas de modelos
 * (ex.: `text_encoders`, `diffusion_models`, `vae`, `latent_upscale_models`) e,
 * dentro de cada uma, os ficheiros necessários. No topo aparecem os repositórios
 * do Hugging Face / ModelScope. Este módulo:
 *
 *   1. interpreta o Markdown (secções, ficheiros, tamanhos, opcionais, links);
 *   2. descobre em que repositório HF vive cada ficheiro (incluindo repos que
 *      não estão listados, por pesquisa automática);
 *   3. calcula a pasta de destino correta dentro de `ComfyUI/models`;
 *   4. descarrega os ficheiros com progresso, retoma e cancelamento.
 *
 * Formato suportado (o dos templates oficiais do ComfyUI):
 *
 *   ### Model Links
 *   - Hugging Face:Comfy-Org/gemma-4
 *   - ModelScope:Comfy-Org/gemma-4
 *
 *   ### text_encoders
 *   - `modelo.safetensors` (4.84 GB) — optional, only needed when ... is enabled.
 *
 * Também aceita links diretos por ficheiro, tabelas Markdown e listas
 * `Nome — https://...`, para não ficar preso a um único template.
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { pipeline } = require('stream/promises');
const { Transform } = require('stream');
const { inferFromFilename, parseQuant } = require('./catalog');

const MODEL_EXTENSIONS = ['.safetensors', '.ckpt', '.pt', '.pth', '.bin', '.gguf', '.onnx', '.pkl', '.sft'];


// Pasta lógica -> pastas reais em ComfyUI/models (a primeira é a preferida).
const CATEGORY_DEFS = {
  checkpoints: { dirs: ['checkpoints'] },
  loras: { dirs: ['loras'] },
  vae: { dirs: ['vae'] },
  controlnet: { dirs: ['controlnet'] },
  upscale_models: { dirs: ['upscale_models'] },
  latent_upscale_models: { dirs: ['latent_upscale_models', 'upscale_models'] },
  text_encoders: { dirs: ['text_encoders', 'clip'] },
  diffusion_models: { dirs: ['diffusion_models', 'unet'] },
  embeddings: { dirs: ['embeddings'] },
  clip_vision: { dirs: ['clip_vision'] },
  style_models: { dirs: ['style_models'] },
  ipadapter: { dirs: ['ipadapter'] },
  audio_encoders: { dirs: ['audio_encoders'] },
  animatediff_models: { dirs: ['animatediff_models'] },
  animatediff_motion_lora: { dirs: ['animatediff_motion_lora'] },
  model_patches: { dirs: ['model_patches'] },
  LLM: { dirs: ['LLM', 'llm'] },
  diffusers: { dirs: ['diffusers'] }
};

const CATEGORY_ALIASES = {
  checkpoint: 'checkpoints', checkpoints: 'checkpoints', ckpt: 'checkpoints', base_model: 'checkpoints',
  lora: 'loras', loras: 'loras', lycoris: 'loras', locon: 'loras', locons: 'loras',
  vae: 'vae', vaes: 'vae', vae_approx: 'vae',
  controlnet: 'controlnet', control_nets: 'controlnet', control_net: 'controlnet',
  upscale: 'upscale_models', upscaler: 'upscale_models', upscalers: 'upscale_models',
  upscale_model: 'upscale_models', upscale_models: 'upscale_models', esrgan: 'upscale_models',
  latent_upscale: 'latent_upscale_models', latent_upscale_model: 'latent_upscale_models',
  latent_upscale_models: 'latent_upscale_models', latent_upscaler: 'latent_upscale_models',
  text_encoder: 'text_encoders', text_encoders: 'text_encoders', clip: 'text_encoders',
  clip_text: 'text_encoders', t5: 'text_encoders', textencoder: 'text_encoders',
  diffusion_model: 'diffusion_models', diffusion_models: 'diffusion_models',
  unet: 'diffusion_models', unets: 'diffusion_models',
  embedding: 'embeddings', embeddings: 'embeddings', textual_inversion: 'embeddings',
  clip_vision: 'clip_vision',
  style_model: 'style_models', style_models: 'style_models',
  ipadapter: 'ipadapter', ip_adapter: 'ipadapter', ipadapters: 'ipadapter',
  audio_encoder: 'audio_encoders', audio_encoders: 'audio_encoders',
  animatediff: 'animatediff_models', animatediff_model: 'animatediff_models',
  animatediff_models: 'animatediff_models', animatediff_motion_lora: 'animatediff_motion_lora',
  model_patch: 'model_patches', model_patches: 'model_patches',
  llm: 'LLM', llms: 'LLM',
  diffusers: 'diffusers'
};

const COMFY_MARKERS = [
  'checkpoints', 'vae', 'loras', 'diffusion_models', 'text_encoders',
  'controlnet', 'upscale_models', 'embeddings', 'clip_vision'
];

const GENERIC_SEARCH_TOKENS = new Set([
  'comfy', 'comfyui', 'int8', 'convrot', 'bf16', 'fp16', 'fp8', 'fp32', 'fp4', 'nvfp4',
  'safetensors', 'distilled', 'transformer', 'with', 'proj', 'projection', 'vae', 'audio',
  'video', 'latent', 'upscaler', 'upscale', 'spatial', 'temporal', 'x2', 'x4', 'x8',
  'dev', 'base', 'model', 'models', 'lora', 'patch', 'patches', 'head', 'duration',
  'scaled', 'quant', 'gguf', 'ckpt', 'sft', 'diffusion', 'text', 'encoder', 'encoders',
  'clip', 'it', 'instruct', 'turbo', 'lightning', 'fast', 'full', 'small', 'large'
]);

/* ------------------------------------------------------------------------- */
/* Parsing                                                                    */
/* ------------------------------------------------------------------------- */

function stripMarkdown(text) {
  return String(text || '')
    .replace(/^[\s>*_#`~-]+/, '')
    .replace(/[\s*_`~]+$/, '')
    .replace(/:$/, '')
    .trim();
}

function normalizeCategory(raw) {
  const key = stripMarkdown(raw)
    .toLowerCase()
    .replace(/&/g, 'and')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
  if (!key) return null;
  return CATEGORY_ALIASES[key] || null;
}

function isModelFile(name) {
  const clean = String(name || '').split('?')[0].split('#')[0];
  const ext = path.extname(clean).toLowerCase();
  return MODEL_EXTENSIONS.includes(ext);
}

/** Converte a categoria funcional inferida do nome na pasta ComfyUI real. */
function comfyCategoryFromFilename(filename) {
  const inferred = inferFromFilename(filename);
  const map = {
    image: 'checkpoints',
    lora: 'loras',
    upscale: 'upscale_models',
    text_encoder: 'text_encoders',
    diffusion_model: 'diffusion_models',
    clip_vision: 'clip_vision',
    embedding: 'embeddings',
    video: 'animatediff_models',
    audio: 'audio_encoders',
    style: 'style_models',
    ipadapter: 'ipadapter',
    vae: 'vae',
    controlnet: 'controlnet',
    other: 'checkpoints'
  };
  return map[inferred] || 'checkpoints';
}

function baseNameOf(value) {
  return String(value || '').replace(/\\/g, '/').split('/').filter(Boolean).pop() || '';
}

/** Extrai nomes de ficheiros de modelo de uma linha. */
function extractFilenames(line) {
  const found = [];
  const seen = new Set();
  const push = (raw) => {
    let value = String(raw || '').trim();
    value = value.replace(/^[`'"*_[\s]+/, '').replace(/[`'"*_.,;:\]\s]+$/, '');
    const base = baseNameOf(value).split('?')[0];
    if (!isModelFile(base)) return;
    const key = base.toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    found.push(base);
  };

  // 1) Conteúdo entre backticks (formato mais comum nos templates ComfyUI).
  for (const match of String(line).matchAll(/`([^`\n]+)`/g)) {
    if (isModelFile(match[1].trim())) push(match[1]);
  }
  if (found.length) return found;

  // 2) Tokens separados por espaços/pipe/parênteses.
  for (const token of String(line).split(/[\s|,;()[\]{}<>]+/)) {
    if (isModelFile(token)) push(token);
  }
  if (found.length) return found;

  // 3) Fallback: nomes com espaços.
  const regex = /([A-Za-z0-9_][A-Za-z0-9._+\- ]{0,180}\.(?:safetensors|ckpt|pt|pth|bin|gguf|onnx|pkl|sft))/gi;
  for (const match of String(line).matchAll(regex)) push(match[1]);
  return found;
}

function parseSizeHint(line) {
  const match = String(line).match(/\(?\s*([\d]+(?:[.,]\d+)?)\s*(GB|GiB|MB|MiB|KB|KiB)\s*\)?/i);
  if (!match) return null;
  const value = parseFloat(String(match[1]).replace(',', '.'));
  if (!Number.isFinite(value) || value <= 0) return null;
  const unit = match[2].toLowerCase();
  const factor = unit.startsWith('g') ? 1024 ** 3 : unit.startsWith('m') ? 1024 ** 2 : 1024;
  return Math.round(value * factor);
}

function extractUrls(line) {
  const urls = [];
  const regex = /https?:\/\/[^\s<>"'`|\])]+/gi;
  for (const match of String(line).matchAll(regex)) {
    const url = match[0].replace(/[.,;:)]+$/, '');
    if (!urls.includes(url)) urls.push(url);
  }
  return urls;
}

/** Interpreta um URL de modelo (HF, hf.co, ModelScope) ou devolve null. */
function parseModelUrl(rawUrl) {
  let url;
  try { url = new URL(rawUrl); } catch (e) { return null; }
  const host = url.hostname.toLowerCase();
  const segments = url.pathname.split('/').filter(Boolean).map(decodeURIComponent);

  if (host === 'huggingface.co' || host === 'www.huggingface.co' || host === 'hf.co') {
    if (segments[0] === 'api' && segments[1] === 'models' && segments.length >= 4) {
      return { provider: 'huggingface', repo: `${segments[2]}/${segments[3]}`, direct: false };
    }
    if (segments[0] === 'datasets' || segments[0] === 'spaces') return null;
    if (segments.length < 2) return null;
    const repo = `${segments[0]}/${segments[1]}`;
    const marker = segments.findIndex((s) => ['resolve', 'blob', 'raw'].includes(s));
    if (marker >= 0 && segments.length > marker + 2) {
      const file = segments.slice(marker + 2).join('/');
      if (isModelFile(file)) {
        return { provider: 'huggingface', repo, direct: true, file, filename: baseNameOf(file) };
      }
    }
    return { provider: 'huggingface', repo, direct: false };
  }

  if (host.endsWith('modelscope.cn')) {
    const modelIndex = segments.indexOf('models');
    if (modelIndex >= 0 && segments.length >= modelIndex + 3) {
      const repo = `${segments[modelIndex + 1]}/${segments[modelIndex + 2]}`;
      const marker = segments.findIndex((s) => ['resolve', 'file'].includes(s));
      if (marker > modelIndex && segments.length > marker + 2) {
        const file = segments.slice(marker + 2).join('/');
        if (isModelFile(file)) {
          return { provider: 'modelscope', repo, direct: true, file, filename: baseNameOf(file) };
        }
      }
      return { provider: 'modelscope', repo, direct: false };
    }
    return null;
  }

  // Qualquer outro URL direto para um ficheiro de modelo (ex.: Civitai).
  if (isModelFile(url.pathname)) {
    return { provider: 'direct', repo: null, direct: true, file: baseNameOf(url.pathname), filename: baseNameOf(url.pathname) };
  }
  return null;
}

function collectRepoRefs(line, repos) {
  const add = (repo, provider) => {
    if (!repo || !repo.includes('/')) return;
    const clean = repo.replace(/\.git$/i, '').trim();
    if (!/^[\w.-]+\/[\w.-]+$/.test(clean)) return;
    const existing = repos.find((r) => r.repo.toLowerCase() === clean.toLowerCase());
    if (existing) {
      // Hugging Face tem prioridade sobre ModelScope para o mesmo repo.
      if (provider === 'huggingface' && existing.provider !== 'huggingface') existing.provider = 'huggingface';
      return;
    }
    repos.push({ repo: clean, provider, discovered: false });
  };

  for (const raw of extractUrls(line)) {
    const parsed = parseModelUrl(raw);
    if (parsed && parsed.repo) add(parsed.repo, parsed.provider);
  }

  const textPatterns = [
    { re: /hugging\s*face\s*(?::|->|→)?\s*([\w.-]+\/[\w.-]+)/gi, provider: 'huggingface' },
    { re: /\bhf\s*:?\s*([\w.-]+\/[\w.-]+)/gi, provider: 'huggingface' },
    { re: /model\s*scope\s*(?::|->|→)?\s*([\w.-]+\/[\w.-]+)/gi, provider: 'modelscope' }
  ];
  for (const { re, provider } of textPatterns) {
    for (const match of line.matchAll(re)) add(match[1], provider);
  }
}

function parseHeading(line) {
  const text = String(line || '').trim();
  if (!text) return null;
  let match = text.match(/^#{1,6}\s+(.+?)\s*#*$/);
  if (match) return stripMarkdown(match[1]);
  match = text.match(/^\*\*(.+?)\*\*:?\s*$/);
  if (match) return stripMarkdown(match[1]);
  // Linha curta sem marcador que corresponde exatamente a uma pasta conhecida.
  if (!/^[-*+]\s|^\d+[.)]\s/.test(text) && text.length <= 64 && !/https?:/i.test(text) && normalizeCategory(text)) {
    return stripMarkdown(text);
  }
  return null;
}

function extractNote(line, filename) {
  const text = String(line || '').trim();
  let note = '';
  const emDash = text.split(/\s+[—–]\s+/);
  if (emDash.length > 1) note = emDash.slice(1).join(' — ');
  else {
    const afterSize = text.match(/\)\s*[—–-]\s*(.+)$/);
    if (afterSize) note = afterSize[1];
  }
  note = note.replace(/`/g, '').replace(/\s+/g, ' ').trim();
  if (note.length > 240) note = note.slice(0, 237) + '...';
  return note;
}

function extractInputAssets(line) {
  const assets = [];
  for (const match of String(line).matchAll(/(?:^|[\s(`'\[])(input\/[^\s)`'\]]+)/gi)) {
    assets.push(match[1]);
  }
  return assets;
}

function tableCells(line) {
  const text = String(line || '').trim();
  if (!text.startsWith('|') || !text.endsWith('|')) return null;
  const cells = text.slice(1, -1).split('|').map((c) => c.trim());
  if (!cells.length) return null;
  if (cells.every((c) => /^:?-{2,}:?$/.test(c) || c === '')) return null;
  return cells;
}

/**
 * Interpreta o Markdown de um workflow.
 * @param {string} markdown
 * @returns {{title: string|null, repos: Array, entries: Array, warnings: Array, inputAssets: Array}}
 */
function parseWorkflowMarkdown(markdown) {
  const text = String(markdown || '').replace(/\r\n?/g, '\n');
  const lines = text.split('\n');
  const repos = [];
  const entries = [];
  const warnings = [];
  const inputAssets = [];
  const seen = new Set();
  let title = null;
  let currentCategory = null;
  let inFence = false;

  const addEntry = ({ filename, category, url, provider, repo, sizeHintBytes, optional, note }) => {
    const clean = baseNameOf(filename);
    if (!isModelFile(clean)) return;
    const cat = normalizeCategory(category) || comfyCategoryFromFilename(clean);
    const key = `${cat}:${clean.toLowerCase()}`;
    if (seen.has(key)) return;
    seen.add(key);
    entries.push({
      id: `e${entries.length + 1}`,
      name: clean,
      filename: clean,
      category: cat,
      url: url || null,
      provider: provider || null,
      repo: repo || null,
      sizeHintBytes: sizeHintBytes || null,
      optional: !!optional,
      note: note || '',
      source: url ? 'direct' : 'repo'
    });
  };

  for (const rawLine of lines) {
    const line = rawLine.trimEnd();
    if (/^\s*```/.test(line)) { inFence = !inFence; continue; }
    if (inFence) continue;
    // Árvore de pastas ("ComfyUI/ ├── models/ ...") não é uma lista de downloads.
    if (/[├└│]/.test(line)) continue;

    const heading = parseHeading(line);
    if (heading) {
      if (!title && /^#\s/.test(line)) title = heading;
      if (/model\s*links?/i.test(heading) || /^links?$/i.test(heading)) {
        currentCategory = null;
      } else if (/input\s*asset|workflow\s*input/i.test(heading)) {
        currentCategory = null;
      } else {
        currentCategory = normalizeCategory(heading);
        if (!currentCategory) {
          // Cabeçalho genérico (ex.: "Model Storage Location") fecha a secção.
          currentCategory = null;
        }
      }
      collectRepoRefs(line, repos);
      continue;
    }

    collectRepoRefs(line, repos);

    const assets = extractInputAssets(line);
    for (const asset of assets) {
      if (!inputAssets.includes(asset)) inputAssets.push(asset);
      if (/required|obrigat/i.test(line)) {
        warnings.push(`Entrada obrigatória do workflow: ${asset} (não é um modelo; coloque o ficheiro em ComfyUI/input).`);
      }
    }

    const urls = extractUrls(line);
    const directUrls = [];
    for (const raw of urls) {
      const parsed = parseModelUrl(raw);
      if (parsed && parsed.direct && parsed.filename) directUrls.push({ raw, parsed });
    }
    const filenames = extractFilenames(line);
    const sizeHintBytes = parseSizeHint(line);
    const optional = /\boptional\b|\bopcional\b/i.test(line);

    const cells = tableCells(line);
    if (cells) {
      const cellFilenames = [];
      const cellCategories = [];
      const cellUrls = [];
      for (const cell of cells) {
        for (const file of extractFilenames(cell)) cellFilenames.push(file);
        const cat = normalizeCategory(cell);
        if (cat) cellCategories.push(cat);
        for (const raw of extractUrls(cell)) {
          const parsed = parseModelUrl(raw);
          if (parsed && parsed.direct && parsed.filename) cellUrls.push({ raw, parsed });
        }
      }
      const category = cellCategories[0] || currentCategory;
      if (cellFilenames.length) {
        for (const file of cellFilenames) {
          const direct = cellUrls.find((u) => u.parsed.filename.toLowerCase() === file.toLowerCase());
          addEntry({
            filename: file,
            category,
            url: direct ? direct.raw : null,
            provider: direct ? direct.parsed.provider : null,
            repo: direct ? direct.parsed.repo : null,
            sizeHintBytes,
            optional,
            note: extractNote(line, file)
          });
        }
        continue;
      }
      if (cellUrls.length) {
        for (const direct of cellUrls) {
          addEntry({
            filename: direct.parsed.filename,
            category,
            url: direct.raw,
            provider: direct.parsed.provider,
            repo: direct.parsed.repo,
            sizeHintBytes,
            optional,
            note: extractNote(line, direct.parsed.filename)
          });
        }
        continue;
      }
    }

    if (filenames.length) {
      for (const file of filenames) {
        const direct = directUrls.find((u) => u.parsed.filename.toLowerCase() === file.toLowerCase())
          || (directUrls.length === 1 ? directUrls[0] : null);
        addEntry({
          filename: file,
          category: currentCategory,
          url: direct ? direct.raw : null,
          provider: direct ? direct.parsed.provider : null,
          repo: direct ? direct.parsed.repo : null,
          sizeHintBytes,
          optional,
          note: extractNote(line, file)
        });
      }
      continue;
    }

    // Linha sem nome de ficheiro mas com link direto para um modelo.
    for (const direct of directUrls) {
      addEntry({
        filename: direct.parsed.filename,
        category: currentCategory,
        url: direct.raw,
        provider: direct.parsed.provider,
        repo: direct.parsed.repo,
        sizeHintBytes,
        optional,
        note: extractNote(line, direct.parsed.filename)
      });
    }
  }

  if (!title) {
    const firstHeading = lines.find((l) => /^#{1,6}\s+/.test(l));
    if (firstHeading) title = stripMarkdown(firstHeading.replace(/^#{1,6}\s+/, ''));
  }
  if (entries.length === 0) {
    warnings.push('Nenhum ficheiro de modelo reconhecido no Markdown. Inclua secções como text_encoders, diffusion_models, vae ou loras.');
  }
  if (entries.length > 0 && repos.length === 0 && entries.some((e) => !e.url)) {
    warnings.push('Há ficheiros sem link direto e não foi encontrado nenhum repositório Hugging Face no documento.');
  }

  return { title, repos, entries, warnings, inputAssets };
}

/* ------------------------------------------------------------------------- */
/* Descoberta de pastas ComfyUI                                               */
/* ------------------------------------------------------------------------- */

function normalizePathKey(value) {
  return path.resolve(String(value || '')).replace(/\\/g, '/').replace(/\/+$/, '').toLowerCase();
}

function markerCount(dir) {
  let count = 0;
  for (const marker of COMFY_MARKERS) {
    try { if (fs.existsSync(path.join(dir, marker))) count++; } catch (e) { /* ignora */ }
  }
  return count;
}

/**
 * Deteta a pasta `ComfyUI/models` a usar. Dá prioridade a uma pasta explícita
 * (`comfyModelsDir`), depois ao `comfyDir` configurado, depois às pastas de
 * varrimento que pareçam uma instalação ComfyUI.
 */
function detectComfyModelsDir(config = {}) {
  const candidates = [];
  const seen = new Set();
  const add = (dir, source) => {
    if (!dir) return;
    let abs;
    try { abs = path.resolve(dir); } catch (e) { return; }
    const key = normalizePathKey(abs);
    if (!key || seen.has(key)) return;
    seen.add(key);
    let exists = false;
    try { exists = fs.existsSync(abs) && fs.statSync(abs).isDirectory(); } catch (e) { exists = false; }
    candidates.push({ path: abs, source, exists, markers: exists ? markerCount(abs) : 0 });
  };

  add(config.comfyModelsDir, 'config');
  if (config.comfyDir) {
    add(path.join(config.comfyDir, 'models'), 'comfyDir');
    add(path.join(config.comfyDir, 'ComfyUI', 'models'), 'comfyDir');
    add(config.comfyDir, 'comfyDir');
  }
  for (const dir of (Array.isArray(config.scanDirectories) ? config.scanDirectories : [])) {
    add(dir, 'scan');
    const parent = path.dirname(path.resolve(dir));
    if (path.basename(parent).toLowerCase() === 'models') add(parent, 'scan');
    add(path.join(path.resolve(dir), 'models'), 'scan');
  }

  const scored = candidates.map((c) => {
    const lower = c.path.toLowerCase().replace(/\\/g, '/');
    let score = c.markers * 10;
    if (c.source === 'config') score += 1000;
    else if (c.source === 'comfyDir') score += 100;
    if (/\/comfyui\//.test(lower + '/')) score += 5;
    return { ...c, score };
  }).sort((a, b) => b.score - a.score);

  const explicit = scored.find((c) => c.exists && c.source === 'config');
  const best = explicit || scored.find((c) => c.exists && c.markers > 0) || null;
  const suggested = config.centralDir
    ? path.join(config.centralDir, 'ComfyUI', 'models')
    : path.join(process.cwd(), 'ComfyUI', 'models');

  return {
    root: best ? best.path : null,
    source: best ? best.source : null,
    candidates: scored.filter((c) => c.exists && (c.markers > 0 || c.source === 'config')).slice(0, 8),
    suggested
  };
}

function resolveCategoryDir(root, category) {
  const def = CATEGORY_DEFS[category];
  if (!def || !root) return null;
  for (const dir of def.dirs) {
    const candidate = path.join(root, dir);
    try { if (fs.existsSync(candidate) && fs.statSync(candidate).isDirectory()) return candidate; } catch (e) { /* ignora */ }
  }
  return path.join(root, def.dirs[0]);
}

function safeFilename(name) {
  let base = baseNameOf(String(name || '').replace(/\\/g, '/'));
  base = base.replace(/[\u0000-\u001f<>:"|?*]/g, '_').trim();
  if (!base || base === '.' || base === '..') return null;
  if (base.length > 200) {
    const ext = path.extname(base);
    base = base.slice(0, 200 - ext.length) + ext;
  }
  return base;
}

/**
 * Caminho final seguro de um ficheiro dentro da pasta de modelos.
 * Impede path traversal e nomes inválidos no Windows.
 */
function buildTargetPath(root, category, filename) {
  const dir = resolveCategoryDir(root, category);
  const safe = safeFilename(filename);
  if (!dir || !safe) return null;
  const target = path.resolve(dir, safe);
  const rootResolved = path.resolve(root);
  if (!(target === rootResolved || target.startsWith(rootResolved + path.sep))) return null;
  return { targetDir: dir, targetPath: target, filename: safe };
}

/* ------------------------------------------------------------------------- */
/* Hugging Face                                                               */
/* ------------------------------------------------------------------------- */

function repoApiPath(repo) {
  return String(repo).split('/').map(encodeURIComponent).join('/');
}

const defaultFetch = (...args) => import('node-fetch').then(({ default: f }) => f(...args));

async function fetchRepoFiles(repo, { token, fetchImpl, timeoutMs = 20000 } = {}) {
  const impl = fetchImpl || defaultFetch;
  const headers = {};
  if (token) headers.Authorization = `Bearer ${token}`;
  const response = await impl(`https://huggingface.co/api/models/${repoApiPath(repo)}?blobs=true`, {
    headers,
    signal: AbortSignal.timeout(timeoutMs)
  });
  if (response.status === 401 || response.status === 403) {
    const error = new Error('Repositório privado ou com acesso restrito. Configure um token do Hugging Face.');
    error.code = 'HF_AUTH';
    throw error;
  }
  if (response.status === 404) {
    const error = new Error(`Repositório "${repo}" não encontrado no Hugging Face.`);
    error.code = 'HF_NOT_FOUND';
    throw error;
  }
  if (!response.ok) throw new Error(`Hugging Face API HTTP ${response.status} para ${repo}.`);
  const data = await response.json();
  return (data.siblings || [])
    .filter((s) => s && s.rfilename && isModelFile(s.rfilename))
    .map((s) => ({
      rfilename: s.rfilename,
      filename: baseNameOf(s.rfilename),
      size: Number(s.size || (s.lfs && s.lfs.size) || 0) || null,
      sha256: (s.lfs && s.lfs.sha256) || null
    }));
}

async function searchHfModels(query, { token, fetchImpl } = {}) {
  const impl = fetchImpl || defaultFetch;
  const headers = {};
  if (token) headers.Authorization = `Bearer ${token}`;
  const url = `https://huggingface.co/api/models?search=${encodeURIComponent(query)}&limit=8&full=true&sort=downloads&direction=-1`;
  const response = await impl(url, { headers, signal: AbortSignal.timeout(20000) });
  if (!response.ok) return [];
  const data = await response.json();
  return (Array.isArray(data) ? data : [])
    .filter((m) => m && m.id && Array.isArray(m.siblings))
    .map((m) => ({ repo: m.id, siblings: m.siblings || [] }));
}

function deriveSearchQuery(filename) {
  const base = String(filename || '').replace(/\.[^.]+$/, '');
  const tokens = base.split(/[-_]+/).filter(Boolean);
  const picked = [];
  for (const token of tokens) {
    const lower = token.toLowerCase();
    if (picked.length >= 2) break;
    if (GENERIC_SEARCH_TOKENS.has(lower)) continue;
    if (/^\d+b$/i.test(lower)) continue;
    if (/^(?:iq|q)\d/i.test(lower)) continue;
    if (/^\d+x\d+$/i.test(lower)) continue;
    if (/^\d+(?:\.\d+)?$/.test(lower) && picked.length === 0) continue;
    picked.push(token);
  }
  const query = picked.join('-');
  return query.length >= 3 ? query : base.slice(0, 40);
}

function matchSibling(files, filename) {
  const target = String(filename || '').toLowerCase();
  if (!target) return null;
  const exactPath = files.find((f) => f.rfilename.toLowerCase() === target);
  if (exactPath) return exactPath;
  const exactBase = files.find((f) => f.filename.toLowerCase() === target);
  if (exactBase) return exactBase;
  const normalize = (value) => value.toLowerCase().replace(/[\s_]+/g, '-');
  const loose = files.find((f) => normalize(f.filename) === normalize(target));
  return loose || null;
}

function resolveUrlFor(repo, rfilename) {
  const filePath = String(rfilename).split('/').map(encodeURIComponent).join('/');
  return `https://huggingface.co/${repo}/resolve/main/${filePath}`;
}

/** Obtém o tamanho de um link direto (HEAD, com fallback para Range 0-0). */
async function fetchRemoteSize(url, { token, fetchImpl } = {}) {
  const impl = fetchImpl || defaultFetch;
  const headers = { 'User-Agent': 'Centraliza.ai/0.6 (+workflow-import)' };
  if (token) headers.Authorization = `Bearer ${token}`;
  try {
    const response = await impl(url, { method: 'HEAD', redirect: 'follow', headers, signal: AbortSignal.timeout(12000) });
    if (response.ok) {
      const length = Number(response.headers.get('content-length') || 0);
      if (length > 0) return length;
    }
  } catch (e) { /* tenta o fallback abaixo */ }
  try {
    const response = await impl(url, {
      method: 'GET',
      redirect: 'follow',
      headers: { ...headers, Range: 'bytes=0-0' },
      signal: AbortSignal.timeout(12000)
    });
    if (response.ok && response.status === 206) {
      const range = response.headers.get('content-range') || '';
      const total = Number(String(range).split('/')[1]) || 0;
      try { response.body?.destroy?.(); } catch (e) { /* ignora */ }
      if (total > 0) return total;
    }
  } catch (e) { /* tamanho desconhecido */ }
  return null;
}

/* ------------------------------------------------------------------------- */
/* Download                                                                   */
/* ------------------------------------------------------------------------- */

function humanError(error) {
  if (!error) return 'Erro desconhecido.';
  if (error.code === 'ENOSPC') return 'Sem espaço em disco suficiente.';
  if (error.name === 'AbortError' || error.code === 'ABORT_ERR') return 'Transferência cancelada.';
  if (error.code === 'HF_AUTH' || error.status === 401 || error.status === 403) {
    return 'Acesso negado pelo Hugging Face. Configure um token (repositório gated/privado).';
  }
  return error.message || String(error);
}

/**
 * Descarrega um ficheiro com progresso e retoma (HTTP Range) a partir de
 * `<destino>.part`. Exportada para testes e reutilização.
 */
async function downloadFile({
  url,
  destPath,
  token,
  signal,
  onProgress,
  fetchImpl,
  headers: extraHeaders
} = {}) {
  if (!url) throw new Error('URL de download ausente.');
  if (!destPath) throw new Error('Destino de download ausente.');
  const impl = fetchImpl || ((...args) => import('node-fetch').then(({ default: f }) => f(...args)));
  const partPath = `${destPath}.part`;
  fs.mkdirSync(path.dirname(destPath), { recursive: true });

  let startBytes = 0;
  try { if (fs.existsSync(partPath)) startBytes = fs.statSync(partPath).size; } catch (e) { startBytes = 0; }

  const headers = {
    'User-Agent': 'Centraliza.ai/0.6 (+workflow-import)',
    Accept: '*/*',
    ...(extraHeaders || {})
  };
  if (token) headers.Authorization = `Bearer ${token}`;
  if (startBytes > 0) headers.Range = `bytes=${startBytes}-`;

  const response = await impl(url, { headers, redirect: 'follow', signal });

  if (response.status === 416 && startBytes > 0) {
    const contentRange = response.headers.get('content-range') || '';
    const total = Number(String(contentRange).split('/')[1]) || 0;
    const partialSize = fs.statSync(partPath).size;
    if (total && partialSize !== total) {
      try { fs.unlinkSync(partPath); } catch (e) { /* ignora */ }
      throw new Error('Ficheiro parcial inconsistente. Tente novamente.');
    }
    if (fs.existsSync(destPath)) fs.unlinkSync(destPath);
    fs.renameSync(partPath, destPath);
    if (onProgress) onProgress({ downloadedBytes: partialSize, totalBytes: partialSize, percent: 100, speed: 0 });
    return { bytes: partialSize, resumed: true };
  }

  if (!response.ok) {
    const error = new Error(`HTTP ${response.status}${response.statusText ? ` ${response.statusText}` : ''} ao descarregar.`);
    error.status = response.status;
    if (response.status === 401 || response.status === 403) error.code = 'HF_AUTH';
    throw error;
  }

  const contentLength = Number(response.headers.get('content-length') || 0);
  const isResume = startBytes > 0 && response.status === 206;
  if (startBytes > 0 && !isResume) {
    // O servidor ignorou o Range: recomeça do zero.
    startBytes = 0;
  }
  const totalBytes = contentLength > 0 ? (isResume ? startBytes + contentLength : contentLength) : 0;

  let downloadedBytes = startBytes;
  let lastTick = Date.now();
  let lastBytes = startBytes;
  let lastEmit = 0;
  let speed = 0;

  const emit = (force) => {
    const now = Date.now();
    if (!force && now - lastEmit < 300) return;
    const elapsed = (now - lastTick) / 1000;
    if (elapsed > 0.05) {
      const instant = (downloadedBytes - lastBytes) / elapsed;
      speed = speed ? (speed * 0.7 + instant * 0.3) : instant;
      lastTick = now;
      lastBytes = downloadedBytes;
    }
    lastEmit = now;
    if (onProgress) {
      onProgress({
        downloadedBytes,
        totalBytes: totalBytes || null,
        percent: totalBytes > 0 ? Math.min(100, Math.floor((downloadedBytes / totalBytes) * 100)) : -1,
        speed: Math.round(speed)
      });
    }
  };

  emit(true);
  const counter = new Transform({
    transform(chunk, _encoding, callback) {
      downloadedBytes += chunk.length;
      emit(false);
      callback(null, chunk);
    }
  });

  try {
    await pipeline(
      response.body,
      counter,
      fs.createWriteStream(partPath, { flags: isResume ? 'a' : 'w' })
    );
  } catch (error) {
    if (error && error.code === 'ENOSPC') error.code = 'ENOSPC';
    throw error;
  }

  emit(true);
  const finalSize = fs.statSync(partPath).size;
  if (totalBytes > 0 && finalSize !== totalBytes) {
    throw new Error(`Transferência incompleta (${finalSize} de ${totalBytes} bytes).`);
  }
  if (fs.existsSync(destPath)) fs.unlinkSync(destPath);
  fs.renameSync(partPath, destPath);
  return { bytes: finalSize, resumed: isResume };
}

/* ------------------------------------------------------------------------- */
/* Inspeção                                                                   */
/* ------------------------------------------------------------------------- */

async function inspectWorkflow({
  markdown,
  fileName,
  config = {},
  token = null,
  autoDiscover = true,
  checkDiskSpace = null,
  fetchImpl
} = {}) {
  const parsed = parseWorkflowMarkdown(markdown);
  const detected = detectComfyModelsDir(config);
  const repos = parsed.repos.map((r) => ({ ...r }));
  const repoFileCache = new Map();
  const warnings = [...parsed.warnings];

  const getFiles = async (repo) => {
    const key = repo.toLowerCase();
    if (repoFileCache.has(key)) return repoFileCache.get(key);
    const promise = fetchRepoFiles(repo, { token, fetchImpl }).catch((error) => {
      error.repo = repo;
      return { error };
    });
    repoFileCache.set(key, promise);
    return promise;
  };

  const entries = parsed.entries.map((entry) => ({ ...entry, status: 'ready', error: null, discoveredRepo: null }));
  const unresolved = [];

  // 1) Resolver contra os repositórios listados no documento.
  await Promise.all(entries.filter((e) => !e.url).map(async (entry) => {
    let responded = 0;
    for (const repo of repos) {
      const files = await getFiles(repo.repo);
      if (files && files.error) {
        entry.error = humanError(files.error);
        continue;
      }
      responded++;
      const hit = matchSibling(files || [], entry.filename);
      if (hit) {
        entry.repo = repo.repo;
        entry.provider = repo.provider;
        entry.url = resolveUrlFor(repo.repo, hit.rfilename);
        entry.repoFile = hit.rfilename;
        entry.size = hit.size || null;
        entry.error = null;
        return;
      }
    }

    // Se a API do HF não respondeu de todo (rede/limite), não bloqueamos o
    // planeamento: tentamos o URL de resolução direto no primeiro repo HF.
    if (responded === 0) {
      const hfRepo = repos.find((r) => r.provider === 'huggingface');
      if (hfRepo) {
        entry.repo = hfRepo.repo;
        entry.provider = hfRepo.provider;
        entry.url = resolveUrlFor(hfRepo.repo, entry.filename);
        entry.unverified = true;
        entry.status = 'ready';
        entry.error = null;
        return;
      }
    }

    entry.status = 'unresolved';
    if (!entry.error) {
      entry.error = repos.length
        ? `Ficheiro não encontrado em ${repos.map((r) => r.repo).join(', ')}.`
        : 'Nenhum repositório indicado no documento.';
    }
    unresolved.push(entry);
  }));

  // 2) Pesquisa automática no HF para ficheiros que não estão nos repos listados.
  if (autoDiscover && unresolved.length > 0) {
    const queries = new Map();
    for (const entry of unresolved) {
      const query = deriveSearchQuery(entry.filename);
      if (!query) continue;
      if (!queries.has(query)) queries.set(query, []);
      queries.get(query).push(entry);
    }
    const searchResults = new Map();
    for (const query of Array.from(queries.keys()).slice(0, 8)) {
      try {
        const results = await searchHfModels(query, { token, fetchImpl });
        searchResults.set(query, results);
      } catch (e) { /* pesquisa é best-effort */ }
    }

    const candidateRepos = new Map();
    for (const results of searchResults.values()) {
      for (const result of results) {
        if (!candidateRepos.has(result.repo)) candidateRepos.set(result.repo, result.siblings);
      }
    }

    for (const entry of unresolved) {
      for (const [repo, siblings] of candidateRepos) {
        const files = siblings.map((s) => ({ rfilename: s.rfilename, filename: baseNameOf(s.rfilename), size: null }));
        const hit = matchSibling(files, entry.filename);
        if (!hit) continue;
        entry.repo = repo;
        entry.provider = 'huggingface';
        entry.repoFile = hit.rfilename;
        entry.url = resolveUrlFor(repo, hit.rfilename);
        entry.discoveredRepo = true;
        entry.status = 'ready';
        entry.error = null;
        if (!repos.some((r) => r.repo.toLowerCase() === repo.toLowerCase())) {
          repos.push({ repo, provider: 'huggingface', discovered: true });
        }
        break;
      }
    }

    // Tamanhos reais para os repos descobertos (a pesquisa full não traz size).
    const discovered = Array.from(new Set(
      unresolved.filter((e) => e.discoveredRepo).map((e) => e.repo)
    ));
    await Promise.all(discovered.map(async (repo) => {
      try {
        const files = await fetchRepoFiles(repo, { token, fetchImpl });
        for (const entry of unresolved) {
          if (entry.repo !== repo || entry.size) continue;
          const hit = matchSibling(files, entry.filename);
          if (hit) entry.size = hit.size || null;
        }
      } catch (e) { /* tamanho é opcional */ }
    }));

    const stillUnresolved = unresolved.filter((e) => e.status !== 'ready');
    if (stillUnresolved.length) {
      warnings.push(`${stillUnresolved.length} ficheiro(s) continuam por localizar. Pode indicar um link direto no passo de revisão.`);
    }
    if (unresolved.some((e) => e.discoveredRepo)) {
      const count = unresolved.filter((e) => e.discoveredRepo).length;
      warnings.push(`${count} ficheiro(s) encontrados automaticamente em repositórios não listados no Markdown.`);
    }
  }

  // 3) Tamanhos dos links diretos (para o resumo de espaço antes de baixar).
  await Promise.all(entries
    .filter((entry) => entry.url && !entry.size)
    .map(async (entry) => {
      const size = await fetchRemoteSize(entry.url, { token, fetchImpl });
      if (size) entry.size = size;
    }));

  // 4) Destinos e estado de cada entrada.
  for (const entry of entries) {
    if (entry.status !== 'ready') {
      entry.selected = false;
      entry.targetDir = null;
      entry.targetPath = null;
      continue;
    }
    if (!entry.size && entry.sizeHintBytes) entry.size = entry.sizeHintBytes;
    const target = detected.root ? buildTargetPath(detected.root, entry.category, entry.filename) : null;
    entry.targetDir = target ? target.targetDir : null;
    entry.targetPath = target ? target.targetPath : null;
    entry.filename = target ? target.filename : entry.filename;
    try { entry.exists = !!(target && fs.existsSync(target.targetPath)); } catch (e) { entry.exists = false; }
    if (entry.exists) entry.status = 'present';
    entry.selected = entry.status === 'ready' && !entry.optional;
    entry.quant = parseQuant(entry.filename);
    if (entry.unverified && !entry.exists) {
      warnings.push(`"${entry.filename}" será tentado por link direto (não foi possível confirmar no repositório).`);
    }
  }

  let freeBytes = null;
  try {
    if (detected.root && typeof checkDiskSpace === 'function') {
      const disk = await checkDiskSpace(path.parse(detected.root).root);
      freeBytes = disk.free;
    }
  } catch (e) { freeBytes = null; }

  const selected = entries.filter((e) => e.selected);
  const summary = {
    total: entries.length,
    ready: entries.filter((e) => e.status === 'ready').length,
    unresolved: entries.filter((e) => e.status === 'unresolved').length,
    present: entries.filter((e) => e.status === 'present').length,
    optional: entries.filter((e) => e.optional).length,
    selected: selected.length,
    bytes: selected.reduce((sum, e) => sum + (e.size || 0), 0),
    totalBytes: entries.reduce((sum, e) => sum + (e.size || 0), 0)
  };

  const jobId = `wf-${Date.now().toString(36)}-${crypto.randomBytes(3).toString('hex')}`;
  return {
    jobId,
    title: parsed.title || (fileName ? String(fileName).replace(/\.(md|markdown|txt)$/i, '') : 'ComfyUI Workflow'),
    fileName: fileName || null,
    createdAt: Date.now(),
    comfy: {
      root: detected.root,
      source: detected.source,
      candidates: detected.candidates,
      suggested: detected.suggested,
      freeBytes,
      categories: Object.fromEntries(Object.entries(CATEGORY_DEFS).map(([key, def]) => [key, def.dirs]))
    },
    repos,
    entries,
    inputAssets: parsed.inputAssets,
    warnings,
    summary
  };
}

/* ------------------------------------------------------------------------- */
/* Serviço com fila de downloads                                              */
/* ------------------------------------------------------------------------- */

function createWorkflowService({
  config = {},
  logger = console,
  notify = () => {},
  onModelsUpdated = () => {},
  dataDir = path.join(process.cwd(), 'data'),
  checkDiskSpace = null,
  fetchImpl
} = {}) {
  const drafts = new Map();
  const jobs = new Map();
  const controllers = new Map();
  const historyFile = path.join(dataDir, 'workflow-jobs.json');
  let historyLoaded = false;
  let lastDraftCleanup = 0;

  const safeNotify = (event, payload) => {
    try { notify(event, payload); } catch (e) { /* socket indisponível */ }
  };

  function loadHistory() {
    if (historyLoaded) return;
    historyLoaded = true;
    try {
      if (!fs.existsSync(historyFile)) return;
      const data = JSON.parse(fs.readFileSync(historyFile, 'utf8'));
      const list = Array.isArray(data) ? data : (data.jobs || []);
      for (const job of list) {
        if (!job || !job.id) continue;
        if (job.status === 'running' || job.status === 'queued') {
          job.status = 'interrupted';
          for (const entry of job.entries || []) {
            if (entry.status === 'downloading' || entry.status === 'queued') {
              entry.status = 'interrupted';
              entry.error = entry.error || 'Interrompido ao reiniciar a aplicação.';
            }
          }
        }
        jobs.set(job.id, job);
      }
    } catch (e) {
      logger.warn?.(`[Workflow] Não foi possível ler o histórico: ${e.message}`);
    }
  }

  function persistHistory() {
    try {
      fs.mkdirSync(dataDir, { recursive: true });
      const list = Array.from(jobs.values())
        .sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0))
        .slice(0, 30)
        .map((job) => {
          const copy = publicJob(job);
          delete copy.active;
          return copy;
        });
      const tmp = `${historyFile}.tmp`;
      fs.writeFileSync(tmp, JSON.stringify({ version: 1, jobs: list }, null, 2));
      fs.renameSync(tmp, historyFile);
    } catch (e) {
      logger.warn?.(`[Workflow] Não foi possível guardar o histórico: ${e.message}`);
    }
  }

  function cleanupDrafts() {
    const now = Date.now();
    if (now - lastDraftCleanup < 60000) return;
    lastDraftCleanup = now;
    for (const [id, draft] of drafts) {
      if (now - draft.createdAt > 2 * 60 * 60 * 1000) drafts.delete(id);
    }
  }

  function publicJob(job) {
    const entries = (job.entries || []).map((entry) => ({
      id: entry.id,
      name: entry.name,
      filename: entry.filename,
      repo: entry.repo || null,
      url: entry.url || null,
      category: entry.category,
      targetDir: entry.targetDir || null,
      targetPath: entry.targetPath || null,
      size: entry.size || null,
      sizeHintBytes: entry.sizeHintBytes || null,
      optional: !!entry.optional,
      status: entry.status,
      progress: entry.status === 'completed' ? 100 : (entry.progress || 0),
      downloadedBytes: entry.downloadedBytes || 0,
      totalBytes: entry.totalBytes || entry.size || null,
      speed: entry.speed || 0,
      error: entry.error || null,
      exists: !!entry.exists,
      discoveredRepo: !!entry.discoveredRepo,
      unverified: !!entry.unverified,
      note: entry.note || ''
    }));
    const summary = {
      total: entries.length,
      completed: entries.filter((e) => e.status === 'completed').length,
      failed: entries.filter((e) => e.status === 'failed').length,
      skipped: entries.filter((e) => e.status === 'skipped' || e.status === 'present').length,
      cancelled: entries.filter((e) => e.status === 'cancelled').length,
      queued: entries.filter((e) => e.status === 'queued').length,
      downloading: entries.filter((e) => e.status === 'downloading').length,
      bytes: entries.reduce((sum, e) => sum + (e.size || 0), 0),
      downloadedBytes: entries.reduce((sum, e) => sum + (e.downloadedBytes || 0), 0)
    };
    return {
      id: job.id,
      title: job.title,
      fileName: job.fileName || null,
      status: job.status,
      createdAt: job.createdAt,
      startedAt: job.startedAt || null,
      finishedAt: job.finishedAt || null,
      root: job.root || null,
      repos: job.repos || [],
      warnings: job.warnings || [],
      entries,
      summary,
      active: job.status === 'running' || job.status === 'cancelling'
    };
  }

  async function inspect({ markdown, fileName, token } = {}) {
    loadHistory();
    cleanupDrafts();
    const draft = await inspectWorkflow({
      markdown,
      fileName,
      config,
      token: token || config.hfToken || null,
      autoDiscover: config.workflowAutoDiscover !== false,
      checkDiskSpace,
      fetchImpl
    });
    drafts.set(draft.jobId, draft);
    return draft;
  }

  function resolveStartEntries(draft, overrides) {
    const byId = new Map((Array.isArray(overrides) ? overrides : []).map((o) => [String(o.id), o]));
    const root = draft.comfy.root;
    const selected = [];

    for (const original of draft.entries) {
      const override = byId.get(String(original.id));
      const isSelected = override ? override.selected !== false : original.selected;
      if (!isSelected) continue;

      const category = normalizeCategory(override && override.category) || original.category;
      const filename = original.filename;
      const target = root ? buildTargetPath(root, category, filename) : null;
      if (!target) {
        throw Object.assign(new Error(`Destino inválido para "${filename}".`), { statusCode: 400 });
      }

      let url = (override && override.url) ? String(override.url).trim() : original.url;
      if (!url) throw Object.assign(new Error(`Sem link de download para "${filename}".`), { statusCode: 400 });

      const skipExisting = !!original.exists && !(override && override.overwrite);
      selected.push({
        ...original,
        category,
        targetDir: target.targetDir,
        targetPath: target.targetPath,
        filename: target.filename,
        url,
        status: skipExisting ? 'skipped' : 'queued',
        progress: skipExisting ? 100 : 0,
        downloadedBytes: skipExisting ? (original.size || 0) : 0,
        totalBytes: original.size || null,
        speed: 0,
        error: null,
        selected: true
      });
    }
    if (selected.length === 0) {
      throw Object.assign(new Error('Nenhum modelo selecionado para transferir.'), { statusCode: 400 });
    }
    return selected;
  }

  async function start({ jobId, entries: overrides, token } = {}) {
    loadHistory();
    const draft = drafts.get(String(jobId));
    if (!draft) {
      throw Object.assign(new Error('Importação expirada. Analise o ficheiro novamente.'), { statusCode: 404 });
    }
    if (!draft.comfy.root) {
      throw Object.assign(new Error('Pasta de modelos do ComfyUI não configurada.'), { statusCode: 400 });
    }

    const selected = resolveStartEntries(draft, overrides);
    const job = {
      id: draft.jobId,
      title: draft.title,
      fileName: draft.fileName,
      status: 'running',
      createdAt: draft.createdAt,
      startedAt: Date.now(),
      finishedAt: null,
      root: draft.comfy.root,
      repos: draft.repos,
      warnings: draft.warnings,
      entries: selected,
      cancelled: false
    };
    jobs.set(job.id, job);
    persistHistory();
    safeNotify('workflow-started', { jobId: job.id, title: job.title, summary: publicJob(job).summary });

    runJob(job, token || config.hfToken || null).catch((error) => {
      logger.error?.('[Workflow] Falha inesperada na fila de downloads', error);
      job.status = 'failed';
      job.finishedAt = Date.now();
      persistHistory();
      safeNotify('workflow-complete', { jobId: job.id, status: job.status, summary: publicJob(job).summary });
    });

    return publicJob(job);
  }

  async function processEntry(job, entry, token) {
    if (job.cancelled) {
      entry.status = 'cancelled';
      safeNotify('workflow-progress', { jobId: job.id, entryId: entry.id, status: entry.status, progress: entry.progress || 0 });
      return;
    }
    entry.status = 'downloading';
    entry.startedAt = Date.now();
    entry.error = null;
    safeNotify('workflow-progress', {
      jobId: job.id, entryId: entry.id, status: entry.status,
      progress: 0, downloadedBytes: 0, totalBytes: entry.totalBytes || entry.size || null
    });

    const controller = new AbortController();
    controllers.set(`${job.id}:${entry.id}`, controller);

    try {
      const result = await downloadFile({
        url: entry.url,
        destPath: entry.targetPath,
        token,
        signal: controller.signal,
        fetchImpl,
        onProgress: (progress) => {
          entry.progress = progress.percent;
          entry.downloadedBytes = progress.downloadedBytes;
          entry.totalBytes = progress.totalBytes || entry.totalBytes;
          entry.speed = progress.speed;
          safeNotify('workflow-progress', {
            jobId: job.id,
            entryId: entry.id,
            status: 'downloading',
            progress: progress.percent,
            downloadedBytes: progress.downloadedBytes,
            totalBytes: progress.totalBytes,
            speed: progress.speed
          });
        }
      });
      entry.status = 'completed';
      entry.progress = 100;
      entry.downloadedBytes = result.bytes;
      entry.totalBytes = result.bytes;
      entry.finishedAt = Date.now();
      entry.speed = 0;
      logger.info?.(`[Workflow] Concluído: ${entry.filename} (${result.bytes} bytes)`);
    } catch (error) {
      if (job.cancelled || controller.signal.aborted || error.name === 'AbortError' || error.code === 'ABORT_ERR') {
        entry.status = 'cancelled';
        entry.error = null;
      } else {
        entry.status = 'failed';
        entry.error = humanError(error);
        logger.error?.(`[Workflow] Falhou ${entry.filename}: ${entry.error}`);
      }
    } finally {
      controllers.delete(`${job.id}:${entry.id}`);
    }

    safeNotify('workflow-progress', {
      jobId: job.id,
      entryId: entry.id,
      status: entry.status,
      progress: entry.progress,
      downloadedBytes: entry.downloadedBytes,
      totalBytes: entry.totalBytes,
      speed: 0,
      error: entry.error
    });
    persistHistory();
  }

  async function runJob(job, token) {
    const concurrency = Math.max(1, Math.min(4, Number(config.workflowConcurrency) || 2));
    const queue = job.entries.filter((e) => e.status === 'queued');
    let cursor = 0;

    const worker = async () => {
      while (!job.cancelled) {
        const index = cursor++;
        if (index >= queue.length) return;
        const entry = queue[index];
        if (entry.status !== 'queued') continue;
        await processEntry(job, entry, token);
      }
    };

    await Promise.all(Array.from({ length: Math.min(concurrency, queue.length || 1) }, worker));

    if (job.cancelled) {
      job.status = 'cancelled';
      for (const entry of job.entries) {
        if (entry.status === 'queued') entry.status = 'cancelled';
      }
    } else {
      job.status = job.entries.some((e) => e.status === 'failed') ? 'completed_with_errors' : 'completed';
    }
    job.finishedAt = Date.now();
    persistHistory();
    onModelsUpdated();
    const summary = publicJob(job).summary;
    safeNotify('workflow-complete', { jobId: job.id, status: job.status, summary });
    logger.info?.(`[Workflow] Job ${job.id} terminado: ${job.status} (${summary.completed}/${summary.total}).`);
  }

  function cancel(jobId) {
    loadHistory();
    const job = jobs.get(String(jobId));
    if (!job) throw Object.assign(new Error('Importação não encontrada.'), { statusCode: 404 });
    if (job.status !== 'running') return publicJob(job);

    job.cancelled = true;
    job.status = 'cancelling';
    for (const [key, controller] of controllers) {
      if (key.startsWith(`${job.id}:`)) {
        try { controller.abort(); } catch (e) { /* ignora */ }
      }
    }
    for (const entry of job.entries) {
      if (entry.status === 'queued') entry.status = 'cancelled';
    }
    persistHistory();
    safeNotify('workflow-progress', { jobId: job.id, status: 'cancelling' });
    return publicJob(job);
  }

  async function retry(jobId) {
    loadHistory();
    const job = jobs.get(String(jobId));
    if (!job) throw Object.assign(new Error('Importação não encontrada.'), { statusCode: 404 });
    if (job.status === 'running' || job.status === 'cancelling') {
      throw Object.assign(new Error('A importação ainda está em curso.'), { statusCode: 409 });
    }

    const pending = job.entries.filter((e) => ['failed', 'cancelled', 'interrupted'].includes(e.status));
    if (pending.length === 0) return publicJob(job);
    for (const entry of pending) {
      if (!entry.url) {
        entry.status = 'failed';
        entry.error = 'Sem link de download. Importe o ficheiro novamente.';
        continue;
      }
      entry.status = 'queued';
      entry.progress = 0;
      entry.downloadedBytes = 0;
      entry.error = null;
    }
    job.status = 'running';
    job.cancelled = false;
    job.startedAt = Date.now();
    job.finishedAt = null;
    persistHistory();
    runJob(job, config.hfToken || null).catch((error) => {
      logger.error?.('[Workflow] Falha no retry', error);
      job.status = 'failed';
      persistHistory();
    });
    return publicJob(job);
  }

  function list() {
    loadHistory();
    return Array.from(jobs.values())
      .sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0))
      .slice(0, 30)
      .map(publicJob);
  }

  function get(jobId) {
    loadHistory();
    const job = jobs.get(String(jobId));
    return job ? publicJob(job) : null;
  }

  function configInfo() {
    const detected = detectComfyModelsDir(config);
    return {
      comfyModelsDir: config.comfyModelsDir || null,
      detectedRoot: detected.root,
      detectedSource: detected.source,
      candidates: detected.candidates,
      suggested: detected.suggested,
      hasHfToken: !!config.hfToken,
      concurrency: Number(config.workflowConcurrency) || 2,
      autoDiscover: config.workflowAutoDiscover !== false
    };
  }

  return {
    inspect,
    start,
    cancel,
    retry,
    list,
    get,
    configInfo,
    _drafts: drafts,
    _jobs: jobs
  };
}

/* ------------------------------------------------------------------------- */
/* Template de exemplo                                                        */
/* ------------------------------------------------------------------------- */

const WORKFLOW_TEMPLATE = `# Exemplo de workflow ComfyUI — Model Links (LTX-2.5)

### Model Links

- Hugging Face:Comfy-Org/gemma-4
- Hugging Face:Lightricks/LTX-2.5
- ModelScope:Comfy-Org/gemma-4

### Input Asset

- \`input_example.png\` — required workflow input ( \`input/input_example.png\` )

### text_encoders

- \`gemma4_e2b_it_int8_convrot.safetensors\` (4.84 GB) — optional, only needed when \`prompt_enhance\` is enabled.
- \`gemma4-12b-with-proj_ltx-2.5-comfy-int8-convrot.safetensors\`

### diffusion_models

- \`ltx-2.5-22b-distilled-transformer-comfy-int8-convrot.safetensors\`

### vae

- \`ltx-2.5-video-vae-bf16.safetensors\`
- \`ltx-2.5-audio-vae-bf16.safetensors\`

### latent_upscale_models

- \`ltx-2.5-latent-spatial-upscaler-x2-bf16-1.0.safetensors\`

### loras

- \`ltx-2.5-22b-distilled-lora-450-bf16.safetensors\`
`;

module.exports = {
  MODEL_EXTENSIONS,
  CATEGORY_DEFS,
  parseWorkflowMarkdown,
  detectComfyModelsDir,
  resolveCategoryDir,
  buildTargetPath,
  safeFilename,
  parseModelUrl,
  normalizeCategory,
  comfyCategoryFromFilename,
  deriveSearchQuery,
  inspectWorkflow,
  downloadFile,
  createWorkflowService,
  WORKFLOW_TEMPLATE
};
