import { describe, it, expect, afterAll } from 'vitest';
import request from 'supertest';
import { app, server } from './server.js';

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
});
