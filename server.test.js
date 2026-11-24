import { describe, it, expect, afterAll } from 'vitest';
import request from 'supertest';
import { app, server, parseGGUFBuffer, parseGGUFHeader } from './server.js';
import flavor from './backend/flavor.js';
import fs from 'fs';
import os from 'os';
import path from 'path';

const { classifyFlavor } = flavor;

// Constrói um buffer GGUF sintético (v3) com metadados conhecidos.
function buildSyntheticGGUF(overrides = {}) {
    const parts = [];
    const u8 = (v) => { const b = Buffer.alloc(1); b.writeUInt8(v); parts.push(b); };
    const u32 = (v) => { const b = Buffer.alloc(4); b.writeUInt32LE(v); parts.push(b); };
    const u64 = (v) => { const b = Buffer.alloc(8); b.writeBigUInt64LE(BigInt(v)); parts.push(b); };
    const str = (s) => { u64(Buffer.byteLength(s)); parts.push(Buffer.from(s, 'utf8')); };
    const kv = (key, type, valueFn) => { str(key); u32(type); valueFn(); };

    u32(0x46554747);      // magic "GGUF"
    u32(3);               // versão
    u64(1);               // tensor_count
    u64(6);               // metadata_kv_count

    kv('general.architecture', 8, () => str(overrides.arch || 'qwen35'));
    kv('llama.block_count', 4, () => u32(overrides.nLayers ?? 64));
    kv('llama.embedding_length', 4, () => u32(overrides.nEmb ?? 5120));
    kv('llama.context_length', 4, () => u32(overrides.nCtxMax ?? 262144));
    kv('llama.attention.head_count_kv', 4, () => u32(overrides.nKVHeads ?? 4));
    kv('general.file_type', 4, () => u32(overrides.fileType ?? 12)); // Q4_K

    return Buffer.concat(parts);
}

