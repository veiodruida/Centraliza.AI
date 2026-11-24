const express = require('express');
const fs = require('fs');
const path = require('path');
const os = require('os');
const http = require('http');
const { Server } = require('socket.io');
const { promisify } = require('util');
const { exec, spawn } = require('child_process');
const checkDiskSpace = require('check-disk-space').default;

// --- MÓDULOS v0.5.0 (hub, armazenamento, motores, extensões, atualizações) ---
const { tagModel } = require('./backend/flavor');
const { summarizeModels } = require('./backend/storage');
const { createEngineManager } = require('./backend/engines');
const { createExtensions } = require('./backend/extensions');
const { createUpdater } = require('./backend/updater');

// --- LOGGING SYSTEM ---
const LOG_FILE = path.join(__dirname, 'server.log');
const logClients = new Set();
// Referência ao Socket.io criado mais abaixo (usada pelo sistema de logs antes
// de o servidor HTTP existir).
let ioRef = null;
// Buffer circular dos últimos logs — permite ao painel do Test & Chat mostrar
// o histórico imediatamente ao abrir a página (RF-024).
const LOG_RING = [];
const LOG_RING_MAX = 400;

const DEBUG_PAYLOAD_FILE = path.join(__dirname, 'debug_payload.log');
const logDebugPayload = (label, data) => {
    try {
        const entry = `\n[${new Date().toISOString()}] === ${label} ===\n${typeof data === 'string' ? data : JSON.stringify(data, null, 2)}\n`;
        fs.appendFileSync(DEBUG_PAYLOAD_FILE, entry);
    } catch(e) {}
};

const broadcastLog = (level, msg) => {
    const time = new Date().toISOString();
    const text = typeof msg === 'string' ? msg : String(msg);
    LOG_RING.push({ level, msg: text, time });
    if (LOG_RING.length > LOG_RING_MAX) LOG_RING.splice(0, LOG_RING.length - LOG_RING_MAX);
    const logEntry = JSON.stringify({ level, msg: text, time });
    logClients.forEach(client => {
        if (!client.writableEnded) client.write(`data: ${logEntry}\n\n`);
    });
    // Streaming em tempo real para o painel de logs (RF-024).
    if (ioRef) {
        try { ioRef.emit('server-log', { level, msg: text, time }); } catch (e) {}
    }
};

const logger = {
    info: (msg) => {
        const entry = `[${new Date().toISOString()}] [INFO] ${msg}`;
        console.log(entry);
        fs.appendFileSync(LOG_FILE, entry + '\n');
        broadcastLog('INFO', msg);
    },
    error: (msg, err) => {
        const entry = `[${new Date().toISOString()}] [ERROR] ${msg} ${err ? (err.message || err) : ''}`;
        console.error(entry);
        fs.appendFileSync(LOG_FILE, entry + '\n');
        broadcastLog('ERROR', `${msg} ${err ? (err.message || err) : ''}`);
    },
    warn: (msg) => {
        const entry = `[${new Date().toISOString()}] [WARN] ${msg}`;
        console.warn(entry);
        fs.appendFileSync(LOG_FILE, entry + '\n');
        broadcastLog('WARN', msg);
    }
};

process.on('uncaughtException', (err) => {
    logger.error('UNCAUGHT EXCEPTION:', err);
});

process.on('unhandledRejection', (reason, promise) => {
    logger.error('UNHANDLED REJECTION:', reason);
});

// --- CACHING SYSTEM ---
const cache = {
    store: new Map(),
    get: (key) => {
        const item = cache.store.get(key);
        if (!item) return null;
        if (Date.now() > item.expiry) {
            cache.store.delete(key);
            return null;
        }
        return item.data;
    },
    set: (key, data, ttlMs = 10000) => {
        cache.store.set(key, { data, expiry: Date.now() + ttlMs });
    },
    clear: () => cache.store.clear()
};

async function getOllamaMap() {
    const blobToName = {};
    const manifestDir = path.join(os.homedir(), '.ollama', 'models', 'manifests');
    
    try {
        if (!fs.existsSync(manifestDir)) return blobToName;

        function scanManifestDir(currentDir, repoParts = []) {
            if (!fs.existsSync(currentDir)) return;
            const entries = fs.readdirSync(currentDir, { withFileTypes: true });
            for (const entry of entries) {
                const fullPath = path.join(currentDir, entry.name);
                if (entry.isDirectory()) {
                    scanManifestDir(fullPath, [...repoParts, entry.name]);
                } else if (entry.isFile()) {
                    let nameParts = [...repoParts];
                    if (nameParts[0] === 'registry.ollama.ai') nameParts = nameParts.slice(1);
                    if (nameParts[0] === 'library') nameParts = nameParts.slice(1);
                    const modelName = nameParts.join('/') + ':' + entry.name;
                    
                    try {
                        const content = JSON.parse(fs.readFileSync(fullPath, 'utf8'));
                        if (content.layers) {
                            for (const layer of content.layers) {
                                if (layer.digest && layer.digest.startsWith('sha256:')) {
                                    const blobName = layer.digest.replace('sha256:', 'sha256-');
                                    blobToName[blobName] = modelName;
                                }
                            }
                        }
                    } catch (e) {}
                }
            }
        }
        
        scanManifestDir(manifestDir);
        logger.info(`[Ollama] Mapped ${Object.keys(blobToName).length} models from manifests.`);
    } catch (e) {
        logger.error(`[Ollama] Failed to scan manifests`, e);
    }
    return blobToName;
}

const app = express();
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));

// Performance Middleware: Logging
app.use((req, res, next) => {
    const start = Date.now();
    res.on('finish', () => {
        const duration = Date.now() - start;
        if (req.path.startsWith('/api') || req.path.startsWith('/v1')) {
            logger.info(`${req.method} ${req.path} ${res.statusCode} - ${duration}ms`);
        }
    });
    next();
});

app.get('/api/logs/stream', (req, res) => {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders();
    
    logClients.add(res);
    req.on('close', () => logClients.delete(res));
});

const CONFIG_FILE = path.join(__dirname, 'config.json');
const DEFAULT_CENTRAL_DIR = 'C:\\AI_Models';
let config = {
    centralDir: DEFAULT_CENTRAL_DIR,
    scanDirectories: [
        path.join(os.homedir(), '.cache', 'lm-studio', 'models'),
        path.join(os.homedir(), 'AppData', 'Roaming', 'StabilityMatrix', 'Models'),
        path.join(os.homedir(), '.ollama', 'models', 'blobs'),
        path.join(os.homedir(), 'ComfyUI', 'models', 'checkpoints'),
        path.join(os.homedir(), 'llama.cpp', 'models'),
        path.join(os.homedir(), '.cache', 'huggingface', 'hub'),
    ],
    comfyDir: 'C:\\ComfyUI_windows_portable',
    // Ordem padrão das secções na página Modelos. O utilizador pode arrastar
    // as secções na UI para reordenar — a escolha fica gravada em config.json.
    sectionOrder: ['Standalone', 'LM Studio / Hugging Face', 'Ollama', 'ComfyUI'],
    activeRouterModel: null,
    vramShieldLimit: 32768,
    // Porta da Web UI do DeepSeek Harness lançada a partir do Centraliza Coder
    // (agente sobre o motor local llama.cpp).
    dshLocalPort: 3090,
    // Executável do llama.cpp (llama-server). Pode ser um caminho absoluto
    // (ex.: C:\Users\...\llama.cpp\build\bin\Release\llama-server.exe) ou
    // apenas o nome "llama-server" para procurar no PATH.
    llamaCppBinary: (os.platform() === 'win32'
        ? path.join(os.homedir(), 'llama.cpp', 'build', 'bin', 'Release', 'llama-server.exe')
        : 'llama-server'),
    // Parâmetros adicionais do llama-server. O marcador $physicalCores é
    // substituído automaticamente pelo número de núcleos físicos da máquina.
    llamaCppArgs: '-t $physicalCores --flash-attn auto -ctk q4_0 -ctv q4_0 -b 2048 -ub 1024 --host 0.0.0.0 --port 8080 --alias qwen',
    // Forma estruturada dos parâmetros (checkboxes da UI): [{ arg, value, enabled }].
    // Preenchida automaticamente a partir de llamaCppArgs na migração abaixo.
    llamaCppArgsList: null,
    // Preferência persistida: mostrar sempre os logs do servidor no Test & Chat (RF-023).
    showServerLogs: false,
    // Portas usadas pela deteção automática de motores (RF-020).
    ollamaPort: 11434,
    lmStudioPort: 1234,
    comfyPort: 8188,
    // Modelo por defeito do agente DeepSeek (Modo A — "Iniciar Motor").
    coderAgentModel: null,
    // Auto-atualização da aplicação (RF-034).
    updates: { enabled: true, manifestUrl: '', githubRepo: '', intervalHours: 24, autoApply: true }
};
if (fs.existsSync(CONFIG_FILE)) {
    try { config = { ...config, ...JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8')) }; } catch (e) { logger.error('Failed to read config', e); }
}
// Migração: converte a string antiga de args na lista estruturada usada pelas
// checkboxes da UI — nenhum parâmetro já guardado é perdido.
if (!Array.isArray(config.llamaCppArgsList) && typeof config.llamaCppArgs === 'string') {
    config.llamaCppArgsList = parseArgsToList(config.llamaCppArgs);
}
// Migração v0.5.0: preferências novas têm de sobreviver a configs antigas.
config.updates = { enabled: true, manifestUrl: '', githubRepo: '', intervalHours: 24, autoApply: true, ...(config.updates || {}) };
if (typeof config.showServerLogs !== 'boolean') config.showServerLogs = false;
if (!config.ollamaPort) config.ollamaPort = 11434;
if (!config.lmStudioPort) config.lmStudioPort = 1234;
if (!config.comfyPort) config.comfyPort = 8188;
if (!fs.existsSync(config.centralDir)) fs.mkdirSync(config.centralDir, { recursive: true });
function saveConfig() { 
    fs.writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2)); 
    cache.clear(); // Clear cache when config changes
}

const MODEL_EXTENSIONS = ['.gguf', '.safetensors', '.ckpt', '.bin', '.pt', '.pth'];

async function scanDirectory(dir, modelsList, ollamaMap) {
    if (!fs.existsSync(dir)) return;
    const normalizedDir = dir.toLowerCase().replace(/\\/g, '/');
    const normalizedCentralDir = config.centralDir.toLowerCase().replace(/\\/g, '/');
    let source = 'Local';
    if (normalizedDir.includes('.ollama')) source = 'Ollama';
    else if (normalizedDir.includes('comfyui')) source = 'ComfyUI';
    // LM Studio and Hugging Face both run via llama.cpp — group them together
    else if (normalizedDir.includes('lm-studio') || normalizedDir.includes('.lmstudio') || normalizedDir.includes('huggingface') || normalizedDir.includes('llama.cpp')) source = 'LM Studio / Hugging Face';
    else if (normalizedDir.includes('stabilitymatrix')) source = 'Stability Matrix';
    // Standalone: files stored directly under the central AI_Models directory
    // (but NOT inside the Centraliza.ai hardlink subfolder — those are duplicates)
    else if (normalizedDir.startsWith(normalizedCentralDir)) source = 'Standalone';

    // Skip the Centraliza.ai hardlink folder — its contents will appear via
    // the original provider directory (same inode). Orphaned files that have
    // no counterpart outside will be caught by the inode-based dedup below.
    // REMOVED: we now scan Centraliza.ai and deduplicate by inode at the API level.

    try {
        const entries = await promisify(fs.readdir)(dir, { withFileTypes: true });
        for (const entry of entries) {
            const fullPath = path.join(dir, entry.name);
            if (entry.isDirectory()) await scanDirectory(fullPath, modelsList, ollamaMap);
            else if (entry.isFile()) {
                const ext = path.extname(entry.name).toLowerCase();
                const isOllamaBlob = entry.name.startsWith('sha256-') && ext === '';
                // Skip partial files/blobs: Ollama appends '-partial' or '.partial'
                const isPartial = entry.name.endsWith('-partial') || entry.name.endsWith('.partial') || entry.name.endsWith('.part');
                
                if (isPartial) continue;

                if (MODEL_EXTENSIONS.includes(ext) || isOllamaBlob) {
                    try {
                        let finalModelName = entry.name;
                        let displayModelName = entry.name;
                        let ollamaTag = null;
                        let repoId = null;
                        
                        if (isOllamaBlob) {
                            const humanName = ollamaMap[entry.name];
                            if (humanName) {
                                ollamaTag = humanName;
                                finalModelName = humanName.replace(/[:\/]/g, '-') + '.gguf';
                                displayModelName = humanName;
                            } else {
                                // Skip unmapped blobs (partial or orphans)
                                continue;
                            }
                        }
                        
                        if (fullPath.includes('models--')) {
                            const parts = fullPath.split('models--');
                            if (parts.length > 1) {
                                const repoParts = parts[1].split(path.sep)[0].split('--');
                                if (repoParts.length >= 2) repoId = `${repoParts[0]}/${repoParts.slice(1).join('-')}`;
                            }
                        }
                        
                        const modelBaseName = path.parse(finalModelName).name;
                        const expectedDestPath = path.resolve(config.centralDir, 'Centraliza.ai', modelBaseName, finalModelName);
                        let isCentralized = false;
                        
                        try {
                            if (fs.existsSync(expectedDestPath)) {
                                const actualStat = await promisify(fs.stat)(fullPath);
                                const destStat = await promisify(fs.stat)(expectedDestPath);
                                if (actualStat.ino === destStat.ino || (actualStat.size === destStat.size && Math.abs(actualStat.mtime - destStat.mtime) < 1000)) {
                                    isCentralized = true;
                                }
                            }
                        } catch (e) {}

                        const actualStat = await promisify(fs.stat)(fullPath);
                        if (actualStat.size > 1024 * 1024) {
                            modelsList.push({
                                name: displayModelName,
                                path: fullPath,
                                size: actualStat.size,
                                inode: actualStat.ino,   // used for hardlink dedup
                                isSymlink: isCentralized,
                                targetPath: isCentralized ? expectedDestPath : null,
                                centralPath: expectedDestPath,
                                finalModelName: finalModelName,
                                source: source,
                                ollamaTag: ollamaTag,
                                repoId: repoId,
                                extension: ext || '.gguf'
                            });
                        }
                    } catch (err) {}
                }
            }
        }
    } catch (e) {}
}

app.get('/api/config', (req, res) => res.json(config));
app.post('/api/config', (req, res) => {
    Object.assign(config, req.body);
    saveConfig();
    res.json({ success: true, config });
});

app.post('/api/active-model', (req, res) => {
    const { model } = req.body;
    config.activeRouterModel = model;
    saveConfig();
    res.json({ success: true, activeModel: model });
});
app.get('/api/active-model', (req, res) => {
    res.json({ activeModel: config.activeRouterModel });
});

app.post('/api/auto-detect', (req, res) => {
    const common = [
        path.join(os.homedir(), '.cache', 'lm-studio', 'models'),
        path.join(os.homedir(), 'ComfyUI', 'models'),
        path.join(os.homedir(), 'llama.cpp', 'models'),
        path.join(os.homedir(), '.ollama', 'models'),
        path.join(os.homedir(), '.cache', 'huggingface', 'hub')
    ];
    
    // Add common portable roots
    ['C', 'D', 'E', 'F'].forEach(drive => {
        const p = `${drive}:\\ComfyUI_windows_portable`;
        if (fs.existsSync(p)) common.push(p);
    });

    let added = 0;
    common.forEach(p => { 
        if (fs.existsSync(p)) {
            // Search for ComfyUI root by climbing up
            let current = p;
            for (let i = 0; i < 4; i++) {
                if (fs.existsSync(path.join(current, 'run_nvidia_gpu.bat')) || fs.existsSync(path.join(current, 'main.py'))) {
                    config.comfyDir = current;
                    break;
                }
                current = path.dirname(current);
            }

            if (!config.scanDirectories.includes(p)) { 
                config.scanDirectories.push(p); 
                added++; 
            } 
        }
    });
    if (added > 0) saveConfig();
    res.json({ success: true, added, config });
});

