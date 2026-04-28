const express = require('express');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { promisify } = require('util');

// Helper to map Ollama blobs to human-readable names
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
                if (entry.isDirectory()) {
                    scanManifestDir(fullPath, [...repoParts, entry.name]);
                } else if (entry.isFile()) {
                    // repoParts usually looks like: ['registry.ollama.ai', 'namespace', 'model']
                    // entry.name is the tag (e.g. '14b' or 'latest')
                    
                    // We only want 'namespace-model-tag'. So we slice(1).
                    // If repoParts is ['registry.ollama.ai', 'library', 'deepseek-r1'], we want 'deepseek-r1-14b'
                    // If repoParts is ['registry.ollama.ai', 'mradermacher', 'gemma'], we want 'mradermacher-gemma-latest'
                    let nameParts = repoParts.slice(1);
                    if (nameParts[0] === 'library') {
                        nameParts = nameParts.slice(1); // omit 'library'
                    }
                    const modelName = [...nameParts, entry.name].join('-');
                    
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
                    } catch (e) {
                        // Ignore parse errors
                    }
                }
            }
        }
        scanManifestDir(manifestDir);
    } catch (e) {
        console.error('Error building Ollama map:', e);
    }
    
    return blobToName;
}

const app = express();
app.use(express.json());
app.use(express.static('public'));

const CONFIG_FILE = path.join(__dirname, 'config.json');
const DEFAULT_CENTRAL_DIR = 'C:\\AI_Models';

// Default configuration
let config = {
    centralDir: DEFAULT_CENTRAL_DIR,
    scanDirectories: [
        path.join(os.homedir(), '.cache', 'lm-studio', 'models'), // LM Studio
        path.join(os.homedir(), 'AppData', 'Roaming', 'StabilityMatrix', 'Models'), // Stability Matrix
        path.join(os.homedir(), '.ollama', 'models', 'blobs'), // Ollama
        path.join(os.homedir(), 'ComfyUI', 'models', 'checkpoints'), // ComfyUI
        path.join(os.homedir(), 'llama.cpp', 'models'), // Llama.cpp
        path.join(os.homedir(), '.cache', 'huggingface', 'hub'), // HuggingFace
    ]
};

// Load config
if (fs.existsSync(CONFIG_FILE)) {
    try {
        const loadedConfig = JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8'));
        config = { ...config, ...loadedConfig };
    } catch (e) {
        console.error('Error loading config.json:', e);
    }
}

// Ensure central dir exists
if (!fs.existsSync(config.centralDir)) {
    try {
        fs.mkdirSync(config.centralDir, { recursive: true });
    } catch (e) {
        console.error('Could not create central directory:', e);
    }
}

function saveConfig() {
    fs.writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2));
}

const MODEL_EXTENSIONS = ['.gguf', '.safetensors', '.ckpt', '.bin', '.pt', '.pth'];