describe('CentralizaIA API', () => {
  afterAll(() => {
    server.close();
  });

  it('GET /api/system-info should return hardware metrics', async () => {
    const res = await request(app).get('/api/system-info');
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('vram');
    expect(res.body).toHaveProperty('totalRam');
  });

  it('GET /api/models should return an array', async () => {
    const res = await request(app).get('/api/models');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });

  it('parseGGUFBuffer lê metadados de um GGUF sintético', () => {
    const buf = buildSyntheticGGUF();
    const r = parseGGUFBuffer(buf, 123456789);
    expect(r.ok).toBe(true);
    expect(r.arch).toBe('qwen35');
    expect(r.nLayers).toBe(64);
    expect(r.nEmb).toBe(5120);
    expect(r.nCtxMax).toBe(262144);
    expect(r.nKVHeads).toBe(4);
    expect(r.fileType).toBe(12);
    expect(r.quantName).toBe('Q4_K');
    expect(r.fileSizeBytes).toBe(123456789);
    expect(r.paramsEstimate).toBe(64 * (12 * 5120 * 5120 + 13 * 5120));
  });

  it('parseGGUFBuffer rejeita buffers sem assinatura GGUF', () => {
    const r = parseGGUFBuffer(Buffer.from('isto não é gguf!'));
    expect(r.ok).toBe(false);
    expect(r.error).toBeTruthy();
  });

  it('GET /api/gguf/meta devolve metadados de um ficheiro local', async () => {
    const tmp = path.join(os.tmpdir(), `gguf-test-${Date.now()}.gguf`);
    fs.writeFileSync(tmp, buildSyntheticGGUF());
    try {
      const res = await request(app).get(`/api/gguf/meta?path=${encodeURIComponent(tmp)}`);
      expect(res.status).toBe(200);
      expect(res.body.ok).toBe(true);
      expect(res.body.nLayers).toBe(64);
      expect(res.body.quantName).toBe('Q4_K');
    } finally {
      fs.unlinkSync(tmp);
    }
  });

  it('GET /api/gguf/meta sem path devolve 400', async () => {
    const res = await request(app).get('/api/gguf/meta');
    expect(res.status).toBe(400);
  });

  // --- v0.5.0: etiquetagem Abliterated/Uncensored (RF-002/RF-003) ---
  it('classifyFlavor deteta Abliterated e Uncensored pelo nome', () => {
    const abl = classifyFlavor('mlabonne/Llama-3-8B-Instruct-abliterated');
    expect(abl.abliterated).toBe(true);
    expect(abl.flavors).toContain('abliterated');

    const unc = classifyFlavor('DavidAU/Qwen3.8-27B-Uncensored-GGUF');
    expect(unc.uncensored).toBe(true);
    expect(unc.flavors).toContain('uncensored');

    const both = classifyFlavor('user/Model-Abliterated-Uncensored-v2');
    expect(both.abliterated).toBe(true);
    expect(both.uncensored).toBe(true);

    const plain = classifyFlavor('Qwen/Qwen2.5-Coder-7B-Instruct-GGUF');
    expect(plain.abliterated).toBe(false);
    expect(plain.uncensored).toBe(false);
    expect(plain.flavors).toEqual([]);
  });

  it('classifyFlavor também olha para as tags do HuggingFace', () => {
    const r = classifyFlavor({ name: 'org/base-model', hf_tags: ['gguf', 'uncensored'] });
    expect(r.uncensored).toBe(true);
  });

  it('GET /api/registry devolve as etiquetas de flavor em cada modelo', async () => {
    const res = await request(app).get('/api/registry');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body.length).toBeGreaterThan(0);
    for (const m of res.body.slice(0, 20)) {
      expect(typeof m.is_abliterated).toBe('boolean');
      expect(typeof m.is_uncensored).toBe('boolean');
      expect(Array.isArray(m.flavors)).toBe(true);
    }
    // O catálogo local tem modelos abliterated/uncensored conhecidos.
    expect(res.body.some(m => m.is_abliterated || m.is_uncensored)).toBe(true);
  });

  it('GET /api/models?filter=abliterated só devolve modelos abliterated', async () => {
    const res = await request(app).get('/api/models?filter=abliterated');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    for (const m of res.body) expect(m.is_abliterated).toBe(true);
  });

  // --- v0.5.0: espaço total e por localização (RF-010 … RF-014) ---
  it('GET /api/storage/summary soma o espaço dos modelos e agrupa por localização', async () => {
    const models = await request(app).get('/api/models');
    const res = await request(app).get('/api/storage/summary');
    expect(res.status).toBe(200);
    const s = res.body;
    expect(typeof s.totalBytes).toBe('number');
    expect(s.totalBytes).toBeGreaterThan(0);
    expect(Array.isArray(s.locations)).toBe(true);
    expect(s.locations.length).toBeGreaterThan(0);

    const sumModels = models.body.reduce((acc, m) => acc + (m.size || 0), 0);
    const diff = Math.abs(sumModels - s.totalBytes) / Math.max(1, sumModels);
    expect(diff).toBeLessThan(0.01); // tolerância < 1% (RF-010)

    const sumLocations = s.locations.reduce((acc, l) => acc + l.bytes, 0);
    expect(Math.abs(sumLocations - s.totalBytes) / Math.max(1, s.totalBytes)).toBeLessThan(0.01);
    expect(s.locations[0]).toHaveProperty('label');
    expect(s.locations[0]).toHaveProperty('count');
    expect(typeof s.savedBytes).toBe('number');
  });

  // --- v0.5.0: deteção de motores (RF-020/RF-021) ---
  it('GET /api/engines devolve os motores detetados com estado', async () => {
    const t0 = Date.now();
    const res = await request(app).get('/api/engines');
    const elapsed = Date.now() - t0;
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.engines)).toBe(true);
    const ids = res.body.engines.map(e => e.id);
    expect(ids).toEqual(expect.arrayContaining(['ollama', 'llamacpp', 'lmstudio', 'comfyui']));
    for (const e of res.body.engines) {
      expect(typeof e.installed).toBe('boolean');
      expect(typeof e.running).toBe('boolean');
      expect(e).toHaveProperty('label');
    }
    expect(elapsed).toBeLessThan(5000); // RNF-001 (margem para CI)
  });

  // --- v0.5.0: logs do servidor (RF-024) ---
  it('GET /api/logs/recent devolve o histórico de logs', async () => {
    const res = await request(app).get('/api/logs/recent?limit=50');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.logs)).toBe(true);
    expect(typeof res.body.max).toBe('number');
  });

  // --- v0.5.0: estado do Coder e auto-update (RF-031 … RF-035) ---
  it('GET /api/coder/status agrega motor, agente e atualizações', async () => {
    const res = await request(app).get('/api/coder/status');
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('engine');
    expect(res.body).toHaveProperty('agent');
    expect(res.body).toHaveProperty('update');
    expect(typeof res.body.engine.running).toBe('boolean');
    expect(typeof res.body.agent.running).toBe('boolean');
    expect(typeof res.body.update.currentVersion).toBe('string');
    // RF-030: já não existe qualquer estado do agente CLI de terceiros.
    expect(res.body).not.toHaveProperty('installed');
  });

  it('GET /api/update/status devolve a versão atual do package.json', async () => {
    const pkg = JSON.parse(fs.readFileSync(path.join(process.cwd(), 'package.json'), 'utf8'));
    const res = await request(app).get('/api/update/status');
    expect(res.status).toBe(200);
    expect(res.body.currentVersion).toBe(pkg.version);
    expect(typeof res.body.enabled).toBe('boolean');
  });

  // --- v0.5.0: integrações com editores (RF-040 … RF-045) ---
  it('GET /api/extensions/status expõe prontidão e bloqueios', async () => {
    const res = await request(app).get('/api/extensions/status');
    expect(res.status).toBe(200);
    expect(typeof res.body.ready).toBe('boolean');
    expect(typeof res.body.engineRunning).toBe('boolean');
    expect(typeof res.body.modelLoaded).toBe('boolean');
    expect(String(res.body.baseUrl)).toMatch(/^http:\/\/localhost:\d+\/v1$/);
    expect(res.body.apiKey).toBe('centraliza-local');
    expect(res.body.modelId).toBe('centraliza-router');
    expect(Array.isArray(res.body.blockers)).toBe(true);
    if (!res.body.ready) expect(res.body.blockers.length).toBeGreaterThan(0);
    // Resumo usado pela página Centraliza Coder (RF-040/RF-041)
    expect(res.body.integrations).toBeTruthy();
    expect(res.body.integrations.continue).toHaveProperty('configured');
    expect(res.body.integrations.roo).toHaveProperty('configured');
  });

  it('POST /api/extensions/roo é bloqueado sem motor pronto', async () => {
    const st = await request(app).get('/api/extensions/status');
    if (st.body.ready) return; // com motor a correr o fluxo é o caminho feliz
    const res = await request(app).post('/api/extensions/roo').send({});
    expect(res.status).toBe(409);
    expect(res.body.success).toBe(false);
    expect(res.body.blockers.length).toBeGreaterThan(0);
  });
});