// Abre o seletor nativo de pastas e devolve { path } ou { error }.
// No Windows usa spawn('powershell.exe', [...]) com o picker.ps1 (sem shell/cmd,
// sem problemas de aspas) e janela do console escondida (windowsHide).
async function pickFolderNative(initialPath, description) {
    const platform = os.platform();
    try {
        if (platform === 'win32') {
            const psFile = path.join(__dirname, 'picker.ps1');
            const args = ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-sta', '-File', psFile];
            if (initialPath) args.push('-initialPath', String(initialPath));
            if (description) args.push('-description', String(description));
            const result = await new Promise((resolve) => {
                const proc = spawn('powershell.exe', args, { windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
                let stdout = '', stderr = '';
                let settled = false;
                let timer = null;
                const done = (obj) => {
                    if (settled) return;
                    settled = true;
                    if (timer) clearTimeout(timer);
                    resolve(obj);
                };
                proc.stdout.on('data', d => { stdout += d; });
                proc.stderr.on('data', d => { stderr += d; });
                proc.on('error', (e) => done({ error: e && e.message ? e.message : String(e) }));
                proc.on('close', (code) => done({ code, stdout, stderr }));
                // Vigilante: se o seletor não responder (diálogo invisível ou
                // bloqueado), mata-o e devolve erro legível em vez de pendurar
                // o pedido durante o timeout de 120s do browser.
                timer = setTimeout(() => {
                    try { proc.kill(); } catch (e) {}
                    if (os.platform() === 'win32') exec(`taskkill /F /T /PID ${proc.pid}`, () => {});
                    done({ error: 'Folder picker timed out (75s). The dialog may not be visible — ensure Centraliza runs in your interactive Windows session, not as a service.' });
                }, 75000);
            });
            if (result.error) return { error: result.error };
            if (result.code !== 0) return { error: String(result.stderr || '').trim() || `picker.ps1 exited with code ${result.code}` };
            const lines = String(result.stdout || '').split(/\r?\n/).filter(l => l.trim());
            const picked = lines.length ? lines[lines.length - 1].trim() : '';
            return { path: picked || null };
        }
        if (platform === 'darwin') {
            const startPath = initialPath ? `default location "${initialPath.replace(/\\/g, '/')}"` : '';
            const command = `osascript -e 'tell application "System Events" to activate' -e 'set theFolder to choose folder with prompt "${description}" ${startPath}' -e 'POSIX path of theFolder'`;
            const { stdout } = await promisify(exec)(command);
            return { path: String(stdout || '').trim() || null };
        }
        const startPath = initialPath ? `--filename="${initialPath}/"` : '';
        const command = `zenity --file-selection --directory --title="${description}" ${startPath}`;
        const { stdout } = await promisify(exec)(command);
        return { path: String(stdout || '').trim() || null };
    } catch (err) {
        return { error: err && err.message ? err.message : String(err) };
    }
}

app.get('/api/pick-folder', async (req, res) => {
    const initialPath = req.query.initialPath || '';
    const result = await pickFolderNative(initialPath, 'Select a folder for Centraliza.ai');
    if (result.error) return res.json({ path: null, error: result.error });
    res.json({ path: result.path || null });
});

// --- HUGGINGFACE MODEL ENRICHMENT HELPERS ---
// Bits por peso por quantização — usados para estimar VRAM mínima e tamanho de ficheiro
const QUANT_BITS = {
    F32: 32, FP32: 32,
    F16: 16, BF16: 16, FP16: 16,
    Q8_0: 8.5, Q8_K_L: 8.8, Q8_K_XL: 8.8,
    Q6_K: 6.6, Q6_K_L: 6.9, Q6_K_M: 6.7, Q6_K_XL: 7.1,
    Q5_K_M: 5.7, Q5_K_S: 5.3, Q5_K_XL: 6.1, Q5_0: 5.5, Q5_1: 6.1,
    Q4_K_M: 4.9, Q4_K_S: 4.4, Q4_K_XL: 5.3, Q4_0: 4.6, Q4_1: 5.1,
    Q3_K_M: 3.9, Q3_K_S: 3.4, Q3_K_L: 4.2, Q3_K_XL: 4.5,
    Q2_K: 2.6, Q2_K_S: 2.6, Q2_K_XL: 3.2,
    IQ4_XS: 4.3, IQ4_NL: 4.6,
    IQ3_XXS: 3.1, IQ3_XS: 3.3, IQ3_S: 3.5,
    IQ2_XXS: 2.1, IQ2_XS: 2.3, IQ2_S: 2.6,
    IQ1_M: 1.8, IQ1_S: 1.6
};

function parseQuantFromText(text) {
    const t = String(text || '').toUpperCase();
    if (!t) return null;
    const m = t.match(/(?:^|[^A-Z0-9])(((?:IQ)?Q\d(?:_[A-Z0-9]+){0,3}|F(?:16|32)|BF16|FP16|FP32))(?=$|[^A-Z0-9])/);
    return m ? m[1] : null;
}

// Extrai número de parâmetros do nome (ex.: "Qwen3.8-27B-GGUF" → 27B)
function parseParamsFromName(name) {
    const t = String(name || '');
    const m = t.match(/(\d+(?:\.\d+)?)\s*[BbMm]\b/);
    if (!m) return null;
    const n = parseFloat(m[1]);
    if (!n || n <= 0) return null;
    const isM = /[Mm]\b/.test(m[0]);
    return { b: isM ? n / 1000 : n, label: isM ? `${n}M` : `${n}B` };
}

function estimateVramGb(paramsB, quant) {
    const bits = QUANT_BITS[quant || 'Q4_K_M'] || 4.9;
    return Math.round((paramsB * bits / 8 + 1.5) * 10) / 10; // +1.5GB overhead (KV cache/contexto)
}

function estimateFileGb(paramsB, quant) {
    const bits = QUANT_BITS[quant || 'Q4_K_M'] || 4.9;
    return Math.round((paramsB * bits / 8) * 10) / 10;
}

// Preenche estimativas (parâmetros, VRAM, tamanho) para entradas sem metadados curados
function enrichModelEntry(m) {
    if (!m || typeof m !== 'object') return m;
    const need = !m.min_vram_gb || m.min_vram_gb <= 0 || !m.parameter_count || m.parameter_count === '?';
    if (!need) return m;
    const p = parseParamsFromName(m.name);
    if (!p) return m;
    const q = parseQuantFromText(m.name) || m.quantization || 'Q4_K_M';
    if (!m.parameter_count || m.parameter_count === '?') { m.parameter_count = p.label; m.parameters_raw = p.b; }
    if (!m.min_vram_gb || m.min_vram_gb <= 0) m.min_vram_gb = estimateVramGb(p.b, q);
    if (!m.file_size_gb || m.file_size_gb <= 0) m.file_size_gb = estimateFileGb(p.b, q);
    m.quantization = q;
    m.params_estimated = true;
    return m;
}

app.get('/api/registry', (req, res) => {
    const cached = cache.get('registry');
    if (cached) return res.json(cached);

    const registryPath = path.join(__dirname, 'data', 'hf_models.json');
    if (fs.existsSync(registryPath)) {
        let registry = JSON.parse(fs.readFileSync(registryPath, 'utf8'));
        registry.unshift({ name: "deepseek-ai/DeepSeek-R1-Distill-Llama-8B", provider: "DeepSeek", parameter_count: "8B", min_vram_gb: 5.5, use_case: "Reasoning, Coding", pipeline_tag: "text-generation", hf_downloads: 15000000 });
        // Subcategorias Abliterated/Uncensored calculadas na leitura (RF-003).
        registry = registry.map(tagModel);
        cache.set('registry', registry, 60000 * 30); // 30 min cache
        res.json(registry);
    } else res.status(404).json({ error: 'Registry not found' });
});

app.get('/api/registry/refresh', async (req, res) => {
    try {
        const fetch = (...args) => import('node-fetch').then(({ default: f }) => f(...args));
        // Top 500 modelos com GGUF por downloads — novos modelos entram automaticamente
        const url = 'https://huggingface.co/api/models?filter=gguf&sort=downloads&direction=-1&limit=500';
        const r = await fetch(url, { signal: AbortSignal.timeout(30000) });
        if (!r.ok) return res.status(502).json({ error: `HuggingFace API error: ${r.status}` });
        let data = await r.json();
        if (!Array.isArray(data)) data = [];

        const registryPath = path.join(__dirname, 'data', 'hf_models.json');
        let existing = [];
        if (fs.existsSync(registryPath)) {
            try { existing = JSON.parse(fs.readFileSync(registryPath, 'utf8')); } catch (_) {}
            if (!Array.isArray(existing)) existing = [];
        }

        // Mescla: modelos curados mantêm seus metadados; novos são adicionados com dados básicos
        const byName = new Map(existing.map(m => [m.name, m]));
        let added = 0;
        for (const m of data) {
            const name = m.id || m.modelId;
            if (!name) continue;
            const org = name.split('/')[0] || 'Community';
            const existingEntry = byName.get(name);
            if (existingEntry) {
                // Atualiza facetas e popularidade sem tocar em metadados curados
                if (!existingEntry.hf_library) existingEntry.hf_library = m.library_name || null;
                if (!Array.isArray(existingEntry.hf_tags) || existingEntry.hf_tags.length === 0) {
                    existingEntry.hf_tags = Array.isArray(m.tags) ? m.tags : [];
                }
                if (!existingEntry.pipeline_tag) existingEntry.pipeline_tag = m.pipeline_tag || 'text-generation';
                if (m.downloads) existingEntry.hf_downloads = m.downloads;
                if (m.likes) existingEntry.hf_likes = m.likes;
                if (!existingEntry.release_date && m.lastModified) existingEntry.release_date = String(m.lastModified).slice(0, 10);
                continue;
            }
            byName.set(name, {
                name,
                provider: org,
                parameter_count: '?',
                parameters_raw: 0,
                min_vram_gb: 0,
                recommended_ram_gb: 0,
                quantization: 'Q4_K_M',
                format: 'gguf',
                context_length: 0,
                use_case: (m.pipeline_tag === 'text-generation') ? 'General purpose text generation' : 'General purpose',
                capabilities: [],
                pipeline_tag: m.pipeline_tag || 'text-generation',
                architecture: '',
                hf_downloads: m.downloads || 0,
                hf_likes: m.likes || 0,
                hf_library: m.library_name || null,
                hf_tags: Array.isArray(m.tags) ? m.tags : [],
                release_date: m.lastModified ? String(m.lastModified).slice(0, 10) : null,
                gguf_sources: [{ repo: name, provider: org }],
                from_live: true
            });
            added++;
        }

        // Backfill: entradas sem metadados (0 GB / '?') ganham estimativas reais a partir do nome
        const merged = Array.from(byName.values()).map(enrichModelEntry).map(tagModel);
        fs.writeFileSync(registryPath, JSON.stringify(merged, null, 2), 'utf8');
        cache.set('registry', merged, 60000 * 60); // 1 hora cache
        res.json({ success: true, total: merged.length, added, message: 'Catálogo atualizado do HuggingFace' });
    } catch (err) {
        logger.error('[HF Registry Refresh] Failed:', err.message);
        res.status(500).json({ error: err.message });
    }
});

// Adiciona um modelo encontrado na busca ao vivo ao catálogo local (para aparecer sempre na lista)
app.post('/api/registry/add', (req, res) => {
    const { name, pipeline_tag, hf_downloads, hf_likes, has_gguf, library_name, tags } = req.body || {};
    if (!name || typeof name !== 'string' || !name.includes('/')) {
        return res.status(400).json({ error: 'Modelo inválido. Formato esperado: org/repo' });
    }

    const registryPath = path.join(__dirname, 'data', 'hf_models.json');
    let registry = [];
    if (fs.existsSync(registryPath)) {
        try { registry = JSON.parse(fs.readFileSync(registryPath, 'utf8')); } catch (_) {}
        if (!Array.isArray(registry)) registry = [];
    }
    if (registry.some(m => m.name === name)) {
        return res.json({ success: true, added: false, message: 'Modelo já está no catálogo' });
    }

    const org = name.split('/')[0] || 'Community';
    registry.push(tagModel(enrichModelEntry({
        name,
        provider: org,
        parameter_count: '?',
        parameters_raw: 0,
        min_vram_gb: 0,
        recommended_ram_gb: 0,
        quantization: 'Q4_K_M',
        format: 'gguf',
        context_length: 0,
        use_case: (pipeline_tag === 'text-generation') ? 'General purpose text generation' : 'General purpose',
        capabilities: [],
        pipeline_tag: pipeline_tag || 'text-generation',
        architecture: '',
        hf_downloads: hf_downloads || 0,
        hf_likes: hf_likes || 0,
        hf_library: library_name || null,
        hf_tags: Array.isArray(tags) ? tags : [],
        release_date: null,
        gguf_sources: has_gguf ? [{ repo: name, provider: org }] : [],
        from_live: true
    })));

    try {
        fs.writeFileSync(registryPath, JSON.stringify(registry, null, 2), 'utf8');
        cache.set('registry', registry, 60000 * 60);
        res.json({ success: true, added: true, message: 'Modelo adicionado ao catálogo' });
    } catch (err) {
        logger.error('[HF Registry Add] Failed:', err.message);
        res.status(500).json({ error: err.message });
    }
});

app.get('/api/search/hf', async (req, res) => {
    const { q, limit = 20 } = req.query;
    if (!q || String(q).trim().length < 2) return res.json([]);

    const cacheKey = `hf-search-${q}-${limit}`;
    const cached = cache.get(cacheKey);
    if (cached) return res.json(cached);

    try {
        const fetch = (...args) => import('node-fetch').then(({ default: f }) => f(...args));
        const url = `https://huggingface.co/api/models?search=${encodeURIComponent(q)}&sort=downloads&direction=-1&limit=${limit}&full=false`;
        const r = await fetch(url, { signal: AbortSignal.timeout(8000) });
        const data = await r.json();
        const normalized = (Array.isArray(data) ? data : []).map(m => tagModel({
            id: m.id || m.modelId || '',
            name: m.id || m.modelId || '',
            provider: (m.id || m.modelId || '').split('/')[0],
            pipeline_tag: m.pipeline_tag || 'text-generation',
            hf_downloads: m.downloads || 0,
            hf_likes: m.likes || 0,
            has_gguf: (m.tags || []).includes('gguf'),
            hf_tags: Array.isArray(m.tags) ? m.tags : [],
            updated_at: m.lastModified || null
        }));
        cache.set(cacheKey, normalized, 60000 * 5);
        res.json(normalized);
    } catch (err) {
        logger.error('[HF Search] Failed:', err.message);
        res.json([]);
    }
});

// Detalhes completos de um modelo direto do HuggingFace: README real + cada versão GGUF com tamanho e link
app.get('/api/models/hf/detail', async (req, res) => {
    const repo = String(req.query.repo || '').trim();
    if (!repo || !repo.includes('/')) return res.status(400).json({ error: 'Modelo inválido. Formato esperado: org/repo' });

    const cacheKey = `hf-detail-${repo}`;
    const cached = cache.get(cacheKey);
    if (cached) return res.json(cached);

    try {
        const fetch = (...args) => import('node-fetch').then(({ default: f }) => f(...args));

        // Nota: a API de detalhe do HF rejeita slash URL-encoded ("%2F") no caminho — manter '/' literal
        const pathPart = repo.split('/').map(encodeURIComponent).join('/');
        const apiRes = await fetch(`https://huggingface.co/api/models/${pathPart}?blobs=true`, { signal: AbortSignal.timeout(20000) });
        if (!apiRes.ok) return res.status(502).json({ error: `HuggingFace API error: ${apiRes.status}` });
        const m = await apiRes.json();

        let readme = '';
        try {
            const rr = await fetch(`https://huggingface.co/api/models/${pathPart}/readme`, { signal: AbortSignal.timeout(10000) });
            if (rr.ok) readme = await rr.text();
        } catch (_) {}
        if (!readme) {
            // Fallback: README cru do repositório (alguns repos não expõem via endpoint /readme)
            try {
                const raw = await fetch(`https://huggingface.co/${pathPart}/raw/main/README.md`, { signal: AbortSignal.timeout(15000) });
                if (raw.ok) readme = await raw.text();
            } catch (_) {}
        }

        const licenseTag = (m.tags || []).find(t => String(t).startsWith('license:'));
        const baseModelTag = (m.tags || []).find(t => String(t).startsWith('base_model:'));

        const ggufFiles = (m.siblings || [])
            .filter(s => s.rfilename && String(s.rfilename).toLowerCase().endsWith('.gguf'))
            .map(s => {
                const fn = s.rfilename;
                const name = fn.split('/').pop() || fn;
                const isShard = /-\d+-of-\d+\.gguf$/i.test(fn) || /^\d+-of-\d+/.test(name);
                const isAux = /^(mmproj|imatrix|embedding|projector)/i.test(name);
                return {
                    file: fn,
                    name,
                    size: s.size || (s.lfs && s.lfs.size) || 0,
                    quant: parseQuantFromText(fn),
                    isShard,
                    isAux,
                    url: `https://huggingface.co/${repo}/resolve/main/${fn.split('/').map(encodeURIComponent).join('/')}`
                };
            });

        const modelGguf = ggufFiles.filter(f => !f.isAux && !f.isShard);
        const totalGgufBytes = (m.gguf && m.gguf.total) || ggufFiles.reduce((a, f) => a + (f.size || 0), 0);
        const params = parseParamsFromName(repo);
        // Quant principal: Q4_K_M é o default de download; senão, a primeira quantização encontrada
        const mainQuant = (modelGguf.find(f => f.quant === 'Q4_K_M') || modelGguf.find(f => f.quant) || ggufFiles.find(f => f.quant))?.quant || 'Q4_K_M';

        const detail = {
            id: m.id || repo,
            name: (m.id || repo).split('/').pop(),
            provider: (m.id || repo).split('/')[0],
            author: m.author || (m.id || repo).split('/')[0],
            pipeline_tag: m.pipeline_tag || 'text-generation',
            library: m.library_name || null,
            license: (m.cardData && m.cardData.license) || (licenseTag ? licenseTag.slice(8) : null) || 'Desconhecida',
            base_model: baseModelTag ? baseModelTag.slice(11) : null,
            downloads: m.downloads || 0,
            likes: m.likes || 0,
            created: m.createdAt ? String(m.createdAt).slice(0, 10) : null,
            lastModified: m.lastModified ? String(m.lastModified).slice(0, 10) : null,
            tags: m.tags || [],
            parameter_count: params ? params.label : '?',
            parameters_raw: params ? params.b : 0,
            quantization: mainQuant,
            min_vram_gb: params ? estimateVramGb(params.b, mainQuant) : 0,
            file_size_gb: Math.round((totalGgufBytes / (1024 ** 3)) * 10) / 10,
            context_length: (m.gguf && m.gguf.context_length) || null,
            architecture: (m.config && (m.config.model_type || (m.config.architectures && m.config.architectures[0]))) || null,
            gguf_files: ggufFiles,
            description: readme || '',
            hf_url: `https://huggingface.co/${repo}`
        };
        // Subcategorias Abliterated/Uncensored do modelo em detalhe (RF-003).
        tagModel(detail);

        cache.set(cacheKey, detail, 60000 * 60);
        res.json(detail);
    } catch (err) {
        logger.error('[HF Detail] Failed:', err.message);
        res.status(500).json({ error: err.message });
    }
});

app.get('/api/model-readme', async (req, res) => {
    const { repoId, localPath } = req.query;
    const cacheKey = `readme-${repoId || localPath}`;
    const cached = cache.get(cacheKey);
    if (cached) return res.send(cached);

    if (repoId) {
        const fetch = (...args) => import('node-fetch').then(({default: fetch}) => fetch(...args));
        try {
            const response = await fetch(`https://huggingface.co/api/models/${repoId}/readme`);
            const data = await response.text();
            cache.set(cacheKey, data, 60000 * 60); // 1h cache
            return res.send(data);
        } catch (e) { logger.error('Failed to fetch HF readme', e); }
    }
    if (localPath) {
        const dir = path.dirname(localPath);
        const readmeFiles = ['README.md', 'readme.md', 'model_details.json'];
        for (const f of readmeFiles) {
            const p = path.join(dir, f);
            if (fs.existsSync(p)) {
                const data = fs.readFileSync(p, 'utf8');
                cache.set(cacheKey, data, 60000 * 5); // 5 min cache
                return res.send(data);
            }
        }
    }
    res.send("No detailed description found for this model.");
});

app.get('/api/system-info', async (req, res) => {
    const cached = cache.get('system-info');
    if (cached) return res.json(cached);

    const getVram = () => new Promise((resolve) => {
        // try/catch defensivo: em alguns ambientes (ex.: processos confinados)
        // o child_process.exec pode falhar; nesse caso reportamos VRAM desconhecida
        // em vez de derrubar o endpoint.
        const tryNvidiaSmi = () => {
            try {
                exec('nvidia-smi --query-gpu=memory.total,name --format=csv,noheader,nounits', (err, stdout) => {
                    if (!err && stdout) {
                        const parts = stdout.trim().split(',');
                        return resolve({ ram: parseInt(parts[0]) * 1024 * 1024, name: parts[1]?.trim() });
                    }
                    tryPowerShell();
                });
            } catch (e) { tryPowerShell(); }
        };
        const tryPowerShell = () => {
            try {
                exec(`powershell -command "Get-CimInstance Win32_VideoController | Select-Object Name, @{Name='VRAM';Expression={[math]::Round($_.AdapterRAM / 1)}} | ForEach-Object { $_.Name + '|' + $_.VRAM }"`, (err2, stdout2) => {
                    let best = { ram: 0, name: 'Unknown' };
                    if (!err2) {
                        stdout2.trim().split('\n').forEach(l => {
                            const [n, r] = l.trim().split('|');
                            const ram = Math.abs(parseFloat(r));
                            if (ram > best.ram) best = { ram, name: n };
                        });
                    }
                    resolve(best);
                });
            } catch (e) { resolve({ ram: 0, name: 'Unknown' }); }
        };
        tryNvidiaSmi();
    });
    const v = await getVram();
    const info = { totalRam: os.totalmem(), freeRam: os.freemem(), vram: v.ram, gpuName: v.name, cpuModel: os.cpus()[0].model };
    cache.set('system-info', info, 5000); // 5s cache
    res.json(info);
});

// ---------------------------------------------------------------------------
// Leitor de metadados GGUF (cabeçalho do ficheiro).
// Permite estimar com precisão o impacto de contexto/camadas GPU no hardware:
// nº de camadas, contexto máximo, dimensões, quantização e bytes por peso.
// Suporta GGUF v2 e v3 (spec https://github.com/ggerganov/ggml/blob/master/docs/gguf.md)
// ---------------------------------------------------------------------------
const GGUF_MAGIC = 0x46554747; // "GGUF" em little-endian
const GGUF_T = { U8:0, I8:1, U16:2, I16:3, U32:4, I32:5, F32:6, BOOL:7, STRING:8, ARRAY:9, U64:10, I64:11, F64:12 };

// Le um valor GGUF a partir do buffer na posição `off`.
// Devolve { value, next } ou undefined se sair dos limites.
function ggufReadValue(buf, off, type) {
    switch (type) {
        case GGUF_T.U8:  return off + 1 > buf.length ? undefined : { value: buf.readUInt8(off), next: off + 1 };
        case GGUF_T.I8:  return off + 1 > buf.length ? undefined : { value: buf.readInt8(off), next: off + 1 };
        case GGUF_T.U16: return off + 2 > buf.length ? undefined : { value: buf.readUInt16LE(off), next: off + 2 };
        case GGUF_T.I16: return off + 2 > buf.length ? undefined : { value: buf.readInt16LE(off), next: off + 2 };
        case GGUF_T.U32: return off + 4 > buf.length ? undefined : { value: buf.readUInt32LE(off), next: off + 4 };
        case GGUF_T.I32: return off + 4 > buf.length ? undefined : { value: buf.readInt32LE(off), next: off + 4 };
        case GGUF_T.F32: return off + 4 > buf.length ? undefined : { value: buf.readFloatLE(off), next: off + 4 };
        case GGUF_T.BOOL: return off + 1 > buf.length ? undefined : { value: buf.readUInt8(off) !== 0, next: off + 1 };
        case GGUF_T.STRING: {
            if (off + 8 > buf.length) return undefined;
            const len = Number(buf.readBigUInt64LE(off));
            off += 8;
            if (off + len > buf.length) return undefined;
            return { value: buf.toString('utf8', off, off + len), next: off + len };
        }
        case GGUF_T.ARRAY: {
            if (off + 12 > buf.length) return undefined;
            const elemType = buf.readUInt32LE(off);
            off += 4;
            const count = Number(buf.readBigUInt64LE(off));
            off += 8;
            // Arrays enormes (ex.: tokenizer.ggml.tokens com 128k strings) são
            // percorridos sem armazenar valores quando não interessa.
            const isHugeStrings = elemType === GGUF_T.STRING && count > 5000;
            const arr = isHugeStrings ? null : [];
            for (let j = 0; j < count; j++) {
                const r = ggufReadValue(buf, off, elemType);
                if (!r) return undefined;
                off = r.next;
                if (!isHugeStrings) arr.push(r.value);
            }
            return { value: arr, next: off };
        }
        case GGUF_T.U64: { if (off + 8 > buf.length) return undefined; return { value: Number(buf.readBigUInt64LE(off)), next: off + 8 }; }
        case GGUF_T.I64: { if (off + 8 > buf.length) return undefined; return { value: Number(buf.readBigInt64LE(off)), next: off + 8 }; }
        case GGUF_T.F64: { if (off + 8 > buf.length) return undefined; return { value: buf.readDoubleLE(off), next: off + 8 }; }
        default: return undefined;
    }
}

// Analisa o buffer do cabeçalho GGUF. `fileSizeBytes` é o tamanho real do ficheiro.
// Devolve o mapa de metadados + informação derivada (ou { ok:false, error }).
function parseGGUFBuffer(buf, fileSizeBytes = 0) {
    if (!buf || buf.length < 24) return { ok: false, error: 'Ficheiro demasiado pequeno para ser GGUF.' };
    if (buf.readUInt32LE(0) !== GGUF_MAGIC) return { ok: false, error: 'O ficheiro não tem assinatura GGUF.' };
    const version = buf.readUInt32LE(4);
    const kvCount = Number(buf.readBigUInt64LE(16));
    let off = 24;
    const meta = {};

    // Chaves essenciais — deixamos de percorrer assim que as tivermos todas,
    // para não atravessar os arrays gigantes do tokenizer no fim dos metadados.
    const needsArch = !meta['general.architecture'];
    const isCore = (k) => k.startsWith('general.architecture') || k === 'general.file_type' || k === 'general.quantization_version' ||
        /\.block_count$/.test(k) || /\.context_length$/.test(k) || /\.embedding_length$/.test(k) ||
        /\.attention\.head_count$/.test(k) || /\.attention\.head_count_kv$/.test(k) || /\.rope\.dimension_count$/.test(k);

    for (let i = 0; i < kvCount; i++) {
        if (off + 8 > buf.length) break;
        const keyLen = Number(buf.readBigUInt64LE(off));
        off += 8;
        if (off + keyLen > buf.length) break;
        const key = buf.toString('utf8', off, off + keyLen);
        off += keyLen;
        if (off + 4 > buf.length) break;
        const vtype = buf.readUInt32LE(off);
        off += 4;
        const r = ggufReadValue(buf, off, vtype);
        if (!r) break;
        off = r.next;
        meta[key] = r.value;

        // Paragem antecipada: já temos tudo o que precisamos.
        const arch = meta['general.architecture'];
        const hasLayers = Object.keys(meta).some(k => k.endsWith('.block_count'));
        const hasEmb = Object.keys(meta).some(k => k.endsWith('.embedding_length'));
        if (arch && hasLayers && hasEmb && meta['general.file_type'] !== undefined) break;
    }

    // --- Derivar os campos estruturados ---
    const pick = (prefixes) => {
        for (const p of prefixes) if (meta[p] !== undefined) return meta[p];
        return undefined;
    };
    const arch = meta['general.architecture'] || 'llama';
    const a = (k) => pick([`${arch}.${k}`, `llama.${k}`, `qwen2.${k}`]);
    const nLayers = a('block_count');
    const nCtxMax = a('context_length');
    const nEmb = a('embedding_length');
    const nHeads = a('attention.head_count');
    const nKVHeads = a('attention.head_count_kv');
    const ropeDim = a('rope.dimension_count');
    const fileType = meta['general.file_type'];
    const quantVersion = meta['general.quantization_version'];

    const FILE_TYPE_NAMES = {
        0: 'F32', 1: 'F16', 2: 'Q4_0', 3: 'Q4_1', 6: 'Q5_0', 7: 'Q5_1', 8: 'Q8_0', 9: 'Q8_1',
        10: 'Q2_K', 11: 'Q3_K', 12: 'Q4_K', 13: 'Q5_K', 14: 'Q6_K', 15: 'Q8_K',
        16: 'IQ2_XXS', 17: 'IQ2_XS', 18: 'IQ3_XXS', 19: 'IQ1_S', 20: 'IQ4_NL', 21: 'IQ3_S',
        22: 'IQ3_M', 23: 'IQ2_S', 24: 'IQ2_M', 25: 'IQ4_XS', 26: 'IQ1_M', 27: 'BF16',
        28: 'Q4_0_4_4', 29: 'Q4_0_4_8', 30: 'Q4_0_8_8', 31: 'TQ1_0', 32: 'TQ2_0', 33: 'IQ4_NL_4_4'
    };
    // Bytes médios por peso para cada quantização (aproximação usada na estimativa).
    const QUANT_BYTES = {
        0: 4, 1: 2, 27: 2, 8: 1, 9: 1, 15: 1, 14: 0.79, 13: 0.69, 6: 0.66, 7: 0.68,
        12: 0.56, 2: 0.56, 3: 0.59, 11: 0.45, 10: 0.34, 19: 0.15, 16: 0.22, 17: 0.26,
        18: 0.31, 23: 0.31, 24: 0.31, 20: 0.53, 21: 0.40, 22: 0.40, 25: 0.53, 26: 0.15,
        28: 0.55, 29: 0.55, 30: 0.55, 31: 0.13, 32: 0.25, 33: 0.53
    };
    const quantName = FILE_TYPE_NAMES[fileType] || (fileType !== undefined ? `FileType_${fileType}` : undefined);
    const bytesPerWeight = QUANT_BYTES[fileType];

    // head_dim: rope.dimension_count ou embedding/heads
    let headDim = ropeDim;
    if (!headDim && nEmb && nHeads) headDim = nEmb / nHeads;

    // Estimativa de parâmetros (arquitetura Llama-like): ~12*nEmb² por camada.
    // Serve para calibrar os bytes/peso reais a partir do tamanho do ficheiro.
    let paramsEstimate = null;
    if (typeof nLayers === 'number' && typeof nEmb === 'number') {
        paramsEstimate = nLayers * (12 * nEmb * nEmb + 13 * nEmb);
    }

    const out = {
        ok: true,
        version,
        arch: arch || null,
        nLayers: typeof nLayers === 'number' ? nLayers : null,
        nCtxMax: typeof nCtxMax === 'number' ? nCtxMax : null,
        nEmb: typeof nEmb === 'number' ? nEmb : null,
        nKVHeads: typeof nKVHeads === 'number' ? nKVHeads : null,
        headDim: typeof headDim === 'number' ? headDim : null,
        fileType: typeof fileType === 'number' ? fileType : null,
        quantVersion: typeof quantVersion === 'number' ? quantVersion : null,
        quantName: quantName || null,
        bytesPerWeight: typeof bytesPerWeight === 'number' ? bytesPerWeight : null,
        paramsEstimate,
        fileSizeBytes: fileSizeBytes || 0
    };
    if (!out.nLayers && !out.fileSizeBytes) out.ok = false; // sem dados úteis
    return out;
}

// Lê os primeiros bytes do ficheiro e analisa o cabeçalho GGUF.
function parseGGUFHeader(filePath, maxReadBytes = 16 * 1024 * 1024) {
    let fd;
    try {
        fd = fs.openSync(filePath, 'r');
        const stat = fs.fstatSync(fd);
        const size = Math.min(stat.size, maxReadBytes);
        const buf = Buffer.alloc(size);
        fs.readSync(fd, buf, 0, size, 0);
        return parseGGUFBuffer(buf, stat.size);
    } catch (e) {
        return { ok: false, error: e.message };
    } finally {
        if (fd !== undefined) { try { fs.closeSync(fd); } catch (e) {} }
    }
}

// Metadados GGUF de um modelo local (usado pelos painéis de "impacto no hardware").
app.get('/api/gguf/meta', (req, res) => {
    const p = String(req.query.path || '');
    if (!p) return res.status(400).json({ ok: false, error: 'Missing path.' });
    if (!p.toLowerCase().endsWith('.gguf')) return res.status(400).json({ ok: false, error: 'O ficheiro não é .gguf.' });
    if (!fs.existsSync(p)) return res.status(404).json({ ok: false, error: 'Ficheiro não encontrado.' });

    const cacheKey = 'gguf-meta:' + p;
    const cached = cache.get(cacheKey);
    if (cached) return res.json(cached);

    const meta = parseGGUFHeader(p);
    cache.set(cacheKey, meta, 1000 * 60 * 60 * 24); // 1 dia
    res.json(meta);
});

/**
 * Lista normalizada de modelos locais (cache de 10 s). Reutilizada por
 * /api/models, pelo resumo de armazenamento e pelo estado do Coder.
 */
async function getModelsList() {
    let deduped = cache.get('models-list');
    if (deduped) return deduped;

    const modelsList = [];
    const ollamaMap = await getOllamaMap();
    for (const dir of config.scanDirectories) if (fs.existsSync(dir)) await scanDirectory(dir, modelsList, ollamaMap);

    const seenOllamaTags = new Set();
    const seenInodes = new Set();   // deduplicate hardlinks by inode
    const seenPaths = new Set();
    deduped = [];
    for (const m of modelsList) {
        if (m.ollamaTag) {
            if (seenOllamaTags.has(m.ollamaTag)) continue;
            seenOllamaTags.add(m.ollamaTag);
        } else {
            if (seenPaths.has(m.path)) continue;
            seenPaths.add(m.path);
            // If inode already seen, this is a hardlink duplicate — prefer the
            // entry from the provider directory (scanned first), skip this one.
            if (m.inode && seenInodes.has(m.inode)) continue;
            if (m.inode) seenInodes.add(m.inode);
        }

        // --- Auto-Classificação de Capacidades ---
        const nameForCheck = (m.ollamaTag || m.name || '').toLowerCase();

        // Excluir modelos de raciocínio puro (DeepSeek-R1) que não suportam tools
        const isReasoner = nameForCheck.includes('-r1') || nameForCheck.includes('deepseek-r1') || nameForCheck.includes('reasoning');

        // Heurística aprimorada para focar APENAS em modelos com capacidade de Tool Calling/Agentes
        const isCapableCoder = (nameForCheck.includes('coder') ||
                               (nameForCheck.includes('deepseek') && !isReasoner) ||
                               nameForCheck.includes('qwen') ||
                               nameForCheck.includes('llama-3') ||
                               nameForCheck.includes('phind') ||
                               nameForCheck.includes('mistral') ||
                               nameForCheck.includes('mixtral')) && !isReasoner;

        m.isCoder = isCapableCoder && m.source !== 'ComfyUI' &&
                    !nameForCheck.includes('embed') &&
                    !nameForCheck.includes('tts') &&
                    !nameForCheck.includes('whisper') &&
                    !nameForCheck.includes('sdxl') &&
                    !nameForCheck.includes('flux');

        // Modelos Multimodais (Visão)
        m.hasVision = nameForCheck.includes('vision') || nameForCheck.includes('llava') ||
                      nameForCheck.includes('pixtral') || nameForCheck.includes('minicpm-v') ||
                      nameForCheck.includes('vl');

        // Subcategorias Abliterated/Uncensored (RF-002/RF-003)
        tagModel(m);

        deduped.push(m);
    }
    cache.set('models-list', deduped, 10000); // 10s cache
    return deduped;
}

app.get('/api/models', async (req, res) => {
    const { filter } = req.query;
    const deduped = await getModelsList();
    if (filter === 'coder') return res.json(deduped.filter(m => m.isCoder));
    if (filter === 'abliterated') return res.json(deduped.filter(m => m.is_abliterated));
    if (filter === 'uncensored') return res.json(deduped.filter(m => m.is_uncensored));
    res.json(deduped);
});

app.post('/api/centralize', async (req, res) => {
    const { modelPath, finalModelName } = req.body;
    if (!modelPath || !finalModelName) return res.status(400).json({ error: 'Missing parameters' });
    
    logger.info(`[Centralize] Request for ${finalModelName} from ${modelPath}`);
    if (!fs.existsSync(modelPath)) return res.status(404).json({ error: 'Source file not found' });

    const safeName = finalModelName.trim().replace(/[:\/]/g, '-');
    const modelBaseName = path.parse(safeName).name;
    const modelDir = path.resolve(config.centralDir, 'Centraliza.ai', modelBaseName);
    const destPath = path.resolve(modelDir, safeName);
    
    if (!fs.existsSync(modelDir)) fs.mkdirSync(modelDir, { recursive: true });
    if (fs.existsSync(destPath)) fs.unlinkSync(destPath);

    try { 
        await promisify(fs.link)(modelPath, destPath); 
        logger.info('[Centralize] Hardlink SUCCESS');
        cache.clear();
        res.json({ success: true }); 
    } catch (e) { 
        logger.warn(`Hardlink failed: ${e.message}. Attempting symlink fallback...`);
        try { 
            await promisify(fs.symlink)(modelPath, destPath, 'file'); 
            cache.clear();
            res.json({ success: true }); 
        } catch (err) { 
            logger.error(`ALL ATTEMPTS FAILED`, err);
            res.status(500).json({ error: err.message }); 
        } 
    }
});

// --- MIDDLEWARE TOOLS (WEB SEARCH) ---
async function performWebSearch(query) {
    try {
        logger.info(`[Web Search] Buscando na web por: "${query}"`);
        const fetch = (...args) => import('node-fetch').then(({default: fetch}) => fetch(...args));
        
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 15000); // 15 segundos de limite
        
        const res = await fetch(`https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`, {
            headers: { 
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
                'Accept-Language': 'en-US,en;q=0.5'
            },
            signal: controller.signal
        });
        
        clearTimeout(timeoutId);
        
        const text = await res.text();
        const snippets = [];
        const regex = /<a class="result__snippet[^>]*>(.*?)<\/a>/gi;
        let match;
        while ((match = regex.exec(text)) !== null && snippets.length < 5) {
            snippets.push(match[1].replace(/<\/?[^>]+(>|$)/g, "").trim());
        }
        if (snippets.length === 0) {
             if (text.toLowerCase().includes('robot') || text.toLowerCase().includes('captcha')) {
                 return "A busca falhou pois o motor de busca bloqueou o pedido (Anti-Bot/Captcha). Diga ao utilizador que não conseguiu pesquisar na internet.";
             }
             return "Nenhum resultado de busca encontrado para esta query.";
        }
        return snippets.map((s, i) => `[Resultado ${i+1}]: ${s}`).join("\n\n");
    } catch (e) {
        logger.error('[Web Search] Falha', e);
        if (e.name === 'AbortError') return "A busca falhou por Timeout (demorou mais de 15 segundos). Diga ao utilizador que o serviço de pesquisa está temporariamente indisponível.";
        return "Erro ao realizar a busca na internet: " + e.message;
    }
}

const WEB_SEARCH_TOOL = { type: 'function', function: { name: 'centraliza_web_search', description: 'Pesquisa informações atuais na internet (DuckDuckGo). Use para fatos recentes, notícias ou documentações.', parameters: { type: 'object', properties: { query: { type: 'string', description: 'Termo de busca exato' } }, required: ['query'] } } };

// --- API GATEWAY: OPENAI COMPATIBLE ---
// Allows Centraliza.ai to act as a drop-in replacement for OpenAI API clients (like Continue.dev, AutoGen, etc)
app.post('/v1/chat/completions', async (req, res) => {
    logDebugPayload('INCOMING REQUEST', { url: req.originalUrl, body: req.body });
    const { model, messages, stream = false, endpoint } = req.body;

    if (!model || !messages || !Array.isArray(messages)) {
        return res.status(400).json({ error: 'Invalid payload. Model and messages array are required.' });
    }

    let targetModel = model;
    if (model === 'centraliza-router') {
        let routerModel = config.activeRouterModel;
        if (!routerModel) {
            // Descoberta automática (RF-045): usa o modelo que o motor local serve.
            try {
                const modelsRes = await fetch(`http://127.0.0.1:${llamaEnginePort()}/v1/models`, { signal: AbortSignal.timeout(1200) });
                if (modelsRes.ok) {
                    const data = await modelsRes.json();
                    routerModel = (data && Array.isArray(data.data) && data.data[0] && data.data[0].id) || null;
                }
            } catch (e) { /* sem motor local */ }
        }
        if (!routerModel) {
            return res.status(400).json({
                error: {
                    message: 'Centraliza.AI: Nenhum modelo ativo para o roteador "centraliza-router".\nAbra a página Centraliza Coder, clique em "Iniciar Motor" (ou escolha um modelo no seletor) e tente novamente.',
                    type: 'invalid_request_error',
                    code: 'no_active_model'
                }
            });
        }
        targetModel = routerModel;
    }

    // Default to Ollama's Native OpenAI compatible endpoint instead of legacy /api/chat
    let targetEndpoint = endpoint;
    if (!targetEndpoint || targetEndpoint === 'http://127.0.0.1:11434/api/chat' || targetEndpoint === 'http://127.0.0.1:11434/api/generate') {
        targetEndpoint = 'http://127.0.0.1:11434/v1/chat/completions';
    }

    const isLocalGguf = targetModel.includes(path.sep) || targetModel.includes('/') || targetModel.toLowerCase().endsWith('.gguf');
    const llamaRunning = !!(await httpGetOk(`http://127.0.0.1:${llamaEnginePort()}/health`, 900));
    const servedModels = llamaRunning ? await llamaServedModels() : [];
    const llamaServesTarget = llamaRunning && (targetModel === llamaAlias() || servedModels.includes(targetModel));

    if (activeLlamaProcess && targetModel === currentLlamaModel) {
        targetEndpoint = `http://127.0.0.1:${currentLlamaPort}/v1/chat/completions`;
    } else if (llamaServesTarget || (isLocalGguf && llamaRunning)) {
        // Motor llama.cpp (gerido pela app ou lançado externamente) serve este modelo.
        targetEndpoint = `http://127.0.0.1:${llamaEnginePort()}/v1/chat/completions`;
    } else if (isLocalGguf) {
        return res.status(400).json({
            error: {
                message: 'Centraliza.AI: O motor de IA não está a correr para este modelo local.\nClique em "Iniciar Motor" na página Centraliza Coder e tente novamente.',
                type: 'invalid_request_error',
                code: 'engine_offline'
            }
        });
    }

    const finalMessages = [...messages];

    // Qwen3 thinking is controlled via the Jinja template kwarg `enable_thinking`, NOT via
    // text tokens in the system/user message. The kwarg is injected per-request below (see
    // chat_template_kwargs) and at server startup (--reasoning off). No text injection needed.

    // --- RAG RETRIEVAL INJECTION ---
    // If documents are loaded in memory, inject their full content as context.
    if (globalDocuments.length > 0) {
        logger.info(`[RAG] Found ${globalDocuments.length} documents in memory. Injecting all content as context.`);
        
        // Concatenate all chunks from all documents into a single string, identifying each file
        const allContent = globalDocuments.map(doc => `--- CONTEÚDO DO FICHEIRO: ${doc.filename} ---\n\n${doc.chunks.join('\n\n')}`).join('\n\n---\n\n');
    
        const contextStr = `O utilizador anexou ${globalDocuments.length} documento(s). O conteúdo completo está abaixo. Use esta informação como a fonte primária e única de verdade para responder ao pedido do utilizador.\n\n[CONTEXTO DOS DOCUMENTOS ANEXADOS]:\n"""\n${allContent}\n"""\n\nBaseado estritamente no contexto acima, responda ao pedido do utilizador.`;
    
        // Inject the context into the system prompt or create a new one.
        let systemMessage = finalMessages.find(m => m.role === 'system');
        if (systemMessage) {
            systemMessage.content = contextStr + '\n\n' + systemMessage.content;
        } else {
            finalMessages.unshift({ role: 'system', content: contextStr });
        }
    }

    // --- VRAM SHIELD v2: SMART COMPACTION WITH INTELLIGENT SUMMARIZATION ---
    // Protege a placa de vídeo com compaction inteligente e monitoramento de métricas
    
    // CORREÇÃO CRÍTICA DO ESTOURO DE CONTEXTO:
    // Agentes (como Claude Code/Roo) enviam max_tokens gigantes (ex: 64000) esperando modelos na nuvem.
    // O Gateway deve limitar-se SEMPRE ao teto físico real (vramShieldLimit) para proteger o motor.
    const hardwareLimit = config.vramShieldLimit || 32768;
    let realCtxLimit = hardwareLimit;
    // Se for o motor nativo Llama.cpp a correr, alinhamos estritamente ao contexto alocado no boot (Evita Crashes).
    // Quando o utilizador iniciou o motor explicitamente com um contexto maior (ex.: 1M), o KV já foi
    // alocado com -c nesse valor — respeitamos essa escolha em vez de a limitar ao vramShieldLimit.
    if (activeLlamaProcess && targetModel === currentLlamaModel) {
        realCtxLimit = Math.max(hardwareLimit, currentLlamaCtx);
    }
    const requestCtx = req.body.num_ctx ? Math.min(req.body.num_ctx, realCtxLimit) : realCtxLimit;

    // Código e JSON tokenizam mais denso (~2.5 chars/token vs 3.5 para texto).
    // Margem de 75% para deixar espaço para resposta do modelo.
    const SAFE_TOKEN_LIMIT = Math.floor(requestCtx * 0.75);

    // Roo Code sends 20+ tool definitions with full schemas — this can be 30-50k chars.
    // Reserve those tokens so the message compaction budget is accurate.
    const incomingToolsChars = JSON.stringify(req.body.tools || []).length;
    const incomingToolsTokens = Math.ceil(incomingToolsChars / 2.5);
    const effectiveTokenLimit = Math.max(2000, SAFE_TOKEN_LIMIT - incomingToolsTokens);
    const CHAR_LIMIT = Math.floor(effectiveTokenLimit * 2.5);

    // Nenhuma leitura de arquivo individual deve ocupar mais de 50% do payload
    const INDIVIDUAL_MSG_LIMIT = Math.floor(CHAR_LIMIT * 0.50);

    // --- METRICS: Track compaction effectiveness ---
    let totalMessagesBefore = finalMessages.length;
    let totalCharsBefore = 0;
    let truncatedMessages = 0;
    let droppedMessages = 0;
    
    // Helper: Summarize large content intelligently
    const summarizeContent = (content, maxLen) => {
        if (typeof content !== 'string') return content;
        if (content.length <= maxLen) return content;
        
        // Smart truncation: keep beginning and end, summarize middle
        const keepStart = Math.floor(maxLen * 0.4);
        const keepEnd = Math.floor(maxLen * 0.4);
        const summaryLen = maxLen - keepStart - keepEnd;
        
        // Find a good truncation point (avoid cutting mid-line)
        const startCut = content.substring(0, keepStart);
        const endCut = content.substring(content.length - keepEnd);
        
        // Create a summary of the middle section
        const middleSummary = `\n\n... [CONTENT SUMMARY: ${(content.length / 1000).toFixed(1)}KB omitted. Key sections preserved.] ...\n\n`;
        
        return startCut + middleSummary + endCut;
    };

    // 1. Trunca respostas individuais gigantes com sumarização inteligente
    finalMessages.forEach(msg => {
        if (typeof msg.content === 'string' && msg.content.length > INDIVIDUAL_MSG_LIMIT && msg.role !== 'system') {
            truncatedMessages++;
            logger.warn(`[VRAM SHIELD] Mensagem gigante de ${msg.content.length} chars detectada no papel '${msg.role}'. Aplicando sumarização inteligente.`);
            msg.content = summarizeContent(msg.content, INDIVIDUAL_MSG_LIMIT);
        } else if (Array.isArray(msg.content)) {
            // Caso o payload venha num array (ex: multimodal)
            msg.content.forEach(item => {
                if (item.type === 'text' && item.text && item.text.length > INDIVIDUAL_MSG_LIMIT) {
                    truncatedMessages++;
                    logger.warn(`[VRAM SHIELD] Conteúdo multimodal gigante detectado. Aplicando sumarização.`);
                    item.text = summarizeContent(item.text, INDIVIDUAL_MSG_LIMIT);
                }
            });
        }
    });

    // 2. Sliding Window com compaction inteligente e métricas
    let currentChars = 0;
    const systemMsgs = finalMessages.filter(m => m.role === 'system');
    const nonSystemMsgs = finalMessages.filter(m => m.role !== 'system');
    
    systemMsgs.forEach(m => currentChars += (typeof m.content === 'string' ? m.content.length : JSON.stringify(m.content).length));
    
    const compactedMessages = [];
    let lastTruncatedMsg = null;
    
    // Adicionamos as mensagens de trás para frente (garantindo que o agente se lembre da ação mais recente)
    for (let i = nonSystemMsgs.length - 1; i >= 0; i--) {
        const msg = nonSystemMsgs[i];
        const msgLen = (typeof msg.content === 'string' ? msg.content.length : JSON.stringify(msg.content ?? null).length)
                     + (msg.tool_calls ? JSON.stringify(msg.tool_calls).length : 0);
        
        if (currentChars + msgLen > CHAR_LIMIT) {
            // Correção da Falha da Última Mensagem:
            // Se o histórico de mensagens antigas for removido, mas a ÚLTIMA AÇÃO do agente SOZINHA
            // for maior que a margem, nós a cortamos à força (em vez de descartá-la inteira).
            if (compactedMessages.length === 0) {
                 logger.warn(`[VRAM SHIELD] Apenas a última mensagem já excede a VRAM restante. Truncando agressivamente.`);
                 const allowedLen = Math.max(4000, CHAR_LIMIT - currentChars - 500); // Garante 4000 chars mínimos
                 if (typeof msg.content === 'string') {
                     msg.content = msg.content.substring(0, allowedLen) + "\n\n... [SYSTEM WARNING: EXTREME TRUNCATION APPLIED. YOUR LAST TOOL OUTPUT WAS IMMENSE.]";
                 } else if (Array.isArray(msg.content)) {
                     const textItem = msg.content.find(x => x.type === 'text');
                     if (textItem && textItem.text) {
                         textItem.text = textItem.text.substring(0, allowedLen) + "\n\n... [SYSTEM WARNING: EXTREME TRUNCATION APPLIED.]";
                     }
                 }
                 compactedMessages.unshift(msg);
            } else {
                 droppedMessages += nonSystemMsgs.length - i;
                 logger.warn(`[VRAM SHIELD] Histórico antigo do agente descartado: ${droppedMessages} mensagens removidas.`);
            }
            break; // Atingiu o teto
        }
        currentChars += msgLen;
        compactedMessages.unshift(msg);
    }
    
    // Log compaction metrics
    const totalCharsAfter = compactedMessages.reduce((sum, msg) =>
        sum + (typeof msg.content === 'string' ? msg.content.length : JSON.stringify(msg.content).length), 0
    );
    const reductionPercent = ((totalCharsBefore - totalCharsAfter) / totalCharsBefore * 100).toFixed(1);
    
    logger.info(`[VRAM SHIELD] Compaction summary: ${totalMessagesBefore} → ${compactedMessages.length} msgs, ${truncatedMessages} truncated, ${droppedMessages} dropped, ${reductionPercent}% reduction`);
    
    // Reescreve a payload da requisição com as mensagens compactadas
    finalMessages.length = 0;
    finalMessages.push(...systemMsgs, ...compactedMessages);
    // --- END VRAM SHIELD v2 ---

    // Preserve all original OpenAI properties (tools, temperature, etc) but replace model and messages
    const finalPayload = {
        ...req.body,
        model: targetModel,
        messages: finalMessages
    };
    // O llama.cpp expõe o modelo pelo alias configurado (--alias), não pelo path:
    // usa o id realmente servido para evitar rejeições do motor.
    if (servedModels.length && targetEndpoint.includes(`:${llamaEnginePort()}`)) {
        finalPayload.model = servedModels[0];
    }
    
    // Se o cliente (ex: Roo Code) já fornecer as suas próprias tools, NÃO INJETAMOS o web search.
    // Isso previne confusão no Agente Autónomo e protege a fluidez do Streaming (SSE).
    if (!finalPayload.tools || finalPayload.tools.length === 0) {
        finalPayload.tools = [WEB_SEARCH_TOOL];
    }

    delete finalPayload.endpoint; // Remove internal routing param

    // Disable Qwen3-family thinking via Jinja template kwarg.
    // The model's chat template checks `enable_thinking` (not text tokens in messages).
    // This generates <think>\n\n</think>\n\n (empty think block) instead of <think>\n (real thinking).
    if (targetEndpoint.includes(`${currentLlamaPort}`)) {
        finalPayload.chat_template_kwargs = { enable_thinking: false };
    }

    // Cap max_tokens so estimated_prompt_tokens + max_tokens <= realCtxLimit
    {
        const estimatedPromptTokens = Math.ceil(
            (finalPayload.messages.reduce((acc, m) => {
                const contentLen = typeof m.content === 'string' ? m.content.length : JSON.stringify(m.content ?? null).length;
                const toolCallsLen = m.tool_calls ? JSON.stringify(m.tool_calls).length : 0;
                return acc + contentLen + toolCallsLen;
            }, 0) + JSON.stringify(finalPayload.tools || []).length) / 2.5
        );
        const maxAllowedOutput = Math.max(512, realCtxLimit - estimatedPromptTokens - 200);
        if (finalPayload.max_tokens && finalPayload.max_tokens > maxAllowedOutput) {
            logger.warn(`[API Gateway] max_tokens capped ${finalPayload.max_tokens} → ${maxAllowedOutput} (prompt est. ${estimatedPromptTokens} tokens).`);
            finalPayload.max_tokens = maxAllowedOutput;
        }
    }

    logger.info(`[API Gateway] Transparent routing to ${targetEndpoint} for model: ${targetModel} (Stream: ${stream})`);
    logDebugPayload('OUTGOING PAYLOAD TO ENGINE', { endpoint: targetEndpoint, payload: finalPayload });

    try {
        let response;
        let retryCount = 0;
        const controller = new AbortController();

        res.on('close', () => {
             if (!res.writableEnded) {
                 logger.info('[API Gateway] Client disconnected prematurely, aborting upstream request.');
                 controller.abort();
             }
        });

        let maxIterations = 3;
        let currentIteration = 0;
        let streamFinished = false;

        // Moved outside the loop to persist across agent iterations
        let headersSentToClient = false;
        const sendHeaders = () => {
            if (!res.headersSent && !headersSentToClient) {
                res.setHeader('Content-Type', 'text/event-stream');
                res.setHeader('Cache-Control', 'no-cache');
                res.setHeader('Connection', 'keep-alive');
                res.flushHeaders(); // Evita que o NodeJS bloqueie os headers no buffer
                headersSentToClient = true;
            }
        };

        logger.info(`[API Gateway] [AUDIT] Iniciando fluxo de geração. Prevenção de loop ativada: Máximo de ${maxIterations} iterações.`);

        while (currentIteration < maxIterations && !streamFinished) {
            currentIteration++;
            logger.info(`[API Gateway] [AUDIT] Iteração ${currentIteration}/${maxIterations} em andamento.`);
            
            while (retryCount < 5) {
                try {
                    response = await fetch(targetEndpoint, {
                        method: 'POST',
                        body: JSON.stringify(finalPayload),
                        headers: { 'Content-Type': 'application/json' },
                        signal: controller.signal
                    });
                } catch (fetchErr) {
                    logDebugPayload('FETCH ERROR', { attempt: retryCount+1, error: fetchErr.message });
                    if (fetchErr.name === 'AbortError') {
                        logger.info('[API Gateway] Upstream request aborted successfully.');
                        if (!res.headersSent) res.end();
                        return;
                    }
                    logger.warn(`[API Gateway] Falha ao conectar com motor (${retryCount+1}/5): ${fetchErr.message}`);
                    await new Promise(r => setTimeout(r, 2000));
                    retryCount++;
                    continue;
                }

                if (!response.ok) {
                    if (response.status === 503) {
                        logger.info(`[API Gateway] 503 Received. Engine might still be loading or warming up. Retrying... (${retryCount+1}/5)`);
                        await new Promise(r => setTimeout(r, 2000));
                        retryCount++;
                        continue;
                    }
                    const errText = await response.text();
                    
                    // Fallback: Modelos podem rejeitar tools retornando diversos erros (invalid_request, not supported)
                    if (response.status === 400 && (errText.toLowerCase().includes('tool') || errText.toLowerCase().includes('function') || errText.toLowerCase().includes('invalid'))) {
                        // Context overflow: emergency recompact and retry instead of failing
                        if (errText.toLowerCase().includes('context') || errText.toLowerCase().includes('exceed')) {
                            let errObj = {};
                            try { errObj = JSON.parse(errText); } catch(e) {}
                            const errDetails = errObj?.error || {};
                            const nPrompt = errDetails.n_prompt_tokens || 0;
                            const nCtx = errDetails.n_ctx || realCtxLimit;

                            if (retryCount < 3) {
                                const targetChars = Math.floor((nCtx * 0.70) * 2.5);
                                const sMsgs = finalPayload.messages.filter(m => m.role === 'system');
                                const nsMsgs = finalPayload.messages.filter(m => m.role !== 'system');
                                let chars = sMsgs.reduce((a, m) => a + (typeof m.content === 'string' ? m.content.length : JSON.stringify(m.content).length), 0);
                                const kept = [];
                                for (let i = nsMsgs.length - 1; i >= 0; i--) {
                                    const l = typeof nsMsgs[i].content === 'string' ? nsMsgs[i].content.length : JSON.stringify(nsMsgs[i].content).length;
                                    if (chars + l > targetChars) break;
                                    chars += l;
                                    kept.unshift(nsMsgs[i]);
                                }
                                finalPayload.messages = [...sMsgs, ...kept];
                                logger.warn(`[API Gateway] Context exceeded (${nPrompt}/${nCtx}). Emergency compaction: ${nsMsgs.length} → ${kept.length} msgs. Retrying...`);
                                retryCount++;
                                continue;
                            }
                            logDebugPayload('CONTEXT EXCEEDED UNRECOVERABLE', { status: response.status, body: errText });
                            throw new Error(`O tamanho do prompt excedeu o limite de contexto mesmo após compactação de emergência.`);
                        }
                        logger.warn(`[API Gateway] Erro 400 (Possível recusa de tools). Removendo tools e tentando novamente... Detalhes: ${errText}`);
                        delete finalPayload.tools;
                        delete finalPayload.tool_choice;
                        retryCount++;
                        continue;
                    }
                    
                    logDebugPayload('UPSTREAM REJECTED', { status: response.status, body: errText });
                    throw new Error(`Upstream error: ${response.status} - ${errText}`);
                }
                break;
            }

            if (!response || !response.ok) {
                logDebugPayload('UPSTREAM FAILURE', 'Target endpoint unreachable.');
                throw new Error(`Upstream error: Target endpoint unreachable.`);
            }

            if (stream) {
                const decoder = new TextDecoder();
                let buffer = '';
                
                let interceptingTool = false;
                let interceptedToolName = '';
                let interceptedToolArgs = '';
                let interceptedToolId = '';
                let chunkCache = [];
                let passThrough = false;
                let doneSent = false;
                
                try {
                    for await (const chunk of response.body) {
                        buffer += decoder.decode(chunk, { stream: true });
                        // Separação flexível por linha única lida perfeitamente com \n\n do OpenAI ou falhas do llama.cpp
                        let parts = buffer.split(/\r?\n/);
                        buffer = parts.pop(); 
                        
                        for (const part of parts) {
                            const trimmed = part.trim();
                            if (!trimmed) continue;
                            
                            if (trimmed === 'data: [DONE]') {
                                chunkCache.push(trimmed + '\n\n');
                                if (passThrough) res.write(trimmed + '\n\n');
                                doneSent = true;
                                continue;
                            }
                            
                            if (!trimmed.startsWith('data: ')) {
                                // Buggy engines podem retornar 200 OK com JSON puro de erro em vez de SSE
                                if (trimmed.startsWith('{"error"')) {
                                    logger.error('[API Gateway] Upstream retornou JSON de erro no stream: ' + trimmed);
                                    if (!headersSentToClient) {
                                        res.status(500).setHeader('Content-Type', 'application/json');
                                        res.write(trimmed);
                                        res.end();
                                        headersSentToClient = true;
                                    } else res.end();
                                    streamFinished = true;
                                    return;
                                }
                                if (passThrough) res.write(part + '\n');
                                continue;
                            }
                            
                            const dataStr = trimmed.replace(/^data:\s*/, '');
                            let dataObj;
                            try {
                                dataObj = JSON.parse(dataStr);
                            } catch(e) {
                                if (passThrough) res.write(trimmed + '\n\n');
                                continue;
                            }

                            // Strip reasoning_content (Qwen3 thinking tokens) before forwarding.
                            // OpenAI-compatible clients (Roo Code, etc.) only read delta.content —
                            // receiving reasoning_content-only chunks causes "no assistant messages".
                            let chunkToForward = trimmed;
                            if (dataObj.choices?.[0]?.delta?.reasoning_content !== undefined) {
                                delete dataObj.choices[0].delta.reasoning_content;
                                chunkToForward = 'data: ' + JSON.stringify(dataObj);
                            }

                            const delta = dataObj.choices?.[0]?.delta;
                            if (delta?.tool_calls?.length > 0) {
                                const tc = delta.tool_calls[0];
                                if (tc.function?.name) {
                                    if (tc.function.name === 'centraliza_web_search') {
                                        interceptingTool = true;
                                        interceptedToolName = tc.function.name;
                                        interceptedToolId = tc.id || `call_${Date.now()}`;
                                    } else {
                                        if (!passThrough) {
                                            logger.info(`[API Gateway] [AUDIT] Repassando ferramenta '${tc.function.name}' para o Roo Code.`);
                                        }
                                        passThrough = true;
                                        sendHeaders();
                                        chunkCache.forEach(c => res.write(c));
                                        chunkCache = [];
                                    }
                                }
                                if (interceptingTool && tc.function?.arguments) interceptedToolArgs += tc.function.arguments;
                            } else if (delta !== undefined) {
                                // Tem conteúdo (mesmo vazio) ou role. Abrir portas para o Roo!
                                if (!interceptingTool && !passThrough) {
                                    passThrough = true;
                                    sendHeaders();
                                    chunkCache.forEach(c => res.write(c));
                                    chunkCache = [];
                                }
                            }

                            if (interceptingTool) chunkCache.push(chunkToForward + '\n\n');
                            else if (passThrough) res.write(chunkToForward + '\n\n');
                            else chunkCache.push(chunkToForward + '\n\n');
                        }
                    }
                    
                    // Despejar qualquer buffer remanescente vital preso na memória
                    if (buffer.trim()) {
                        const trimmed = buffer.trim();
                        if (trimmed.startsWith('data: ') && passThrough) res.write(trimmed + '\n\n');
                    }
                    
                    if (interceptingTool && interceptedToolName === 'centraliza_web_search') {
                        let query = '';
                        try { query = JSON.parse(interceptedToolArgs).query; } catch(e) { query = interceptedToolArgs; }
                        
                        logger.info(`[API Gateway] [AUDIT] Ferramenta '${interceptedToolName}' acionada. Resolvendo e aguardando resposta...`);
                        const searchResults = await performWebSearch(query);
                        
                        finalPayload.messages.push({ role: 'assistant', content: '', tool_calls: [{ id: interceptedToolId, type: 'function', function: { name: 'centraliza_web_search', arguments: interceptedToolArgs } }] });
                        finalPayload.messages.push({ role: 'tool', tool_call_id: interceptedToolId, name: 'centraliza_web_search', content: searchResults });
                        
                        if (currentIteration >= maxIterations) {
                            logger.warn(`[API Gateway] [AUDIT] Limite de segurança atingido (${maxIterations}/${maxIterations})! Quebrando o loop do modelo para evitar execuções infinitas.`);
                            if (!headersSentToClient) sendHeaders();
                            res.write(`data: ${JSON.stringify({ choices: [{ delta: { content: "\n\n*[AVISO DO SISTEMA: O modelo atingiu o limite máximo de execuções encadeadas de ferramentas. O loop foi interrompido para sua proteção.]*" } }] })}\n\n`);
                            res.write('data: [DONE]\n\n');
                            res.end();
                            streamFinished = true;
                        } else {
                            retryCount = 0; 
                            continue; 
                        }
                    } else {
                        if (!headersSentToClient) sendHeaders();
                        if (!passThrough) chunkCache.forEach(c => res.write(c));
                        
                        // PREVENÇÃO CRÍTICA PARA O ROO CODE: Injetar manualmente o [DONE] final se o motor não o enviou
                        if (!doneSent) {
                             res.write('data: [DONE]\n\n');
                        }
                        res.end();
                        streamFinished = true;
                    }
                } catch (err) {
                    logger.warn('Stream response body error: ', err);
                    if (!headersSentToClient) res.status(500).json({ error: { message: err.message } });
                    else res.end();
                    streamFinished = true;
                }
            } else {
                const rawText = await response.text();
                if (!rawText.trim()) throw new Error('O motor de IA retornou uma resposta vazia.');
                
                try {
                    const dataObj = JSON.parse(rawText);
                    const tc = dataObj.choices?.[0]?.message?.tool_calls?.[0];
                    
                    if (tc && tc.function?.name === 'centraliza_web_search') {
                        let query = '';
                        try { query = JSON.parse(tc.function.arguments).query; } catch(e) { query = tc.function.arguments; }
                        
                        logger.info(`[API Gateway] [AUDIT] Ferramenta '${tc.function.name}' executada (non-stream).`);
                        const searchResults = await performWebSearch(query);
                        
                        finalPayload.messages.push(dataObj.choices[0].message);
                        finalPayload.messages.push({ role: 'tool', tool_call_id: tc.id, name: 'centraliza_web_search', content: searchResults });
                        
                        if (currentIteration >= maxIterations) {
                            logger.warn(`[API Gateway] [AUDIT] Limite de segurança de ${maxIterations} iterações atingido! Parando o agente (non-stream).`);
                            dataObj.choices[0].message.content = (dataObj.choices[0].message.content || '') + "\n\n*[AVISO DO SISTEMA: Loop interrompido. Limite máximo de chamadas de ferramenta alcançado.]*";
                            delete dataObj.choices[0].message.tool_calls;
                            res.setHeader('Content-Type', 'application/json');
                            res.send(JSON.stringify(dataObj));
                            streamFinished = true;
                        } else {
                            retryCount = 0;
                            continue;
                        }
                    } else {
                        res.setHeader('Content-Type', 'application/json');
                        res.send(rawText);
                        streamFinished = true;
                    }
                } catch (e) {
                    res.setHeader('Content-Type', 'application/json');
                    res.send(rawText);
                    streamFinished = true;
                }
            }
        }
    } catch (e) {
        logger.error('[API Gateway] Error routing completion request', e);
        if (e.name !== 'AbortError') {
            if (!res.headersSent) {
                // Padronização OpenAI Compatible rigorosa para extensões
                res.status(500).json({ error: { message: 'AI Gateway Error: ' + e.message, type: 'server_error', code: 500 } });
            } else {
                res.end();
            }
        }
    }
});

// --- API GATEWAY: MOCK OPENAI MODELS ---
// Essencial para evitar que extensões (Roo/Continue) congelem ao tentar validar a ligação.
// SEMPRE retorna 'centraliza-router' — o ID que o Roo Code e Continue.dev estão configurados
// para usar. Retornar o path GGUF causaria mismatch de validação nas extensões.
app.get('/v1/models', (req, res) => {
    res.json({
        object: 'list',
        data: [
            {
                id: 'centraliza-router',
                object: 'model',
                created: Math.floor(Date.now() / 1000),
                owned_by: 'centraliza'
            }
        ]
    });
});

// --- RAG (RETRIEVAL-AUGMENTED GENERATION) SYSTEM ---
const multer = require('multer');
const pdfParse = require('pdf-parse');
const mammoth = require('mammoth');
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } }); // 10MB limit

