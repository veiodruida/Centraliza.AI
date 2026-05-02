# ðŸš€ Centraliza.ai v3.2 - Global Premium Edition

Centraliza.ai is a state-of-the-art local AI orchestrator designed for ultimate performance and a premium user experience. It unifies model management for Ollama, ComfyUI, Llama.cpp, and LM Studio into a single, beautiful, and localized dashboard.

---

## âœ¨ New in v3.2 "Global Premium"

### ðŸŒ Global Localization (i18n)
- **Full Multi-Language Support**: Support for PT-BR, PT-PT, EN, ES, FR, DE, IT, ZH, AR, KO, JA.
- **RTL Support**: Native Right-to-Left layout for Arabic.
- **Localized Tooltips**: Layperson-friendly guidance in every language.

### ðŸ’Ž Ultra-Premium UI/UX
- **Glassmorphic Aesthetic**: Modern interface using backdrop blur, premium shadows, and fluid animations.
- **Dynamic Feedback**: Micro-animations for every interaction (hover, active, processing).
- **Responsive Navigation**: Intelligent sidebar and layout transitions for a seamless experience.

### âš™ï¸ Performance & Observability
- **Intelligent Caching**: In-memory TTL caching system for near-instant API responses.
- **System-wide Logging**: Detailed logging engine (`server.log`) for professional-grade debugging.
- **Optimized Lifecycles**: Robust download tracking with real-time WebSocket synchronization.

### ðŸ“¦ Pro Model Orchestration
- **Detailed Intelligence Hub**: Deep analysis of models before installation (VRAM needs, licenses, author metadata).
- **Hardlink Centralization**: Save hundreds of GBs of disk space by sharing model weights between applications.
- **Hardware Telemetry**: Real-time analysis of GPU and CPU capabilities.

---

## âš¡ Quick Start

### 1. Zero Configuration Setup
Open a terminal in the project folder and run:
```bash
setup.bat
```
*Installs dependencies, builds the premium frontend, and registers the global 'central' command.*

### 2. Launch Anywhere
Simply type in any terminal:
```bash
central
```
- **Dashboard URL**: [http://localhost:4000](http://localhost:4000)

---

## ðŸ› ï¸ Technical Stack
- **Frontend**: React 18, Vite, Lucide, Recharts, Tailwind CSS.
- **Backend**: Node.js, Express, Socket.io, check-disk-space.
- **Storage**: NTFS Hardlinks for de-duplication.
- **i18n**: Custom reactive translation engine.

---
**Centralize your intelligence. Globalize your experience.**
