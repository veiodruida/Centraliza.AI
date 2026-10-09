# 🌌 Centraliza.ai — The Ultimate Local AI Orchestrator

![Centraliza.ai](centraliza_hero.png)

**Centraliza.ai** is a premium dashboard that unifies your local AI ecosystem — **LM Studio**, **Ollama**, **ComfyUI**, **Llama.cpp** and **Hugging Face** — into a single control center, managing models with **zero disk duplication**.

> **100% local.** Your data, models, and conversations never leave your machine.

---

## ✨ Key Features

- **Smart Link Technology** — Share models across different engines (LM Studio ↔ Ollama, ComfyUI, Llama.cpp) using NTFS hardlinks (with symlink fallback). No more duplicated files: save **hundreds of GBs** of disk space.
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
- **Automated regression testing** with Playwright lives in `scripts/` (`resp-scan`, `resp-verify`, `resp-resize`, `resp-debug`, `final-shots`).

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
| `npm test` | Runs the test suite (server + estimation engine) |

---

## 🏗️ Architecture

Three-layer design, all served from a single process on **port 4000**:

| Layer | Role |
| :--- | :--- |
| **Scan Engine** | Recursively scans configured directories (`.gguf`, `.safetensors`, `.ckpt`, `.bin`, `.pt`, `.pth`), resolves Ollama manifest hashes into readable names, and returns a normalized model list. |
| **Centralization Engine** | Creates NTFS **hardlinks** (`fs.link`) with symlink fallback (`fs.symlink`), validating via inode or `size + mtime` comparison. Destination: `{centralDir}/Centraliza.ai/{modelBaseName}/{fileName}`. |
| **Orchestration Engine** | Launches and manages inference: `ollama run`, `llama-cli`/`llama-server` with configurable args (threads, GPU layers, context), ComfyUI via `run_nvidia_gpu.bat`, LM Studio via `lms.exe`, plus a transparent chat proxy to `localhost:11434/api/generate`. |

### Tech Stack

| Layer | Technology |
| :--- | :--- |
| **Backend** | Node.js + Express + Socket.io |
| **Frontend** | React 19 + Vite + TypeScript |
| **Styling** | Tailwind CSS + CSS variables (glassmorphic design system) |
| **Realtime** | Socket.io (download progress, UI sync) |
| **Storage** | NTFS hardlinks / symlinks (fallback) |
| **Charts** | Recharts (disk usage graphs) |
| **i18n** | Custom reactive engine — 11 languages + RTL (Arabic) |

### API Overview (selected endpoints)

| Route | Method | Description |
| :--- | :--- | :--- |
| `/api/models` | GET | List all detected models (10s cache) |
| `/api/system-info` | GET | CPU/RAM/GPU/VRAM telemetry |
| `/api/gguf/meta` | GET | GGUF metadata: layers, max context, architecture, quantization |
| `/api/system/disk` | GET | Disk usage and central folder size |
| `/api/registry` | GET | Local Hugging Face catalog |
| `/api/centralize` | POST | Create a hardlink for a model |
| `/api/download` | POST | Start a model download (`ollama pull`) |
| `/api/launch` | POST | Launch an inference engine |
| `/api/chat` | POST | Proxy chat to a local model |
| `/api/auto-detect` | POST | Auto-detect AI installation paths |
| `/api/models/rename` / `/api/models/move` | POST | Rename / move a model on the filesystem |
| `/api/models/sanity-check` | POST | Clean up broken hardlinks |
| `/api/models` | DELETE | Remove a model (Ollama RM + unlink) |

See [documentation/ARCHITECTURE.md](documentation/ARCHITECTURE.md) for the full API surface, caching rules, WebSocket events and operational guidelines.

---

## 📂 Project Structure

```
Centraliza.AI/
├── server.js                  # Express + Socket.io backend (port 4000)
├── config.json                # Configuration persistence (gitignored)
├── package.json               # Backend dependencies
├── setup.bat                  # Zero-config installer
├── start.bat / start_app.bat  # Launchers
├── central.bat                # Global `central` command
├── picker.ps1                 # Native folder picker (PowerShell -sta)
├── centraliza_hero.png        # Hero image
├── data/
│   ├── hf_models.json         # Local Hugging Face catalog
│   └── models.json            # Detected models index
├── frontend/                  # React + Vite + TypeScript dashboard
│   └── src/
│       ├── App.tsx            # Router + Dashboard + Sidebar
│       ├── pages/             # MyModels, ExploreStore, HardwareLab, Centralization, Extensions, Settings…
│       ├── components/        # Impact Panel, DiskUsageGraph, DownloadTracker, SlashCommands…
│       ├── context/           # AppContext (global state + i18n)
│       └── i18n/              # Translations (11 languages + RTL)
├── documentation/
│   ├── ARCHITECTURE.md        # System architecture reference
│   └── DEVELOPMENT_GUIDE.md   # Development guide
└── screenshots/               # UI screenshots
```

---

## 🧪 Tests

```bat
npm test
```

- **6 server tests** — GGUF parser (synthetic + local file), endpoint validation, system-info and models.
- **7 estimation engine tests** — context classification, KV cache, recommendations and warnings.
- **1 frontend smoke test** — component renders.
- **Responsiveness suite (Playwright)** — `scripts/resp-scan.mjs` / `resp-verify.mjs` / `resp-resize.mjs`: 9 pages × 13 viewports plus live resize cycles, asserting zero horizontal overflow, zero clipped numbers and zero clipped text without a tooltip.

---

## 🧭 Further Reading

- [Architecture](documentation/ARCHITECTURE.md) — technical reference, API surface, caching and operational rules
- [Development Guide](documentation/DEVELOPMENT_GUIDE.md) — contributor guide
- [Release Notes v0.4.1](RELEASE_NOTES_v0.4.1.md) — what's new in the responsive release
- [Release Notes v0.4.0](RELEASE_NOTES_v0.4.0.md) — what's new in the hardware-aware release

---

## 📄 License

ISC

---

*Built for the local AI revolution. Empower your machine.*
