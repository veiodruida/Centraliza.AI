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
    const modelsBody = document.getElementById('modelsBody');
    const errorBox = document.getElementById('errorBox');

    let currentConfig = {
        centralDir: '',
        scanDirectories: []
    };

    // Initialize
    fetchConfig();

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
        modelsBody.innerHTML = '';
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
            modelsBody.innerHTML = '<tr><td colspan="6" style="text-align:center">No models found. Try adding more directories.</td></tr>';
            return;
        }

        models.forEach(model => {
            const tr = document.createElement('tr');
            
            const isCentralized = model.isSymlink;
            const statusBadge = isCentralized 
                ? '<span class="status-badge status-centralized">Centralized</span>'
                : '<span class="status-badge status-unmanaged">Unmanaged</span>';

            const actionBtn = isCentralized
                ? `<button class="action-btn" disabled>Already Linked</button>`
                : `<button class="action-btn centralize-btn" data-path="${model.path.replace(/\\/g, '\\\\')}" data-name="${model.name}" data-finalname="${model.finalModelName}">Centralize</button>`;

            // Checkbox should be enabled for deletion even if centralized!
            const checkboxHtml = `<input type="checkbox" class="model-checkbox" data-path="${model.path.replace(/\\/g, '\\\\')}" data-name="${model.name}" data-finalname="${model.finalModelName}">`;

            tr.innerHTML = `
                <td>${checkboxHtml}</td>
                <td><strong>${model.name}</strong></td>
                <td>${statusBadge}</td>
                <td>${formatBytes(model.size)}</td>
                <td title="${model.path}">${model.path.length > 40 ? '...' + model.path.substring(model.path.length - 37) : model.path}</td>
                <td>${actionBtn}</td>
            `;
            modelsBody.appendChild(tr);
        });

        // Add checkbox listeners
        document.querySelectorAll('.model-checkbox').forEach(cb => {
            cb.addEventListener('change', updateCentralizeBtnState);
        });
        updateCentralizeBtnState();
        
        // Add centralize listeners
        document.querySelectorAll('.centralize-btn').forEach(btn => {
            btn.addEventListener('click', async (e) => {
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
                    
                    alert('Success: ' + data.message);
                    scanModels(); // Refresh list
                } catch (err) {
                    showError(err.message);
                    e.target.innerText = originalText;
                    e.target.disabled = false;
                }
            });
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
