# 🌌 Centraliza.ai — The Ultimate Local AI Orchestrator

![Centraliza.ai](centraliza_hero.png)

**Centraliza.ai** is a premium dashboard that unifies your local AI ecosystem — **LM Studio**, **Ollama**, **ComfyUI**, **Llama.cpp** and **Hugging Face** — into a single control center, managing models with **zero disk duplication**.

> **100% local.** Your data, models, and conversations never leave your machine.

---

## ✨ Key Features

- **Smart Link Technology** — Share models across different engines (LM Studio ↔ Ollama, ComfyUI, Llama.cpp) using NTFS hardlinks (with symlink fallback). No more duplicated files: save **hundreds of GBs** of disk space.
- **ComfyUI Workflow Import** — Import a workflow's `.md` **Model Links** and automatically download every required model from Hugging Face into the correct ComfyUI folder — with live progress, resume and optional HF token for gated repos.
- **One-Click Launch** — Start Ollama, Llama.cpp, ComfyUI or LM Studio environments directly from one unified dashboard.
- **Hardware Intelligence** — Real-time VRAM/GPU telemetry, hardware-specific model recommendations, and an **Impact Panel** that estimates speed and memory *before* you load a model.
- **GGUF Metadata Reader** — Reads real layer counts, maximum context, architecture and quantization straight from each local model file.
- **Large Context Support** — Context windows up to **1M tokens** (limited to what the model actually supports), respected end-to-end by the gateway's VRAM Shield.
- **Document Analysis** — Map-Reduce analysis for large documents with intelligent context summarization and VRAM-aware compaction.
- **Privacy First** — Everything runs locally. No cloud dependencies for core functionality.

---

## 🧠 Hardware Impact Panel (v0.4.0)

When you adjust **Context Size** or **GPU Layers**, the Impact Panel recalculates in real time, based on your actual hardware (VRAM, RAM, GPU) and the model's GGUF metadata:

- **Estimated speed** (tokens/second) with rating (Very fast / Good / Slow / Very slow);
- **Memory forecast**: VRAM and RAM used vs. available (model weights + KV cache);
- **Context fit**: Quick chat · General/Programming · Programming/Documents · Long documents/RAG · Extreme context (1M);
- **Warnings** when the configuration exceeds VRAM/RAM, goes past the model's maximum, or becomes too slow;
- **Automatic recommendation** of context + GPU layers for your hardware, with an **Apply** button.

Sliders respect the model's real limits: GPU layers are capped at the model's actual layer count and context extends to the model's real maximum (up to 1M tokens).

---

## 📱 Responsive & Cross-Resolution UI (v0.4.1)

The entire dashboard is now **proof against window resizes and screen resolutions** — every page adapts from 360px (mobile) up to 2560px (large monitors) with nothing clipped:

- **Big numbers never cut off**: on the Hardware and Centralization pages, VRAM/RAM/storage values use fluid typography (`clamp()`) — they shrink to fit narrow cards and grow on large screens, always fully visible.
- **Dynamic root layout**: `100dvh` height (correct on mobile browsers), adaptive sidebar (`lg:64 · xl:72 · 2xl:80`), and `min-width: 0` on the main content so nothing overflows.
- **Model Hub reordered**: the search/filters/sort toolbar only sits in a single row from `2xl` up; below that it stacks with `flex-wrap` (the 1280px filter-bar overflow is gone).
- **Chat (ModelTester)**: narrower sidebar at `lg` and an overflow-free chat header at 1024px; model names get a `title` tooltip when truncated.
- **Resilient headers, cards, buttons and modals**: section headers wrap, badges ellipsize, `.btn-premium` no longer enforces a rigid `min-width`, the delete modal is width-limited with scroll, and help tooltips never leave the viewport.
- **Automated regression testing** with Playwright lives in `scripts/` (`resp-scan`, `resp-verify`).

---

## 🎬 ComfyUI Workflow Import (v0.6.0)

Open **My Models → Import workflow** and drop the `.md` file that comes with a
ComfyUI template (the **Model Links** block). Centraliza.ai:

- reads the model folders (`text_encoders`, `diffusion_models`, `vae`, `loras`, …);
- finds each file in the listed Hugging Face repositories — and automatically
  searches for repositories that are not listed in the document;
- downloads everything to `ComfyUI/models/<folder>` with progress, cancel and
  resume (`.part` + HTTP `Range`);
- lets you review optional models, fix a missing link, change the destination
  folder or set a Hugging Face token for gated repositories.

