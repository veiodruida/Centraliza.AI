'use strict';

/**
 * Integrações com editores (RF-040 … RF-045).
 *
 * Continue.dev e Roo Code apontam ambos para o gateway OpenAI-compatible do
 * Centraliza Coder (http://localhost:<porta>/v1, apiKey "centraliza-local",
 * modelo "centraliza-router"). A configuração é escrita automaticamente, com
 * backup do ficheiro/BD original, e só é permitida quando o motor e o modelo
 * local estão a correr (RF-042).
 */

const fs = require('fs');
const os = require('os');
const path = require('path');
const { exec, spawn } = require('child_process');
const { promisify } = require('util');

const execAsync = promisify(exec);

const API_KEY = 'centraliza-local';
const MODEL_ID = 'centraliza-router';
const MODEL_TITLE = 'Centraliza.ai Gateway';
const AUTOCOMPLETE_TITLE = 'Centraliza.ai Autocomplete';
const WIN = os.platform() === 'win32';

function ts() {
  return new Date().toISOString().replace(/[:.]/g, '-');
}

function safeExists(p) {
  try { return fs.existsSync(p); } catch (e) { return false; }
}

function backupFile(file) {
  if (!safeExists(file)) return null;
  const dest = `${file}.centraliza-backup-${ts()}`;
  try {
    fs.copyFileSync(file, dest);
    return dest;
  } catch (e) {
    return null;
  }
}

/** Provedor no formato que o Continue.dev entende (JSON e YAML). */
function continueModel(baseUrl) {
  return {
    title: MODEL_TITLE,
    provider: 'openai',
    model: MODEL_ID,
    apiBase: baseUrl,
    apiKey: API_KEY
  };
}

function continueAutocomplete(baseUrl) {
  return {
    title: AUTOCOMPLETE_TITLE,
    provider: 'openai',
    model: MODEL_ID,
    apiBase: baseUrl,
    apiKey: API_KEY
  };
}

