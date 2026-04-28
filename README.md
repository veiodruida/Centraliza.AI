# 🚀 CentralizaIA - Local AI Orchestrator & Dashboard

CentralizaIA é um dashboard premium para gestão de modelos de Inteligência Artificial local. Ele permite centralizar, organizar e lançar modelos (Ollama, ComfyUI, Llama.cpp, LM Studio) de forma inteligente, economizando espaço em disco através de Hardlinks.

---

## ⚡ Instalação Rápida (Quick Start)

### 1. Pré-requisitos
- **Node.js** (v18 ou superior)
- **Ollama** (opcional, para modelos Ollama)
- **NVIDIA GPU** (recomendado para melhor performance)

### 2. Configuração Automática
Abra o terminal na pasta do projeto e execute:
```bash
setup.bat
```
*Este comando instalará todas as dependências do servidor e da interface.*

### 3. Como Rodar
Para iniciar a aplicação completa (Backend + Frontend), basta executar:
```bash
start_app.bat
```
- **Interface Dashboard**: [http://localhost:5173](http://localhost:5173)
- **Backend API**: [http://localhost:4000](http://localhost:4000)

---

## ✨ Funcionalidades Principais

### 📂 Centralização Inteligente (Link Engine)
- **Zero Disk Waste**: Use Hardlinks/Symlinks para centralizar modelos de diferentes pastas (ComfyUI, LM Studio, Ollama) sem ocupar espaço extra.
- **Gestão em Massa**: Na aba **Centralization**, selecione múltiplos modelos standalone e vincule-os ao repositório mestre com um clique.

### 🚀 Launch Engine (Orquestrador)
- **Lançamento Adaptativo**: O sistema detecta o motor ideal para cada modelo.
- **One-Click Server**: Inicie servidores **Ollama** ou **Llama.cpp** (na porta 8080) diretamente pela interface em terminais dedicados.
- **ComfyUI Integration**: Lance o ComfyUI com suporte a GPU NVIDIA automaticamente.

### 🖥️ Hardware Lab & Telemetry
- **Monitoramento Real**: Detecção de VRAM via `nvidia-smi` e WMI.
- **Compatibility Check**: O sistema analisa sua memória RAM/VRAM e indica quais modelos do **AI Model Hub** (HuggingFace) rodam perfeitamente na sua máquina.

### 💬 Test & Chat
- **Interface Integrada**: Converse com seus modelos locais diretamente no dashboard.
- **Multi-Engine**: Troque entre Ollama, Llama.cpp ou endpoints customizados em tempo real.

---

## 🛠️ Estrutura do Projeto

- `server.js`: Servidor Backend (Express) - Orquestração de processos e sistema de arquivos.
- `frontend/`: Dashboard React + Vite + Tailwind CSS.
- `picker.ps1`: Script auxiliar para seleção de pastas nativa e cross-platform.
- `config.json`: Armazena suas pastas de scan e configurações de diretório central.

---

## 🌍 Compatibilidade
- **Sistemas**: Windows (Foco principal), macOS e Linux.
- **Formatos**: GGUF, Safetensors, Checkpoints, Ollama Blobs.

---
**Desenvolvido para oferecer controle total sobre sua infraestrutura de IA local.**
