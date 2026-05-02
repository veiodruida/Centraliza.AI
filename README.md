# 🌌 Centraliza.ai - The Ultimate Local AI Orchestrator

**Centraliza.ai** is a premium dashboard designed to unify your local AI ecosystem. It acts as the perfect companion for **LM Studio**, **Ollama**, **ComfyUI**, and **Llama.cpp**, allowing you to manage models without disk redundancy.

---

## 🚀 Key Features
- **Smart Link Technology**: Share models across different engines (LM Studio <-> Ollama) without duplicating files. Save hundreds of GBs.
- **One-Click Launch**: Start Ollama, Llama.cpp, or ComfyUI environments directly from one unified dashboard.
- **Hardware Intelligence**: Real-time VRAM telemetry and hardware-specific model recommendations.
- **Privacy First**: 100% local. Your data, models, and conversations never leave your machine.

---

## 🛠️ Installation & Setup

### 1. Automated Setup
Simply run the setup script to install dependencies and configure your environment:
`bash
.\setup.bat
`
*This will also add the central command to your Windows PATH.*

### 2. Quick Start
Once installed, you can launch the orchestrator from anywhere using:
`bash
central
`
*Or use .\start.bat from the root directory.*

---

## ⌨️ Command Line Interface (CLI)

| Command | Action |
| :--- | :--- |
| central | Launches the Centraliza.ai Dashboard |
| .\setup.bat | Re-installs dependencies and fixes PATH |
| .\start.bat | Direct launch for development or production |

---

## 📂 Project Structure
- **/frontend**: React + Vite dashboard with modern UI.
- **/i18n**: Multi-language support (PT/EN).
- **/scripts**: Automation and hardware detection logic.

---
*Built for the local AI revolution. Empower your machine.*