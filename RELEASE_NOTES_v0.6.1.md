# Centraliza.ai v0.6.1 — Cross-Platform Installers & Runtime

This release fixes the first-run experience for new users. Previously, running
`setup.bat` on a machine without Node.js stopped with an error. Now the
installers bootstrap Node.js automatically and the application has native
launchers and runtime support for **Windows, Linux and macOS**.

## ✨ Highlights

### One-command setup on every platform
- **Windows** — `setup.bat` tries **winget**, then **Chocolatey**, and finally
  downloads the official **Node.js 22 LTS portable ZIP** to
  `%LOCALAPPDATA%\CentralizaAI\node` (no administrator rights required).
- **Linux** — `setup.sh` downloads the official **Node.js 22 LTS** tarball to
  `${XDG_DATA_HOME:-~/.local/share}/centraliza-ai/node` when Node.js is
  missing or too old.
- **macOS** — `setup-macos.sh` (or the double-clickable `setup.command`) uses
  the same portable Node.js strategy and installs into
  `~/Library/Application Support/Centraliza.ai/node`.
- The installers also install npm dependencies, build the production frontend,
  register the `central` command, and create platform shortcuts.

### Installation verification
- `setup.bat --check` and `./setup.sh --check` verify Node.js, npm,
  dependencies and the frontend build without modifying the system.
- The Windows installer refreshes the PATH from the registry after a winget
  installation, so the new Node.js is usable immediately in the same window.

### Cross-platform runtime
- **Platform-aware defaults**: `C:\AI_Models` on Windows and `~/AI_Models` on
  Linux/macOS; platform-specific ComfyUI, LM Studio, Ollama and llama.cpp
  detection paths.
- **Native folder pickers**: PowerShell on Windows, AppleScript on macOS,
  zenity/kdialog/yad on Linux.
- **Folder and URL opening** through Explorer, Finder or `xdg-open`.
- **Terminal launch** for interactive engines through `cmd`, Terminal.app or
  the user's graphical terminal.
- **Engine control on Linux/macOS**: ComfyUI starts from `main.py` or
  `run_*.sh`; LM Studio uses its `lms` CLI or `open -a`; Ollama and ComfyUI
  processes are stopped with `lsof`/`fuser` + SIGKILL rather than `taskkill`.
- **VS Code / Cursor / VSCodium storage paths** resolved correctly on all
  platforms for the Continue.dev and Roo Code integrations.
- **GPU telemetry fallback**: `system_profiler` on macOS and `lspci` on Linux
  when NVIDIA tooling is unavailable.
- **Config migration**: a Windows `config.json` does not carry `C:\...` paths
  into a Linux/macOS installation (and Windows-specific model paths are
  ignored); defaults are applied automatically.

### New launchers
- `start.sh` — universal Linux/macOS launcher with dependency checks, portable
  Node.js discovery and browser opening.
- `start.command` — double-clickable macOS launcher.
- `setup.command` — double-clickable macOS installer.
- `start.bat` now prefers the Node.js installed by setup and offers to run the
  installer when Node.js is missing.

## 🐛 Fixes

- New users no longer fail at `setup.bat` with "Node.js not found".
- Setup no longer assumes that `node` is already in the current terminal PATH
  after a winget/Chocolatey installation.
- The old Windows-only `start cmd /k` launch path was replaced by
  platform-specific terminal handling.
- The old `open -R` fallback (macOS-only) was replaced by a real Linux/macOS
  open-folder implementation.
- `taskkill` usages for the DeepSeek agent, llama.cpp and ComfyUI were replaced
  by cross-platform process helpers.
- ComfyUI stop/start no longer depends on Windows batch files.
- LM Studio detection now supports macOS/Linux CLI locations.

## 📄 Documentation

- [README](README.md) — Windows, Linux and macOS setup instructions.
- [Release Notes v0.6.0](RELEASE_NOTES_v0.6.0.md) — ComfyUI workflow import.
- [ComfyUI Workflow Import & Model Library](documentation/WORKFLOW_IMPORT.md).

## 🧪 Tests and build

- **37 backend tests pass** (`npm test`): 17 server/API tests, 13 workflow
  tests and 7 cross-platform helper tests.
- `tsc -b` and `vite build` complete without errors.
- `setup.bat --check` and the PowerShell installer check mode were verified on
  Windows.
- Shell scripts were syntax-checked with `bash -n`.
- The server starts and serves the dashboard normally after the platform
  refactor.

## 🔧 Upgrade notes

- Existing `config.json` files are preserved. On Linux/macOS, Windows-only
  paths are replaced with platform defaults; on Windows nothing changes.
- Node.js 22.5+ is required (`engines` in `package.json`). The installers
  upgrade older Node.js versions automatically.
- Running `setup.bat` / `setup.sh` again is safe: it keeps user data,
  reinstalls dependencies if needed, rebuilds the frontend and refreshes the
  shortcuts.
- The application still does not install AI engines or models; only the
  runtime is prepared.

## 📦 Assets

- `centraliza-ai-v0.6.1-ready.zip` — ready-to-run package for Windows, Linux
  and macOS.
- `README.md` — project overview and platform setup.
- `RELEASE_NOTES_v0.6.1.md` — this document.

---

*Centraliza.ai — your local AI orchestrator.*
