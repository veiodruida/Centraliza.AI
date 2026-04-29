# Phase 1 Plan: Infraestrutura & Core Backend

## Goal
Prepare the project for v0.3.0 by establishing automated testing, updating versioning, and implementing the WebSocket foundation for real-time features.

## Requirements
- **ARCH-01**: Bump version to 0.3.0 globally.
- **ARCH-02**: Implement and run automated tests.
- **FEAT-03**: Download Manager base (WebSocket server).

## 🛠️ Step 1: Version Bump (ARCH-01)
Update version strings from `0.2.2` to `0.3.0` in:
- `package.json`
- `frontend/package.json`
- `setup.bat`
- `README.md`
- `web-publish/index.html`

## 🛠️ Step 2: Testing Infrastructure (ARCH-02)
1. Install testing dependencies in root and frontend.
2. Configure `vitest` in `vite.config.ts` for frontend.
3. Add a sample test for the backend (`server.test.js`) and frontend (`App.test.tsx`).

## 🛠️ Step 3: WebSocket Foundation (FEAT-03)
1. Install `socket.io` (backend) and `socket.io-client` (frontend).
2. Refactor `server.js` to serve via `http.Server` and initialize `io`.
3. Create a basic WebSocket connection handler.

## 🛠️ Step 4: Refactor Download API (FEAT-03)
1. Update `POST /api/download` in `server.js`.
2. Instead of ignoring `stdio`, capture it and emit progress events to the connected socket.

## Verification
- [ ] `npm run test` (root) passes with 1 test.
- [ ] `npm run test` (frontend) passes with 1 test.
- [ ] App starts without errors and version 0.3.0 is visible.
- [ ] WebSocket connection established log appears on startup.
