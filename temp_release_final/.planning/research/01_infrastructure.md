# Research: Phase 1 — Infraestrutura & Core Backend

## Objective
Establish the technical foundation for v0.3.0, focusing on real-time communication, automated testing, and versioning.

## 1. Version Bump (ARCH-01)
- **Target Version**: 0.3.0
- **Files to update**:
  - `package.json` (root)
  - `frontend/package.json`
  - `setup.bat` (title and any check logic)
  - `README.md`
  - `web-publish/index.html` (Landing page)

## 2. Automated Testing (ARCH-02)
- **Frontend**: **Vitest** is the recommended tool for Vite-based React projects.
  - Required packages: `vitest`, `@testing-library/react`, `@testing-library/jest-dom`, `jsdom`.
  - Config: Add `test` script to `frontend/package.json`.
- **Backend**: **Vitest** can also be used for Node.js backend testing (it's fast and compatible).
  - Required packages: `vitest`, `supertest` (for API testing).
  - Config: Add `test` script to root `package.json`.

## 3. WebSocket Integration (FEAT-03)
- **Library**: `socket.io` is robust and handles reconnections well.
- **Backend (`server.js`)**:
  - Integrate `http` module with `express`.
  - Initialize `socket.io` server.
  - Create a progress-tracking wrapper for `spawn('ollama', ['pull', ...])`.
  - **Ollama Progress Parsing**: Need to handle the stream from `ollama pull`. Usually, it sends lines like `pulling [hash]... 45%`.
- **Frontend**:
  - Install `socket.io-client`.
  - Create a hook/service to listen for `download-progress` events.

## 4. Dependencies to Install
### Root
```bash
npm install socket.io
npm install -D vitest supertest
```
### Frontend
```bash
cd frontend
npm install socket.io-client
npm install -D vitest @testing-library/react @testing-library/jest-dom jsdom
```

## 5. Verification Plan
- [ ] Run `npm test` and see a sample test pass.
- [ ] Verify version 0.3.0 is displayed in the app and landing page.
- [ ] Mock a WebSocket message from backend and verify frontend receives it.