Full format and API reference: [`documentation/WORKFLOW_IMPORT.md`](documentation/WORKFLOW_IMPORT.md).

Each section of **My Models** can now be sorted per section (date added, size,
name, function, format) and filtered by model function (LLM, coding, vision,
image, LoRA, VAE, ControlNet, text encoder, …). Preferences are saved in
`config.json`.

---

## 🛠️ Installation & Setup

### Requirements

- **Node.js** (18+ recommended)
- **Windows** (10/11) — the project uses `.bat` launchers, PowerShell pickers and `nvidia-smi` telemetry
- At least one AI engine installed: [Ollama](https://ollama.com), [LM Studio](https://lmstudio.ai), [ComfyUI](https://github.com/comfyanonymous/ComfyUI), or [Llama.cpp](https://github.com/ggml-org/llama.cpp)

### 1. Automated Setup

Run the setup script to install everything in one go:

```bat
.\setup.bat
```

`setup.bat` handles the full installation:

1. Verifies Node.js;
2. Installs root and frontend dependencies;
3. Builds the frontend (`dist/`);
4. Adds the `central` command to the user PATH;
5. Creates a **"Centraliza.ai" desktop shortcut** (pointing to `start.bat`).

### 2. Quick Start

After installing, launch the app any of these equivalent ways:

- The **"Centraliza.ai"** desktop shortcut;
- The `central` command (after reopening your terminal);
- `.\start.bat` from the project root.

`start.bat` is the single launcher: it kills any previous instance on port 4000, opens the dashboard in your browser, and starts the server (close the server window to stop the app).

> 💡 Tip: the server port can be overridden with the `PORT` environment variable, e.g. `PORT=4001 node server.js`.

---

## ⌨️ Command Line Interface (CLI)

| Command | Action |
| :--- | :--- |
| `central` | Launches the Centraliza.ai dashboard (equivalent to `start.bat`) |
| `.\setup.bat` | Installs dependencies, builds, configures PATH and creates the desktop shortcut |
| `.\start.bat` | Single launcher: starts the server and opens the dashboard |
| `.\start_app.bat` | Compatibility alias for `start.bat` |
| `.\create-shortcut.ps1` | (Re)creates the "Centraliza.ai" desktop shortcut |
| `npm test` | Runs the server test suite (`cd frontend && npm test` for the UI suite) |

---

## 🚀 v0.6.0 — ComfyUI Workflow Import & Model Library

- **Import a ComfyUI workflow**: drop the template's `.md` **Model Links** file and Centraliza.ai resolves every model on Hugging Face, downloads it into the correct `ComfyUI/models` folder, and shows progress, speed, cancel and resume.
- **Automatic Hugging Face discovery**: files not present in the repositories listed in the document are searched by exact filename across public HF repositories and shown with an **AUTO** badge.
- **Review before downloading**: optional models are detected and unchecked, input assets are reported separately, and you can change the destination folder or paste a direct URL for an unresolved file.
- **Reliable transfers**: gated-repository token, 1–4 simultaneous downloads, `.part` + HTTP `Range` resume, retry from the import history.
- **Model Library organization**: every My Models section can be sorted by date added, size, name, function or format, and filtered by function (LLM, coding, vision, image, LoRA, VAE, ControlNet, text encoder, …). Preferences are stored per section in `config.json`.
- **Richer model cards**: function badge, date added, quantization and parameter count.

See [Release Notes v0.6.0](RELEASE_NOTES_v0.6.0.md) and [ComfyUI Workflow Import & Model Library](documentation/WORKFLOW_IMPORT.md) for the full format, API and setup details.

---

## 🧩 v0.5.0 — Hub, Centralization, Test & Chat, Coder and Extensions

- **Model Hub search fixed**: at 1920–2560 px the search field keeps ≥ 40% of the content width, 16–18 px text, a visible caret and no horizontal clipping.
- **New subcategories**: models are automatically tagged **Abliterated** and **Uncensored** (name, Hugging Face tags and metadata), with permanent filters and result counters.
- **Storage visibility**: total model space (auto GB/TB), space per location with an interactive donut chart, click-to-filter, and real physical space vs. space saved by hardlinks.
- **Engine management**: automatic detection of Ollama, llama.cpp, LM Studio and ComfyUI (state: running/stopped), open each engine's web UI, live server logs (toggle persisted in `config.json`), and stop/unload (graceful unload before killing processes).
- **Native DeepSeek agent**: the third-party CLI integration was removed. The Centraliza Coder now starts the DeepSeek Harness from the dashboard in two modes — default model ("Start engine") or a model you selected.
- **Automatic app updates**: checks on startup and every 24 h, SHA-256 verification, transactional apply with backup and rollback.
- **Extensions repaired**: Continue.dev and Roo Code are configured automatically (with backups) only when the engine and model are running, followed by an automatic smoke test and actionable diagnostics.

See [Release Notes v0.5.0](RELEASE_NOTES_v0.5.0.md) for the full list.

---

## 🏗️ Architecture

Three-layer design plus the v0.5.0/v0.6.0 modules, all served from a single process on **port 4000**:

| Layer | Role |
| :--- | :--- |
| **Scan Engine** | Recursively scans configured directories (`.gguf`, `.safetensors`, `.ckpt`, `.bin`, `.pt`, `.pth`), resolves Ollama manifest hashes into readable names, and returns a normalized model list. |
| **Centralization Engine** | Creates NTFS **hardlinks** (`fs.link`) with symlink fallback (`fs.symlink`), validating via inode or `size + mtime` comparison. Destination: `{centralDir}/Centraliza.ai/{modelBaseName}/{fileName}`. |
| **Orchestration Engine** | Launches and manages inference: `ollama run`, `llama-cli`/`llama-server` with configurable args (threads, GPU layers, context), ComfyUI via `run_nvidia_gpu.bat`, LM Studio via `lms.exe`, plus a transparent chat proxy to `localhost:11434/api/generate`. |
| **v0.5.0 modules** (`backend/`) | `flavor.js` (Abliterated/Uncensored tagging), `storage.js` (space by location), `engines.js` (detect/start/stop), `extensions.js` (Continue/Roo automation), `updater.js` (transactional self-update). |
| **v0.6.0 modules** (`backend/`) | `workflow.js` (ComfyUI Markdown parser, Hugging Face resolution, download queue) and `catalog.js` (functional model classification for the My Models filters). |

### Tech Stack

| Layer | Technology |
| :--- | :--- |
| **Backend** | Node.js + Express + Socket.io |
| **Frontend** | React 19 + Vite + TypeScript |
| **Styling** | Tailwind CSS + CSS variables (glassmorphic design system) |
| **Realtime** | Socket.io (download progress, server logs, update notices, UI sync) |
| **Storage** | NTFS hardlinks / symlinks (fallback) |
| **Charts** | Recharts (disk usage + space by location) |
| **i18n** | Custom reactive engine — 11 languages + RTL (Arabic) |

### API Overview (selected endpoints)

| Route | Method | Description |
| :--- | :--- | :--- |
| `/api/models` | GET | List all detected models (`?filter=coder/abliterated/uncensored`, 10s cache) |
| `/api/workflows/config` | GET/POST | ComfyUI models folder, HF token, concurrency and auto-discovery settings |
| `/api/workflows/inspect` | POST | Parse a workflow `.md` and return files, repositories and destinations |
| `/api/workflows/start` | POST | Start the workflow download queue |
| `/api/workflows` | GET | Import history and configuration |
| `/api/workflows/:id/cancel` / `/retry` | POST | Cancel an import / retry failed entries |
| `/api/system-info` | GET | CPU/RAM/GPU/VRAM telemetry |
| `/api/gguf/meta` | GET | GGUF metadata: layers, max context, architecture, quantization |
| `/api/system/disk` | GET | Disk usage and central folder size |
| `/api/storage/summary` | GET | Total model space, per location, saved by centralization |
| `/api/engines` | GET | Detected engines with running/stopped state |
| `/api/engines/start` / `/api/engines/stop` | POST | Start or stop/unload an engine |
| `/api/logs/recent` | GET | Recent server logs (live stream via `server-log` socket event) |
| `/api/registry` | GET | Local Hugging Face catalog (with Abliterated/Uncensored flags) |
| `/api/centralize` | POST | Create a hardlink for a model |
| `/api/download` | POST | Start a model download (`ollama pull`) |
| `/api/coder/agent/start` | POST | Launch the DeepSeek agent (engine mode or selected model) |
| `/api/coder/agent/stop` | POST | Stop the DeepSeek agent |
| `/api/coder/status` | GET | Engine + model + agent + update state |
| `/api/extensions/status` | GET | Integration readiness and blockers |
| `/api/extensions/continue` / `/roo` | POST | Write the editor configuration automatically |
| `/api/extensions/smoke-test` | POST | Ask the local model "Responde apenas: OK" |
| `/api/update/check` / `/api/update/apply` | POST | Check / apply an app update |
| `/api/launch` | POST | Launch an inference engine (legacy) |
| `/api/chat` | POST | Proxy chat to a local model (legacy) |
| `/api/auto-detect` | POST | Auto-detect AI installation paths |
| `/api/models/rename` / `/api/models/move` | POST | Rename / move a model on the filesystem |
| `/api/models/sanity-check` | POST | Clean up broken hardlinks |
| `/api/models` | DELETE | Remove a model (Ollama RM + unlink) |
| `/v1/chat/completions` | POST | OpenAI-compatible gateway for editors and tools |

See [documentation/ARCHITECTURE.md](documentation/ARCHITECTURE.md) for the full API surface, caching rules, WebSocket events and operational guidelines.

---

## 📂 Project Structure

```
Centraliza.AI/
├── server.js                  # Express + Socket.io backend (port 4000)
├── backend/                   # v0.5.0/v0.6.0 modules (flavor, storage, engines, extensions, updater, workflow, catalog)
├── config.json                # Configuration persistence (gitignored)
├── package.json               # Backend dependencies
├── setup.bat                  # Zero-config installer
├── start.bat / start_app.bat  # Launchers
├── central.bat                # Global `central` command
├── picker.ps1                 # Native folder picker (PowerShell -sta)
├── centraliza_hero.png        # Hero image
├── data/
│   ├── hf_models.json         # Local Hugging Face catalog
│   └── dsh/                   # Isolated profile patch for the DeepSeek agent (generated)
├── frontend/                  # React + Vite + TypeScript dashboard
│   └── src/
│       ├── App.tsx            # Router + Dashboard + Sidebar
│       ├── pages/             # MyModels, ExploreStore, ModelTester, Coder, Centralization, Extensions, Settings…
│       ├── components/        # Impact Panel, DiskUsageGraph, StorageLocationChart, DownloadTracker…
│       ├── context/           # AppContext (global state + i18n)
│       └── i18n/              # Translations (11 languages + RTL, v050.ts for the new keys)
├── scripts/                   # QA helpers (resp-scan, resp-verify, verify-v050)
├── index.html                 # Landing page source (GitHub Pages)
├── documentation/
│   ├── ARCHITECTURE.md        # System architecture reference
│   ├── CENTRALIZA_CODER_SPEC.md
│   ├── WORKFLOW_IMPORT.md     # ComfyUI workflow import, Markdown format and API
│   └── DEVELOPMENT_GUIDE.md   # Development guide
```

---

## 🧪 Tests

```bat
npm test
```

- **17 server tests** — GGUF parser, endpoints, Abliterated/Uncensored tagging, storage summary, engine detection, logs, Coder status, update status and extension readiness.
- **13 workflow tests** — Markdown parsing (including optional models, sizes and the ignored storage tree), Markdown tables and direct links, ComfyUI folder detection, path traversal protection, Hugging Face resolution with mocked repositories and real downloads from a local HTTP server with `Range` resume.
- **13 frontend tests** — estimation engine, component smoke test and i18n completeness (all 11 languages, placeholders preserved).
- **Responsiveness suite (Playwright)** — `scripts/resp-scan.mjs` / `resp-verify.mjs`: 9 pages × 13 viewports, asserting zero horizontal overflow, zero clipped numbers and zero clipped text without a tooltip.
- **v0.5.0 functional checks** — `scripts/verify-v050.mjs`: new controls on the 5 changed modules, Hub search measurements at 2560 px and 360 px overflow checks.

---

## 🧭 Further Reading

- [Architecture](documentation/ARCHITECTURE.md) — technical reference, API surface, caching and operational rules
- [Development Guide](documentation/DEVELOPMENT_GUIDE.md) — contributor guide
- [Release Notes v0.6.0](RELEASE_NOTES_v0.6.0.md) — ComfyUI workflow import and model library
- [ComfyUI Workflow Import & Model Library](documentation/WORKFLOW_IMPORT.md) — Markdown format, API and configuration
- [Release Notes v0.5.0](RELEASE_NOTES_v0.5.0.md) — hub, centralization, engine control, native agent and extensions
- [Release Notes v0.5.0 (EN)](RELEASE_NOTES_v0.5.0_EN.md) — English version

---

## 📄 License

ISC

---

*Built for the local AI revolution. Empower your machine.*
