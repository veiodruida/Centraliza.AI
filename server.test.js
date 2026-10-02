import { describe, it, expect, afterAll } from 'vitest';
import request from 'supertest';
import { app, server, parseGGUFBuffer, parseGGUFHeader } from './server.js';
import fs from 'fs';
import os from 'os';
import path from 'path';

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
});