// Basic in-memory document store
let globalDocuments = [];

app.post('/api/documents/upload', upload.single('document'), async (req, res) => {
    if (!req.file) return res.status(400).json({ error: 'No file uploaded.' });

    // Check if limit of 5 documents has been reached
    if (globalDocuments.length >= 5) {
        return res.status(400).json({ error: 'Maximum limit of 5 documents reached. Please remove some files first.' });
    }

    try {
        logger.info(`[RAG] Processing document: ${req.file.originalname}`);
        let extractedText = '';

        if (req.file.mimetype === 'application/pdf') {
            const data = await pdfParse(req.file.buffer);
            extractedText = data.text;
        } else if (req.file.mimetype === 'text/plain') {
            extractedText = req.file.buffer.toString('utf8');
        } else if (req.file.originalname.endsWith('.docx')) {
            const result = await mammoth.extractRawText({ buffer: req.file.buffer });
            extractedText = result.value;
        } else {
            return res.status(400).json({ error: 'Unsupported file type. Use PDF, TXT or DOCX.' });
        }

        // Chunking the text (Basic naive chunking by ~1000 characters)
        const cleanText = extractedText.replace(/\n+/g, ' ').replace(/\s+/g, ' ');
        const chunkSize = 1000;
        const chunks = [];
        for (let i = 0; i < cleanText.length; i += chunkSize) {
            chunks.push(cleanText.substring(i, i + chunkSize));
        }

        globalDocuments.push({
            filename: req.file.originalname,
            chunks: chunks,
            uploadedAt: Date.now()
        });

        logger.info(`[RAG] Document indexed into ${chunks.length} chunks.`);
        res.json({ success: true, message: `Document ${req.file.originalname} processed.`, chunks: chunks.length, document: { filename: req.file.originalname, chunks: chunks.length, id: globalDocuments[globalDocuments.length-1].uploadedAt } });
    } catch (e) {
        logger.error('[RAG] Error processing document', e);
        res.status(500).json({ error: 'Failed to process document: ' + e.message });
    }
});

