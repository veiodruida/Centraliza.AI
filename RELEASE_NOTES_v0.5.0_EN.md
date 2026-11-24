# Centraliza.ai v0.5.0 — Model Hub, Centralization, Engine Control, Native Agent & Extensions

This release closes the usability issues reported in v0.4.1 and turns the orchestrator
into a more usable and autonomous platform: the Hub search is readable on large
screens, centralization gains space visibility, engines are detected and controlled
from the dashboard, the coding agent becomes native (DeepSeek) and the VS Code
integrations become automatic and gated on the local engine state.

## ✨ Highlights

### Model Hub
- **Search fixed (RF-001)**: the field now takes **61% of the content width at 2560 px** (requirement: at least 40%), with **18 px** text, a visible caret, a 56 px minimum height and no horizontal clipping. The placeholder no longer competes with the typed value.
- **Abliterated and Uncensored subcategories (RF-002/RF-003)**: two permanent filters with **model counters** and their own visual accent, combinable with the existing filters and Hugging Face facets.
- **Automatic tagging**: the backend classifies every model (repository name, tags and metadata) and exposes `is_abliterated`, `is_uncensored` and `flavors` in the catalog, live search and details. Models like "…-abliterated" or "…-uncensored" land in the right subcategory with no manual work.
- Result counter, chips to clear filters and the active search.

### Centralization
- **Total model space (RF-010)**: sum of every detected file, with automatic GB/TB conversion (validated within 1% of the sum of entries).
- **Space by location (RF-011)**: aggregation per folder, with the full path in a tooltip and the model count.
- **Interactive chart (RF-012/RF-013)**: Recharts donut with per-slice percentage, tooltip showing GB + model count, clickable legend and **list filtering when a slice is clicked** (with a clear button).
- **Real physical space vs. saved space (RF-014)**: separate cards with a tooltip explaining that hardlinks share the same data.
- Layout revised at 1440 px and 360 px: numbers never wrap, text uses `line-clamp` plus a tooltip.

### Test & Chat
- **Automatic engine detection (RF-020/RF-021)**: Ollama, llama.cpp, LM Studio and ComfyUI, detected via binary/PATH, common folders and port health checks. Only installed engines are listed, each with a **running/stopped** indicator and a "Refresh detection" button. With none installed, the UI shows "No engine detected".
- **Open engine web UI (RF-022)**: opens the correct UI; if the engine is stopped it asks for confirmation and **starts it before opening**.
- **Server logs (RF-023/RF-024)**: real-time panel over Socket.io (`server-log`) with initial history, autoscroll, clear and expand; the "always show logs" preference is **persisted in `config.json`**.
- **Stop / Unload (RF-025)**: graceful unload first (Ollama `keep_alive: 0`, LM Studio `lms unload --all`) and only then process termination, with a state check afterwards. Separate "Stop engine" and "Unload only" buttons.
- **Sending blocked while the engine is stopped (RF-026)**: explanatory banner with "Start engine"; once started, the message is sent automatically.

### Centraliza Coder
- **Third-party CLI integration removed (RF-030)**: no clone/`git pull`, no global CLI install and no references left in the UI, `server.js` or the active documentation.
- **Native DeepSeek agent (RF-031)**: starts from the dashboard with visible state (engine, model and agent) and start/stop controls.
- **Mode A (RF-032)**: "Start engine" boots the default model and launches the agent on top of it (enabled by default).
- **Mode B (RF-033)**: independent launch with the model selected in the picker — local GGUF (llama.cpp) or an Ollama model.
- **Automatic updates (RF-034)**: checks on startup and every 24 hours, transactional apply with **SHA-256**, backup, **rollback** and notification; offline or without a configured source, startup is never blocked.
- **Integrated state (RF-035)**: `/api/coder/status` aggregates engine + active model + agent + update state.
- **Editors summary in the Coder page**: the "Editors" card shows the real integration state (Continue.dev and Roo Code: configured / not configured / not detected), the engine blocker with "Start engine and model", an **Integrate** button per extension and a **See details in Extensions** shortcut — without duplicating the Extensions page.

### Extensions
- **Continue.dev (RF-040)**: configuration written automatically to `~/.continue/config.yaml|yml|json`, with a **backup** and validation (YAML without tabs / valid JSON), including autocomplete.
- **Roo Code (RF-041)**: written automatically to the VS Code storage (`state.vscdb`, SQLite via `node:sqlite`) with a backup; if the database is locked, a support file plus an actionable diagnostic.
- **Engine dependency (RF-042)**: integrations are only enabled when both the engine **and** the model are running; the UI shows the missing step and offers "Start engine and model".
- **No copy/paste (RF-043)**: the user is never asked for a URL, key or model ID.
- **Smoke test (RF-044)**: opens VS Code and asks the gateway "Reply only: OK", showing the result and latency.
- **Diagnostics (RF-045)**: each failure (engine stopped, model not loaded, gateway down, Roo not installed, database locked) has its own message.

### Platform
- **New modules** under `backend/` (`flavor`, `storage`, `engines`, `extensions`, `updater`) so `server.js` does not keep growing.
- **11 languages**: every new key translated (`pt-BR`, `pt-PT`, `en`, `es`, `fr`, `de`, `it`, `zh`, `ar`, `ko`, `ja`), placeholders preserved and RTL kept.
- **New endpoints**: `/api/storage/summary`, `/api/engines`, `/api/engines/start|stop|stop-all`, `/api/logs/recent`, `/api/coder/status`, `/api/coder/agent/start|stop`, `/api/update/status|check|apply`, `/api/extensions/*`.
- **More robust gateway**: resolves `centraliza-router` even without an active model (it discovers the model served by the engine), uses the real llama.cpp alias and returns actionable errors (`no_active_model`, `engine_offline`).

## 🧪 Tests
- **17 server tests** (vitest + supertest): GGUF, endpoints, Abliterated/Uncensored classification, storage summary, engine detection, logs, Coder state, auto-update and extension readiness.
- **13 frontend tests**: estimation engine, component smoke test and **i18n completeness across 11 languages** (including placeholders).
- **32 functional Playwright checks** (`scripts/verify-v050.mjs`): new controls on the 5 changed modules, no console errors, Hub search at 2560 px (61% / 18 px), typing without clipping and zero overflow at 360 px.
- **Responsiveness suite** (`scripts/resp-scan.mjs`): **9 pages × 13 viewports = 117 combinations, zero issues** — no horizontal overflow, no off-screen elements and no clipped text (truncation only with a tooltip carrying the full content).
- `tsc -b` + `vite build` with no errors.

## 🔧 Migration notes
- New preferences are migrated automatically on startup (`showServerLogs`, `ollamaPort`, `lmStudioPort`, `comfyPort`, `updates`) without losing `config.json`.
- The `data/free-claude-code/` folder is no longer used and can be deleted.
- To enable automatic updates, set `updates.manifestUrl` (or `updates.githubRepo`) in `config.json`. Without it, the app reports `not-configured` and keeps working normally.

## 📦 Assets
- `centraliza-ai-v0.5.0-ready.zip` — ready-to-run package (backend, built frontend and sources).

---

*Centraliza.ai — Your local AI orchestrator.*
