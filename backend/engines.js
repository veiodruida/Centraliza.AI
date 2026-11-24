'use strict';

/**
 * Gestor de motores de inferência (RF-020 … RF-026).
 *
 * Deteta automaticamente os motores instalados na máquina — Ollama, llama.cpp,
 * LM Studio e ComfyUI — por múltiplas fontes (binário no PATH, pastas comuns e
 * portas à escuta), expõe o estado de cada um (a correr/parado), arranca e
 * pára/descarrega motores, e indica a URL da UI web quando existe.
 *
 * A deteção corre em paralelo com timeouts curtos para cumprir o RNF-001
 * (≤ 2 s em hardware médio) sem bloquear a UI.
 */

const fs = require('fs');
const os = require('os');
const path = require('path');
const net = require('net');
const { spawn, exec } = require('child_process');
const { promisify } = require('util');

const execAsync = promisify(exec);

const WIN = os.platform() === 'win32';

const {
  IS_WIN,
  IS_MAC,
  pidOnPort,
  killProcess,
  killProcessByName,
  comfyPython,
  comfyLaunchScripts
} = require('./platform');

/** Candidate paths for the LM Studio CLI (`lms`). */
function lmStudioCliCandidates() {
  const home = os.homedir();
  if (IS_WIN) {
    return [
      path.join(process.env.LOCALAPPDATA || path.join(home, 'AppData', 'Local'), 'Programs', 'LM Studio', 'lms.exe'),
      path.join(process.env.LOCALAPPDATA || path.join(home, 'AppData', 'Local'), 'LM-Studio', 'lms.exe'),
      path.join(home, '.lmstudio', 'lms.exe')
    ];
  }
  return [
    path.join(home, '.lmstudio', 'bin', 'lms'),
    path.join(home, '.cache', 'lm-studio', 'bin', 'lms'),
    path.join(home, '.local', 'bin', 'lms'),
    '/usr/local/bin/lms',
    '/opt/homebrew/bin/lms'
  ];
}

/** Corre um comando com timeout e devolve stdout (string) ou null. */
async function run(cmd, timeout = 2500) {
  try {
    const { stdout } = await execAsync(cmd, { timeout, windowsHide: true, maxBuffer: 1024 * 1024 });
    return String(stdout || '');
  } catch (e) {
    return e && e.stdout ? String(e.stdout) : null;
  }
}

/** Procura um executável no PATH (where/which) e devolve o caminho ou null. */
async function which(cmd) {
  const out = await run(WIN ? `where ${cmd}` : `command -v ${cmd}`, 2000);
  if (!out) return null;
  const first = out.split(/\r?\n/).map(l => l.trim()).filter(Boolean)[0];
  return first || null;
}

/** Verifica se uma porta TCP local está à escuta. */
function portOpen(port, host = '127.0.0.1', timeout = 700) {
  return new Promise((resolve) => {
    const p = Number(port);
    if (!Number.isFinite(p) || p <= 0) return resolve(false);
    const socket = new net.Socket();
    let settled = false;
    const done = (ok) => {
      if (settled) return;
      settled = true;
      try { socket.destroy(); } catch (e) { /* ignore */ }
      resolve(ok);
    };
    socket.setTimeout(timeout);
    socket.once('connect', () => done(true));
    socket.once('timeout', () => done(false));
    socket.once('error', () => done(false));
    try { socket.connect(p, host); } catch (e) { done(false); }
  });
}

/** GET HTTP com timeout; devolve o corpo JSON ou null. */
async function httpJson(url, timeout = 1500) {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(timeout) });
    if (!res || !res.ok) return null;
    return await res.json();
  } catch (e) {
    return null;
  }
}

/**
 * @param {object} deps
 * @param {() => object} deps.getConfig Configuração atual.
 * @param {object} deps.logger Logger da app.
 * @param {object} deps.llama Helpers do motor llama.cpp gerido pela app.
 */
