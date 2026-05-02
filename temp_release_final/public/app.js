document.addEventListener('DOMContentLoaded', () => {
    // DOM Elements
    const centralDirInput = document.getElementById('centralDir');
    const scanDirsList = document.getElementById('scanDirsList');
    const newScanDirInput = document.getElementById('newScanDir');
    const addDirBtn = document.getElementById('addDirBtn');
    const autoDetectBtn = document.getElementById('autoDetectBtn');
    const saveConfigBtn = document.getElementById('saveConfigBtn');
    const selectAllBtn = document.getElementById('selectAllBtn');
    const deselectAllBtn = document.getElementById('deselectAllBtn');
    const centralizeSelectedBtn = document.getElementById('centralizeSelectedBtn');
    const deleteSelectedBtn = document.getElementById('deleteSelectedBtn');
    const scanBtn = document.getElementById('scanBtn');
    const loadingDiv = document.getElementById('loading');
    const modelsContainer = document.getElementById('models-container');
    const systemStatsDiv = document.getElementById('system-stats');
    const errorBox = document.getElementById('errorBox');
    const downloadBtn = document.getElementById('downloadBtn');
    const downloadNameInput = document.getElementById('downloadName');
    const downloadStatus = document.getElementById('downloadStatus');

    let currentConfig = {
        centralDir: '',
        scanDirectories: []
    };

    let sysInfo = null;

    // Initialize
    fetchConfig();
    loadSystemInfo();

    // Event Listeners
    addDirBtn.addEventListener('click', () => {
        const dir = newScanDirInput.value.trim();
        if (dir && !currentConfig.scanDirectories.includes(dir)) {
            currentConfig.scanDirectories.push(dir);
            newScanDirInput.value = '';
            renderScanDirs();
        }
    });

    saveConfigBtn.addEventListener('click', async () => {
        currentConfig.centralDir = centralDirInput.value.trim();
        try {
            const res = await fetch('/api/config', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(currentConfig)
            });
            const data = await res.json();
            if (data.error) throw new Error(data.error);
            alert('Configuration saved successfully!');
        } catch (err) {
            showError(err.message);
        }
    });

    autoDetectBtn.addEventListener('click', async () => {
        const originalText = autoDetectBtn.innerText;
        autoDetectBtn.innerText = 'Detecting...';
        autoDetectBtn.disabled = true;
        
        try {
            const res = await fetch('/api/auto-detect', { method: 'POST' });
            const data = await res.json();
            
            if (data.error) throw new Error(data.error);
            
            currentConfig = data.config;
            renderScanDirs();
            
            if (data.addedCount > 0) {
                alert(`Found and added ${data.addedCount} new standard directories!`);
            } else {
                alert('No new standard directories found on your PC. You might need to add them manually.');
            }
        } catch (err) {
            showError('Failed to auto-detect directories: ' + err.message);
        } finally {
            autoDetectBtn.innerText = originalText;
            autoDetectBtn.disabled = false;
        }
    });

    scanBtn.addEventListener('click', scanModels);

    downloadBtn.addEventListener('click', async () => {
        const modelName = downloadNameInput.value.trim();
        if (!modelName) return;

        downloadBtn.disabled = true;
        downloadStatus.innerText = `Starting download of ${modelName}...`;
        downloadStatus.className = 'status-badge status-unmanaged'; // Red/Warning style
        downloadStatus.classList.remove('hidden');

        try {
            const res = await fetch('/api/download', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ modelName })
            });
            const data = await res.json();
            
            downloadStatus.innerText = data.message;
            downloadStatus.className = 'status-badge status-centralized';
            downloadNameInput.value = '';
            
            // Wait a bit and refresh scan
            setTimeout(scanModels, 5000);
        } catch (err) {
            downloadStatus.innerText = 'Error: ' + err.message;
            downloadStatus.className = 'status-badge status-unmanaged';
        } finally {
            downloadBtn.disabled = false;
        }
    });

    selectAllBtn.addEventListener('click', () => {
        document.querySelectorAll('.model-checkbox').forEach(cb => {
            cb.checked = true;
        });
        updateCentralizeBtnState();
    });

    deselectAllBtn.addEventListener('click', () => {
        document.querySelectorAll('.model-checkbox').forEach(cb => cb.checked = false);
        updateCentralizeBtnState();
    });

    centralizeSelectedBtn.addEventListener('click', async () => {
        const checkboxes = document.querySelectorAll('.model-checkbox:checked');
        if (checkboxes.length === 0) return;

        centralizeSelectedBtn.disabled = true;
        let successCount = 0;
        let failCount = 0;

        for (const cb of checkboxes) {
            const modelPath = cb.dataset.path;
            const modelName = cb.dataset.name;
            const finalModelName = cb.dataset.finalname;
            const row = cb.closest('tr');
            const actionCell = row.querySelector('td:last-child');
            actionCell.innerHTML = '<span style="color:var(--accent-color)">Moving...</span>';
            
            try {
                const res = await fetch('/api/centralize', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ modelPath, modelName, finalModelName })
                });
                const data = await res.json();
                if (data.error) throw new Error(data.error);
                actionCell.innerHTML = '<span style="color:var(--success-color); font-weight:600;">Done</span>';
                cb.disabled = true;
                cb.checked = false;
                successCount++;
            } catch (err) {
                actionCell.innerHTML = `<span style="color:var(--danger-color)" title="${err.message}">Failed</span>`;
                failCount++;
            }
        }
        
        updateCentralizeBtnState();
        alert(`Batch process complete! ${successCount} centralized, ${failCount} failed.`);
        scanModels(); // Refresh list to update status badges
    });

    deleteSelectedBtn.addEventListener('click', async () => {
        const checkboxes = document.querySelectorAll('.model-checkbox:checked');
        if (checkboxes.length === 0) return;

        if (!confirm(`Are you SURE you want to permanently delete ${checkboxes.length} model(s) from your PC? This cannot be undone.`)) {
            return;
        }

        deleteSelectedBtn.disabled = true;
        let successCount = 0;
        let failCount = 0;

        for (const cb of checkboxes) {
            const modelPath = cb.dataset.path;
            const modelName = cb.dataset.name;
            const finalModelName = cb.dataset.finalname;
            const row = cb.closest('tr');
            const actionCell = row.querySelector('td:last-child');
            actionCell.innerHTML = '<span style="color:var(--danger-color)">Deleting...</span>';
            
            try {
                const res = await fetch('/api/models', {
                    method: 'DELETE',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ modelPath, modelName, finalModelName })
                });
                const data = await res.json();
                if (data.error) throw new Error(data.error);
                actionCell.innerHTML = '<span style="color:var(--danger-color); font-weight:600;">Deleted</span>';
                cb.disabled = true;
                cb.checked = false;
                successCount++;
            } catch (err) {
                actionCell.innerHTML = `<span style="color:var(--danger-color)" title="${err.message}">Failed</span>`;
                failCount++;
            }
        }
        
        updateCentralizeBtnState();
        alert(`Deletion complete! ${successCount} deleted, ${failCount} failed.`);
        scanModels(); // Refresh list
    });

    function updateCentralizeBtnState() {
        const checked = document.querySelectorAll('.model-checkbox:checked').length;
        centralizeSelectedBtn.disabled = checked === 0;
        centralizeSelectedBtn.innerText = checked > 0 ? `Centralize Selected (${checked})` : 'Centralize Selected';
        deleteSelectedBtn.disabled = checked === 0;
        deleteSelectedBtn.innerText = checked > 0 ? `Delete Selected (${checked})` : 'Delete Selected';
    }

    // Functions
    async function fetchConfig() {
        try {
            const res = await fetch('/api/config');
            currentConfig = await res.json();
            centralDirInput.value = currentConfig.centralDir;
            renderScanDirs();
        } catch (err) {
            showError('Failed to load configuration.');
        }
    }

    async function loadSystemInfo() {
        try {
            const res = await fetch('/api/system-info');
            sysInfo = await res.json();
            const ramGB = (sysInfo.totalRam / (1024 ** 3)).toFixed(1);
            const vramGB = (sysInfo.vram / (1024 ** 3)).toFixed(1); // wmic AdapterRAM is in bytes on newer windows
            
            systemStatsDiv.innerHTML = `
                <span>RAM: <strong>${ramGB} GB</strong></span>
                <span>VRAM: <strong>${vramGB} GB</strong></span>
            `;
        } catch (e) {
            console.error('Failed to load system info', e);
        }
    }

    function renderScanDirs() {
        scanDirsList.innerHTML = '';
        currentConfig.scanDirectories.forEach((dir, index) => {
            const li = document.createElement('li');
            li.innerHTML = `
                <span title="${dir}">${dir.length > 50 ? '...' + dir.substring(dir.length - 47) : dir}</span>
                <button class="remove-btn" data-index="${index}">✕</button>
            `;
            scanDirsList.appendChild(li);
        });

        // Add remove listeners
        document.querySelectorAll('.remove-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const index = parseInt(e.target.dataset.index);
                currentConfig.scanDirectories.splice(index, 1);
                renderScanDirs();
            });
        });
    }

    async function scanModels() {
        hideError();
        loadingDiv.classList.remove('hidden');
        modelsContainer.innerHTML = '';
        scanBtn.disabled = true;

        try {
            const res = await fetch('/api/models');
            const models = await res.json();
            renderModels(models);
        } catch (err) {
            showError('Failed to scan models: ' + err.message);
        } finally {
            loadingDiv.classList.add('hidden');
            scanBtn.disabled = false;
        }
    }

    function formatBytes(bytes, decimals = 2) {
        if (bytes === 0) return '0 Bytes';
        const k = 1024;
        const dm = decimals < 0 ? 0 : decimals;
        const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
    }

    function renderModels(models) {
        if (models.length === 0) {
            modelsContainer.innerHTML = '<div style="text-align:center; padding: 2rem;">No models found. Try adding more directories.</div>';
            return;
        }

        // Group models by source
        const groups = {};
        models.forEach(model => {
            const source = model.source || 'Local';
            if (!groups[source]) groups[source] = [];
            groups[source].push(model);
        });

        Object.keys(groups).sort().forEach(source => {
            const groupModels = groups[source];
            const groupDiv = document.createElement('div');
            groupDiv.className = 'model-group';
            
            const sourceClass = source.toLowerCase().replace(/ /g, '-');
            
            groupDiv.innerHTML = `
                <div class="group-header">
                    <span class="source-badge source-${sourceClass}">${source}</span>
                    <h3>${source} Models (${groupModels.length})</h3>
                </div>
                <div class="table-wrapper">
                    <table>
                        <thead>
                            <tr>
                                <th style="width: 40px;"></th>
                                <th>Model Name</th>
                                <th>Status</th>
                                <th>Size</th>
                                <th>Original Path</th>
                                <th>Action</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${groupModels.map(model => renderModelRow(model)).join('')}
                        </tbody>
                    </table>
                </div>
            `;
            modelsContainer.appendChild(groupDiv);
        });

        attachRowListeners();
    }

    function renderModelRow(model) {
        const isCentralized = model.isSymlink;
        const statusBadge = isCentralized 
            ? '<span class="status-badge status-centralized">Centralized</span>'
            : '<span class="status-badge status-unmanaged">Local Only</span>';

        const actionBtn = isCentralized
            ? `<button class="action-btn" disabled>Already Linked</button>`
            : `<button class="action-btn centralize-btn" data-path="${model.path.replace(/\\/g, '\\\\')}" data-name="${model.name}" data-finalname="${model.finalModelName}">Centralize</button>`;

        const checkboxHtml = `<input type="checkbox" class="model-checkbox" data-path="${model.path.replace(/\\/g, '\\\\')}" data-name="${model.name}" data-finalname="${model.finalModelName}">`;

        // VRAM Check
        let vramBadge = '';
        if (sysInfo && sysInfo.vram > 0) {
            const modelBytes = model.size;
            const availableVram = sysInfo.vram;
            if (modelBytes < availableVram * 0.8) vramBadge = '<span class="vram-badge vram-good" title="GPU Ready">GPU Ready</span>';
            else if (modelBytes < availableVram * 1.2) vramBadge = '<span class="vram-badge vram-warning" title="GPU Tight">GPU Tight</span>';
            else vramBadge = '<span class="vram-badge vram-bad" title="System RAM">System RAM</span>';
        }

        const externalLinkHtml = model.externalLink 
            ? `<a href="${model.externalLink}" target="_blank" class="external-link" title="Explore Source">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"></path><polyline points="15 3 21 3 21 9"></polyline><line x1="10" y1="14" x2="21" y2="3"></line></svg>
               </a>` 
            : '';

        return `
            <tr>
                <td>${checkboxHtml}</td>
                <td>
                    <div style="display:flex; align-items:center; gap:8px">
                        <strong>${model.name}</strong>
                        ${vramBadge}
                        ${externalLinkHtml}
                    </div>
                </td>
                <td>${statusBadge}</td>
                <td>${formatBytes(model.size)}</td>
                <td class="path-cell" data-path="${model.path.replace(/\\/g, '\\\\')}" title="Click to open in Explorer">
                    ${model.path.length > 40 ? '...' + model.path.substring(model.path.length - 37) : model.path}
                </td>
                <td>${actionBtn}</td>
            </tr>
        `;
    }

    function attachRowListeners() {
        document.querySelectorAll('.centralize-btn').forEach(btn => {
            btn.onclick = async (e) => {
                const modelPath = e.target.dataset.path;
                const modelName = e.target.dataset.name;
                const finalModelName = e.target.dataset.finalname;
                const originalText = e.target.innerText;
                
                e.target.innerText = 'Moving...';
                e.target.disabled = true;
                
                try {
                    hideError();
                    const res = await fetch('/api/centralize', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ modelPath, modelName, finalModelName })
                    });
                    
                    const data = await res.json();
                    if (data.error) throw new Error(data.error);
                    
                    e.target.innerText = 'Success!';
                    scanModels();
                } catch (err) {
                    showError(err.message);
                    e.target.innerText = originalText;
                    e.target.disabled = false;
                }
            };
        });

        document.querySelectorAll('.path-cell').forEach(cell => {
            cell.onclick = (e) => {
                const folderPath = e.currentTarget.dataset.path;
                fetch('/api/open-folder', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ folderPath })
                });
            };
        });

        document.querySelectorAll('.model-checkbox').forEach(cb => {
            cb.onchange = updateCentralizeBtnState;
        });
    }

    function showError(msg) {
        errorBox.innerText = msg;
        errorBox.classList.remove('hidden');
    }

    function hideError() {
        errorBox.classList.add('hidden');
    }
});
