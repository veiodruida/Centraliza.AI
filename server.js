const express = require('express');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { promisify } = require('util');
const { exec, spawn } = require('child_process');

function buildOllamaManifestMap() {
    const blobToName = {};
    const manifestDir = path.join(os.homedir(), '.ollama', 'models', 'manifests');
    if (!fs.existsSync(manifestDir)) return blobToName;
    try {
        function scanManifestDir(currentDir, repoParts = []) {
            if (!fs.existsSync(currentDir)) return;
            const entries = fs.readdirSync(currentDir, { withFileTypes: true });
            for (const entry of entries) {
                const fullPath = path.join(currentDir, entry.name);
                if (entry.isDirectory()) scanManifestDir(fullPath, [...repoParts, entry.name]);
                else if (entry.isFile()) {
                    let nameParts = repoParts.slice(1);
                    if (nameParts[0] === 'library') nameParts = nameParts.slice(1);
                    const modelName = [...nameParts, entry.name].join(':');
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
    } catch (e) {}
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
    comfyDir: 'C:\\ComfyUI_windows_portable'
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
                                finalModelName = humanName.replace(':', '-') + '.gguf';
                                displayModelName = humanName;
                            } else {
                                finalModelName = entry.name + '.gguf';
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
                        const expectedDestPath = path.join(config.centralDir, 'CentralizaIA', modelBaseName, finalModelName);
                        const isCentralized = fs.existsSync(expectedDestPath);
                        const actualStat = await promisify(fs.stat)(fullPath);
                        if (actualStat.size > 1024 * 1024) {
                            modelsList.push({
                                name: displayModelName,
                                path: fullPath,
                                size: actualStat.size,
                                isSymlink: isCentralized,
                                targetPath: isCentralized ? expectedDestPath : null,
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
        path.join(os.homedir(), '.ollama', 'models', 'blobs'),
        'C:\\ComfyUI_windows_portable'
    ];
    let added = 0;
    common.forEach(p => { 
        if (fs.existsSync(p)) {
            if (p.includes('ComfyUI_windows_portable')) config.comfyDir = p;
            if (!config.scanDirectories.includes(p)) { config.scanDirectories.push(p); added++; } 
        }
    });
    if (added > 0) saveConfig();
    res.json({ success: true, added, config });
});

app.get('/api/pick-folder', (req, res) => {
    const script = `
    Add-Type -AssemblyName System.Windows.Forms
    $f = New-Object System.Windows.Forms.FolderBrowserDialog
    if ($f.ShowDialog() -eq "OK") { $f.SelectedPath }
    `;
    exec(`powershell -command "${script}"`, (err, stdout) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ path: stdout.trim() });
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
    const ollamaMap = buildOllamaManifestMap();
    for (const dir of config.scanDirectories) if (fs.existsSync(dir)) await scanDirectory(dir, modelsList, ollamaMap);
    res.json(modelsList);
});

app.post('/api/centralize', async (req, res) => {
    const { modelPath, finalModelName } = req.body;
    const modelBaseName = path.parse(finalModelName).name;
    const modelDir = path.join(config.centralDir, 'CentralizaIA', modelBaseName);
    const destPath = path.join(modelDir, finalModelName);
    if (!fs.existsSync(modelDir)) fs.mkdirSync(modelDir, { recursive: true });
    try { await promisify(fs.link)(modelPath, destPath); res.json({ success: true }); }
    catch (e) { try { await promisify(fs.symlink)(modelPath, destPath, 'file'); res.json({ success: true }); }
    catch (err) { res.status(500).json({ error: err.message }); } }
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
    const { type, modelPath, modelName, ollamaTag } = req.body;
    let command = '';
    if (type === 'ollama') command = `start cmd /k "ollama run ${ollamaTag || modelName}"`;
    else if (type === 'llama.cpp') command = `start cmd /k "llama-server.exe -m \\"${modelPath}\\" --port 8080"`;
    else if (type === 'comfyui') {
        const runBat = path.join(config.comfyDir, 'run_nvidia_gpu.bat');
        if (fs.existsSync(runBat)) command = `start cmd /k "cd /d \\"${config.comfyDir}\\" && run_nvidia_gpu.bat"`;
        else command = `start cmd /k "echo ComfyUI Home path incorrect. Update in Settings. && pause"`;
    } else if (type === 'lm-studio') {
        const lmPath = path.join(os.homedir(), 'AppData', 'Local', 'Programs', 'lm-studio', 'LM Studio.exe');
        if (fs.existsSync(lmPath)) command = `start "" "${lmPath}"`;
        else command = `start lm-studio://model/${modelName}`;
    }
    if (command) {
        exec(command, (err) => {
            if (err) return res.status(500).json({ error: 'Failed to launch: ' + err.message });
            res.json({ success: true, message: `Launching ${type}...` });
        });
    } else res.status(400).json({ error: 'Unsupported engine.' });
});

app.post('/api/download', (req, res) => {
    spawn('ollama', ['pull', req.body.modelName], { detached: true, stdio: 'ignore' }).unref();
    res.json({ success: true });
});

app.post('/api/open-folder', (req, res) => {
    const { folderPath } = req.body;
    if (os.platform() === 'win32') exec(`explorer /select,"${folderPath}"`);
    else exec(`open -R "${folderPath}"`);
    res.json({ success: true });
});

app.listen(4000, () => console.log('CentralizaIA on 4000'));