function createEngineManager(deps) {
  const { getConfig, logger } = deps;
  const llama = deps.llama;

  const cfg = () => getConfig() || {};

  function llamaBinaryPath() {
    try { return llama.resolveBinary(); } catch (e) { return ''; }
  }

  function llamaPort() {
    try { return llama.port(); } catch (e) { return 8080; }
  }

  function comfyPort() {
    const p = parseInt(cfg().comfyPort, 10);
    return Number.isFinite(p) && p > 0 ? p : 8188;
  }

  /** Locate a ComfyUI root from the configured folder or the scanned folders. */
  function resolveComfyDir() {
    const config = cfg();
    const candidates = [config.comfyDir, ...(Array.isArray(config.scanDirectories) ? config.scanDirectories : [])];
    for (const candidate of candidates) {
      if (!candidate) continue;
      let current = path.resolve(candidate);
      for (let i = 0; i < 4; i++) {
        if (fs.existsSync(path.join(current, 'main.py')) ||
            fs.existsSync(path.join(current, 'run_nvidia_gpu.bat')) ||
            fs.existsSync(path.join(current, 'run_nvidia_gpu.sh'))) {
          return current;
        }
        const parent = path.dirname(current);
        if (parent === current) break;
        current = parent;
      }
    }
    return config.comfyDir && fs.existsSync(config.comfyDir) ? config.comfyDir : '';
  }

  function lmStudioPort() {
    const p = parseInt(cfg().lmStudioPort, 10);
    return Number.isFinite(p) && p > 0 ? p : 1234;
  }

  function ollamaPort() {
    const p = parseInt(cfg().ollamaPort, 10);
    return Number.isFinite(p) && p > 0 ? p : 11434;
  }

  async function detectOllama() {
    const port = ollamaPort();
    const [bin, version] = await Promise.all([
      which('ollama'),
      httpJson(`http://127.0.0.1:${port}/api/version`, 1200)
    ]);
    const dataDir = path.join(os.homedir(), '.ollama', 'models');
    const installed = !!bin || fs.existsSync(dataDir);
    const running = !!(version && (version.version || version.os));
    let loadedModels = [];
    if (running) {
      const ps = await httpJson(`http://127.0.0.1:${port}/api/ps`, 1200);
      if (ps && Array.isArray(ps.models)) {
        loadedModels = ps.models.map(m => m.name || m.model).filter(Boolean);
      }
    }
    return {
      id: 'ollama',
      label: 'Ollama',
      kind: 'service',
      installed,
      running,
      port,
      uiUrl: null,
      uiHint: 'O Ollama não tem UI web nativa. Se tiver o Open WebUI a correr (porta 3000), será oferecido aqui.',
      openWebUiUrl: (await portOpen(3000)) ? 'http://localhost:3000' : null,
      executable: bin || null,
      details: {
        version: (version && version.version) || null,
        dataDir,
        loadedModels,
        loadedModel: loadedModels[0] || null
      }
    };
  }

  async function detectLlamaCpp() {
    const port = llamaPort();
    const bin = llamaBinaryPath();
    const exists = (() => {
      try { return llama.binaryExists(); } catch (e) { return null; }
    })();
    const [inPath, health] = await Promise.all([
      which('llama-server'),
      httpJson(`http://127.0.0.1:${port}/health`, 1300)
    ]);
    const installed = exists === true || !!inPath || (!!bin && /[\\/]/.test(bin) && fs.existsSync(bin));
    let managedRunning = false;
    try { managedRunning = !!llama.isRunning(); } catch (e) { managedRunning = false; }
    const running = !!(health && (health.status === 'ok' || health.status === 'loading')) || managedRunning;
    // Quando o servidor responde, /v1/models diz qual o modelo realmente servido
    // (inclui servidores externos lançados fora do Centraliza).
    let servedModels = [];
    if (running) {
      const modelsRes = await httpJson(`http://127.0.0.1:${port}/v1/models`, 1300);
      if (modelsRes && Array.isArray(modelsRes.data)) {
        servedModels = modelsRes.data.map(m => m && m.id).filter(Boolean);
      }
    }
    let managedModel = null;
    try { managedModel = llama.currentModel(); } catch (e) { managedModel = null; }
    return {
      id: 'llamacpp',
      label: 'llama.cpp',
      kind: 'server',
      installed,
      running,
      port,
      uiUrl: `http://127.0.0.1:${port}`,
      uiHint: 'O llama-server (llama.cpp) inclui uma UI web de chat na própria porta.',
      executable: bin || inPath || null,
      managed: managedRunning,
      details: {
        binary: bin || inPath || null,
        binaryExists: exists,
        model: managedModel || servedModels[0] || null,
        loadedModel: managedModel || servedModels[0] || null,
        models: servedModels,
        health: health ? health.status : null
      }
    };
  }

  async function detectLmStudio() {
    const port = lmStudioPort();
    const candidates = lmStudioCliCandidates();
    const existsOnDisk = candidates.find(p => { try { return fs.existsSync(p); } catch (e) { return false; } });
    const [bin, models] = await Promise.all([
      which('lms'),
      httpJson(`http://127.0.0.1:${port}/v1/models`, 1300)
    ]);
    const dataDir = path.join(os.homedir(), '.lmstudio');
    const installed = !!bin || !!existsOnDisk || fs.existsSync(dataDir);
    const running = !!(models && Array.isArray(models.data));
    let loadedModels = [];
    if (running) loadedModels = models.data.map(m => m.id).filter(Boolean);
    return {
      id: 'lmstudio',
      label: 'LM Studio',
      kind: 'app',
      installed,
      running,
      port,
      uiUrl: null,
      uiHint: 'O LM Studio é uma aplicação desktop — abra-a diretamente. O servidor local responde na porta indicada.',
      executable: bin || existsOnDisk || null,
      details: {
        dataDir,
        loadedModels,
        loadedModel: loadedModels[0] || null,
        serverUrl: `http://127.0.0.1:${port}/v1`
      }
    };
  }

  async function detectComfyUI() {
    const port = comfyPort();
    const comfyDir = resolveComfyDir();
    const mainPy = comfyDir ? path.join(comfyDir, 'main.py') : '';
    const hasDir = !!(comfyDir && fs.existsSync(comfyDir));
    const installed = !!(mainPy && fs.existsSync(mainPy)) || hasDir;
    const running = await portOpen(port, '127.0.0.1', 900);
    return {
      id: 'comfyui',
      label: 'ComfyUI',
      kind: 'service',
      installed,
      running,
      port,
      uiUrl: `http://127.0.0.1:${port}`,
      uiHint: 'O ComfyUI abre a interface de grafos no browser.',
      executable: mainPy && fs.existsSync(mainPy) ? mainPy : (comfyDir || null),
      details: { comfyDir, mainPy: mainPy || null }
    };
  }

  /** Deteta todos os motores em paralelo (objetivo: ≤ 2 s). */
  async function detect() {
    const started = Date.now();
    const results = await Promise.all([
      detectOllama().catch(() => null),
      detectLlamaCpp().catch(() => null),
      detectLmStudio().catch(() => null),
      detectComfyUI().catch(() => null)
    ]);
    const engines = results.filter(Boolean);
    const installed = engines.filter(e => e.installed);
    const running = engines.filter(e => e.running);
    let activeEngineId = null;
    if (running.length) {
      const llamaRunning = running.find(e => e.id === 'llamacpp' && e.managed);
      activeEngineId = (llamaRunning || running[0]).id;
    }
    return {
      engines,
      installed: installed.map(e => e.id),
      running: running.map(e => e.id),
      activeEngineId,
      anyRunning: running.length > 0,
      anyInstalled: installed.length > 0,
      durationMs: Date.now() - started,
      checkedAt: new Date().toISOString()
    };
  }

  /** Arranca um motor. */
  async function start(id, opts = {}) {
    const config = cfg();
    if (id === 'llamacpp') {
      const modelPath = opts.modelPath || config.activeRouterModel;
      if (!modelPath) {
        return { success: false, error: 'Nenhum modelo por defeito configurado. Escolha um modelo na página Centraliza Coder.' };
      }
      const result = await llama.start({ modelPath, ctx: opts.ctx, ngl: opts.ngl });
      if (!result || !result.success) return { success: false, error: (result && result.error) || 'Falha ao iniciar o llama.cpp.' };
      return { success: true, message: 'llama.cpp iniciado.', port: result.port, uiUrl: `http://127.0.0.1:${result.port || llamaPort()}` };
    }

    if (id === 'ollama') {
      const port = ollamaPort();
      if (await portOpen(port)) return { success: true, message: 'O Ollama já está a correr.', port };
      if (!(await which('ollama'))) return { success: false, error: 'Ollama não encontrado. Instale o Ollama para o utilizar.' };
      logger.info('[Engines] A iniciar Ollama (ollama serve)...');
      const child = spawn(WIN ? 'ollama.exe' : 'ollama', ['serve'], { detached: true, stdio: 'ignore', windowsHide: true });
      child.unref();
      const up = await waitFor(() => portOpen(port, '127.0.0.1', 500), 20000);
      if (!up) return { success: false, error: 'O Ollama não respondeu a tempo na porta ' + port + '.' };
      return { success: true, message: 'Ollama iniciado.', port };
    }

    if (id === 'lmstudio') {
      const port = lmStudioPort();
      if (await portOpen(port)) return { success: true, message: 'O servidor do LM Studio já está a correr.', port };
      const lms = (await which('lms')) || lmStudioCliCandidates().find(p => p && fs.existsSync(p));
      if (!lms && IS_MAC) {
        logger.info('[Engines] A abrir a aplicação LM Studio...');
        spawn('open', ['-a', 'LM Studio'], { detached: true, stdio: 'ignore' }).unref();
        const up = await waitFor(() => portOpen(port, '127.0.0.1', 500), 20000);
        if (up) return { success: true, message: 'LM Studio iniciado.', port };
        return { success: false, error: 'LM Studio não respondeu. Abra a aplicação e ative o servidor local.' };
      }
      if (!lms) return { success: false, error: 'LM Studio CLI (lms) não encontrado. Instale o LM Studio e ative o CLI nas definições.' };
      logger.info('[Engines] A iniciar servidor do LM Studio...');
      spawn(lms, ['server', 'start'], { detached: true, stdio: 'ignore', windowsHide: true }).unref();
      const up = await waitFor(() => portOpen(port, '127.0.0.1', 500), 20000);
      if (!up) return { success: false, error: 'O servidor do LM Studio não respondeu a tempo.' };
      return { success: true, message: 'Servidor do LM Studio iniciado.', port };
    }

    if (id === 'comfyui') {
      const port = comfyPort();
      if (await portOpen(port)) return { success: true, message: 'O ComfyUI já está a correr.', port };
      const dir = resolveComfyDir();
      if (!dir || !fs.existsSync(dir)) return { success: false, error: 'Pasta do ComfyUI não configurada. Defina-a nas Configurações.' };
      const scripts = comfyLaunchScripts(dir);
      logger.info(`[Engines] A iniciar ComfyUI em ${dir}...`);
      if (scripts.length) {
        if (IS_WIN) {
          spawn('cmd.exe', ['/c', 'start', '""', '/D', dir, scripts[0]], { detached: true, stdio: 'ignore', windowsHide: true }).unref();
        } else {
          spawn('bash', [scripts[0]], { cwd: dir, detached: true, stdio: 'ignore' }).unref();
        }
      } else {
        const python = comfyPython(dir);
        spawn(python, ['main.py'], { cwd: dir, detached: true, stdio: 'ignore', windowsHide: true }).unref();
      }
      const up = await waitFor(() => portOpen(port, '127.0.0.1', 600), 60000);
      if (!up) return { success: false, error: 'O ComfyUI não respondeu a tempo. Verifique a instalação e as dependências Python.' };
      return { success: true, message: 'ComfyUI iniciado.', port };
    }

    return { success: false, error: `Motor desconhecido: ${id}` };
  }

  function waitFor(fn, timeoutMs = 10000, interval = 400) {
    return new Promise((resolve) => {
      const started = Date.now();
      const tick = async () => {
        const ok = await Promise.resolve(fn()).catch(() => false);
        if (ok) return resolve(true);
        if (Date.now() - started >= timeoutMs) return resolve(false);
        setTimeout(tick, interval);
      };
      tick();
    });
  }

  /** Descarrega os modelos de um motor Ollama (keep_alive = 0). */
  async function unloadOllamaModels() {
    const port = ollamaPort();
    const ps = await httpJson(`http://127.0.0.1:${port}/api/ps`, 1500);
    const models = (ps && Array.isArray(ps.models)) ? ps.models.map(m => m.name || m.model).filter(Boolean) : [];
    const unloaded = [];
    for (const model of models) {
      try {
        const res = await fetch(`http://127.0.0.1:${port}/api/generate`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ model, keep_alive: 0, prompt: '', stream: false }),
          signal: AbortSignal.timeout(10000)
        });
        if (res.ok) unloaded.push(model);
      } catch (e) { /* continua com os restantes */ }
    }
    return unloaded;
  }

  /** Para um motor: primeiro unload gracioso, depois termina os processos. */
  async function stop(id, opts = {}) {
    const unloadOnly = !!opts.unloadOnly;
    const report = { id, unloaded: [], killed: [], errors: [], unloadOnly };

    if (id === 'ollama') {
      report.unloaded = await unloadOllamaModels();
      if (!unloadOnly) {
        if (IS_WIN) {
          for (const image of ['ollama app.exe', 'ollama.exe']) {
            try {
              await execAsync(`taskkill /F /IM "${image}"`, { windowsHide: true, timeout: 5000 });
              report.killed.push(image);
            } catch (e) { /* não estava a correr */ }
          }
        } else {
          const pid = await pidOnPort(ollamaPort());
          if (pid) {
            killProcess(pid);
            report.killed.push(`PID ${pid}`);
          } else {
            killProcessByName('ollama');
            report.killed.push('ollama');
          }
        }
      }
      await new Promise(r => setTimeout(r, 800));
      report.running = await portOpen(ollamaPort(), '127.0.0.1', 600);
      return report;
    }

    if (id === 'llamacpp') {
      try { await llama.stop(); report.killed.push('llama-server'); } catch (e) { report.errors.push(String(e && e.message || e)); }
      report.running = await portOpen(llamaPort(), '127.0.0.1', 600);
      return report;
    }

    if (id === 'lmstudio') {
      const lms = (await which('lms')) || lmStudioCliCandidates().find(p => p && fs.existsSync(p));
      if (!lms) {
        const pid = await pidOnPort(lmStudioPort());
        if (pid && !unloadOnly) {
          killProcess(pid);
          report.killed.push(`PID ${pid}`);
        } else {
          report.errors.push('LM Studio CLI (lms) não encontrado.');
        }
        report.running = await portOpen(lmStudioPort(), '127.0.0.1', 600);
        return report;
      }
      await run(`"${lms}" unload --all`, 15000);
      if (!unloadOnly) {
        await run(`"${lms}" server stop`, 15000);
        report.killed.push('lms server');
      }
      report.running = await portOpen(lmStudioPort(), '127.0.0.1', 600);
      return report;
    }

    if (id === 'comfyui') {
      const port = comfyPort();
      const pid = await pidOnPort(port);
      if (!pid) {
        report.errors.push('Não foi encontrado nenhum processo do ComfyUI à escuta na porta ' + port + '.');
        report.running = false;
        return report;
      }
      if (unloadOnly) {
        report.errors.push('O ComfyUI não suporta unload de modelos sem terminar o processo.');
        report.running = true;
        return report;
      }
      killProcess(pid);
      report.killed.push(`PID ${pid}`);
      await new Promise(r => setTimeout(r, 800));
      report.running = await portOpen(port, '127.0.0.1', 600);
      return report;
    }

    report.errors.push(`Motor desconhecido: ${id}`);
    report.running = false;
    return report;
  }

  /** Para todos os motores detetados a correr (botão global "Parar motores"). */
  async function stopAll(opts = {}) {
    const det = await detect();
    const targets = det.engines.filter(e => e.running).map(e => e.id);
    const reports = [];
    for (const id of targets) {
      try { reports.push(await stop(id, opts)); } catch (e) { reports.push({ id, errors: [String(e && e.message || e)], running: true }); }
    }
    const after = await detect();
    return {
      success: reports.every(r => !r.running),
      stopped: reports.map(r => r.id),
      reports,
      engines: after.engines,
      running: after.running
    };
  }

  return { detect, start, stop, stopAll, portOpen, httpJson, which, unloadOllamaModels };
}

module.exports = { createEngineManager, portOpen, httpJson, which, run };