async function scanDirectory(dir, modelsList, ollamaMap) {
    if (!fs.existsSync(dir)) return;

    try {
        const entries = await promisify(fs.readdir)(dir, { withFileTypes: true });

        for (const entry of entries) {
            const fullPath = path.join(dir, entry.name);

            if (entry.isDirectory()) {
                await scanDirectory(fullPath, modelsList, ollamaMap);
            } else if (entry.isFile()) {
                // Check if it's a model
                const ext = path.extname(entry.name).toLowerCase();
                const isOllamaBlob = entry.name.startsWith('sha256-') && ext === '';
                
                if (MODEL_EXTENSIONS.includes(ext) || isOllamaBlob) {
                    try {
                        // Determine the expected name in the central directory
                        let finalModelName = entry.name;
                        let displayModelName = entry.name;
                        
                        if (isOllamaBlob) {
                            const humanName = ollamaMap[entry.name];
                            if (humanName) {
                                finalModelName = humanName + '.gguf';
                                displayModelName = humanName + ' (Ollama)';
                            } else {
                                finalModelName = entry.name + '.gguf';
                            }
                        }
                        
                        // LM Studio requires Author/Repo/file.gguf structure
                        const modelBaseName = path.parse(finalModelName).name;
                        const expectedDestPath = path.join(config.centralDir, 'CentralizaIA', modelBaseName, finalModelName);
                        
                        // It is centralized if the link or file already exists in the central directory
                        const isCentralized = fs.existsSync(expectedDestPath);
                        
                        let targetPath = null;
                        if (isCentralized) {
                            targetPath = "Centralized in " + expectedDestPath;
                        }

                        // Get file size
                        const actualStat = await promisify(fs.stat)(fullPath);

                        // Ignore very small files (less than 1MB) which might be just config files in HF or elsewhere
                        if (actualStat.size > 1024 * 1024) {
                            modelsList.push({
                                name: displayModelName,
                                path: fullPath,
                                size: actualStat.size,
                                isSymlink: isCentralized,
                                targetPath,
                                finalModelName: finalModelName
                            });
                        }
                    } catch (err) {
                        console.error('Error stating file', fullPath, err);
                    }
                }
            }
        }
    } catch (e) {
        console.error(`Error scanning directory ${dir}:`, e);
    }
}

app.get('/api/config', (req, res) => {
    res.json(config);
});

app.post('/api/config', (req, res) => {
    const { centralDir, scanDirectories } = req.body;
    if (centralDir) config.centralDir = centralDir;
    if (scanDirectories) config.scanDirectories = scanDirectories;

    // Ensure new central dir exists
    if (!fs.existsSync(config.centralDir)) {
        try {
            fs.mkdirSync(config.centralDir, { recursive: true });
        } catch (e) {
            return res.status(500).json({ error: 'Could not create central directory.' });
        }
    }

    saveConfig();
    res.json({ success: true, config });
});

app.post('/api/auto-detect', async (req, res) => {
    const commonPaths = [
        path.join(os.homedir(), '.cache', 'lm-studio', 'models'),
        path.join(os.homedir(), '.lmstudio', 'models'),
        path.join(os.homedir(), '.lmstudio', '.internal', 'bundled-models'),
        path.join(os.homedir(), '.cache', 'huggingface', 'hub'),
        path.join(os.homedir(), 'AppData', 'Roaming', 'StabilityMatrix', 'Models'),
        path.join(os.homedir(), '.ollama', 'models', 'blobs'),
        path.join(os.homedir(), 'Documents', 'ComfyUI', 'models'),
        path.join(os.homedir(), 'Documents', 'ComfyUI', 'custom_nodes'),
        path.join(os.homedir(), 'ComfyUI', 'models'),
        path.join(os.homedir(), 'ComfyUI_windows_portable', 'ComfyUI', 'models'),
        path.join(os.homedir(), 'llama.cpp', 'models'),
        path.join(os.homedir(), 'Documents', 'llama.cpp', 'models'),
        'C:\\ComfyUI_windows_portable\\ComfyUI\\models\\checkpoints',
        'C:\\ComfyUI\\models\\checkpoints',
        'C:\\llama.cpp\\models',
        'D:\\ComfyUI_windows_portable\\ComfyUI\\models\\checkpoints',
        'D:\\ComfyUI\\models\\checkpoints',
        'D:\\llama.cpp\\models'
    ];

    let addedCount = 0;
    for (const p of commonPaths) {
        if (fs.existsSync(p) && !config.scanDirectories.includes(p)) {
            config.scanDirectories.push(p);
            addedCount++;
        }
    }

    if (addedCount > 0) {
        saveConfig();
    }

    res.json({ success: true, addedCount, config });
});

app.get('/api/models', async (req, res) => {
    const modelsList = [];
    const ollamaMap = buildOllamaManifestMap();
    
    for (const dir of config.scanDirectories) {
        if (fs.existsSync(dir)) {
            await scanDirectory(dir, modelsList, ollamaMap);
        }
    }
    res.json(modelsList);
});

