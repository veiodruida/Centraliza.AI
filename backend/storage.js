'use strict';

const path = require('path');

const GB = 1024 ** 3;
const TB = 1024 ** 4;

/** Normaliza um caminho Windows para comparação (minúsculas, barras iguais). */
function normalizePath(p) {
  return String(p || '')
    .replace(/\//g, '\\')
    .replace(/\\+/g, '\\')
    .replace(/\\+$/, '')
    .toLowerCase();
}

/**
 * Etiqueta legível para uma localização. Evita caminhos gigantes na UI e mantém
 * as duas últimas pastas, que são as que identificam o motor (ex.: ".ollama\models").
 */
function shortLabel(location, centralDir) {
  const norm = normalizePath(location);
  const normCentral = normalizePath(centralDir);
  if (normCentral && (norm === normCentral || norm.startsWith(normCentral + '\\'))) {
    return 'Centraliza.ai';
  }
  const parts = String(location || '').split(/[\\/]+/).filter(Boolean);
  if (parts.length === 0) return String(location || '?');
  if (parts.length === 1) return parts[0];
  const tail = parts.slice(-2).join('\\');
  // Mantém a unidade (C:) para desambiguar pastas com o mesmo nome.
  const drive = parts[0].match(/^[a-zA-Z]:$/) ? parts[0] : null;
  return drive && !tail.includes(':') ? tail : tail;
}

/**
 * Determina a "localização" de um modelo: a raiz de scan que o contém (a mais
 * específica) ou, em último recurso, a pasta do ficheiro.
 */
function locationFor(modelPath, scanDirectories) {
  const np = normalizePath(modelPath);
  let best = null;
  for (const dir of (Array.isArray(scanDirectories) ? scanDirectories : [])) {
    if (!dir) continue;
    const nd = normalizePath(dir);
    if (!nd) continue;
    if (np === nd || np.startsWith(nd + '\\')) {
      if (!best || nd.length > normalizePath(best).length) best = dir;
    }
  }
  return best || path.dirname(modelPath || '');
}

/** Converte bytes em texto com unidade automática (GB/TB) — RF-010. */
function formatBytes(bytes) {
  const n = Number(bytes) || 0;
  if (n >= TB) return `${(n / TB).toFixed(2)} TB`;
  if (n >= GB) return `${(n / GB).toFixed(1)} GB`;
  const MB = 1024 ** 2;
  if (n >= MB) return `${(n / MB).toFixed(0)} MB`;
  return `${Math.round(n / 1024)} KB`;
}

/**
 * Agrega a lista de modelos em espaço total, espaço por localização e espaço
 * poupado por centralização (RF-010 … RF-014).
 *
 * Nota sobre hardlinks: um hardlink não duplica dados, por isso a soma dos
 * tamanhos de todas as entradas é o espaço físico real ocupado pelos modelos.
 * O "poupado" é a soma dos modelos já centralizados — o que teria sido
 * duplicado sem a centralização.
 */
function summarizeModels(models, options = {}) {
  const list = Array.isArray(models) ? models : [];
  const scanDirectories = Array.isArray(options.scanDirectories) ? options.scanDirectories : [];
  const centralDir = options.centralDir || '';

  const byLocation = new Map();
  let totalBytes = 0;
  let savedBytes = 0;
  let centralizedBytes = 0;
  let standaloneBytes = 0;
  let centralizedCount = 0;
  let standaloneCount = 0;
  let largest = null;

  for (const m of list) {
    if (!m || typeof m !== 'object') continue;
    const size = Number(m.size) || 0;
    totalBytes += size;
    const location = locationFor(m.path, scanDirectories);
    const key = location;
    if (!byLocation.has(key)) {
      byLocation.set(key, {
        path: location,
        label: shortLabel(location, centralDir),
        bytes: 0,
        count: 0,
        uniqueBytes: 0,
        savedBytes: 0,
        sources: {}
      });
    }
    const bucket = byLocation.get(key);
    bucket.bytes += size;
    bucket.count += 1;
    bucket.uniqueBytes += size;
    const src = m.source || 'Local';
    bucket.sources[src] = (bucket.sources[src] || 0) + 1;

    if (m.isSymlink || m.isCentralized) {
      savedBytes += size;
      centralizedBytes += size;
      centralizedCount += 1;
      bucket.savedBytes += size;
      bucket.centralizedCount = (bucket.centralizedCount || 0) + 1;
    } else {
      standaloneBytes += size;
      standaloneCount += 1;
    }

    if (!largest || size > Number(largest.size || 0)) {
      largest = { name: m.name, path: m.path, size, source: m.source || 'Local' };
    }
  }

  const locations = Array.from(byLocation.values())
    .map(l => ({
      ...l,
      bytesLabel: formatBytes(l.bytes),
      percent: totalBytes > 0 ? Math.round((l.bytes / totalBytes) * 1000) / 10 : 0,
      sources: Object.keys(l.sources).sort((a, b) => l.sources[b] - l.sources[a])
    }))
    .sort((a, b) => b.bytes - a.bytes);

  return {
    totalBytes,
    totalLabel: formatBytes(totalBytes),
    modelCount: list.length,
    savedBytes,
    savedLabel: formatBytes(savedBytes),
    centralizedBytes,
    standaloneBytes,
    centralizedCount,
    standaloneCount,
    largest,
    locations,
    locationCount: locations.length,
    generatedAt: new Date().toISOString()
  };
}

module.exports = { summarizeModels, formatBytes, shortLabel, locationFor, normalizePath, GB, TB };