app.delete('/api/documents/:id', (req, res) => {
    const id = parseInt(req.params.id);
    globalDocuments = globalDocuments.filter(d => d.uploadedAt !== id);
    logger.info(`[RAG] Document ${id} cleared from memory.`);
    res.json({ success: true, message: 'Document removed.' });
});

app.delete('/api/documents', (req, res) => {
    globalDocuments = [];
    logger.info('[RAG] Document memory cleared.');
    res.json({ success: true, message: 'All documents cleared from memory.' });
});

app.get('/api/documents', (req, res) => {
    res.json(globalDocuments.map(d => ({ filename: d.filename, chunks: d.chunks.length, id: d.uploadedAt })));
});


// --- NATIVE INFERENCE ENGINE STATE ---
let activeLlamaProcess = null;
let currentLlamaPort = 8080;
let currentLlamaModel = null;
let currentLlamaCtx = 2048;

// ---- llama.cpp helpers ----
let cachedPhysicalCores = null;

// Número de núcleos físicos (não lógicos) da máquina, com cache.
async function getPhysicalCoreCount() {
    if (cachedPhysicalCores) return cachedPhysicalCores;
    try {
        if (os.platform() === 'win32') {
            const psCmd = `powershell -NoProfile -Command "(Get-CimInstance Win32_Processor | Measure-Object -Property NumberOfCores -Sum).Sum"`;
            const { stdout } = await promisify(exec)(psCmd, { timeout: 10000 });
            const n = parseInt(String(stdout).trim(), 10);
            if (n > 0) { cachedPhysicalCores = n; return n; }
        } else if (os.platform() === 'darwin') {
            const { stdout } = await promisify(exec)('sysctl -n hw.physicalcpu', { timeout: 5000 });
            const n = parseInt(String(stdout).trim(), 10);
            if (n > 0) { cachedPhysicalCores = n; return n; }
        } else {
            // Linux: conta pares únicos de physical id + core id em /proc/cpuinfo
            const cpuinfo = fs.readFileSync('/proc/cpuinfo', 'utf8');
            const ids = new Set();
            let phys = null, core = null;
            for (const line of cpuinfo.split('\n')) {
                if (line.startsWith('physical id')) phys = line.split(':')[1].trim();
                else if (line.startsWith('core id')) core = line.split(':')[1].trim();
                else if (line.trim() === '') {
                    if (phys !== null && core !== null) ids.add(`${phys}:${core}`);
                    phys = null; core = null;
                }
            }
            if (ids.size > 0) { cachedPhysicalCores = ids.size; return ids.size; }
        }
    } catch (e) { /* usa fallback abaixo */ }
    cachedPhysicalCores = os.cpus().length; // fallback: núcleos lógicos
    return cachedPhysicalCores;
}

