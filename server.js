const express = require('express');
const fs = require('fs');
const path = require('path');
const os = require('os');
const http = require('http');
const { Server } = require('socket.io');
const { promisify } = require('util');
const { exec, spawn } = require('child_process');
const checkDiskSpace = require('check-disk-space').default;

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
        console.log(`[Ollama] Mapped ${Object.keys(blobToName).length} models from manifests.`);
    } catch (e) {
        console.error(`[Ollama] Failed to scan manifests: ${e.message}`);
    }
    return blobToName;
}

const app = express();
app.use(express.json());

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
    try { config = { ...config, ...JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8')) }; } catch (e) {}
}
if (!fs.existsSync(config.centralDir)) fs.mkdirSync(config.centralDir, { recursive: true });
function saveConfig() { fs.writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2)); }

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
                // Skip partial blobs: Ollama appends '-partial' suffix during download
                const isPartialBlob = isOllamaBlob && entry.name.endsWith('-partial');
                if (isPartialBlob) continue;
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
                                // Sanitize filename: replace both colons and slashes with dashes
                                finalModelName = humanName.replace(/[:\/]/g, '-') + '.gguf';
                                displayModelName = humanName;
                            } else {
                                // Skip unmapped blobs (they are either partial or internal orphans)
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
                                // If they have the same inode (hardlink) or same size/mtime (best guess)
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
        if (err) {
            // If user cancels, zenity/osascript might return error code. We return null path.
            return res.json({ path: null });
        }
        const pickedPath = stdout.trim().split('\n').pop()?.trim();
        res.json({ path: pickedPath || null });
    });
});

app.get('/api/registry', (req, res) => {
    const registryPath = path.join(__dirname, 'data', 'hf_models.json');
    if (fs.existsSync(registryPath)) {
        let registry = JSON.parse(fs.readFileSync(registryPath, 'utf8'));
        registry.unshift({ name: "deepseek-ai/DeepSeek-R1-Distill-Llama-8B", provider: "DeepSeek", parameter_count: "8B", min_vram_gb: 5.5, use_case: "Reasoning, Coding", pipeline_tag: "text-generation", hf_downloads: 15000000 });
        res.json(registry);
    } else res.status(404).json({ error: 'Registry not found' });
});

app.get('/api/model-readme', async (req, res) => {
    const { repoId, localPath } = req.query;
    if (repoId) {
        const fetch = (...args) => import('node-fetch').then(({default: fetch}) => fetch(...args));
        try {
            const response = await fetch(`https://huggingface.co/api/models/${repoId}/readme`);
            const data = await response.text();
            return res.send(data);
        } catch (e) {}
    }
    if (localPath) {
        const dir = path.dirname(localPath);
        const readmeFiles = ['README.md', 'readme.md', 'model_details.json'];
        for (const f of readmeFiles) {
            const p = path.join(dir, f);
            if (fs.existsSync(p)) return res.send(fs.readFileSync(p, 'utf8'));
        }
    }
    res.send("No detailed description found for this model.");
});

app.get('/api/system-info', async (req, res) => {
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
    res.json({ totalRam: os.totalmem(), freeRam: os.freemem(), vram: v.ram, gpuName: v.name, cpuModel: os.cpus()[0].model });
});

app.get('/api/models', async (req, res) => {
    const modelsList = [];
    const ollamaMap = await getOllamaMap();
    for (const dir of config.scanDirectories) if (fs.existsSync(dir)) await scanDirectory(dir, modelsList, ollamaMap);

    // Deduplicate: same Ollama model can appear as both a blob AND a hardlink in C:\AI_Models
    // Keep only ONE entry per ollamaTag (prefer the blob/source, not the centralized copy)
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
    res.json(deduped);
});

