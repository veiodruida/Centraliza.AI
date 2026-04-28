# 🚀 Centraliza.ai v2.1.1 - Local AI Orchestrator & Dashboard

Centraliza.ai is a premium dashboard for managing local Artificial Intelligence models. It allows you to centralize, organize, and launch models (Ollama, ComfyUI, Llama.cpp, LM Studio) intelligently, saving disk space through system Hardlinks.

---

## ⚡ Quick Start (Installation & Usage)

Centraliza.ai is now unified into a single service for a seamless "Zero Configuration" experience.

### 1. Initial Setup & Auto-Start
Open a terminal in the project folder and run:
```bash
setup.bat
```
*This command will install dependencies, compile the interface (build), and automatically open the dashboard in your browser.*

### 2. Daily Usage
After the first setup, you can start the app simply by clicking:
```bash
start_app.bat
```
- **Dashboard URL**: [http://localhost:4000](http://localhost:4000)

### 3. Shortcut Command (Global)
You can now start Centraliza.ai from any terminal window by simply typing:
```bash
central
```
*Note: This shortcut is automatically configured when you run `setup.bat`. If it's your first time, remember to restart your terminal after the setup for the change to take effect.*

---

## ✨ Key Features

### 📂 Intelligent Centralization (Link Engine)
- **Zero Disk Waste**: Use Hardlinks to centralize models from various folders (ComfyUI, LM Studio, Ollama) without using extra disk space.
- **Bulk Management**: In the **Centralization** tab, select multiple standalone models and link them to the master repository with one click.
- **Native Picker**: Use the folder icon in Settings to choose directories using the native Windows selector (always stays in front of the browser).

### 🚀 Launch Engine (Orchestrator)
- **Adaptive Launching**: The system automatically detects the ideal engine for each model (e.g., Ollama vs. Llama.cpp).
- **One-Click Server**: Launch **Ollama** or **Llama.cpp** (port 8080) servers directly from the interface in dedicated terminals.
- **ComfyUI Integration**: Launch ComfyUI with NVIDIA GPU support automatically.

### 🖥️ Hardware Lab & Telemetry
- **Real-Time Monitoring**: VRAM detection via `nvidia-smi` and WMI.
- **Compatibility Check**: The system analyzes your VRAM/RAM and indicates which models from the **AI Model Hub** run perfectly on your machine.

### 💬 Test & Chat
- **Integrated Interface**: Chat with your local models directly within the dashboard.
- **Multi-Engine Support**: Switch between Ollama, Llama.cpp, or custom endpoints in real-time.

---

## 🛠️ Technical Structure
- **Unified Port**: The frontend is pre-compiled (`npm run build`) and served directly by Node.js on port 4000.
- **Cross-Platform Picker**: Folder selection compatible with Windows, Mac, and Linux.

---
**Centralize your intelligence. Optimize your space.**
