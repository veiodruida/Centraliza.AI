const express = require('express');
const fs = require('fs');
const path = require('path');
const os = require('os');
const http = require('http');
const { Server } = require('socket.io');
const { promisify } = require('util');
const { exec, spawn } = require('child_process');
const checkDiskSpace = require('check-disk-space').default;

// --- LOGGING SYSTEM ---
const LOG_FILE = path.join(__dirname, 'server.log');
const logger = {
    info: (msg) => {
        const entry = `[${new Date().toISOString()}] [INFO] ${msg}`;
        console.log(entry);
        fs.appendFileSync(LOG_FILE, entry + '\n');
    },
    error: (msg, err) => {
        const entry = `[${new Date().toISOString()}] [ERROR] ${msg} ${err ? (err.message || err) : ''}`;
        console.error(entry);
        fs.appendFileSync(LOG_FILE, entry + '\n');
    },
    warn: (msg) => {
        const entry = `[${new Date().toISOString()}] [WARN] ${msg}`;
        console.warn(entry);
        fs.appendFileSync(LOG_FILE, entry + '\n');
    }
};

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
app.use(express.json());

// Performance Middleware: Logging
app.use((req, res, next) => {
    const start = Date.now();
    res.on('finish', () => {
        const duration = Date.now() - start;
        if (req.path.startsWith('/api')) {
            logger.info(`${req.method} ${req.path} ${res.statusCode} - ${duration}ms`);
        }
    });
    next();
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
    sectionOrder: ['Ollama', 'ComfyUI', 'LM Studio', 'Hugging Face', 'Standalone']
};
if (fs.existsSync(CONFIG_FILE)) {
    try { config = { ...config, ...JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8')) }; } catch (e) { logger.error('Failed to read config', e); }
}
if (!fs.existsSync(config.centralDir)) fs.mkdirSync(config.centralDir, { recursive: true });
function saveConfig() { 
    fs.writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2)); 
    cache.clear(); // Clear cache when config changes
}

const MODEL_EXTENSIONS = ['.gguf', '.safetensors', '.ckpt', '.bin', '.pt', '.pth'];

async function scanDirectory(dir, modelsList, ollamaMap) {
    if (!fs.existsSync(dir)) return;
    let source = 'Local';
    const lowerDir = dir.toLowerCase();
    if (lowerDir.includes('.ollama')) source = 'Ollama';
    else if (lowerDir.includes('comfyui')) source = 'ComfyUI';
    else if (lowerDir.includes('lm-studio') || lowerDir.includes('.lmstudio')) source = 'LM Studio';
    else if (lowerDir.includes('huggingface')) source = 'Hugging Face';
    else if (lowerDir.includes('stabilitymatrix')) source = 'Stability Matrix';
    else if (lowerDir.includes('llama.cpp')) source = 'Llama.cpp';

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
                        
                        if (source === 'Hugging Face' && fullPath.includes('models--')) {
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

app.get('/api/pick-folder', (req, res) => {
    const platform = os.platform();
    const initialPath = req.query.initialPath || '';
    let command = '';

    if (platform === 'win32') {
        const psFile = path.join(__dirname, 'picker.ps1');
        command = `powershell -NoProfile -ExecutionPolicy Bypass -sta -File "${psFile}" -initialPath "${initialPath}"`;
    } else if (platform === 'darwin') {
        const startPath = initialPath ? `default location "${initialPath.replace(/\\/g, '/')}"` : '';
        command = `osascript -e 'tell application "System Events" to activate' -e 'set theFolder to choose folder with prompt "Select a folder for Centraliza.ai" ${startPath}' -e 'POSIX path of theFolder'`;
    } else {
        const startPath = initialPath ? `--filename="${initialPath}/"` : '';
        command = `zenity --file-selection --directory --title="Select a folder for Centraliza.ai" ${startPath}`;
    }
    
    exec(command, (err, stdout) => {
        if (err) return res.json({ path: null });
        const pickedPath = stdout.trim().split('\n').pop()?.trim();
        res.json({ path: pickedPath || null });
    });
});

app.get('/api/registry', (req, res) => {
    const cached = cache.get('registry');
    if (cached) return res.json(cached);

    const registryPath = path.join(__dirname, 'data', 'hf_models.json');
    if (fs.existsSync(registryPath)) {
        let registry = JSON.parse(fs.readFileSync(registryPath, 'utf8'));
        registry.unshift({ name: "deepseek-ai/DeepSeek-R1-Distill-Llama-8B", provider: "DeepSeek", parameter_count: "8B", min_vram_gb: 5.5, use_case: "Reasoning, Coding", pipeline_tag: "text-generation", hf_downloads: 15000000 });
        cache.set('registry', registry, 60000 * 30); // 30 min cache
        res.json(registry);
    } else res.status(404).json({ error: 'Registry not found' });
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
        exec('nvidia-smi --query-gpu=memory.total,name --format=csv,noheader,nounits', (err, stdout) => {
            if (!err && stdout) {
                const parts = stdout.trim().split(',');
                return resolve({ ram: parseInt(parts[0]) * 1024 * 1024, name: parts[1]?.trim() });
            }
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
        });
    });
    const v = await getVram();
    const info = { totalRam: os.totalmem(), freeRam: os.freemem(), vram: v.ram, gpuName: v.name, cpuModel: os.cpus()[0].model };
    cache.set('system-info', info, 5000); // 5s cache
    res.json(info);
});

app.get('/api/models', async (req, res) => {
    const cached = cache.get('models-list');
    if (cached) return res.json(cached);

    const modelsList = [];
    const ollamaMap = await getOllamaMap();
    for (const dir of config.scanDirectories) if (fs.existsSync(dir)) await scanDirectory(dir, modelsList, ollamaMap);

    const seenOllamaTags = new Set();
    const seenPaths = new Set();
    const deduped = [];
    for (const m of modelsList) {
        if (m.ollamaTag) {
            if (seenOllamaTags.has(m.ollamaTag)) continue;
            seenOllamaTags.add(m.ollamaTag);
        } else {
            if (seenPaths.has(m.path)) continue;
            seenPaths.add(m.path);
        }
        deduped.push(m);
    }
    cache.set('models-list', deduped, 10000); // 10s cache
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

// --- API GATEWAY: OPENAI COMPATIBLE ---
// Allows Centraliza.ai to act as a drop-in replacement for OpenAI API clients (like Continue.dev, AutoGen, etc)
app.post('/v1/chat/completions', async (req, res) => {
    const { model, messages, temperature, top_p, stream = false } = req.body;

    if (!model || !messages || !Array.isArray(messages)) {
        return res.status(400).json({ error: 'Invalid payload. Model and messages array are required.' });
    }

    const fetch = (...args) => import('node-fetch').then(({default: fetch}) => fetch(...args));

    // For Phase 2, we proxy to Ollama on localhost:11434.
    // In Phase 3, this will proxy to our internal llama.cpp engine if running.
    const targetEndpoint = 'http://localhost:11434/api/chat';

    const payload = {
        model: model,
        messages: messages, // Ollama natively supports the OpenAI role/content array format on /api/chat
        stream: stream
    };

    const options = {};
    if (temperature !== undefined) options.temperature = temperature;
    if (top_p !== undefined) options.top_p = top_p;
    if (Object.keys(options).length > 0) payload.options = options;

    logger.info(`[API Gateway] Routing /v1/chat/completions for model: ${model} (Stream: ${stream})`);

    try {
        const response = await fetch(targetEndpoint, {
            method: 'POST',
            body: JSON.stringify(payload),
            headers: { 'Content-Type': 'application/json' }
        });

        if (!response.ok) {
            const errText = await response.text();
            throw new Error(`Upstream error: ${response.status} - ${errText}`);
        }

        if (stream) {
            res.setHeader('Content-Type', 'text/event-stream');
            res.setHeader('Cache-Control', 'no-cache');
            res.setHeader('Connection', 'keep-alive');

            // Proxying the stream directly from Ollama
            response.body.on('data', (chunk) => {
                try {
                    const lines = chunk.toString().split('\n').filter(l => l.trim());
                    for (const line of lines) {
                        const parsed = JSON.parse(line);
                        // Convert Ollama stream format to OpenAI stream format
                        const openAIChunk = {
                            id: `chatcmpl-${Date.now()}`,
                            object: 'chat.completion.chunk',
                            created: Math.floor(Date.now() / 1000),
                            model: model,
                            choices: [{
                                index: 0,
                                delta: { content: parsed.message?.content || '' },
                                finish_reason: parsed.done ? 'stop' : null
                            }]
                        };
                        res.write(`data: ${JSON.stringify(openAIChunk)}\n\n`);
                        if (parsed.done) res.write('data: [DONE]\n\n');
                    }
                } catch (err) {
                    logger.warn('Error parsing stream chunk', err);
                }
            });

            response.body.on('end', () => res.end());
            response.body.on('error', () => res.end());

        } else {
            const data = await response.json();
            // Convert Ollama static format to OpenAI static format
            const openAIResponse = {
                id: `chatcmpl-${Date.now()}`,
                object: 'chat.completion',
                created: Math.floor(Date.now() / 1000),
                model: model,
                choices: [{
                    index: 0,
                    message: data.message, // { role: "assistant", content: "..." }
                    finish_reason: 'stop'
                }],
                usage: {
                    prompt_tokens: data.prompt_eval_count || 0,
                    completion_tokens: data.eval_count || 0,
                    total_tokens: (data.prompt_eval_count || 0) + (data.eval_count || 0)
                }
            };
            res.json(openAIResponse);
        }
    } catch (e) {
        logger.error('[API Gateway] Error routing completion request', e);
        res.status(500).json({ error: 'AI Gateway Error: ' + e.message });
    }
});

app.post('/api/chat', async (req, res) => {
    const { ollamaTag, prompt, endpoint = 'http://localhost:11434/api/generate', options, system } = req.body;
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

    const isWindows = os.platform() === 'win32';
    const shellCmd = isWindows ? 'cmd.exe' : '/bin/sh';
    const shellArgs = isWindows ? ['/c', `ollama pull ${modelName}`] : ['-c', `ollama pull ${modelName}`];
    
    const proc = spawn(shellCmd, shellArgs, { shell: false, windowsHide: true });
    activeDownloads.set(modelName, { proc, completed: false });
    logger.info(`[Download] Started process for ${modelName} (PID: ${proc.pid})`);

    const onData = (data) => {
        const currentEntry = activeDownloads.get(modelName);
        if (!currentEntry || currentEntry.completed) return;
        const text = data.toString();
        const lines = text.split(/\r|\n/);
        for (const rawLine of lines) {
            // Strip ANSI codes and trim
            const line = rawLine.replace(/[\u001b\u009b][[()#;?]*(?:[0-9]{1,4}(?:;[0-9]{0,4})*)?[0-9A-ORZcf-nqry=><]/g, '').trim();
            if (!line) continue;
            
            const lower = line.toLowerCase();
            
            // Success terminal states
            if (lower.includes('success') || lower.includes('verifying sha256 digest') || (lower.includes('complete') && !lower.includes('pulling') && !lower.includes('layer'))) {
                finishDownload(modelName, { success: true });
                return;
            }

            // Progress parsing - focus on overall progress lines like "pulling manifest", "pulling layer", etc.
            // Ollama often sends multiple lines per update. We pick the first valid percentage.
            const match = line.match(/(\d+(?:\.\d+)?)\s*%/);
            if (match) {
                const p = Math.round(parseFloat(match[1]));
                const prev = lastProgress.get(modelName);
                
                // Only emit if progress increased or was -1, to prevent flicker from sub-layer progress
                if (prev === undefined || p > prev || (p === 0 && prev === -1)) {
                    lastProgress.set(modelName, p);
                    io.emit('download-progress', { model: modelName, progress: p });
                }
            } else if (lower.includes('pulling') || lower.includes('downloading')) {
                if (!lastProgress.has(modelName) || lastProgress.get(modelName) === -1) {
                    lastProgress.set(modelName, -1);
                    io.emit('download-progress', { model: modelName, progress: -1 });
                }
            }
        }
    };

    proc.stdout.on('data', onData);
    proc.stderr.on('data', onData);
    proc.on('close', (code) => {
        if (code === 0) finishDownload(modelName, { success: true });
        else {
            const entry = activeDownloads.get(modelName);
            if (entry && !entry.completed) finishDownload(modelName, { success: false });
        }
    });
    proc.on('error', (err) => {
        logger.error(`Download process error ${modelName}`, err);
        finishDownload(modelName, { success: false });
    });
    res.json({ success: true });
});

app.post('/api/download/pause', (req, res) => {
    const { modelName } = req.body;
    const entry = activeDownloads.get(modelName);
    if (entry) {
        logger.info(`[Download] Pausing ${modelName}`);
        finishDownload(modelName, { success: false, paused: true });
        if (os.platform() === 'win32') exec(`taskkill /F /T /PID ${entry.proc.pid}`, () => {});
        else entry.proc.kill('SIGKILL');
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
        if (os.platform() === 'win32') exec(`taskkill /F /T /PID ${entry.proc.pid}`, () => {});
        else entry.proc.kill('SIGKILL');
        
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
    } else res.status(404).json({ error: 'Download not found' });
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
            exec(`ollama rm ${ollamaTag}`, () => {
                cache.clear();
                io.emit('models-updated');
            });
            return res.json({ success: true });
        }
        if (modelPath && fs.existsSync(modelPath)) {
            await promisify(fs.unlink)(modelPath);
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

app.post('/api/open-folder', (req, res) => {
    const { folderPath } = req.body;
    if (os.platform() === 'win32') {
        const cleanPath = folderPath.replace(/\//g, '\\');
        exec(`explorer.exe /select,"${cleanPath}"`);
        const psFocus = `powershell.exe -Command "$path = '${path.dirname(cleanPath)}'; $wshell = New-Object -ComObject WScript.Shell; $explorer = New-Object -ComObject Shell.Application; $window = $explorer.Windows() | Where-Object { try { $_.Document.Folder.Self.Path.ToLower() -eq $path.ToLower() } catch { $false } } | Select-Object -First 1; if ($window) { $wshell.AppActivate($window.HWND) } else { $wshell.AppActivate('Explorador de Arquivos'); $wshell.AppActivate('File Explorer') }"`;
        setTimeout(() => { exec(psFocus); }, 1000);
    } else exec(`open -R "${folderPath}"`);
    res.json({ success: true });
});

const distPath = path.join(__dirname, 'frontend', 'dist');
if (fs.existsSync(distPath)) {
    app.use(express.static(distPath));
    app.use((req, res, next) => {
        if (!req.path.startsWith('/api')) res.sendFile(path.join(distPath, 'index.html'));
        else next();
    });
}

const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*" } });

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

if (require.main === module) {
    server.listen(4000, () => logger.info('Centraliza.ai on http://localhost:4000'));
}
module.exports = { app, server };