// Converte uma string de argumentos em tokens, respeitando aspas.
function tokenizeArgs(str) {
    const tokens = [];
    const re = /"([^"]*)"|'([^']*)'|(\S+)/g;
    let m;
    while ((m = re.exec(str)) !== null) {
        tokens.push(m[1] !== undefined ? m[1] : (m[2] !== undefined ? m[2] : m[3]));
    }
    return tokens;
}

// Converte uma string de argumentos ("-t 8 --flash-attn auto ...") na lista
// estruturada usada pelas checkboxes da UI: [{ arg, value, enabled }].
// Um token que começa por "-" é uma flag; o token seguinte é o valor dela
// (a menos que também comece por "-", caso em que a flag não tem valor).
function parseArgsToList(str) {
    const tokens = tokenizeArgs(String(str || '').trim());
    const list = [];
    for (let i = 0; i < tokens.length; i++) {
        const tok = tokens[i];
        const next = tokens[i + 1];
        if (tok.startsWith('-') && next !== undefined && !next.startsWith('-')) {
            list.push({ arg: tok, value: next, enabled: true });
            i++; // consome o valor
        } else {
            list.push({ arg: tok, value: '', enabled: true });
        }
    }
    return list;
}

// Reconstrói a string clássica ("-t 8 --flash-attn auto") a partir da lista
// estruturada — apenas parâmetros ativos, espelhando o que é executado.
// Mantém a compatibilidade com llamaCppArgs em config.json.
function listToArgsString(list) {
    return (Array.isArray(list) ? list : [])
        .filter(x => x && x.enabled !== false && typeof x.arg === 'string' && x.arg.trim())
        .map(x => {
            const arg = x.arg.trim();
            const val = String(x.value || '').trim();
            return val ? `${arg} ${val}` : arg;
        })
        .join(' ');
}

// Converte a lista estruturada em tokens finais para o spawn, aplicando a
// substituição de $physicalCores e ignorando parâmetros desativados.
function buildArgsFromList(list, cores) {
    const out = [];
    for (const x of (Array.isArray(list) ? list : [])) {
        if (!x || !x.enabled) continue;
        const arg = String(x.arg || '').trim().replace(/\$physicalCores/gi, String(cores));
        if (!arg) continue;
        const val = String(x.value || '').trim().replace(/\$physicalCores/gi, String(cores));
        out.push(arg);
        if (val) out.push(val);
    }
    return out;
}

// Extrai a porta (--port N ou -p N) dos argumentos, se presente.
function extractPort(args) {
    for (let i = 0; i < args.length - 1; i++) {
        if (args[i] === '--port' || args[i] === '-p') {
            const p = parseInt(args[i + 1], 10);
            if (p > 0) return p;
        }
    }
    return null;
}

// Caminho resolvido do binário llama-server (configurado ou nome simples).
function resolveLlamaBinary() {
    const bin = (config.llamaCppBinary || '').trim();
    if (!bin) return os.platform() === 'win32' ? 'llama-server.exe' : 'llama-server';
    return bin;
}

// Verifica se o binário configurado existe (só para caminhos com separador).
function llamaBinaryExists() {
    const bin = (config.llamaCppBinary || '').trim();
    if (!bin) return null;
    if (!/[\\/]/.test(bin)) return null; // nome simples → procura no PATH
    return fs.existsSync(bin);
}

// Monta a lista final de argumentos: base + extras (extras têm prioridade).
async function buildLlamaArgs(modelPath, ctx, ngl) {
    const cores = await getPhysicalCoreCount();
    const base = ['-m', modelPath, '-c', String(ctx), '-ngl', String(ngl), '--reasoning', 'off'];
    let extras;
    if (Array.isArray(config.llamaCppArgsList) && config.llamaCppArgsList.length) {
        extras = buildArgsFromList(config.llamaCppArgsList, cores);
    } else {
        extras = tokenizeArgs(String(config.llamaCppArgs || '').replace(/\$physicalCores/gi, String(cores)));
    }
    return [...base, ...extras];
}

// Encerra o processo ativo do motor (taskkill com PID ou nome da imagem).
function killActiveLlama(bin) {
    return new Promise(r => {
        if (os.platform() === 'win32') {
            const image = (bin && path.basename(bin)) || 'llama-server.exe';
            const killCmd = activeLlamaProcess && activeLlamaProcess.pid
                ? `taskkill /F /T /PID ${activeLlamaProcess.pid}`
                : `taskkill /F /IM ${image}`;
            exec(killCmd, () => setTimeout(r, 2000));
        } else {
            if (activeLlamaProcess && activeLlamaProcess.kill) activeLlamaProcess.kill('SIGKILL');
            else exec('pkill -9 llama-server', () => {});
            setTimeout(r, 2000);
        }
    });
}

// Configuração do motor (binário + args) — lida pela página Centraliza Coder
app.get('/api/inference/config', async (req, res) => {
    const binary = (config.llamaCppBinary || '').trim();
    res.json({
        binary: binary || 'llama-server',
        args: listToArgsString(config.llamaCppArgsList) || config.llamaCppArgs || '',
        argList: (Array.isArray(config.llamaCppArgsList) ? config.llamaCppArgsList : []).map(x => ({ arg: x.arg, value: x.value || '', enabled: !!x.enabled })),
        physicalCores: await getPhysicalCoreCount(),
        binaryExists: llamaBinaryExists(),
        port: currentLlamaPort
    });
});

