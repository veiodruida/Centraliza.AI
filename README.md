# 🚀 Centraliza.ai v0.3.0 - Gestão Absoluta

Centraliza.ai is a premium dashboard for managing local Artificial Intelligence models. It allows you to centralize, organize, and launch models (Ollama, ComfyUI, Llama.cpp, LM Studio) intelligently, saving disk space through system Hardlinks.

---

## ✨ New in v0.3.0 "Gestão Absoluta"

### 📂 Complete Model Management (CRUD)
- **Rename & Move**: Manage your models physically on disk. Rename or move files across drives directly from the UI.
- **Collapsable Sections**: Grouped view by provider (Ollama, ComfyUI, LM Studio) with expand/collapse logic and persistent state.
- **Sanity Check**: Automated tool to clean up orphan links and maintain repository integrity.

### 📊 Disk Usage Analytics
- **Visual Breakdown**: New interactive pie chart on the Dashboard showing exactly how much space Centraliza.ai is saving you compared to other files.
- **Real-time Stats**: Track total, used, and free disk space with precision.

### 🚀 Advanced Launch Engine
- **Llama.cpp Modal**: Configure Threads, GPU Layers (n_gpu_layers), and Context Size via a premium modal before launching GGUF models.
- **Real-time Download Tracking**: Monitor `ollama pull` progress with live percentages via WebSockets.
- **Auto-Detection**: The system now automatically detects your apps and paths on first run for a "Zero Configuration" experience.

### 💡 Global Help System
- **Contextual Tooltips**: Premium glassmorphism tooltips throughout the interface to explain technical concepts to non-technical users.
- **Global Toast Notifications**: Instant feedback for every operation (rename, move, delete, launch).

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

## 🛠️ Technical Structure
- **Core**: Node.js + Express (Backend), React + Vite (Frontend).
- **Communication**: WebSockets (Socket.io) for real-time progress.
- **Styling**: Tailwind CSS + Lucide Icons + Recharts.
- **Space Saving**: Windows NTFS Hardlinks.

---
**Centralize your intelligence. Optimize your space.**
