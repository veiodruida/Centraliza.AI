import { defineConfig } from 'vitest/config';

// Suite do backend (raiz). Os testes do frontend correm no respetivo pacote
// (`cd frontend && npm test`). O include explícito evita apanhar cópias em
// `.pnpm-store/` ou worktrees (`/.gh-pages/`).
export default defineConfig({
  test: {
    include: ['server.test.js', 'backend/**/*.test.js'],
    environment: 'node'
  }
});
