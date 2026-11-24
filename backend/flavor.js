'use strict';

/**
 * Etiquetagem automática de modelos "Abliterated" e "Uncensored" (RF-002/RF-003).
 *
 * A classificação é feita a partir do nome do repositório/modelo, das tags do
 * HuggingFace, da descrição e do caso de uso. Cobre os padrões que a comunidade
 * de modelos locais usa nos nomes (ex.: "mlabonne/...-abliterated",
 * "...-uncensored-GGUF", "refusal-free") sem precisar de intervenção manual.
 */

// Abliterated: modelos com a direção de recusa removida por abliteração.
const ABLITERATED_PATTERNS = [
  /abliterat/i,                     // abliterated, abliteration, abliterate
  /(^|[^a-z])abli([^a-z]|$)/i,      // sufixo curto "abli"
  /refusal[\s_-]*free/i,            // refusal-free / refusal_free
  /(^|[^a-z])no[\s_-]*refusal/i,    // no-refusal
  /uncensor(ed)?[\s_-]*abliterat/i  // combinações explícitas
];

// Uncensored: modelos sem filtro de conteúdo (não necessariamente abliterados).
const UNCENSORED_PATTERNS = [
  /uncensor/i,                      // uncensored, uncensor, uncensorship
  /decensor/i,                      // decensored
  /unfiltered/i,                    // unfiltered
  /amoral/i,                        // amoral
  /(^|[^a-z])nsfw([^a-z]|$)/i       // tag/termo nsfw isolado
];

function matchesAny(text, patterns) {
  for (const re of patterns) if (re.test(text)) return true;
  return false;
}

/**
 * Classifica um modelo.
 * @param {string|object} input Nome do modelo ou objeto com name/id/repo/tags/description.
 * @returns {{abliterated: boolean, uncensored: boolean, flavors: string[]}}
 */
function classifyFlavor(input) {
  const parts = [];
  if (typeof input === 'string') {
    parts.push(input);
  } else if (input && typeof input === 'object') {
    const { name, id, repo, description, use_case, quantization } = input;
    for (const v of [name, id, repo, description, use_case, quantization]) {
      if (typeof v === 'string' && v) parts.push(v);
    }
    const tags = Array.isArray(input.hf_tags) ? input.hf_tags
      : (Array.isArray(input.tags) ? input.tags : []);
    for (const t of tags) {
      if (typeof t === 'string') parts.push(t);
      else if (t && typeof t === 'object' && typeof t.value === 'string') parts.push(t.value);
    }
    if (Array.isArray(input.gguf_sources)) {
      for (const s of input.gguf_sources) {
        if (s && typeof s.repo === 'string') parts.push(s.repo);
      }
    }
  }

  const haystack = parts.join('\n');
  const abliterated = matchesAny(haystack, ABLITERATED_PATTERNS);
  const uncensored = matchesAny(haystack, UNCENSORED_PATTERNS);
  const flavors = [];
  if (abliterated) flavors.push('abliterated');
  if (uncensored) flavors.push('uncensored');
  return { abliterated, uncensored, flavors };
}

/**
 * Aplica as etiquetas de "flavor" a uma entrada de modelo (mutação + devolve o
 * próprio objeto, para poder ser usado em map()).
 */
function tagModel(m) {
  if (!m || typeof m !== 'object') return m;
  const repo = m.repo
    || m.id
    || (Array.isArray(m.gguf_sources) && m.gguf_sources[0] && m.gguf_sources[0].repo)
    || m.ollamaTag
    || null;
  const c = classifyFlavor({
    name: m.name,
    id: m.id,
    repo,
    description: m.description,
    use_case: m.use_case,
    hf_tags: m.hf_tags,
    tags: m.hf_tags || m.tags
  });
  m.is_abliterated = c.abliterated;
  m.is_uncensored = c.uncensored;
  m.flavors = c.flavors;
  return m;
}

module.exports = { classifyFlavor, tagModel, ABLITERATED_PATTERNS, UNCENSORED_PATTERNS };