app.post('/api/inference/config', (req, res) => {
    const { binary, args, argList } = req.body || {};
    if (typeof binary === 'string' && binary.trim()) config.llamaCppBinary = binary.trim();
    if (Array.isArray(argList)) {
        // Forma estruturada (checkboxes da UI): guarda a lista e mantém a
        // string clássica sincronizada para compatibilidade.
        const clean = argList
            .filter(x => x && typeof x.arg === 'string' && x.arg.trim())
            .map(x => ({ arg: String(x.arg).trim(), value: String(x.value || '').trim(), enabled: !!x.enabled }));
        config.llamaCppArgsList = clean;
        config.llamaCppArgs = listToArgsString(clean);
    } else if (typeof args === 'string') {
        // Forma antiga (string livre): converte para a lista estruturada.
        config.llamaCppArgs = args.trim();
        config.llamaCppArgsList = parseArgsToList(args);
    }
    saveConfig();
    logger.info(`[Llama.cpp] Engine config saved. Binary: ${config.llamaCppBinary}`);
    res.json({ success: true });
});

// Abre o seletor nativo de PASTA e devolve o caminho do llama-server nela
// (o utilizador escolhe a pasta onde está o build do llama.cpp, ex.:
// C:\...\llama.cpp\build\bin\Release, e o ficheiro é completado por aqui).
app.get('/api/inference/pick-binary', async (req, res) => {
    const platform = os.platform();
    const exeName = platform === 'win32' ? 'llama-server.exe' : 'llama-server';
    const current = (config.llamaCppBinary || '').trim();
    let initialPath = (current && /[\\/]/.test(current)) ? path.dirname(current) : '';
    if (initialPath && !fs.existsSync(initialPath)) initialPath = '';
    if (!initialPath) initialPath = __dirname; // sem pista do binário → começa na pasta da app

    const result = await pickFolderNative(initialPath, 'Select the folder containing llama-server (llama.cpp)');
    if (result.error || !result.path) {
        return res.json({ path: null, exists: false, folder: null, error: result.error || null });
    }
    const candidate = path.join(result.path, exeName);
    res.json({ path: candidate, exists: fs.existsSync(candidate), folder: result.path });
});

/**
 * Arranca o motor llama.cpp com um modelo. Reutilizado pelo endpoint HTTP, pelo
 * gestor de motores (/api/engines/start) e pelo agente DeepSeek do Coder.
 * Devolve { success, port, message } ou { success:false, error, status }.
 */
async function startLlamaEngine(options = {}) {
    const { modelPath, ngl = 0, ctx = 2048, binary, extraArgs, argList } = options;
    if (!modelPath) return { success: false, error: 'Missing model path.', status: 400 };

    // Aceita binário/args vindos da UI e persiste-os em config.json
    if (typeof binary === 'string' && binary.trim()) config.llamaCppBinary = binary.trim();
    if (Array.isArray(argList)) {
        const clean = argList
            .filter(x => x && typeof x.arg === 'string' && x.arg.trim())
            .map(x => ({ arg: String(x.arg).trim(), value: String(x.value || '').trim(), enabled: !!x.enabled }));
        config.llamaCppArgsList = clean;
        config.llamaCppArgs = listToArgsString(clean);
    } else if (typeof extraArgs === 'string') {
        config.llamaCppArgs = extraArgs.trim();
        config.llamaCppArgsList = parseArgsToList(extraArgs);
    }
    if (binary || argList || extraArgs) saveConfig();

    const bin = resolveLlamaBinary();
    const binExists = llamaBinaryExists();
    if (binExists === false) {
        return { success: false, status: 400, error: `Binário do llama.cpp não encontrado em: ${bin}. Verifique o caminho nas configurações do motor (Centraliza Coder → ⚙).` };
    }

    if (activeLlamaProcess) {
        // Se o mesmo modelo e contexto já estão a correr, apenas informa
        if (currentLlamaModel === modelPath && currentLlamaCtx === ctx) {
            logger.info('[Llama.cpp] Engine already running with this model and ctx.');
            return { success: true, port: currentLlamaPort, message: 'Engine already running.' };
        }
        logger.info('[Llama.cpp] Terminating old engine to load new model or context size.');
        await killActiveLlama(bin);
        activeLlamaProcess = null;
    }

    const args = await buildLlamaArgs(modelPath, ctx, ngl);
    const portFromArgs = extractPort(args);
    if (portFromArgs) currentLlamaPort = portFromArgs;
    logDebugPayload('SPAWNING LLAMA.CPP', { binary: bin, args });

    try {
        const proc = spawn(bin, args, { stdio: 'pipe', windowsHide: true });
        activeLlamaProcess = proc;

        proc.stdout.on('data', d => logger.info(`[Llama.cpp] ${d.toString().trim()}`));
        proc.stderr.on('data', d => logger.info(`[Llama.cpp ERR] ${d.toString().trim()}`));

        proc.on('error', (err) => {
            logger.error('[Llama.cpp] Spawn error. Binary missing?', err);
            if (activeLlamaProcess && activeLlamaProcess.pid === proc.pid) activeLlamaProcess = null;
        });

        currentLlamaModel = modelPath;
        currentLlamaCtx = ctx;

        // O modelo arrancado passa a ser o modelo do gateway (centraliza-router),
        // para que as extensões (Continue/Roo) funcionem sem configuração extra.
        if (modelPath.toLowerCase().endsWith('.gguf') && config.activeRouterModel !== modelPath) {
            config.activeRouterModel = modelPath;
            saveConfig();
        }

        proc.on('close', () => {
            logger.info('[Llama.cpp] Engine stopped.');
            if (activeLlamaProcess && activeLlamaProcess.pid === proc.pid) {
                 activeLlamaProcess = null;
                 currentLlamaModel = null;
                 currentLlamaCtx = 2048;
            }
        });

        // Espera até 60 s por /health == ok (modelo carregado)
        const ready = await new Promise((resolve) => {
            let attempts = 0;
            const maxAttempts = 30; // 30 * 2000ms = 60s
            const checkHealth = async () => {
                 attempts++;
                 try {
                     const healthRes = await fetch(`http://127.0.0.1:${currentLlamaPort}/health`, { signal: AbortSignal.timeout(3000) });
                     const healthData = await healthRes.json();
                     if (healthData.status === 'ok') {
                          logger.info('[Llama.cpp] Engine is fully loaded and ready.');
                          return resolve(true);
                     }
                 } catch (err) { /* ainda a carregar */ }
                 if (attempts >= maxAttempts) {
                     logger.error('[Llama.cpp] Engine startup timeout.');
                     return resolve(false);
                 }
                 if (!activeLlamaProcess) return resolve(false);
                 setTimeout(checkHealth, 2000);
            };
            setTimeout(checkHealth, 1500);
        });

        if (!ready) {
            if (!activeLlamaProcess) return { success: false, status: 500, error: 'Engine crashed during startup.' };
            return { success: false, status: 500, error: 'Engine startup timeout. The model might be too large or took too long to load.' };
        }
        return { success: true, port: currentLlamaPort, message: 'Engine running.' };
    } catch (e) {
        logger.error('Failed to start llama-server', e);
        return { success: false, status: 500, error: 'Failed to start engine: ' + e.message };
    }
}

app.post('/api/inference/start', async (req, res) => {
    const result = await startLlamaEngine(req.body || {});
    if (!result.success) return res.status(result.status || 500).json({ error: result.error });
    res.json(result);
});

app.post('/api/inference/stop', async (req, res) => {
    if (activeLlamaProcess) {
        await killActiveLlama(resolveLlamaBinary());
        activeLlamaProcess = null;
        currentLlamaModel = null;
        res.json({ success: true, message: 'Engine stopped.' });
    } else {
        res.json({ success: true, message: 'No engine running.' });
    }
});

app.get('/api/inference/status', (req, res) => {
    res.json({ running: !!activeLlamaProcess, port: currentLlamaPort, model: currentLlamaModel, ctx: currentLlamaCtx });
});

// --- GESTOR DE MOTORES (RF-020 … RF-026) ---
// Deteção automática, arranque, UI web e paragem/unload de motores.
const engineManager = createEngineManager({
    getConfig: () => config,
    logger,
    llama: {
        resolveBinary: resolveLlamaBinary,
        binaryExists: llamaBinaryExists,
        port: llamaEnginePort,
        isRunning: () => !!activeLlamaProcess,
        currentModel: () => currentLlamaModel,
        start: (opts) => startLlamaEngine(opts),
        stop: async () => {
            await killActiveLlama(resolveLlamaBinary());
            activeLlamaProcess = null;
            currentLlamaModel = null;
            currentLlamaCtx = 2048;
        }
    }
});

app.get('/api/engines', async (req, res) => {
    try {
        const det = await engineManager.detect();
        cache.set('engines', det, 3000);
        res.json(det);
    } catch (e) {
        logger.error('[Engines] Falha na deteção', e);
        res.status(500).json({ error: String(e && e.message || e) });
    }
});

app.post('/api/engines/start', async (req, res) => {
    const { id, modelPath, ctx, ngl } = req.body || {};
    if (!id) return res.status(400).json({ error: 'Indique o motor a iniciar (id).' });
    try {
        const result = await engineManager.start(id, { modelPath, ctx, ngl });
        if (!result.success) return res.status(400).json(result);
        cache.clear();
        const det = await engineManager.detect();
        res.json({ ...result, engines: det.engines, running: det.running });
    } catch (e) {
        logger.error(`[Engines] Falha ao iniciar ${id}`, e);
        res.status(500).json({ error: String(e && e.message || e) });
    }
});

app.post('/api/engines/stop', async (req, res) => {
    const { id, unloadOnly } = req.body || {};
    if (!id) return res.status(400).json({ error: 'Indique o motor a parar (id).' });
    try {
        const report = await engineManager.stop(id, { unloadOnly: !!unloadOnly });
        cache.clear();
        const det = await engineManager.detect();
        logger.info(`[Engines] ${id} parado (unloadOnly=${!!unloadOnly}); running=${report.running}`);
        res.json({ success: !report.running, report, engines: det.engines, running: det.running });
    } catch (e) {
        logger.error(`[Engines] Falha ao parar ${id}`, e);
        res.status(500).json({ error: String(e && e.message || e) });
    }
});

app.post('/api/engines/stop-all', async (req, res) => {
    const { unloadOnly } = req.body || {};
    try {
        const result = await engineManager.stopAll({ unloadOnly: !!unloadOnly });
        cache.clear();
        res.json(result);
    } catch (e) {
        logger.error('[Engines] Falha ao parar todos os motores', e);
        res.status(500).json({ error: String(e && e.message || e) });
    }
});

// --- LOGS DO SERVIDOR (RF-024) ---
app.get('/api/logs/recent', (req, res) => {
    const limit = Math.min(LOG_RING_MAX, Math.max(1, parseInt(req.query.limit, 10) || 200));
    res.json({ logs: LOG_RING.slice(-limit), total: LOG_RING.length, max: LOG_RING_MAX });
});

app.post('/api/chat', async (req, res) => {
    const { ollamaTag, prompt, endpoint = 'http://127.0.0.1:11434/api/generate', options, system } = req.body;
    const fetch = (...args) => import('node-fetch').then(({default: fetch}) => fetch(...args));

    // Prepare the payload based on provided parameters
    const payload = { model: ollamaTag, prompt, stream: false };
    if (options) Object.assign(payload, { options });
    if (system) Object.assign(payload, { system });

    try {
        const response = await fetch(endpoint, {
            method: 'POST',
            body: JSON.stringify(payload),
            headers: { 'Content-Type': 'application/json' }
        });
        const data = await response.json();
        res.json(data);
    } catch (e) { 
        logger.error('Chat error', e);
        res.status(500).json({ error: 'AI Server error: ' + e.message }); 
    }
});

// --- MAP-REDUCE CAPABILITY ---
app.post('/api/documents/analyze', async (req, res) => {
    const { userQuestion, modelId, engineType, ctxSize = 8192 } = req.body;
    
    if (globalDocuments.length === 0) {
        return res.status(400).json({ error: 'Nenhum documento em memória. Por favor, anexe um arquivo primeiro usando o clip de papel.' });
    }

    const fetch = (...args) => import('node-fetch').then(({default: fetch}) => fetch(...args));
    const longText = globalDocuments.map(doc => doc.chunks.join('\n\n')).join('\n\n---\n\n');

    // O tamanho do pedaço é calculado para usar 50% do contexto da IA disponível (em caracteres, multiplicando tokens por 4)
    const CHUNK_SIZE = Math.floor((ctxSize * 0.5) * 4);
    const chunks = [];
    for (let i = 0; i < longText.length; i += CHUNK_SIZE) {
        chunks.push(longText.slice(i, i + CHUNK_SIZE));
    }

    logger.info(`[Map-Reduce] Inciando análise. Documento tem ${chunks.length} pedaços. Modelo: ${modelId}, Motor: ${engineType}`);
    
    try {
        const summaries = [];
        const isLlama = engineType === 'llama.cpp';
        const url = isLlama ? `http://127.0.0.1:${currentLlamaPort}/completion` : 'http://127.0.0.1:11434/api/generate';

        for (const [index, chunk] of chunks.entries()) {
            logger.info(`[Map-Reduce] Lendo parte ${index + 1}/${chunks.length}...`);
            const mapPrompt = `Você é um assistente de IA extraindo dados essenciais de partes de um texto. Resuma o seguinte texto de forma concisa e preserve fatos importantes.\n\nTEXTO:\n${chunk}\n\nRESUMO:`;

            const payload = isLlama ? {
                prompt: mapPrompt,
                n_predict: Math.floor(ctxSize * 0.15),
                stream: false
            } : {
                model: modelId,
                prompt: mapPrompt,
                stream: false,
                options: { num_ctx: Math.floor(ctxSize * 0.6) }
            };

            const response = await fetch(url, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });

            if (!response.ok) throw new Error(`Erro no motor (${response.status})`);
            const data = await response.json();
            summaries.push(isLlama ? data.content : data.response);
        }

        logger.info(`[Map-Reduce] Sintetizando ${summaries.length} resumos...`);
        const combinedSummaries = summaries.join('\n\n---\n\n');
        const finalPrompt = `Use os resumos abaixo extraídos do documento para responder detalhadamente à pergunta do usuário.\n\nRESUMOS DO DOCUMENTO:\n${combinedSummaries}\n\nPERGUNTA: ${userQuestion}\n\nRESPOSTA:`;

        const finalPayload = isLlama ? {
            prompt: finalPrompt,
            n_predict: Math.floor(ctxSize * 0.25),
            stream: false
        } : {
            model: modelId,
            prompt: finalPrompt,
            stream: false,
            options: { num_ctx: ctxSize }
        };

        const finalResponse = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(finalPayload)
        });

        const finalData = await finalResponse.json();
        const finalAnswer = isLlama ? finalData.content : finalData.response;
        
        res.json({ success: true, answer: finalAnswer, chunksProcessed: chunks.length });
    } catch (error) {
        logger.error('[Map-Reduce] Falha:', error);
        res.status(500).json({ error: error.message });
    }
});

app.post('/api/launch', (req, res) => {
    const { type, modelPath, ollamaTag, params } = req.body;
    let cmd = '';
    
    if (type === 'ollama') {
        cmd = `ollama run ${ollamaTag}`;
    } else if (type === 'comfyui') {
        if (!config.comfyDir) return res.status(400).json({ error: 'ComfyUI path not set.' });
        cmd = `cd /d "${config.comfyDir}" && python main.py`;
    } else if (type === 'lm-studio') {
        cmd = `start lms.exe`;
    } else if (type === 'llama.cpp') {
        const threads = params?.threads || 4;
        const gpuLayers = params?.n_gpu_layers || 0;
        const ctx = params?.ctx_size || 2048;
        const prompt = params?.prompt || "You are a helpful AI assistant.";
        cmd = `llama-cli -m "${modelPath}" -t ${threads} -ngl ${gpuLayers} -c ${ctx} -p "${prompt.replace(/"/g, '\\"')}"`;
    }

    if (cmd) {
        logger.info(`Launching ${type}: ${cmd}`);
        exec(`start cmd /k "${cmd}"`, (err) => {
            if (err) return res.status(500).json({ error: 'Failed to launch: ' + err.message });
            res.json({ success: true, message: `Launching ${type}...` });
        });
    } else res.status(400).json({ error: 'Unsupported engine.' });
});

const activeDownloads = new Map();
const pendingCancels = new Set();
const lastProgress = new Map();

function finishDownload(modelName, options = { success: false }) {
    const entry = activeDownloads.get(modelName);
    if (!entry || entry.completed) return;
    entry.completed = true;
    activeDownloads.delete(modelName);
    lastProgress.delete(modelName);
    const isCancelled = options.cancelled || pendingCancels.has(modelName);
    pendingCancels.delete(modelName);
    logger.info(`[Download] Finished ${modelName} - success=${options.success}, cancelled=${isCancelled}, paused=${options.paused}`);
    io.emit('download-complete', { 
        model: modelName, 
        success: options.success || false, 
        cancelled: isCancelled,
        paused: options.paused || false 
    });
    cache.clear();
}

app.post('/api/download', (req, res) => {
    const { modelName } = req.body;
    if (activeDownloads.has(modelName)) return res.status(400).json({ error: 'Download already in progress.' });

    const fetch = (...args) => import('node-fetch').then(({ default: f }) => f(...args));
    const abortController = new AbortController();
    activeDownloads.set(modelName, { abortController, completed: false, errorLines: [] });
    logger.info(`[Download] Started Ollama REST pull for ${modelName}`);
    io.emit('download-progress', { model: modelName, progress: -1 });
    res.json({ success: true });

    (async () => {
        try {
            const ollamaRes = await fetch('http://localhost:11434/api/pull', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ model: modelName, stream: true }),
                signal: abortController.signal
            });
            if (!ollamaRes.ok) throw new Error(`Ollama API ${ollamaRes.status}`);

            let buf = '';
            ollamaRes.body.on('data', (chunk) => {
                const entry = activeDownloads.get(modelName);
                if (!entry || entry.completed) { ollamaRes.body.destroy(); return; }
                buf += chunk.toString();
                const lines = buf.split('\n');
                buf = lines.pop() || '';
                for (const line of lines) {
                    if (!line.trim()) continue;
                    let d; try { d = JSON.parse(line); } catch { continue; }
                    if (d.error) { entry.errorLines.push(d.error); finishDownload(modelName, { success: false }); return; }
                    if (d.status === 'success') { finishDownload(modelName, { success: true }); return; }
                    if (d.total && d.completed !== undefined) {
                        const pct = Math.round((d.completed / d.total) * 100);
                        const prev = lastProgress.get(modelName);
                        if (prev === undefined || pct > prev || (pct === 0 && prev === -1)) {
                            lastProgress.set(modelName, pct);
                            io.emit('download-progress', { model: modelName, progress: pct });
                        }
                    } else if (!lastProgress.has(modelName) || lastProgress.get(modelName) === -1) {
                        lastProgress.set(modelName, -1);
                        io.emit('download-progress', { model: modelName, progress: -1 });
                    }
                }
            });
            await new Promise((resolve, reject) => {
                ollamaRes.body.on('end', resolve);
                ollamaRes.body.on('error', reject);
            });
            const entry = activeDownloads.get(modelName);
            if (entry && !entry.completed) finishDownload(modelName, { success: true });
        } catch (err) {
            if (err.name === 'AbortError' || err.type === 'aborted') return;
            logger.error(`[Download] Ollama pull failed: ${modelName}`, err);
            const entry = activeDownloads.get(modelName);
            if (entry) entry.errorLines.push(err.message);
            if (entry && !entry.completed) finishDownload(modelName, { success: false });
        }
    })();
});