app.post('/api/centralize', async (req, res) => {
    const { modelPath, finalModelName } = req.body;
    if (!modelPath || !finalModelName) {
        console.error('[Centralize] Missing parameters:', { modelPath, finalModelName });
        return res.status(400).json({ error: 'Missing modelPath or finalModelName' });
    }
    console.log(`[Centralize] Request for ${finalModelName} from ${modelPath}`);
    
    if (!fs.existsSync(modelPath)) {
        console.error(`[Centralize] SOURCE FILE NOT FOUND: ${modelPath}`);
        return res.status(404).json({ error: 'Source file not found: ' + modelPath });
    }

    // Sanitize finalModelName again just in case
    const safeName = finalModelName.trim().replace(/[:\/]/g, '-');
    const modelBaseName = path.parse(safeName).name;
    const modelDir = path.resolve(config.centralDir, 'Centraliza.ai', modelBaseName);
    const destPath = path.resolve(modelDir, safeName);
    
    console.log(`[Centralize] Target Path: ${destPath}`);

    if (!fs.existsSync(modelDir)) {
        console.log(`[Centralize] Creating directory: ${modelDir}`);
        fs.mkdirSync(modelDir, { recursive: true });
    }
    
    if (fs.existsSync(destPath)) {
        console.log(`[Centralize] Target already exists. Removing to recreate: ${destPath}`);
        fs.unlinkSync(destPath);
    }

    try { 
        console.log(`[Centralize] Attempting hardlink: ${modelPath} -> ${destPath}`);
        await promisify(fs.link)(modelPath, destPath); 
        console.log('[Centralize] Hardlink SUCCESS');
        res.json({ success: true }); 
    } catch (e) { 
        console.log(`[Centralize] Hardlink failed. Reason: ${e.code || e.message}`);
        console.log(`[Centralize] Attempting symlink fallback...`);
        try { 
            await promisify(fs.symlink)(modelPath, destPath, 'file'); 
            res.json({ success: true }); 
        } catch (err) { 
            console.error(`[Centralize] ALL ATTEMPTS FAILED: ${err.message}`);
            res.status(500).json({ error: err.message }); 
        } 
    }
});

app.post('/api/chat', async (req, res) => {
    const { ollamaTag, prompt, endpoint = 'http://localhost:11434/api/generate' } = req.body;
    const fetch = (...args) => import('node-fetch').then(({default: fetch}) => fetch(...args));
    try {
        const response = await fetch(endpoint, {
            method: 'POST',
            body: JSON.stringify({ model: ollamaTag, prompt, stream: false }),
            headers: { 'Content-Type': 'application/json' }
        });
        const data = await response.json();
        res.json(data);
    } catch (e) { res.status(500).json({ error: 'AI Server error: ' + e.message }); }
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
        exec(`start cmd /k "${cmd}"`, (err) => {
            if (err) return res.status(500).json({ error: 'Failed to launch: ' + err.message });
            res.json({ success: true, message: `Launching ${type}...` });
        });
    } else res.status(400).json({ error: 'Unsupported engine.' });
});

// Map of modelName -> { proc, completed }
const activeDownloads = new Map();
// Set of models pending cancel (so proc.on('close') knows to emit cancelled:true)
const pendingCancels = new Set();
// Track last real progress per model (to avoid flickering with -1)
const lastProgress = new Map();

// Global finish function accessible by pause/cancel routes
function finishDownload(modelName, options = { success: false }) {
    const entry = activeDownloads.get(modelName);
    if (!entry || entry.completed) return;
    entry.completed = true;
    activeDownloads.delete(modelName);
    lastProgress.delete(modelName);
    const isCancelled = options.cancelled || pendingCancels.has(modelName);
    pendingCancels.delete(modelName);
    console.log(`[Socket Emit] download-complete ${modelName}:`, { ...options, cancelled: isCancelled });
    io.emit('download-complete', { 
        model: modelName, 
        success: options.success || false, 
        cancelled: isCancelled,
        paused: options.paused || false 
    });
}