function createExtensions(deps) {
  const { getConfig, logger, engines, getServerPort, llama } = deps;

  const baseUrl = () => `http://localhost:${getServerPort ? getServerPort() : 4000}/v1`;

  /**
   * Estado dos pré-requisitos das integrações: motor a correr + modelo carregado
   * + gateway pronto. Devolve também a lista de bloqueios legíveis.
   */
  async function status() {
    const det = await engines.detect();
    const runningEngines = det.engines.filter(e => e.running);
    const hasModel = (e) => !!(e && e.details && e.details.loadedModel);

    // Motor que o gateway consegue servir: o que tiver um modelo realmente
    // carregado (llama.cpp tem prioridade, seguido de Ollama e LM Studio).
    const llamaEngine = runningEngines.find(e => e.id === 'llamacpp' && hasModel(e)) || null;
    const ollamaEngine = runningEngines.find(e => e.id === 'ollama' && hasModel(e)) || null;
    const lmEngine = runningEngines.find(e => e.id === 'lmstudio' && hasModel(e)) || null;
    const chatEngine = llamaEngine || ollamaEngine || lmEngine || null;

    const engineRunning = runningEngines.length > 0;
    const modelLoaded = hasModel(chatEngine);
    const config = getConfig() || {};
    const activeModel = (chatEngine && chatEngine.details && chatEngine.details.loadedModel)
      || config.activeRouterModel
      || null;
    const routerConfigured = !!activeModel;

    // O gateway só está pronto quando existe motor, modelo carregado e modelo
    // ativo resolvível (RF-042: integrações dependem da inicialização).
    const gatewayReady = engineRunning && modelLoaded && routerConfigured;

    const blockers = [];
    if (!engineRunning) {
      blockers.push({
        code: 'engine-offline',
        message: 'Nenhum motor de inferência está a correr.',
        action: 'start-engine'
      });
    }
    if (engineRunning && !modelLoaded) {
      blockers.push({
        code: 'model-not-loaded',
        message: 'O motor está a correr mas nenhum modelo está carregado.',
        action: 'start-engine'
      });
    }
    if (engineRunning && modelLoaded && !routerConfigured) {
      blockers.push({
        code: 'router-model-missing',
        message: 'Nenhum modelo ativo definido para o gateway (centraliza-router).',
        action: 'select-model'
      });
    }

    let gatewayOk = false;
    try {
      const res = await fetch(`http://127.0.0.1:${getServerPort ? getServerPort() : 4000}/v1/models`, { signal: AbortSignal.timeout(1500) });
      gatewayOk = !!(res && res.ok);
    } catch (e) { gatewayOk = false; }
    if (!gatewayOk) {
      blockers.push({
        code: 'gateway-down',
        message: 'O gateway OpenAI do Centraliza não respondeu na porta da aplicação.',
        action: 'retry'
      });
    }

    return {
      ready: gatewayReady && gatewayOk,
      engineRunning,
      modelLoaded,
      gatewayReady,
      gatewayOk,
      activeModel,
      engineId: chatEngine ? chatEngine.id : null,
      engineLabel: chatEngine ? chatEngine.label : null,
      baseUrl: baseUrl(),
      apiKey: API_KEY,
      modelId: MODEL_ID,
      port: getServerPort ? getServerPort() : 4000,
      blockers,
      engines: det.engines,
      // Resumo do estado de cada integração (usado pelo Centraliza Coder).
      integrations: {
        continue: continueConfigState(),
        roo: rooConfigState()
      },
      checkedAt: new Date().toISOString()
    };
  }

  // --- Estado (read-only) das integrações ---------------------------------
  // Permite que outras páginas (ex.: Centraliza Coder) mostrem um resumo do
  // estado sem duplicar lógica de escrita.

  /** Indica se o Continue.dev já tem o provedor do Centraliza configurado. */
  function continueConfigState() {
    const p = continuePaths();
    const files = [p.yaml, p.yml, p.json].filter(safeExists);
    const target = files[0] || null;
    if (!target) {
      return { installed: safeExists(p.dir), configured: false, path: p.json, format: 'json' };
    }
    let configured = false;
    try {
      const content = fs.readFileSync(target, 'utf8');
      configured = content.includes(MODEL_ID) && content.includes(API_KEY);
    } catch (e) {
      configured = null; // não foi possível ler
    }
    return {
      installed: true,
      configured,
      path: target,
      format: String(target).toLowerCase().endsWith('.json') ? 'json' : 'yaml'
    };
  }

  /** Indica se o Roo Code está instalado e já tem o provedor configurado. */
  function rooConfigState() {
    const dirs = rooStorageDirs();
    if (!dirs.length) return { installed: false, configured: false, product: null };
    let DatabaseSync;
    try {
      ({ DatabaseSync } = require('node:sqlite'));
    } catch (e) {
      return { installed: true, configured: null, product: dirs[0].product };
    }
    let unknown = false;
    for (const dir of dirs) {
      // Ficheiro de apoio criado quando a BD estava bloqueada.
      if (safeExists(path.join(dir.dir, 'settings', 'centraliza-provider.json'))) {
        return { installed: true, configured: true, product: dir.product, source: 'file' };
      }
      if (!safeExists(dir.db)) continue;
      let db;
      try {
        db = new DatabaseSync(dir.db, { readOnly: true });
        const rows = db.prepare("SELECT key, value FROM ItemTable WHERE key LIKE '%roo%' OR key LIKE '%cline%'").all();
        const configured = rows.some(r => {
          const v = String(r.value || '');
          return v.includes(API_KEY) && v.includes(MODEL_ID);
        });
        db.close();
        if (configured) return { installed: true, configured: true, product: dir.product, source: 'db' };
      } catch (e) {
        unknown = true;
        try { db && db.close(); } catch (_) { /* ignore */ }
      }
    }
    return { installed: true, configured: unknown ? null : false, product: dirs[0].product };
  }

  // --- Continue.dev ---------------------------------------------------------

  function continuePaths() {
    const dir = path.join(os.homedir(), '.continue');
    return {
      dir,
      yaml: path.join(dir, 'config.yaml'),
      yml: path.join(dir, 'config.yml'),
      json: path.join(dir, 'config.json')
    };
  }

  /**
   * Remove um bloco YAML cuja linha inicial corresponde a `matchLine` (e todas
   * as linhas seguintes mais indentadas). Nunca remove entradas irmãs da lista.
   */
  function stripYamlBlock(lines, matchLine) {
    const out = [];
    let skipping = false;
    let skipIndent = 0;
    for (const line of lines) {
      const indent = (line.match(/^[ \t]*/) || [''])[0].length;
      if (!skipping) {
        if (matchLine.test(line)) {
          skipping = true;
          skipIndent = indent;
          continue;
        }
        out.push(line);
        continue;
      }
      if (line.trim() === '') continue;          // linhas em branco dentro do bloco
      if (indent > skipIndent) continue;          // continuação do bloco removido
      skipping = false;
      out.push(line);                             // irmão: mantém-se
    }
    return out;
  }

  /** Insere/atualiza o bloco do Centraliza num config.yaml existente. */
  function writeContinueYaml(file, url) {
    const original = fs.readFileSync(file, 'utf8');
    let lines = original.split(/\r?\n/);
    lines = stripYamlBlock(lines, /^[ \t]*- name:\s*["']?Centraliza\.ai Gateway["']?\s*$/);
    lines = stripYamlBlock(lines, /^[ \t]*tabAutocompleteModel:\s*$/);
    let content = lines.join('\n').replace(/\s+$/, '') + '\n';

    const modelBlock = [
      '  - name: ' + MODEL_TITLE,
      '    provider: openai',
      '    model: ' + MODEL_ID,
      '    apiBase: ' + url,
      '    apiKey: ' + API_KEY
    ].join('\n');

    const modelsKey = /^([ \t]*)models:[ \t]*(#.*)?$/m;
    const modelsInline = /^([ \t]*)models:[ \t]*\[[^\]]*\][ \t]*$/m;
    if (modelsKey.test(content)) {
      content = content.replace(modelsKey, (m, ind) => `${ind}models:\n${modelBlock}`);
    } else if (modelsInline.test(content)) {
      content = content.replace(modelsInline, (m, ind) => `${ind}models:\n${modelBlock}`);
    } else {
      content = content.trimEnd() + `\n\nmodels:\n${modelBlock}\n`;
    }

    // Autocomplete do separador (Tab) aponta para o mesmo gateway.
    const tabBlock = [
      'tabAutocompleteModel:',
      '  name: ' + AUTOCOMPLETE_TITLE,
      '  provider: openai',
      '  model: ' + MODEL_ID,
      '  apiBase: ' + url,
      '  apiKey: ' + API_KEY
    ].join('\n');
    content = content.trimEnd() + `\n\n${tabBlock}\n`;

    if (/\t/.test(content)) {
      throw new Error('O ficheiro YAML do Continue contém tabulações — corrija-o antes de integrar (YAML não permite tabs).');
    }
    fs.writeFileSync(file, content, 'utf8');
    return { format: 'yaml', path: file, verified: content.includes(url) && content.includes(MODEL_ID) };
  }

  function writeContinueJson(file, url) {
    let config = {};
    if (safeExists(file)) {
      const raw = fs.readFileSync(file, 'utf8').trim();
      if (raw) {
        try { config = JSON.parse(raw); } catch (e) {
          throw new Error('O config.json do Continue não é JSON válido. Corrija-o ou remova-o antes de integrar.');
        }
      }
    }
    if (!config || typeof config !== 'object') config = {};
    if (!Array.isArray(config.models)) config.models = [];
    config.models = config.models.filter(m => !m || (m.title !== MODEL_TITLE && m.name !== MODEL_TITLE));
    config.models.push(continueModel(url));
    config.tabAutocompleteModel = continueAutocomplete(url);
    const serialized = JSON.stringify(config, null, 2);
    JSON.parse(serialized); // valida antes de escrever
    fs.writeFileSync(file, serialized, 'utf8');
    return { format: 'json', path: file, verified: serialized.includes(url) && serialized.includes(MODEL_ID) };
  }

  async function setupContinue() {
    const st = await status();
    if (!st.ready) {
      return { success: false, blocked: true, error: 'O motor e o modelo local têm de estar a correr antes de integrar.', blockers: st.blockers, status: st };
    }
    const p = continuePaths();
    try {
      fs.mkdirSync(p.dir, { recursive: true });
      const url = st.baseUrl;
      // Escolhe o alvo antes de escrever, para poder guardar o backup do ficheiro
      // original (RF-042 exige não destruir a configuração do utilizador).
      let targetPath;
      let isYaml;
      if (safeExists(p.yaml)) { targetPath = p.yaml; isYaml = true; }
      else if (safeExists(p.yml)) { targetPath = p.yml; isYaml = true; }
      else { targetPath = p.json; isYaml = false; }
      const backup = backupFile(targetPath);
      const target = isYaml ? writeContinueYaml(targetPath, url) : writeContinueJson(targetPath, url);
      logger.info(`[Extensions] Continue.dev configurado (${target.format}) em ${target.path}`);
      return {
        success: true,
        message: 'Continue.dev configurado automaticamente. Abra o VS Code para usar o modelo local.',
        configPath: target.path,
        format: target.format,
        verified: target.verified,
        backup,
        settings: { apiBase: url, apiKey: API_KEY, model: MODEL_ID },
        installUri: 'vscode:extension/Continue.continue'
      };
    } catch (err) {
      logger.error('[Extensions] Falha ao configurar Continue.dev', err);
      return { success: false, error: err.message || String(err) };
    }
  }

  // --- Roo Code -------------------------------------------------------------

  /** Pastas de dados do VS Code (e variantes) onde vive a globalStorage. */
  function vscodeRoots() {
    const appData = process.env.APPDATA || path.join(os.homedir(), 'AppData', 'Roaming');
    const candidates = ['Code', 'Code - Insiders', 'VSCodium', 'Cursor', 'Windsurf'];
    const roots = [];
    for (const name of candidates) {
      const userDir = path.join(appData, name, 'User');
      if (safeExists(userDir)) {
        roots.push({
          product: name,
          userDir,
          globalStorage: path.join(userDir, 'globalStorage'),
          db: path.join(userDir, 'globalStorage', 'state.vscdb')
        });
      }
    }
    return roots;
  }

  function rooStorageDirs() {
    const dirs = [];
    for (const root of vscodeRoots()) {
      if (!safeExists(root.globalStorage)) continue;
      let entries = [];
      try { entries = fs.readdirSync(root.globalStorage, { withFileTypes: true }); } catch (e) { entries = []; }
      for (const entry of entries) {
        if (!entry.isDirectory()) continue;
        const name = entry.name.toLowerCase();
        if (!name.includes('roo') && !name.includes('cline')) continue;
        dirs.push({ product: root.product, dir: path.join(root.globalStorage, entry.name), db: root.db, extensionId: entry.name });
      }
    }
    return dirs;
  }

  const ROO_API_CONFIG = (url) => ({
    apiProvider: 'openai',
    openAiBaseUrl: url,
    openAiApiKey: API_KEY,
    openAiModelId: MODEL_ID,
    openAiUseAzure: false,
    openAiHeaders: {},
    apiModelId: MODEL_ID,
    openAiCustomModelInfo: {
      maxTokens: 8192,
      contextWindow: 131072,
      supportsImages: false,
      supportsPromptCache: false
    }
  });

  /**
   * Escreve a configuração do provedor diretamente na globalStorage do Roo Code.
   * O VS Code guarda o estado da extensão em `state.vscdb` (SQLite, tabela
   * ItemTable). Estratégia: backup -> leitura -> merge do apiConfiguration ->
   * gravação -> verificação. Se a BD estiver bloqueada (VS Code aberto) a
   * operação é recusada com instruções claras, em vez de corromper o estado.
   */
  function writeRooStateDb(dbPath, url, extensionDirName) {
    let DatabaseSync;
    try {
      ({ DatabaseSync } = require('node:sqlite'));
    } catch (e) {
      return { ok: false, reason: 'node:sqlite indisponível neste Node.js', fatal: false };
    }

    const backup = backupFile(dbPath);
    let db;
    try {
      db = new DatabaseSync(dbPath, { readOnly: false });
    } catch (e) {
      return { ok: false, reason: `Não foi possível abrir a base de dados do VS Code (${e.message}). Feche o VS Code e tente novamente.`, fatal: true, backup };
    }

    try {
      const rows = db.prepare('SELECT key, value FROM ItemTable').all();
      const candidates = rows.filter(r => {
        const k = String(r.key || '').toLowerCase();
        return k.includes('roo') || k.includes('cline') || k === `extensions.${extensionDirName}`;
      });
      if (candidates.length === 0) {
        db.close();
        return { ok: false, reason: 'A extensão Roo Code ainda não gravou estado no VS Code (abra-a uma vez e feche o VS Code).', fatal: false, backup };
      }

      let updated = 0;
      const stmt = db.prepare('UPDATE ItemTable SET value = ? WHERE key = ?');
      for (const row of candidates) {
        let state;
        try { state = JSON.parse(String(row.value)); } catch (e) { continue; }
        if (!state || typeof state !== 'object') continue;

        const rooConfig = ROO_API_CONFIG(url);
        state.apiConfiguration = { ...(state.apiConfiguration || {}), ...rooConfig };
        // Versões recentes guardam perfis de provedor nomeados.
        if (state.providerProfiles && typeof state.providerProfiles === 'object') {
          const profiles = state.providerProfiles.apiConfigs && typeof state.providerProfiles.apiConfigs === 'object'
            ? state.providerProfiles.apiConfigs
            : null;
          if (profiles) {
            const existingName = state.providerProfiles.currentApiConfigName;
            const targetName = existingName && profiles[existingName] ? existingName : 'Centraliza.ai';
            profiles[targetName] = { ...(profiles[targetName] || {}), ...rooConfig, id: profiles[targetName]?.id || targetName, name: targetName };
            state.providerProfiles.currentApiConfigName = targetName;
          }
        }
        stmt.run(JSON.stringify(state), row.key);
        updated += 1;
      }
      db.close();
      if (updated === 0) {
        return { ok: false, reason: 'O estado do Roo Code não pôde ser interpretado (formato desconhecido).', fatal: false, backup };
      }
      return { ok: true, updated, backup, db: dbPath };
    } catch (e) {
      try { db.close(); } catch (_) {}
      return { ok: false, reason: `Falha ao escrever na base de dados do VS Code: ${e.message}`, fatal: false, backup };
    }
  }

  /** Fallback: escreve um ficheiro de importação + diagnóstico legível. */
  function writeRooFallbackFile(rooDir, url, reason) {
    const settingsDir = path.join(rooDir.dir, 'settings');
    fs.mkdirSync(settingsDir, { recursive: true });
    const file = path.join(settingsDir, 'centraliza-provider.json');
    const payload = {
      _generatedBy: 'Centraliza.ai',
      _generatedAt: new Date().toISOString(),
      _note: 'Importe este provedor no Roo Code (Settings → Providers → OpenAI Compatible) ou use os valores abaixo.',
      _fallbackReason: reason || null,
      apiProvider: 'openai',
      baseUrl: url,
      apiKey: API_KEY,
      modelId: MODEL_ID
    };
    fs.writeFileSync(file, JSON.stringify(payload, null, 2), 'utf8');
    return file;
  }

  async function setupRoo() {
    const st = await status();
    if (!st.ready) {
      return { success: false, blocked: true, error: 'O motor e o modelo local têm de estar a correr antes de integrar.', blockers: st.blockers, status: st };
    }
    const url = st.baseUrl;
    const dirs = rooStorageDirs();
    const diagnostics = [];

    if (dirs.length === 0) {
      return {
        success: false,
        error: 'Roo Code não foi encontrado no VS Code. Instale a extensão e volte a tentar.',
        installUri: 'vscode:extension/RooVeterinaryInc.roo-cline',
        settings: { apiBase: url, apiKey: API_KEY, model: MODEL_ID },
        diagnostics: [{
          code: 'roo-not-installed',
          message: 'Nenhuma pasta de globalStorage do Roo Code foi encontrada.',
          hint: 'Instale a extensão Roo Code no VS Code (ou Cursor) e abra-a uma vez.'
        }]
      };
    }

    for (const dir of dirs) {
      const dbResult = safeExists(dir.db)
        ? writeRooStateDb(dir.db, url, dir.extensionId)
        : { ok: false, reason: 'state.vscdb não encontrado.', fatal: false };
      if (dbResult.ok) {
        diagnostics.push({ code: 'ok', product: dir.product, message: `Configuração escrita na storage do Roo Code (${dir.product}).`, db: dbResult.db, backup: dbResult.backup });
        logger.info(`[Extensions] Roo Code configurado em ${dir.db} (${dir.product}).`);
        return {
          success: true,
          message: `Roo Code configurado automaticamente (${dir.product}). Abra o VS Code e o provedor local estará ativo.`,
          product: dir.product,
          db: dbResult.db,
          backup: dbResult.backup,
          settings: { apiBase: url, apiKey: API_KEY, model: MODEL_ID },
          diagnostics
        };
      }
      const file = writeRooFallbackFile(dir, url, dbResult.reason);
      diagnostics.push({
        code: dbResult.fatal ? 'db-locked' : 'fallback-file',
        product: dir.product,
        message: dbResult.reason,
        hint: dbResult.fatal
          ? 'Feche o VS Code e clique novamente para escrita automática na storage.'
          : 'Foi escrito um ficheiro de apoio com os valores exatos.',
        file
      });
      logger.warn(`[Extensions] Roo Code: fallback para ficheiro (${dir.product}) — ${dbResult.reason}`);
    }

    return {
      success: false,
      partial: true,
      error: 'A configuração do Roo Code não pôde ser escrita automaticamente. Veja o diagnóstico.',
      settings: { apiBase: url, apiKey: API_KEY, model: MODEL_ID },
      diagnostics
    };
  }

  // --- Teste de fumo e abertura do VS Code --------------------------------

  async function smokeTest(prompt = 'Responde apenas: OK') {
    const st = await status();
    if (!st.engineRunning) {
      return { success: false, error: 'O motor local não está a correr.', blockers: st.blockers };
    }
    const started = Date.now();
    try {
      const res = await fetch(`${st.baseUrl}/chat/completions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: MODEL_ID,
          messages: [{ role: 'user', content: prompt }],
          max_tokens: 32,
          temperature: 0,
          stream: false
        }),
        signal: AbortSignal.timeout(30000)
      });
      const latencyMs = Date.now() - started;
      const raw = await res.text();
      let data = null;
      try { data = JSON.parse(raw); } catch (e) { data = null; }
      if (!res.ok) {
        const msg = (data && data.error && (data.error.message || data.error)) || raw.slice(0, 300);
        return { success: false, status: res.status, error: String(msg), latencyMs };
      }
      const text = (data && data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content) || '';
      return { success: !!String(text).trim(), text: String(text).trim(), latencyMs, status: res.status };
    } catch (e) {
      return { success: false, error: e.name === 'TimeoutError' ? 'O modelo não respondeu em 30 s.' : String(e.message || e), latencyMs: Date.now() - started };
    }
  }

  async function openVSCode() {
    const candidates = ['code', 'code-insiders', 'cursor', 'codium'];
    for (const cmd of candidates) {
      try {
        await execAsync(WIN ? `where ${cmd}` : `command -v ${cmd}`, { timeout: 2000, windowsHide: true });
      } catch (e) { continue; }
      try {
        const child = spawn(WIN ? `${cmd}.cmd` : cmd, ['--reuse-window', '.'], { detached: true, stdio: 'ignore', windowsHide: true, shell: WIN });
        child.unref();
        logger.info(`[Extensions] VS Code aberto com "${cmd}".`);
        return { success: true, opened: true, executable: cmd };
      } catch (e) { /* tenta o próximo */ }
    }
    return { success: false, opened: false, error: 'Não foi encontrado o comando do VS Code (code/cursor) no PATH.' };
  }

  return { status, setupContinue, setupRoo, smokeTest, openVSCode, vscodeRoots, rooStorageDirs, API_KEY, MODEL_ID };
}

module.exports = { createExtensions, API_KEY, MODEL_ID };