app.post('/api/download/pause', (req, res) => {
    const { modelName } = req.body;
    const entry = activeDownloads.get(modelName);
    if (entry) {
        logger.info(`[Download] Pausing ${modelName}`);
        finishDownload(modelName, { success: false, paused: true });
        if (entry.abortController) entry.abortController.abort();
        if (entry.proc) {
            if (os.platform() === 'win32') exec(`taskkill /F /T /PID ${entry.proc.pid}`, () => {});
            else entry.proc.kill('SIGKILL');
        }
        res.json({ success: true });
    } else res.status(404).json({ error: 'Download not found' });
});

app.post('/api/download/cancel', (req, res) => {
    const { modelName } = req.body;
    const entry = activeDownloads.get(modelName);
    if (entry) {
        pendingCancels.add(modelName);
        logger.info(`[Download] Cancelling ${modelName}`);
        
        // Immediate UI update via finishDownload (emits cancelled: true)
        finishDownload(modelName, { success: false, cancelled: true });
        
        // Kill the process tree reliably
        if (entry.abortController) entry.abortController.abort();
        if (entry.proc) {
            if (os.platform() === 'win32') exec(`taskkill /F /T /PID ${entry.proc.pid}`, () => {});
            else entry.proc.kill('SIGKILL');
        }
        
        // Post-kill cleanup: Ollama RM + partial files
        setTimeout(() => {
            logger.info(`[Download] Starting deep cleanup for ${modelName}`);
            exec(`ollama rm ${modelName}`, (err) => {
                if (err) logger.warn(`[Download] ollama rm failed (expected if never finished manifest): ${err.message}`);
                
                // Deep scan for partial blobs
                const blobDir = path.join(os.homedir(), '.ollama', 'models', 'blobs');
                if (fs.existsSync(blobDir)) {
                    try {
                        const blobs = fs.readdirSync(blobDir);
                        let removedCount = 0;
                        blobs.forEach(f => {
                            if (f.endsWith('-partial') || f.endsWith('.partial')) {
                                try { 
                                    fs.unlinkSync(path.join(blobDir, f)); 
                                    removedCount++;
                                } catch (e) {}
                            }
                        });
                        logger.info(`[Download] Cleanup finished. Removed ${removedCount} partial blobs.`);
                    } catch (e) {
                        logger.error(`[Download] Blob cleanup failed`, e);
                    }
                }
                io.emit('models-updated');
                cache.clear();
            });
        }, 1500);
        res.json({ success: true });
    } else {
        // Entry not in activeDownloads — was already paused or finished.
        // Still emit cancel event so UI unblocks, and clean up Ollama blobs.
        logger.info(`[Download] Cancel of already-stopped ${modelName} — emitting cancelled and cleaning up`);
        io.emit('download-complete', { model: modelName, success: false, cancelled: true });
        exec(`ollama rm ${modelName}`, (err) => {
            if (err) logger.warn(`[Download] ollama rm (post-pause cleanup) failed: ${err.message}`);
            cache.clear();
            io.emit('models-updated');
        });
        res.json({ success: true });
    }
});