app.post('/api/download', (req, res) => {
    const { modelName } = req.body;
    
    if (activeDownloads.has(modelName)) {
        return res.status(400).json({ error: 'Download already in progress.' });
    }

    // Use shell to properly handle ollama command on Windows
    const isWindows = os.platform() === 'win32';
    const shellCmd = isWindows ? 'cmd.exe' : '/bin/sh';
    const shellArgs = isWindows ? ['/c', `ollama pull ${modelName}`] : ['-c', `ollama pull ${modelName}`];
    
    const proc = spawn(shellCmd, shellArgs, {
        shell: false,
        windowsHide: true,
        env: { ...process.env }
    });
    
    const entry = { proc, completed: false };
    activeDownloads.set(modelName, entry);
    console.log(`[Download] Started process for ${modelName} (PID: ${proc.pid})`);

    const onData = (data) => {
        // Skip processing if already done
        const currentEntry = activeDownloads.get(modelName);
        if (!currentEntry || currentEntry.completed) return;

        const text = data.toString();
        process.stdout.write(text);
        
        // Ollama uses \r to overwrite the same line for progress updates.
        // Split on \r first, then \n, to get each individual progress line.
        const lines = text.split(/\r|\n/);
        for (const rawLine of lines) {
            // Strip ANSI escape codes
            const line = rawLine.replace(/[\u001b\u009b][[()#;?]*(?:[0-9]{1,4}(?:;[0-9]{0,4})*)?[0-9A-ORZcf-nqry=><]/g, '').trim();
            if (!line) continue;

            const lower = line.toLowerCase();

            // Detect completion FIRST (highest priority)
            if (
                lower.includes('success') ||
                lower.includes('verifying sha256 digest') ||
                (lower.includes('complete') && !lower.includes('pulling') && !lower.includes('layer'))
            ) {
                console.log(`[Download] Success detected for ${modelName}`);
                io.emit('download-progress', { model: modelName, progress: 100 });
                setTimeout(() => io.emit('models-updated'), 1500);
                finishDownload(modelName, { success: true });
                return; // stop processing further lines
            }

            // Progress percentage — e.g. "pulling manifest  23%" or "pulling layer 23 %"
            const match = line.match(/(\d+(?:\.\d+)?)\s*%/);
            if (match) {
                const p = Math.round(parseFloat(match[1]));
                const prev = lastProgress.get(modelName);
                // Only emit if changed, and never go backward (avoid flicker from multi-layer reporting)
                if (prev === undefined || p > prev) {
                    lastProgress.set(modelName, p);
                    console.log(`[Socket Emit] download-progress ${modelName}: ${p}%`);
                    io.emit('download-progress', { model: modelName, progress: p });
                }
            } else if (lower.includes('pulling') || lower.includes('downloading')) {
                // Only send indeterminate if we haven't received any real % yet
                if (!lastProgress.has(modelName)) {
                    io.emit('download-progress', { model: modelName, progress: -1 });
                }
            }
        }
    };

    proc.stdout.on('data', onData);
    proc.stderr.on('data', (data) => {
        console.error(`[Download stderr] ${data.toString()}`);
        onData(data);
    });

    proc.on('close', (code) => {
        console.log(`[Download] ${modelName} closed with code ${code}, pendingCancel=${pendingCancels.has(modelName)}`);
        if (code === 0) {
            io.emit('download-progress', { model: modelName, progress: 100 });
            finishDownload(modelName, { success: true });
        } else {
            // If pause/cancel route already called finishDownload, this is a no-op (guard inside).
            // If close fires first (race), pendingCancels tells us the intent.
            finishDownload(modelName, { success: false });
        }
    });
    proc.on('error', (err) => {
        console.error(`[Download Error] ${modelName} failed to start: ${err.message}`);
        finishDownload(modelName, { success: false });
    });

    res.json({ success: true, message: 'Download started' });
    
    // Initial indeterminate state
    setTimeout(() => {
        const e = activeDownloads.get(modelName);
        if (e && !e.completed) {
            io.emit('download-progress', { model: modelName, progress: -1 });
        }
    }, 500);
});

app.post('/api/download/pause', (req, res) => {
    const { modelName } = req.body;
    const entry = activeDownloads.get(modelName);
    if (entry) {
        console.log(`[Download] Pausing model: ${modelName} (keeping partials)`);
        // Signal BEFORE killing so proc.on('close') fires after completed=true
        finishDownload(modelName, { success: false, paused: true });
        if (os.platform() === 'win32') {
            exec(`taskkill /F /T /PID ${entry.proc.pid}`, () => {});
        } else {
            entry.proc.kill('SIGKILL');
        }
        res.json({ success: true, message: 'Download paused (partial files kept)' });
    } else {
        res.status(404).json({ error: 'Download not found' });
    }
});

app.post('/api/download/cancel', (req, res) => {
    const { modelName } = req.body;
    const entry = activeDownloads.get(modelName);
    if (entry) {
        // Mark as pending cancel BEFORE killing — so even if proc.on('close') wins the race,
        // finishDownload will read pendingCancels and emit cancelled:true
        pendingCancels.add(modelName);
        // Signal cancelled immediately (also removes from activeDownloads)
        finishDownload(modelName, { success: false, cancelled: true });
        
        if (os.platform() === 'win32') {
            exec(`taskkill /F /T /PID ${entry.proc.pid}`, () => {});
        } else {
            entry.proc.kill('SIGKILL');
        }
        
        // Cleanup partial Ollama blobs from disk after process has time to die
        console.log(`[Download] PERMANENT CLEANUP for model: ${modelName}...`);
        setTimeout(() => {
            exec(`ollama rm ${modelName}`, (err) => {
                if (err) console.error(`[Download] Cleanup failed for ${modelName}:`, err.message);
                else console.log(`[Download] Cleanup success for ${modelName}`);
            });
            // Also delete any partial blob files in ~/.ollama/models/blobs/
            const blobDir = path.join(os.homedir(), '.ollama', 'models', 'blobs');
            if (fs.existsSync(blobDir)) {
                try {
                    fs.readdirSync(blobDir).forEach(f => {
                        if (f.endsWith('-partial')) {
                            try { 
                                fs.unlinkSync(path.join(blobDir, f)); 
                                console.log(`[Download] Deleted partial blob: ${f}`);
                            } catch (e) {}
                        }
                    });
                } catch (e) {}
            }
            io.emit('models-updated');
        }, 2500);

        res.json({ success: true, message: 'Download cancelled and cleanup scheduled' });
    } else {
        res.status(404).json({ error: 'Download not found' });
    }
});
app.post('/api/models/rename', async (req, res) => {
    const { oldPath, newName } = req.body;
    const oldDir = path.dirname(oldPath);
    const ext = path.extname(oldPath);
    const newPath = path.join(oldDir, newName + ext);
    try {
        await promisify(fs.rename)(oldPath, newPath);
        res.json({ success: true });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/models/move', async (req, res) => {
    const { oldPath, newDir } = req.body;
    const fileName = path.basename(oldPath);
    const newPath = path.join(newDir, fileName);
    try {
        await promisify(fs.rename)(oldPath, newPath);
        res.json({ success: true });
    } catch (e) {
        // Fallback for cross-device move
        try {
            await promisify(fs.copyFile)(oldPath, newPath);
            await promisify(fs.unlink)(oldPath);
            res.json({ success: true, fallback: true });
        } catch (err) { res.status(500).json({ error: err.message }); }
    }
});

app.delete('/api/models', async (req, res) => {
    const { modelPath, ollamaTag, centralPath } = req.body;
    console.log(`[Delete] Request for:`, { modelPath, ollamaTag, centralPath });
    try {
        // Decentralize case: ONLY remove the link in centralPath
        if (centralPath) {
            console.log(`[Delete] Decentralizing: removing link at ${centralPath}`);
            if (fs.existsSync(centralPath)) {
                await promisify(fs.unlink)(centralPath);
                io.emit('models-updated');
                return res.json({ success: true, decentralized: true });
            }
        }

        // Delete case: Remove from source
        if (ollamaTag) {
            console.log(`[Ollama] Removing model: ${ollamaTag}`);
            try {
                // Ensure no download is active for this model
                const proc = activeDownloads.get(ollamaTag);
                if (proc) {
                    if (os.platform() === 'win32') exec(`taskkill /F /T /PID ${proc.pid}`);
                    else proc.kill('SIGKILL');
                    activeDownloads.delete(ollamaTag);
                }

                // Use a more robust way to run ollama rm
                exec(`ollama rm ${ollamaTag}`, (err, stdout, stderr) => {
                    if (err) {
                        // Even if it errors, check if model is still there
                        console.warn(`[Ollama] rm warning/error for ${ollamaTag}: ${err.message}`);
                    }
                    console.log(`[Ollama] rm output: ${stdout || 'none'}`);
                    if (stderr) console.log(`[Ollama] rm stderr: ${stderr}`);
                    io.emit('models-updated');
                });
                
                // Return success immediately as ollama rm is usually non-blocking for the manifest removal
                return res.json({ success: true, ollama: true });
            } catch (err) {
                console.error(`[Ollama] rm unexpected error: ${err.message}`);
                return res.status(500).json({ error: err.message });
            }
        }
        
        if (modelPath && fs.existsSync(modelPath)) {
            await promisify(fs.unlink)(modelPath);
            io.emit('models-updated');
            return res.json({ success: true });
        }
        
        res.status(404).json({ error: 'Model not found or already deleted.' });
    } catch (e) { 
        console.error(`[Delete] General error: ${e.message}`);
        res.status(500).json({ error: e.message }); 
    }
});

app.post('/api/models/sanity-check', async (req, res) => {
    const linkDir = path.join(config.centralDir, 'Centraliza.ai');
    if (!fs.existsSync(linkDir)) return res.json({ cleaned: 0 });
    let cleaned = 0;
    const clean = (d) => {
        fs.readdirSync(d, {withFileTypes:true}).forEach(e => {
            const p = path.join(d, e.name);
            if (e.isDirectory()) clean(p);
            else {
                try { fs.statSync(p); } catch(err) { fs.unlinkSync(p); cleaned++; }
            }
        });
    };
    try { clean(linkDir); } catch(e) {}
    res.json({ success: true, cleaned });
});

app.get('/api/system/disk', async (req, res) => {
    try {
        const diskPath = path.parse(process.cwd()).root;
        const disk = await checkDiskSpace(diskPath);
        
        // Calculate space used by Centraliza.ai links
        let centralSize = 0;
        const linkDir = path.join(config.centralDir, 'Centraliza.ai');
        const getDirSize = (d) => {
            if (!fs.existsSync(d)) return 0;
            let total = 0;
            fs.readdirSync(d, {withFileTypes:true}).forEach(e => {
                const p = path.join(d, e.name);
                if (e.isDirectory()) total += getDirSize(p);
                else {
                    try { total += fs.statSync(p).size; } catch(err) {}
                }
            });
            return total;
        };
        centralSize = getDirSize(linkDir);

        res.json({
            total: disk.size,
            free: disk.free,
            used: disk.size - disk.free,
            centraliza: centralSize,
            others: (disk.size - disk.free) - centralSize
        });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/open-folder', (req, res) => {
    const { folderPath } = req.body;
    if (os.platform() === 'win32') {
        const cleanPath = folderPath.replace(/\//g, '\\');
        // Open explorer and select file
        exec(`explorer.exe /select,"${cleanPath}"`);
        
        // Advanced focus script: find the window by path and bring to front
        const parentDir = path.dirname(cleanPath);
        const psFocus = `powershell.exe -Command "$path = '${parentDir}'; $wshell = New-Object -ComObject WScript.Shell; $explorer = New-Object -ComObject Shell.Application; $window = $explorer.Windows() | Where-Object { try { $_.Document.Folder.Self.Path.ToLower() -eq $path.ToLower() } catch { $false } } | Select-Object -First 1; if ($window) { $wshell.AppActivate($window.HWND) } else { $wshell.AppActivate('Explorador de Arquivos'); $wshell.AppActivate('File Explorer') }"`;
        
        setTimeout(() => {
            exec(psFocus);
        }, 1000);
    } else {
        exec(`open -R "${folderPath}"`);
    }
    res.json({ success: true });
});

// Serve Frontend Static Files
const distPath = path.join(__dirname, 'frontend', 'dist');
if (fs.existsSync(distPath)) {
    app.use(express.static(distPath));
    // SPA Fallback: Redirect all non-API routes to index.html
    app.use((req, res, next) => {
        if (!req.path.startsWith('/api')) {
            res.sendFile(path.join(distPath, 'index.html'));
        } else {
            next();
        }
    });
}

const server = http.createServer(app);
const io = new Server(server, {
    cors: { origin: "*" }
});

io.on('connection', (socket) => {
    console.log('Client connected via WebSocket');
    
    // Test event to verify UI progress bar
    socket.on('test-progress', () => {
        let p = 0;
        const iv = setInterval(() => {
            p += 10;
            io.emit('download-progress', { model: 'TEST_MODEL_CONNECTION', progress: p });
            if (p >= 100) {
                clearInterval(iv);
                io.emit('download-complete', { model: 'TEST_MODEL_CONNECTION', success: true });
            }
        }, 300);
    });
});

if (require.main === module) {
    server.listen(4000, () => console.log('Centraliza.ai on http://localhost:4000'));
}

module.exports = { app, server };
