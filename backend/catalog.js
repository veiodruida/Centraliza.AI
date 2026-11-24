'use strict';

/**
 * Classificação funcional dos modelos locais (v0.6.0).
 *
 * A página "Os Meus Modelos" organiza cada secção por data de inclusão,
 * tamanho, nome, formato e FUNCIONALIDADE. Este módulo é a fonte única dessa
 * classificação: recebe a entrada normalizada de `getModelsList()` (nome,
 * caminho, origem, extensão) e devolve uma categoria estável + metadados
 * derivados do nome (quantização e parâmetros).
 *
 * Categorias (chaves estáveis usadas pela UI/i18n):
 *   llm, coding, reasoning, vision, embedding, audio, image, video,
 *   upscale, lora, vae, controlnet, text_encoder, diffusion_model,
 *   clip_vision, style, ipadapter, other
 */

const COMFY_FOLDER_CATEGORY = {
  checkpoints: 'image',
  loras: 'lora',
  lycoris: 'lora',
  vae: 'vae',
  vae_approx: 'vae',
  controlnet: 'controlnet',
  upscale_models: 'upscale',
  latent_upscale_models: 'upscale',
  text_encoders: 'text_encoder',
  clip: 'text_encoder',
  diffusion_models: 'diffusion_model',
  unet: 'diffusion_model',
  embeddings: 'embedding',
  clip_vision: 'clip_vision',
  style_models: 'style',
  ipadapter: 'ipadapter',
  audio_encoders: 'audio',
  animatediff_models: 'video',
  animatediff_motion_lora: 'video',
  llm: 'llm',
  photomaker: 'image',
  pulid: 'image',
  insightface: 'image',
  facerestore_models: 'image',
  gligen: 'image',
  hypernetworks: 'image',
  model_patches: 'image'
};

const QUANT_RE = /(?:^|[^A-Z0-9])((?:IQ)?Q\d(?:_[A-Z0-9]+){0,3}|F16|F32|BF16|FP16|FP32)(?=$|[^A-Z0-9])/;

/** Deteta a pasta de modelos ComfyUI a partir do caminho completo. */
function comfyFolderFor(modelPath) {
  const normalized = String(modelPath || '').replace(/\\/g, '/');
  const match = normalized.match(/\/models\/([^/]+)\//i);
  if (!match) return null;
  return match[1].toLowerCase();
}

/** Extrai a quantização do nome (ex.: "Q4_K_M", "BF16"). */
function parseQuant(name) {
  const match = String(name || '').toUpperCase().match(QUANT_RE);
  return match ? match[1] : null;
}

/** Extrai parâmetros declarados no nome (ex.: "9B", "22b"). */
function parseParams(name) {
  const match = String(name || '').match(/(?:^|[-_. ])(\d+(?:\.\d+)?)b(?:[-_. ]|$)/i);
  if (!match) return null;
  const value = parseFloat(match[1]);
  return Number.isFinite(value) && value > 0 ? `${value % 1 === 0 ? value : match[1]}B` : null;
}

/** Heurísticas para modelos de linguagem (nome + extensão). */
function classifyLlm(name) {
  const n = name.toLowerCase();
  if (/(^|[-_.])(embed|embedding|gte|bge|e5[-_.]|nomic|reranker)/.test(n)) return 'embedding';
  if (/(whisper|tts|text[-_]?to[-_]?speech|speech|audio|voice|musicgen)/.test(n)) return 'audio';
  if (/(vision|llava|pixtral|minicpm-v|qwen.*vl|[-_.]vl[-_.]|internvl|gemma.*vision|mmproj|projector)/.test(n)) return 'vision';
  if (/(coder|code|starcoder|phind|devstral|codestral)/.test(n)) return 'coding';
  if (/(reason|[-_.]r1[-_.]|qwq|thinking|o1[-_.]|o3[-_.])/.test(n)) return 'reasoning';
  return 'llm';
}

/**
 * Classifica um modelo local.
 * @param {object} model Entrada de getModelsList(): { name, path, source, extension, ollamaTag }
 * @returns {{category: string, comfyCategory: string|null, quant: string|null, params: string|null, comfyFolder: string|null}}
 */
function classifyModel(model) {
  const m = model || {};
  const name = String(m.name || m.ollamaTag || '');
  const folder = comfyFolderFor(m.path);
  const isComfy = m.source === 'ComfyUI' || !!folder;

  let category;
  if (folder && COMFY_FOLDER_CATEGORY[folder]) {
    category = COMFY_FOLDER_CATEGORY[folder];
  } else if (isComfy) {
    // Pasta ComfyUI não mapeada: usa o nome do ficheiro como pista.
    category = inferFromFilename(name, 'image');
  } else {
    category = classifyLlm(name);
  }

  return {
    category,
    comfyCategory: folder,
    comfyFolder: folder,
    quant: parseQuant(name),
    params: parseParams(name)
  };
}

/**
 * Classificação por nome de ficheiro, usada também na importação de workflows
 * quando a secção do markdown não indica a pasta de destino.
 */
function inferFromFilename(filename, fallback = 'image') {
  const n = String(filename || '').toLowerCase();
  if (/vae/.test(n)) return 'vae';
  if (/(lora|lycoris|locon|loha)/.test(n)) return 'lora';
  if (/control[-_]?net|control[-_]?lora|t2i[-_]?adapter/.test(n)) return 'controlnet';
  if (/(upscal|esrgan|swinir|real[-_]?esr|4x[-_]|2x[-_])/.test(n)) return 'upscale';
  if (/clip[-_]?vision/.test(n)) return 'clip_vision';
  if (/(clip|t5|text[-_]?encoder|umt5|gemma)/.test(n) && !/checkpoint/.test(n)) return 'text_encoder';
  if (/(unet|diffusion|transformer)/.test(n)) return 'diffusion_model';
  if (/embed/.test(n)) return 'embedding';
  if (/(animatediff|svd|video)/.test(n)) return 'video';
  return fallback;
}

module.exports = {
  classifyModel,
  inferFromFilename,
  parseQuant,
  parseParams,
  comfyFolderFor,
  COMFY_FOLDER_CATEGORY
};