app.post('/api/download/hf', async (req, res) => {
    const { repo, modelName, file } = req.body;
    if (!repo || !modelName) return res.status(400).json({ error: 'Missing repo or modelName' });
    if (activeDownloads.has(modelName)) return res.status(400).json({ error: 'Download already in progress.' });

    try {
        const fetch = (...args) => import('node-fetch').then(({ default: f }) => f(...args));

        const apiRes = await fetch(`https://huggingface.co/api/models/${repo}`);
        if (!apiRes.ok) return res.status(502).json({ error: `HuggingFace API error: ${apiRes.status}` });

        const apiData = await apiRes.json();
        const allGguf = (apiData.siblings || []).map(s => s.rfilename).filter(f => f.toLowerCase().endsWith('.gguf'));
        // Prefer single-file GGUFs; fall back to split shards (first shard only — user can pull rest manually)
        const singleGguf = allGguf.filter(f => !f.toLowerCase().includes('-of-'));
        const ggufFiles = singleGguf.length > 0 ? singleGguf : allGguf;

        const QUANT_PREF = ['Q4_K_M', 'Q5_K_M', 'Q4_K_S', 'Q4_0', 'Q5_0', 'Q8_0', 'IQ4_XS', 'IQ3_M', 'IQ4_NL', 'Q2_K'];
        let selectedFile = null;
        // Quantização específica pedida pela UI (ex.: versão escolhida pelo utilizador)
        if (file && (allGguf.includes(file) || ggufFiles.includes(file))) {
            selectedFile = file;
        } else {
            for (const q of QUANT_PREF) {
                selectedFile = ggufFiles.find(f => f.toUpperCase().includes(q));
                if (selectedFile) break;
            }
            if (!selectedFile && ggufFiles.length > 0) selectedFile = ggufFiles[0];
        }
        if (!selectedFile) return res.status(404).json({ error: `No GGUF file found in ${repo}` });

        const downloadUrl = `https://huggingface.co/${repo}/resolve/main/${encodeURIComponent(selectedFile)}`;
        const destPath = path.join(config.centralDir, selectedFile);
        const partPath = destPath + '.part';

        logger.info(`[HF Download] ${modelName} → ${selectedFile} from ${repo}`);
        activeDownloads.set(modelName, { completed: false, errorLines: [] });
        res.json({ success: true, file: selectedFile });

        (async () => {
            try {
                const dlRes = await fetch(downloadUrl);
                if (!dlRes.ok) throw new Error(`HTTP ${dlRes.status} from HuggingFace`);

                const totalBytes = parseInt(dlRes.headers.get('content-length') || '0', 10);
                let downloadedBytes = 0;
                let lastPct = -1;

                const fileStream = require('fs').createWriteStream(partPath);
                dlRes.body.on('data', (chunk) => {
                    const entry = activeDownloads.get(modelName);
                    if (!entry || entry.completed) { dlRes.body.destroy(); return; }
                    downloadedBytes += chunk.length;
                    fileStream.write(chunk);
                    if (totalBytes > 0) {
                        const pct = Math.round((downloadedBytes / totalBytes) * 100);
                        if (pct !== lastPct) { lastPct = pct; io.emit('download-progress', { model: modelName, progress: pct }); }
                    } else {
                        io.emit('download-progress', { model: modelName, progress: -1 });
                    }
                });

                await new Promise((resolve, reject) => {
                    dlRes.body.on('end', resolve);
                    dlRes.body.on('error', reject);
                });
                fileStream.end();
                await new Promise(resolve => fileStream.on('finish', resolve));

                require('fs').renameSync(partPath, destPath);
                finishDownload(modelName, { success: true });
                io.emit('models-updated');
                logger.info(`[HF Download] Complete: ${destPath}`);
            } catch (err) {
                logger.error(`[HF Download] Failed: ${modelName}`, err);
                const entry = activeDownloads.get(modelName);
                if (entry) entry.errorLines.push(err.message);
                finishDownload(modelName, { success: false });
                if (require('fs').existsSync(partPath)) try { require('fs').unlinkSync(partPath); } catch (_) {}
            }
        })();
    } catch (err) {
        logger.error(`[HF Download] Setup failed: ${modelName}`, err);
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/models/rename', async (req, res) => {
    const { oldPath, newName } = req.body;
    const newPath = path.join(path.dirname(oldPath), newName + path.extname(oldPath));
    try {
        await promisify(fs.rename)(oldPath, newPath);
        cache.clear();
        res.json({ success: true });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/models/move', async (req, res) => {
    const { oldPath, newDir } = req.body;
    const newPath = path.join(newDir, path.basename(oldPath));
    try {
        await promisify(fs.rename)(oldPath, newPath);
        cache.clear();
        res.json({ success: true });
    } catch (e) {
        try {
            await promisify(fs.copyFile)(oldPath, newPath);
            await promisify(fs.unlink)(oldPath);
            cache.clear();
            res.json({ success: true, fallback: true });
        } catch (err) { res.status(500).json({ error: err.message }); }
    }
});

app.delete('/api/models', async (req, res) => {
    const { modelPath, ollamaTag, centralPath } = req.body;
    logger.info(`[Delete] Request for: ${ollamaTag || modelPath}`);
    try {
        if (centralPath && fs.existsSync(centralPath)) {
            await promisify(fs.unlink)(centralPath);
            cache.clear();
            io.emit('models-updated');
            return res.json({ success: true });
        }
        if (ollamaTag) {
            const proc = activeDownloads.get(ollamaTag);
            if (proc) {
                if (os.platform() === 'win32') exec(`taskkill /F /T /PID ${proc.pid}`);
                else proc.kill('SIGKILL');
                activeDownloads.delete(ollamaTag);
            }
            // Wait for ollama rm to finish BEFORE responding, so the frontend
            // sees the model gone when it immediately re-fetches.
            await promisify(exec)(`ollama rm ${ollamaTag}`);
            cache.clear();
            io.emit('models-updated');
            return res.json({ success: true });
        }
        if (modelPath && fs.existsSync(modelPath)) {
            // Hugging Face cache uses a special structure:
            //   hub/models--org--name/blobs/<sha>      (actual data, no extension)
            //   hub/models--org--name/snapshots/HASH/  (may be hardlinks or copies on Windows)
            // Deleting just the snapshot file leaves the blob behind and HF will
            // reconstruct the link. We must remove the ENTIRE models--xxx folder.
            const hfMatch = modelPath.match(/^(.*?models--[^/\\]+)/i);
            if (hfMatch) {
                const modelCacheDir = hfMatch[1];
                logger.info(`[Delete] HF cache folder to remove: ${modelCacheDir}`);
                fs.rmSync(modelCacheDir, { recursive: true, force: true });
                logger.info(`[Delete] HF cache folder removed successfully`);
            } else {
                logger.info(`[Delete] Unlinking file: ${modelPath}`);
                await promisify(fs.unlink)(modelPath);
            }
            cache.clear();
            io.emit('models-updated');
            return res.json({ success: true });
        }
        res.status(404).json({ error: 'Model not found' });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/models/sanity-check', async (req, res) => {
    const linkDir = path.join(config.centralDir, 'Centraliza.ai');
    if (!fs.existsSync(linkDir)) return res.json({ cleaned: 0 });
    let cleaned = 0;
    const clean = (d) => {
        fs.readdirSync(d, {withFileTypes:true}).forEach(e => {
            const p = path.join(d, e.name);
            if (e.isDirectory()) clean(p);
            else { try { fs.statSync(p); } catch(err) { fs.unlinkSync(p); cleaned++; } }
        });
    };
    try { clean(linkDir); cache.clear(); } catch(e) {}
    res.json({ success: true, cleaned });
});

app.get('/api/system/disk', async (req, res) => {
    const cached = cache.get('system-disk');
    if (cached) return res.json(cached);
    try {
        const diskPath = path.parse(process.cwd()).root;
        const disk = await checkDiskSpace(diskPath);
        const linkDir = path.join(config.centralDir, 'Centraliza.ai');
        const getDirSize = (d) => {
            if (!fs.existsSync(d)) return 0;
            let total = 0;
            fs.readdirSync(d, {withFileTypes:true}).forEach(e => {
                const p = path.join(d, e.name);
                if (e.isDirectory()) total += getDirSize(p);
                else { try { total += fs.statSync(p).size; } catch(err) {} }
            });
            return total;
        };
        const centralSize = getDirSize(linkDir);
        const result = { total: disk.size, free: disk.free, used: disk.size - disk.free, centraliza: centralSize, others: (disk.size - disk.free) - centralSize };
        cache.set('system-disk', result, 15000); // 15s cache
        res.json(result);
    } catch (e) { res.status(500).json({ error: e.message }); }
});

// --- ESPAÇO OCUPADO PELOS MODELOS E POR LOCALIZAÇÃO (RF-010 … RF-014) ---
app.get('/api/storage/summary', async (req, res) => {
    const cached = cache.get('storage-summary');
    if (cached) return res.json(cached);
    try {
        const models = await getModelsList();
        const summary = summarizeModels(models, {
            scanDirectories: config.scanDirectories,
            centralDir: config.centralDir
        });
        cache.set('storage-summary', summary, 15000); // 15s cache
        res.json(summary);
    } catch (e) {
        logger.error('[Storage] Falha ao resumir o espaço dos modelos', e);
        res.status(500).json({ error: String(e && e.message || e) });
    }
});

app.post('/api/open-folder', (req, res) => {
    const { folderPath } = req.body;
    if (os.platform() === 'win32') {
        // Resolve symlinks so Explorer can actually navigate to the real location
        let resolvedPath = folderPath;
        try {
            resolvedPath = fs.realpathSync(folderPath);
        } catch(e) {
            // If realpathSync fails (e.g. file deleted), fall back to dirname
            resolvedPath = path.dirname(folderPath);
        }
        const cleanPath = resolvedPath.replace(/\//g, '\\');
        // If it points to a file, open the parent folder with the file selected
        let explorerArg;
        try {
            const stat = fs.statSync(cleanPath);
            explorerArg = stat.isDirectory() ? `"${cleanPath}"` : `/select,"${cleanPath}"`;
        } catch(e) {
            // File doesn't exist, just open the parent
            explorerArg = `"${path.dirname(cleanPath)}"`;
        }
        exec(`explorer.exe ${explorerArg}`);
        const targetDir = (() => { try { return fs.statSync(cleanPath).isDirectory() ? cleanPath : path.dirname(cleanPath); } catch(e) { return path.dirname(cleanPath); } })();
        const psFocus = `powershell.exe -Command "$path = '${targetDir}'; $wshell = New-Object -ComObject WScript.Shell; $explorer = New-Object -ComObject Shell.Application; $window = $explorer.Windows() | Where-Object { try { $_.Document.Folder.Self.Path.ToLower() -eq $path.ToLower() } catch { $false } } | Select-Object -First 1; if ($window) { $wshell.AppActivate($window.HWND) } else { $wshell.AppActivate('Explorador de Arquivos'); $wshell.AppActivate('File Explorer') }"`;
        setTimeout(() => { exec(psFocus); }, 1000);
    } else exec(`open -R "${folderPath}"`);
    res.json({ success: true });
});

// --- CENTRALIZA CODER (AGENTE DEEPSEEK NATIVO) ---
// v0.5.0: removida a integração com o agente CLI de terceiros (free-claude-code).
// O agente passa a ser o DeepSeek Harness (`dsh web`), lançado a partir do
// dashboard em dois modos:
//   Modo A — "Iniciar Motor": arranca o llama.cpp com o modelo por defeito e
//            lança o agente sobre esse motor.
//   Modo B — independente: o utilizador escolhe um modelo já configurado
//            (GGUF local ou modelo Ollama) e o agente arranca com esse modelo.

/** Primeiro modelo GGUF local com capacidade de agente (fallback do Modo A). */
async function findDefaultAgentModel() {
    if (config.coderAgentModel) return config.coderAgentModel;
    if (config.activeRouterModel) return config.activeRouterModel;
    try {
        const models = await getModelsList();
        const coder = models.find(m => m.isCoder && String(m.path).toLowerCase().endsWith('.gguf'));
        if (coder) return coder.path;
        const anyGguf = models.find(m => String(m.path).toLowerCase().endsWith('.gguf') && m.source !== 'Ollama' && m.source !== 'ComfyUI');
        if (anyGguf) return anyGguf.path;
    } catch (e) { /* sem modelos */ }
    return null;
}

/** Carrega um modelo no Ollama (keep_alive) para que o agente o possa usar. */
async function loadOllamaModel(tag, keepAlive = '30m') {
    const port = parseInt(config.ollamaPort, 10) || 11434;
    try {
        const res = await fetch(`http://127.0.0.1:${port}/api/generate`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ model: tag, prompt: '', keep_alive: keepAlive, stream: false }),
            signal: AbortSignal.timeout(120000)
        });
        return res.ok;
    } catch (e) {
        return false;
    }
}

app.get('/api/coder/status', async (req, res) => {
    try {
        const det = await engineManager.detect();
        const llamaEngine = det.engines.find(e => e.id === 'llamacpp') || null;
        const ollamaEngine = det.engines.find(e => e.id === 'ollama') || null;
        const dsh = await dshStatus();
        let coderModels = [];
        try {
            const models = await getModelsList();
            coderModels = models
                .filter(m => m.isCoder)
                .map(m => ({ name: m.name, path: m.path, size: m.size, source: m.source, ollamaTag: m.ollamaTag || null }))
                .slice(0, 200);
        } catch (e) { /* lista vazia */ }
        res.json({
            engine: {
                running: !!(llamaEngine && llamaEngine.running),
                managed: !!(llamaEngine && llamaEngine.managed),
                model: (llamaEngine && llamaEngine.details && llamaEngine.details.model) || currentLlamaModel || null,
                port: currentLlamaPort,
                binary: resolveLlamaBinary(),
                binaryExists: llamaBinaryExists()
            },
            ollama: {
                running: !!(ollamaEngine && ollamaEngine.running),
                model: (ollamaEngine && ollamaEngine.details && ollamaEngine.details.loadedModel) || null
            },
            agent: dsh,
            defaultModel: config.coderAgentModel || config.activeRouterModel || null,
            models: coderModels,
            update: updater.status(),
            engines: det.engines,
            version: updater.status().currentVersion
        });
    } catch (e) {
        logger.error('[Coder] Falha ao obter estado', e);
        res.status(500).json({ error: String(e && e.message || e) });
    }
});

app.post('/api/coder/agent/start', async (req, res) => {
    const { mode = 'engine', modelPath, ctx, ngl } = req.body || {};
    try {
        let providerBaseUrl = null;
        let providerModelId = null;
        let label = null;

        if (mode === 'model' && modelPath) {
            if (String(modelPath).toLowerCase().endsWith('.gguf')) {
                // Modelo GGUF local: garante o motor llama.cpp com este modelo.
                const started = await startLlamaEngine({ modelPath, ctx, ngl });
                if (!started.success) return res.status(started.status || 500).json({ error: started.error });
                providerBaseUrl = `http://127.0.0.1:${currentLlamaPort}/v1`;
                providerModelId = llamaAlias();
                label = path.basename(modelPath);
                config.coderAgentModel = modelPath;
                saveConfig();
            } else {
                // Modelo servido pelo Ollama (tag) ou outro serviço OpenAI local.
                const tag = String(modelPath);
                if (!(await engineManager.httpJson(`http://127.0.0.1:${config.ollamaPort || 11434}/api/version`, 1500))) {
                    return res.status(400).json({ error: 'O Ollama não está a correr. Inicie o motor Ollama ou escolha um modelo GGUF local.' });
                }
                if (!(await loadOllamaModel(tag))) {
                    return res.status(500).json({ error: `Não foi possível carregar o modelo "${tag}" no Ollama.` });
                }
                providerBaseUrl = `http://127.0.0.1:${config.ollamaPort || 11434}/v1`;
                providerModelId = tag;
                label = tag;
                config.coderAgentModel = tag;
                saveConfig();
            }
        } else {
            // Modo A: modelo por defeito (ou o último usado) + "Iniciar Motor".
            const model = await findDefaultAgentModel();
            if (!model) {
                return res.status(400).json({ error: 'Nenhum modelo configurado. Escolha um modelo GGUF na página Meus Modelos ou use o seletor de modelo.' });
            }
            if (String(model).toLowerCase().endsWith('.gguf')) {
                const already = activeLlamaProcess && currentLlamaModel === model;
                if (!already) {
                    const started = await startLlamaEngine({ modelPath: model, ctx, ngl });
                    if (!started.success) return res.status(started.status || 500).json({ error: started.error });
                }
                providerBaseUrl = `http://127.0.0.1:${currentLlamaPort}/v1`;
                providerModelId = llamaAlias();
            } else {
                if (!(await loadOllamaModel(String(model)))) {
                    return res.status(500).json({ error: `Não foi possível carregar o modelo "${model}" no Ollama.` });
                }
                providerBaseUrl = `http://127.0.0.1:${config.ollamaPort || 11434}/v1`;
                providerModelId = String(model);
            }
            label = path.basename(String(model));
        }

        const launched = await launchDshAgent({ baseURL: providerBaseUrl, modelId: providerModelId, mode, label });
        if (!launched.success) return res.status(502).json(launched);
        cache.clear();
        res.json({
            success: true,
            message: `Agente DeepSeek iniciado sobre ${label || providerModelId}.`,
            url: launched.url,
            port: launched.port,
            mode,
            model: providerModelId,
            engine: { running: !!activeLlamaProcess, port: currentLlamaPort, model: currentLlamaModel },
            agent: await dshStatus()
        });
    } catch (e) {
        logger.error('[Coder] Falha ao iniciar o agente', e);
        res.status(500).json({ error: String(e && e.message || e) });
    }
});

app.post('/api/coder/agent/stop', async (req, res) => {
    try {
        const result = await stopDshAgent();
        res.json({ success: true, ...result, agent: await dshStatus() });
    } catch (e) {
        res.status(500).json({ error: String(e && e.message || e) });
    }
});

// --- DEEPSEEK HARNESS COMO AGENTE SOBRE O MOTOR LOCAL ---
// Lança a Web UI do DeepSeek Harness (`dsh web`) apontada para um serviço
// OpenAI-compatible local (llama.cpp ou Ollama) através de um patch de perfil
// isolado: os providers/settings reais do utilizador (~/.dsh) não são tocados.
const DSH_PATCH_DIR = path.join(__dirname, 'data', 'dsh');

function llamaArgsMap() {
    const map = {};
    const list = Array.isArray(config.llamaCppArgsList) ? config.llamaCppArgsList : [];
    for (const item of list) {
        if (item && typeof item.arg === 'string' && item.arg.trim()) {
            map[String(item.arg).trim()] = String(item.value || '').trim();
        }
    }
    return map;
}

function llamaAlias() {
    const alias = llamaArgsMap()['--alias'];
    return (alias && alias.trim()) || 'qwen';
}

function llamaEnginePort() {
    const p = parseInt(llamaArgsMap()['--port'], 10);
    return (Number.isFinite(p) && p > 0) ? p : (currentLlamaPort || 8080);
}

/** Modelos que o llama-server (llama.cpp) está efetivamente a servir. */
async function llamaServedModels() {
    try {
        const res = await fetch(`http://127.0.0.1:${llamaEnginePort()}/v1/models`, { signal: AbortSignal.timeout(1200) });
        if (!res.ok) return [];
        const data = await res.json();
        return Array.isArray(data && data.data) ? data.data.map(m => m && m.id).filter(Boolean) : [];
    } catch (e) {
        return [];
    }
}

async function httpGetOk(url, timeoutMs = 2000) {
    try {
        const res = await fetch(url, { signal: AbortSignal.timeout(timeoutMs) });
        return res && res.ok ? res : null;
    } catch (e) { return null; }
}

async function isEngineRunning() {
    return !!(await httpGetOk(`http://127.0.0.1:${llamaEnginePort()}/health`, 1500));
}

function findFreePort(start) {
    return new Promise((resolve) => {
        const net = require('net');
        const tryPort = (p) => {
            if (p > start + 20) return resolve(start);
            const srv = net.createServer();
            srv.once('error', () => { srv.close(); tryPort(p + 1); });
            srv.listen(p, '127.0.0.1', () => {
                const port = srv.address().port;
                srv.close(() => resolve(port));
            });
        };
        tryPort(start);
    });
}

let dshProcessPid = null;
let dshCurrentPort = null;
let dshCurrentModel = null;
let dshCurrentMode = null;
let dshCurrentBaseUrl = null;

/** Porta configurada para a Web UI do agente. */
function dshPort() {
    const p = parseInt(config.dshLocalPort, 10);
    return Number.isFinite(p) && p > 0 ? p : 3090;
}

/**
 * Escreve o patch de perfil isolado que liga o DeepSeek Harness a um serviço
 * OpenAI-compatible local (llama.cpp ou Ollama), sem tocar em ~/.dsh.
 */
function writeDshPatch(opts = {}) {
    fs.mkdirSync(DSH_PATCH_DIR, { recursive: true });
    const settingsPath = path.join(DSH_PATCH_DIR, 'settings.local.yaml');
    const credentialsPath = path.join(DSH_PATCH_DIR, '.credentials.local.yaml');
    fs.writeFileSync(settingsPath, '{}\n');
    fs.writeFileSync(credentialsPath, '{}\n');
    const baseURL = String(opts.baseURL || `http://127.0.0.1:${llamaEnginePort()}/v1`).replace(/\/+$/, '');
    const modelId = opts.modelId || llamaAlias();
    const displayName = opts.displayName || 'Centraliza Local';
    const contextWindow = Number(config.vramShieldLimit) > 0 ? Number(config.vramShieldLimit) : 131072;
    const patch = [
        { id: 'settings', name: '@deepseek-ai/dsh-settings-file', config: { path: settingsPath, watch: false } },
        { id: 'credentials', name: '@deepseek-ai/dsh-credentials-local', config: { path: credentialsPath, watch: false } },
        {
            id: 'llm-pi-ai',
            name: '@deepseek-ai/dsh-llm-pi-ai',
            config: {
                providers: {
                    'centraliza-local': {
                        displayName,
                        api: 'openai-completions',
                        baseURL,
                        headers: { Authorization: 'Bearer centraliza-local' },
                        defaultInput: ['text'],
                        models: [
                            {
                                id: modelId,
                                name: `${modelId} (local)`,
                                contextWindow
                            }
                        ]
                    }
                }
            }
        },
        { id: 'agent-default-model', name: '@deepseek-ai/dsh-agent-default-model', config: { provider: 'centraliza-local', model: modelId } }
    ];
    const patchPath = path.join(DSH_PATCH_DIR, 'local.patch.json');
    fs.writeFileSync(patchPath, JSON.stringify(patch, null, 2));
    return patchPath;
}

/** Estado do agente DeepSeek Harness. */
async function dshStatus() {
    const configured = dshPort();
    const preferred = dshCurrentPort || configured;
    let running = !!(await httpGetOk(`http://127.0.0.1:${preferred}`, 1200));
    let port = preferred;
    if (!running && configured !== preferred && (await httpGetOk(`http://127.0.0.1:${configured}`, 1000))) {
        running = true;
        port = configured;
    }
    // Se fomos nós que o lançámos, procura nas portas adjacentes (findFreePort).
    if (!running && dshProcessPid) {
        for (let p = configured; p < configured + 6 && !running; p++) {
            if (await httpGetOk(`http://127.0.0.1:${p}`, 600)) { running = true; port = p; }
        }
    }
    return {
        running,
        agent: 'deepseek-harness',
        port,
        url: `http://127.0.0.1:${port}`,
        engineRunning: await isEngineRunning(),
        model: dshCurrentModel,
        mode: dshCurrentMode,
        baseURL: dshCurrentBaseUrl,
        managed: !!dshProcessPid
    };
}

/** Lança a Web UI do agente apontada a um serviço OpenAI-compatible local. */
async function launchDshAgent(opts = {}) {
    const startPort = dshPort();
    const port = await findFreePort(startPort);
    const url = `http://127.0.0.1:${port}`;

    if (await httpGetOk(url, 1200)) {
        dshCurrentPort = port;
        dshCurrentModel = opts.modelId || llamaAlias();
        dshCurrentMode = opts.mode || null;
        dshCurrentBaseUrl = opts.baseURL || null;
        return { success: true, port, url, message: 'O DeepSeek Harness já está a correr.' };
    }

    const patchPath = writeDshPatch(opts);
    const cmd = `dsh web --no-open --host 127.0.0.1 --port ${port} --patch "${patchPath}"`;
    logger.info(`[DSH] A lançar DeepSeek Harness: ${cmd}`);
    const child = spawn(cmd, { shell: true, detached: true, stdio: 'ignore', windowsHide: true });
    child.unref();
    dshProcessPid = child.pid;
    dshCurrentPort = port;
    dshCurrentModel = opts.modelId || llamaAlias();
    dshCurrentMode = opts.mode || null;
    dshCurrentBaseUrl = opts.baseURL || null;
    child.on('error', (err) => {
        logger.error('[DSH] Falha ao lançar DeepSeek Harness:', err);
    });

    let up = false;
    for (let i = 0; i < 45; i++) {
        if (await httpGetOk(url, 1500)) { up = true; break; }
        await new Promise(r => setTimeout(r, 1000));
    }
    if (!up) {
        logger.error('[DSH] DeepSeek Harness não respondeu a tempo.');
        return { success: false, error: 'O DeepSeek Harness não respondeu a tempo. Verifique se o dsh está instalado (npm install -g @deepseek-ai/dsh) e se a porta está livre.' };
    }
    logger.info(`[DSH] DeepSeek Harness ativo em ${url} (modelo: ${dshCurrentModel}).`);
    return { success: true, port, url, message: 'Agente DeepSeek iniciado.' };
}

/** Para o agente DeepSeek Harness (processo rastreado + PID à escuta na porta). */
async function stopDshAgent() {
    const ports = Array.from(new Set([dshCurrentPort, dshPort()].filter(Boolean)));
    const pids = new Set();
    if (dshProcessPid) pids.add(dshProcessPid);
    dshProcessPid = null;
    dshCurrentPort = null;
    dshCurrentModel = null;
    dshCurrentMode = null;
    dshCurrentBaseUrl = null;
    for (const port of ports) {
        try {
            const out = await new Promise((resolve, reject) => exec(`netstat -ano | findstr :${port}`, (err, stdout) => err ? reject(err) : resolve(stdout)));
            for (const line of out.split(/\r?\n/)) {
                if (!line.toLowerCase().includes('listen')) continue;
                const m = line.trim().match(/\s+(\d+)\s*$/);
                if (m) pids.add(parseInt(m[1], 10));
            }
        } catch (e) { /* sem netstat — usa apenas o pid rastreado */ }
    }
    let killed = 0;
    for (const pid of pids) {
        if (!pid || pid <= 0 || pid === process.pid) continue;
        try { exec(`taskkill /F /T /PID ${pid}`, () => {}); killed++; } catch (e) {}
    }
    return { killed };
}

app.get('/api/coder/dsh/status', async (req, res) => {
    try {
        const dsh = await dshStatus();
        res.json({ ...dsh, dshRunning: dsh.running, engineRunning: dsh.engineRunning });
    } catch (e) {
        res.status(500).json({ error: String(e && e.message || e) });
    }
});

app.post('/api/coder/dsh/launch', async (req, res) => {
    try {
        if (!(await isEngineRunning())) {
            return res.status(400).json({ error: 'O motor local (llama.cpp) não está a correr. Inicie o motor na página Centraliza Coder e tente novamente.' });
        }
        const launched = await launchDshAgent({ baseURL: `http://127.0.0.1:${llamaEnginePort()}/v1`, modelId: llamaAlias(), mode: 'engine' });
        if (!launched.success) return res.status(502).json(launched);
        res.json(launched);
    } catch (e) {
        logger.error('[DSH] Erro ao lançar:', e);
        res.status(500).json({ error: String(e && e.message || e) });
    }
});

app.post('/api/coder/dsh/stop', async (req, res) => {
    try {
        const result = await stopDshAgent();
        res.json({ success: true, ...result });
    } catch (e) {
        res.status(500).json({ error: String(e && e.message || e) });
    }
});

// --- INTEGRAÇÕES COM EDITORES (Continue.dev e Roo Code) — RF-040 … RF-045 ---
const extensions = createExtensions({
    getConfig: () => config,
    logger,
    engines: engineManager,
    getServerPort: () => Number(process.env.PORT) || 4000,
    llama: { currentModel: () => currentLlamaModel }
});

app.get('/api/extensions/status', async (req, res) => {
    try {
        res.json(await extensions.status());
    } catch (e) {
        logger.error('[Extensions] Falha ao obter estado', e);
        res.status(500).json({ error: String(e && e.message || e) });
    }
});

app.post('/api/extensions/continue', async (req, res) => {
    try {
        const result = await extensions.setupContinue();
        res.status(result.success ? 200 : 409).json(result);
    } catch (e) {
        res.status(500).json({ error: String(e && e.message || e) });
    }
});

app.post('/api/extensions/roo', async (req, res) => {
    try {
        const result = await extensions.setupRoo();
        res.status(result.success ? 200 : 409).json(result);
    } catch (e) {
        res.status(500).json({ error: String(e && e.message || e) });
    }
});

app.post('/api/extensions/smoke-test', async (req, res) => {
    try {
        const { prompt } = req.body || {};
        res.json(await extensions.smokeTest(prompt));
    } catch (e) {
        res.status(500).json({ error: String(e && e.message || e) });
    }
});

app.post('/api/extensions/open-vscode', async (req, res) => {
    try {
        res.json(await extensions.openVSCode());
    } catch (e) {
        res.status(500).json({ error: String(e && e.message || e) });
    }
});

/**
 * "Iniciar motor e modelo" (RF-042): arranca o motor por defeito e carrega o
 * modelo, para desbloquear as integrações sem sair da página Extensões.
 */
app.post('/api/extensions/start-stack', async (req, res) => {
    try {
        const model = await findDefaultAgentModel();
        if (!model) {
            return res.status(400).json({ error: 'Nenhum modelo configurado. Escolha um modelo GGUF na página Meus Modelos.' });
        }
        if (String(model).toLowerCase().endsWith('.gguf')) {
            const started = await startLlamaEngine({ modelPath: model });
            if (!started.success) return res.status(500).json({ error: started.error });
        } else if (!(await loadOllamaModel(String(model)))) {
            return res.status(500).json({ error: 'Não foi possível carregar o modelo no Ollama.' });
        }
        cache.clear();
        res.json({ success: true, model, status: await extensions.status() });
    } catch (e) {
        logger.error('[Extensions] Falha ao iniciar motor e modelo', e);
        res.status(500).json({ error: String(e && e.message || e) });
    }
});

// Compatibilidade com os endpoints antigos (a UI v0.5.0 usa /api/extensions/*).
app.post('/api/coder/setup-continue', async (req, res) => {
    const result = await extensions.setupContinue();
    res.status(result.success ? 200 : 409).json(result);
});

app.get('/api/coder/setup-roo', async (req, res) => {
    const st = await extensions.status();
    res.json({
        success: true,
        installUri: 'vscode:extension/RooVeterinaryInc.roo-cline',
        ready: st.ready,
        settings: { apiBase: st.baseUrl, apiKey: 'centraliza-local', model: 'centraliza-router' }
    });
});

// --- AUTO-ATUALIZAÇÃO DA APLICAÇÃO (RF-034) ---
const updater = createUpdater({
    getConfig: () => config,
    logger,
    appRoot: __dirname,
    notify: (event, payload) => {
        if (ioRef) { try { ioRef.emit(event, payload); } catch (e) {} }
    }
});

app.get('/api/update/status', (req, res) => res.json(updater.status()));

app.post('/api/update/check', async (req, res) => {
    try {
        res.json(await updater.check('manual'));
    } catch (e) {
        res.status(500).json({ error: String(e && e.message || e) });
    }
});

app.post('/api/update/apply', async (req, res) => {
    try {
        res.json(await updater.apply());
    } catch (e) {
        res.status(500).json({ error: String(e && e.message || e) });
    }
});

const distPath = path.join(__dirname, 'frontend', 'dist');
if (fs.existsSync(distPath)) {
    app.use(express.static(distPath));
    app.use((req, res, next) => {
        // Se for um pedido para a API ou Gateway, devolvemos 404 em JSON (evita crashes silenciosos nos clientes OpenAI)
        // Se for qualquer outra coisa (navegador), devolvemos o React (index.html)
        if (!req.path.startsWith('/api') && !req.path.startsWith('/v1')) {
            res.sendFile(path.join(distPath, 'index.html'));
        } else {
            res.status(404).json({ error: { message: 'Endpoint not found in Centraliza API/Gateway.', type: 'invalid_request_error' } });
        }
    });
}

const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*" } });
// Liga o sistema de logs ao Socket.io (painel de logs em tempo real — RF-024).
ioRef = io;

io.on('connection', (socket) => {
    logger.info('Client connected via WebSocket');
    socket.on('test-progress', () => {
        let p = 0;
        const iv = setInterval(() => {
            p += 10;
            io.emit('download-progress', { model: 'TEST_MODEL_CONNECTION', progress: p });
            if (p >= 100) { clearInterval(iv); io.emit('download-complete', { model: 'TEST_MODEL_CONNECTION', success: true }); }
        }, 300);
    });
});

async function probeExistingLlamaEngine() {
    if (!config.activeRouterModel || !config.activeRouterModel.toLowerCase().endsWith('.gguf')) return;
    try {
        const resp = await fetch(`http://127.0.0.1:${currentLlamaPort}/health`, { signal: AbortSignal.timeout(2000) });
        if (resp.ok) {
            logger.info(`[Llama.cpp] Engine já a correr na porta ${currentLlamaPort}. Reconectando para modelo: ${path.basename(config.activeRouterModel)}`);
            activeLlamaProcess = { pid: null, isExternal: true };
            currentLlamaModel = config.activeRouterModel;
            currentLlamaCtx = config.vramShieldLimit || 32768;
        }
    } catch(e) {
        // Nenhum motor a correr — normal ao iniciar
    }
}

if (require.main === module) {
    const PORT = Number(process.env.PORT) || 4000;
    server.listen(PORT, () => {
        logger.info(`Centraliza.ai on http://localhost:${PORT}`);
        probeExistingLlamaEngine().catch(() => {});
        // Auto-atualização (RF-034): verificação no arranque + agendamento periódico.
        // Sem rede ou sem fonte configurada, o arranque não é bloqueado.
        setTimeout(() => { updater.check('startup').catch(() => {}); }, 8000);
        updater.schedule();
        logger.info('[Update] Verificação de atualizações agendada (intervalo configurável em config.json).');
    });
}
module.exports = { app, server, writeDshPatch, parseGGUFBuffer, parseGGUFHeader };
