'use strict';

/**
 * Auto-atualização da aplicação (RF-034).
 *
 * Verifica uma fonte de atualizações (manifesto JSON ou release do GitHub) no
 * arranque e periodicamente (por omissão a cada 24 h), descarrega o pacote,
 * valida a integridade SHA-256, aplica a atualização de forma transacional
 * (com backup e rollback) e notifica o utilizador.
 *
 * Sem rede, ou sem fonte configurada, o arranque nunca é bloqueado.
 */

const fs = require('fs');
const os = require('os');
const path = require('path');
const { exec } = require('child_process');
const { promisify } = require('util');

const execAsync = promisify(exec);
const WIN = os.platform() === 'win32';

// Nunca são substituídos pela atualização: configuração do utilizador, dados
// locais e dependências instaladas.
const PROTECTED = new Set(['config.json', 'server.log', 'debug_payload.log', '.git', '.updates', 'data', 'node_modules', 'package-lock.json', 'pnpm-lock.yaml', '.env']);

function cmpSemver(a, b) {
  const pa = String(a || '0').replace(/^v/i, '').split(/[.+-]/).map(n => parseInt(n, 10) || 0);
  const pb = String(b || '0').replace(/^v/i, '').split(/[.+-]/).map(n => parseInt(n, 10) || 0);
  for (let i = 0; i < 3; i++) {
    const x = pa[i] || 0;
    const y = pb[i] || 0;
    if (x !== y) return x > y ? 1 : -1;
  }
  return 0;
}