app.post('/api/centralize', async (req, res) => {
    const { modelPath, modelName, finalModelName } = req.body;

    if (!fs.existsSync(modelPath)) {
        return res.status(404).json({ error: 'Model file not found.' });
    }

    // Determine final model name
    let targetFileName = finalModelName || modelName;
    if (targetFileName.startsWith('sha256-') && !targetFileName.includes('.')) {
        targetFileName = targetFileName + '.gguf';
    }

    // LM Studio requires the structure: <central_dir>/<Author>/<Repo>/model.gguf
    const modelBaseName = path.parse(targetFileName).name;
    const modelDir = path.join(config.centralDir, 'CentralizaIA', modelBaseName);
    const destPath = path.join(modelDir, targetFileName);

    // Ensure the Author/Repo directory exists
    if (!fs.existsSync(modelDir)) {
        fs.mkdirSync(modelDir, { recursive: true });
    }
    
    // If it's already there, do nothing
    if (fs.existsSync(destPath)) {
        return res.json({ success: true, message: 'Model is already centralized!' });
    }

    try {
        // We create a Hardlink IN the central directory, pointing TO the original file.
        // This prevents breaking the original program (like Ollama or ComfyUI) because
        // their files are never moved, renamed, or touch in terms of permissions.
        await promisify(fs.link)(modelPath, destPath);
        res.json({ success: true, message: 'Model centralized (Hardlink) successfully!' });
    } catch (linkError) {
        if (linkError.code === 'EXDEV') {
            // Cross-device, try Symlink
            try {
                await promisify(fs.symlink)(modelPath, destPath, 'file');
                res.json({ success: true, message: 'Model centralized (Symlink) successfully!' });
            } catch (symlinkError) {
                if (symlinkError.code === 'EPERM') {
                    return res.status(403).json({
                        error: 'O Windows bloqueou o link simbólico entre discos diferentes. Por favor, feche e abra o terminal como Administrador para centralizar entre diferentes discos (Ex: C: e D:).'
                    });
                }
                return res.status(500).json({ error: 'Failed to create symlink: ' + symlinkError.message });
            }
        } else {
            return res.status(500).json({ error: 'Failed to create hardlink: ' + linkError.message });
        }
    }
});

app.delete('/api/models', async (req, res) => {
    const { modelPath, finalModelName, modelName } = req.body;

    try {
        let deletedOriginal = false;
        let deletedCentral = false;

        // 1. Delete original file
        if (fs.existsSync(modelPath)) {
            await promisify(fs.unlink)(modelPath);
            deletedOriginal = true;
        }

        // 2. Delete centralized file
        let targetFileName = finalModelName || modelName;
        if (targetFileName.startsWith('sha256-') && !targetFileName.includes('.')) {
            targetFileName = targetFileName + '.gguf';
        }
        
        const modelBaseName = path.parse(targetFileName).name;
        const modelDir = path.join(config.centralDir, 'CentralizaIA', modelBaseName);
        const destPath = path.join(modelDir, targetFileName);

        if (fs.existsSync(destPath)) {
            await promisify(fs.unlink)(destPath);
            deletedCentral = true;
        }

        // Clean up empty directory in central repo
        if (fs.existsSync(modelDir)) {
            const files = fs.readdirSync(modelDir);
            if (files.length === 0) fs.rmdirSync(modelDir);
        }

        if (deletedOriginal || deletedCentral) {
            res.json({ success: true, message: 'Model deleted successfully.' });
        } else {
            res.status(404).json({ error: 'File not found in any path.' });
        }
    } catch (e) {
        res.status(500).json({ error: 'Failed to delete: ' + e.message });
    }
});

const PORT = 4000;
app.listen(PORT, () => {
    console.log(`CentralizaIA is running on http://localhost:${PORT}`);
});
