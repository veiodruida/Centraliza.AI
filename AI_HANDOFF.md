# 🤖 CentralizaIA - AI Handoff Document

This document is intended for the next AI developer to continue the evolution of the CentralizaIA Dashboard.

## 📌 Project Overview
CentralizaIA is a local AI model orchestrator for Windows. It allows users to centralize models from multiple sources (Ollama, ComfyUI, LM Studio, etc.) into a single repository using Hardlinks/Symlinks to save disk space while keeping original apps functional. It also provides a management interface for launching inference servers and benchmarking hardware.

## 🛠️ Tech Stack
- **Backend**: Node.js + Express (Port 4000).
- **Frontend**: React + Vite + Tailwind CSS + Lucide-React (Port 5173).
- **OS**: Windows, Linux, macOS (Cross-platform folder picking implemented).
- **Storage**: `config.json` for persistence; `data/hf_models.json` for HuggingFace registry.

## 🏗️ Core Architecture
- **Linking Engine**: Uses `fs.link` (Hardlink) as first priority and `fs.symlink` as fallback. This ensures zero disk space usage for duplicated models across different tools.
- **Launch Engine**: Spawns detached shell processes (`start cmd /k`) for Ollama and Llama.cpp servers. This allows servers to persist even if the dashboard is closed.
- **Hardware Telemetry**: Accurate VRAM detection using `nvidia-smi` (if available) or `Win32_VideoController` (PowerShell).
- **Context-Aware UI**: The frontend detects model sources and restricts launch options (e.g., Ollama models can only launch via Ollama).

## 📡 API Endpoints (server.js)
- `GET /api/models`: Returns list of all detected models with metadata (source, path, size, isSymlink, repoId).
- `GET /api/pick-folder`: Opens a native Windows Folder Selection dialog via PowerShell.
- `POST /api/centralize`: Creates a link from a source path to the central repository.
- `POST /api/auto-detect`: Scans for common AI app paths (including ComfyUI Home).
- `GET /api/system-info`: Returns CPU, RAM, and GPU/VRAM telemetry.
- `POST /api/launch`: Launches a specific engine (ollama, llama.cpp, comfyui, lm-studio).
- `POST /api/chat`: Proxy to local inference endpoints (Ollama/Llama.cpp).
- `GET /api/model-readme`: Fetches descriptions from HuggingFace API or local README.md files.
- `GET /api/registry`: Returns the local cache of popular HuggingFace models.

## 🚀 Current Roadmap / Next Steps
1.  **Advanced Centralization UI**: The "And XX more" section now supports bulk selection and individual model management.
2.  **ComfyUI Deep Integration**: Auto-detection now finds the root ComfyUI folder to enable the one-click launch via `run_nvidia_gpu.bat`.
3.  **Native File Picking**: All configuration paths now have a folder icon that opens the Windows native picker.
4.  **Extensions SDK**: The `Extensions` page is currently a placeholder. The goal is to allow users to drop `.js` or `.py` adapters to support new AI engines.
5.  **HuggingFace Download Manager**: Implement a real-time progress bar for model downloads using WebSockets (the current `/api/download` is fire-and-forget).
6.  **Llama.cpp Configuration UI**: Add a "Launch Settings" modal to allow users to configure Context Window, Layers, and Quantization before launching the llama-server.
7.  **Disk Analysis Graph**: Add a visual chart (Recharts) to show storage distribution per application source.

## ⚠️ Known Constraints
- **Path Escaping**: Windows paths with spaces are handled using double escaping in `exec`. Be careful when modifying shell commands in `server.js`.
- **Port Conflict**: Backend is hardcoded to 4000; Frontend to 5173.
- **Ollama Naming**: Ollama models are stored as hash-blobs. The app uses a manifest-parser (`buildOllamaManifestMap`) to translate these into human names.

## 📂 Key Files
- `server.js`: The heart of the system.
- `picker.ps1`: Helper script for native Windows folder selection (requires -sta).
- `frontend/src/App.tsx`: Navigation and Global Dashboard.
- `frontend/src/pages/MyModels.tsx`: Model management logic.
- `frontend/src/pages/Centralization.tsx`: Storage health engine.
- `frontend/src/pages/ModelTester.tsx`: Chat and inference proxy.

---
**Happy coding! CentralizaIA is built to be fast, premium, and zero-redundancy.**