function createUpdater(deps) {
  const { getConfig, logger, appRoot, notify } = deps;
  const updatesDir = path.join(appRoot, '.updates');
  const state = {
    currentVersion: null,
    lastCheck: null,
    lastResult: 'never',
    available: null,
    error: null,
    checkedBy: null,
    restartPending: false
  };
  let timer = null;

  function cfg() {
    const c = getConfig() || {};
    const u = c.updates || {};
    return {
      enabled: u.enabled !== false,
      manifestUrl: u.manifestUrl || process.env.CENTRALIZA_UPDATE_MANIFEST || '',
      githubRepo: u.githubRepo || '',
      intervalHours: Number(u.intervalHours) > 0 ? Number(u.intervalHours) : 24,
      autoApply: u.autoApply !== false
    };
  }

  function currentVersion() {
    try {
      const pkg = JSON.parse(fs.readFileSync(path.join(appRoot, 'package.json'), 'utf8'));
      return pkg.version || '0.0.0';
    } catch (e) {
      return '0.0.0';
    }
  }

  function status() {
    const c = cfg();
    state.currentVersion = currentVersion();
    const configured = !!(c.manifestUrl || c.githubRepo);
    return {
      ...state,
      enabled: c.enabled,
      configured,
      source: c.manifestUrl ? 'manifest' : (c.githubRepo ? 'github' : null),
      intervalHours: c.intervalHours,
      autoApply: c.autoApply,
      updateAvailable: !!(state.available && cmpSemver(state.available.version, state.currentVersion) > 0)
    };
  }

  /** Lê o manifesto de atualização (URL direta ou release do GitHub). */
  async function fetchManifest() {
    const c = cfg();
    if (c.manifestUrl) {
      const res = await fetch(c.manifestUrl, { signal: AbortSignal.timeout(15000) });
      if (!res.ok) throw new Error(`Fonte de atualizações respondeu ${res.status}`);
      const data = await res.json();
      return normalizeManifest(data);
    }
    if (c.githubRepo) {
      const res = await fetch(`https://api.github.com/repos/${c.githubRepo}/releases/latest`, {
        headers: { Accept: 'application/vnd.github+json', 'User-Agent': 'Centraliza.ai' },
        signal: AbortSignal.timeout(15000)
      });
      if (!res.ok) throw new Error(`GitHub respondeu ${res.status} (repositório privado ou inexistente?)`);
      const rel = await res.json();
      const asset = (rel.assets || []).find(a => /\.zip$/i.test(a.name || '')) || (rel.assets || [])[0];
      return normalizeManifest({
        version: rel.tag_name || rel.name,
        url: asset ? asset.browser_download_url : null,
        sha256: null,
        notes: rel.body || ''
      });
    }
    return null;
  }

  function normalizeManifest(data) {
    if (!data || typeof data !== 'object') throw new Error('Manifesto de atualização inválido.');
    const version = String(data.version || data.tag || data.tag_name || '').replace(/^v/i, '');
    if (!version) throw new Error('O manifesto não indica a versão.');
    if (!data.url) throw new Error('O manifesto não indica a URL do pacote.');
    return {
      version,
      url: String(data.url),
      sha256: data.sha256 ? String(data.sha256).toLowerCase() : null,
      notes: data.notes || data.body || '',
      publishedAt: data.publishedAt || data.published_at || null
    };
  }

  async function check(origin = 'manual') {
    const c = cfg();
    state.lastCheck = new Date().toISOString();
    state.checkedBy = origin;
    state.error = null;
    state.currentVersion = currentVersion();

    if (!c.enabled) {
      state.lastResult = 'disabled';
      state.available = null;
      return status();
    }
    if (!c.manifestUrl && !c.githubRepo) {
      state.lastResult = 'not-configured';
      state.available = null;
      return status();
    }

    try {
      const manifest = await fetchManifest();
      if (!manifest) {
        state.lastResult = 'not-configured';
        return status();
      }
      if (cmpSemver(manifest.version, state.currentVersion) > 0) {
        state.available = manifest;
        state.lastResult = 'available';
        logger.info(`[Update] Nova versão disponível: v${manifest.version} (atual v${state.currentVersion}).`);
        if (typeof notify === 'function') notify('update-available', { version: manifest.version, current: state.currentVersion, notes: manifest.notes });
        if (c.autoApply) {
          logger.info('[Update] Aplicação automática ativada — a instalar...');
          const applied = await applyInternal(manifest);
          return { ...status(), ...applied };
        }
      } else {
        state.available = null;
        state.lastResult = 'up-to-date';
      }
      return status();
    } catch (e) {
      state.lastResult = 'error';
      state.error = String(e.message || e);
      logger.warn(`[Update] Verificação falhou (o arranque continua normalmente): ${state.error}`);
      return status();
    }
  }

  async function download(url, destFile) {
    const res = await fetch(url, { signal: AbortSignal.timeout(120000), headers: { 'User-Agent': 'Centraliza.ai' } });
    if (!res.ok) throw new Error(`Download falhou (HTTP ${res.status}).`);
    const buffer = Buffer.from(await res.arrayBuffer());
    fs.mkdirSync(path.dirname(destFile), { recursive: true });
    fs.writeFileSync(destFile, buffer);
    return { size: buffer.length, sha256: require('crypto').createHash('sha256').update(buffer).digest('hex') };
  }

  async function extract(zipFile, destDir) {
    fs.rmSync(destDir, { recursive: true, force: true });
    fs.mkdirSync(destDir, { recursive: true });
    if (WIN) {
      const cmd = `powershell -NoProfile -Command "Expand-Archive -LiteralPath '${zipFile.replace(/'/g, "''")}' -DestinationPath '${destDir.replace(/'/g, "''")}' -Force"`;
      await execAsync(cmd, { timeout: 180000, windowsHide: true });
    } else {
      await execAsync(`unzip -oq "${zipFile}" -d "${destDir}"`, { timeout: 180000 });
    }
    // O ZIP pode trazer uma pasta raiz (ex.: centraliza-ai-v0.5.1/).
    let root = destDir;
    const entries = fs.readdirSync(destDir, { withFileTypes: true }).filter(e => !e.name.startsWith('.'));
    if (entries.length === 1 && entries[0].isDirectory()) root = path.join(destDir, entries[0].name);
    return root;
  }

  function copyRecursive(fromDir, toDir, backupDir, rel = '') {
    const entries = fs.readdirSync(fromDir, { withFileTypes: true });
    const copied = [];
    for (const entry of entries) {
      const relPath = rel ? path.join(rel, entry.name) : entry.name;
      if (rel === '' && PROTECTED.has(entry.name)) continue;
      if (entry.name === 'node_modules' || entry.name === '.git') continue;
      const src = path.join(fromDir, entry.name);
      const dest = path.join(toDir, entry.name);
      if (entry.isDirectory()) {
        fs.mkdirSync(dest, { recursive: true });
        copied.push(...copyRecursive(src, dest, backupDir, relPath));
      } else {
        if (fs.existsSync(dest)) {
          const bak = path.join(backupDir, relPath);
          fs.mkdirSync(path.dirname(bak), { recursive: true });
          fs.copyFileSync(dest, bak);
        }
        fs.mkdirSync(path.dirname(dest), { recursive: true });
        fs.copyFileSync(src, dest);
        copied.push(relPath);
      }
    }
    return copied;
  }

  async function applyInternal(manifest) {
    const version = manifest.version;
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    const workDir = path.join(updatesDir, 'staging', `${version}-${stamp}`);
    const zipFile = path.join(workDir, 'package.zip');
    const extractDir = path.join(workDir, 'content');
    const backupDir = path.join(updatesDir, 'rollback', `${version}-${stamp}`);

    try {
      fs.mkdirSync(workDir, { recursive: true });
      logger.info(`[Update] A descarregar v${version}...`);
      const dl = await download(manifest.url, zipFile);
      if (manifest.sha256 && dl.sha256 !== manifest.sha256) {
        fs.rmSync(zipFile, { force: true });
        throw new Error(`SHA-256 não corresponde (esperado ${manifest.sha256}, obtido ${dl.sha256}). Atualização cancelada.`);
      }
      logger.info('[Update] Integridade verificada. A extrair...');
      const root = await extract(zipFile, extractDir);
      if (!fs.existsSync(path.join(root, 'server.js')) && !fs.existsSync(path.join(root, 'package.json'))) {
        throw new Error('O pacote não parece ser uma distribuição do Centraliza.ai (sem server.js/package.json).');
      }
      logger.info('[Update] A aplicar ficheiros (transacional)...');
      const copied = copyRecursive(root, appRoot, backupDir);
      fs.writeFileSync(path.join(updatesDir, 'last-update.json'), JSON.stringify({
        version, appliedAt: new Date().toISOString(), files: copied.length, backupDir, sha256: dl.sha256
      }, null, 2));
      state.restartPending = true;
      state.lastResult = 'applied';
      state.available = null;
      logger.info(`[Update] v${version} aplicada (${copied.length} ficheiros). Reinicie a aplicação para concluir.`);
      if (typeof notify === 'function') notify('update-applied', { version, restartRequired: true, files: copied.length });
      return { applied: true, version, restartRequired: true, backupDir, files: copied.length };
    } catch (e) {
      state.lastResult = 'error';
      state.error = String(e.message || e);
      logger.error('[Update] Falha ao aplicar atualização', e);
      // Rollback: restaura os ficheiros que já tinham sido substituídos.
      try {
        if (fs.existsSync(backupDir)) {
          const restore = (dir, rel = '') => {
            for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
              const relPath = rel ? path.join(rel, entry.name) : entry.name;
              const src = path.join(dir, entry.name);
              const dest = path.join(appRoot, relPath);
              if (entry.isDirectory()) restore(src, relPath);
              else { fs.mkdirSync(path.dirname(dest), { recursive: true }); fs.copyFileSync(src, dest); }
            }
          };
          restore(backupDir);
          logger.warn('[Update] Rollback concluído — a versão anterior foi restaurada.');
        }
      } catch (re) {
        logger.error('[Update] Rollback falhou', re);
      }
      return { applied: false, error: state.error };
    } finally {
      try { fs.rmSync(workDir, { recursive: true, force: true }); } catch (e) { /* mantém para diagnóstico */ }
    }
  }

  async function apply() {
    const c = cfg();
    if (!state.available) {
      const checked = await check('apply');
      if (!checked.available) return { applied: false, error: 'Não há nenhuma atualização disponível.', status: checked };
    }
    return { ...(await applyInternal(state.available)), status: status() };
  }

  function schedule() {
    const c = cfg();
    if (timer) { clearInterval(timer); timer = null; }
    if (!c.enabled || (!c.manifestUrl && !c.githubRepo)) return;
    const intervalMs = Math.max(1, c.intervalHours) * 60 * 60 * 1000;
    timer = setInterval(() => { check('schedule').catch(() => {}); }, intervalMs);
    if (timer.unref) timer.unref();
  }

  return { status, check, apply, schedule, cmpSemver };
}

module.exports = { createUpdater, cmpSemver };
