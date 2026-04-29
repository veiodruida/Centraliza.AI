# Release Notes: Centraliza.ai v0.3.0 "Gestão Absoluta"

We are proud to announce the release of **v0.3.0**, a major update focused on user experience, advanced management, and system transparency. This version transforms Centraliza.ai into a complete local AI orchestrator.

## 🚀 Highlights

### 📁 Total File Control (CRUD)
You no longer need to open Windows Explorer to manage your models. Rename and move files directly through our interface. The system handles link integrity automatically.

### 📊 Disk Analytics Dashboard
A new interactive visualization shows you exactly how much space you've saved. Our "Link Engine" optimization is now transparently displayed, comparing Centraliza.ai's footprint against your total disk usage.

### 🎮 Advanced Execution Modal
For power users, we've added a configuration modal for Llama.cpp. Fine-tune your hardware utilization by setting specific CPU threads, GPU layers, and context sizes before launching any GGUF model.

### 🌐 Real-time Connectivity
With the new WebSocket integration, you can now monitor model downloads (`ollama pull`) with real-time progress bars and live status updates. No more guessing when your model will be ready.

### 🛡️ Smart Auto-Detection
Setting up for the first time? Centraliza.ai now scans common paths (Ollama, ComfyUI, etc.) on launch, configuring itself silently so you can start managing models immediately.

---

## 🛠️ Changelog

### Added
- **Global Toast Notification System**: Instant feedback for all disk and launch operations.
- **Glassmorphism Help Tooltips**: Contextual guidance for non-technical users.
- **Collapsable Model Sections**: Organized view by source with persistent expansion state.
- **Sanity Check Tool**: Maintenance utility to remove broken links and keep the repository clean.
- **Recharts Integration**: Premium disk usage analytics graph.
- **Socket.io Integration**: Real-time backend-to-frontend communication.

### Improved
- **Settings Automation**: "Auto-detect" now runs quietly on page load.
- **UI Performance**: Refactored "My Models" with virtualized-like scrolling for large libraries.
- **Error Handling**: Enhanced feedback for cross-drive move operations.

### Fixed
- Fixed an issue where model paths with spaces could fail to launch.
- Corrected VRAM detection on certain Windows configurations.
- Improved hardlink detection logic to avoid false positives.

---
**Upgrade now and experience Absolute Management.**
