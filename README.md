# CentralizaIA

Centralizador de Modelos de Inteligência Artificial para Windows.

## 🌟 Versão 2.0 (Nova)
O projeto foi totalmente migrado para uma arquitetura de Dashboard moderno. 

### Principais Funcionalidades:
- **Gestão de Modelos**: Centralize modelos do Ollama, ComfyUI, LM Studio e Llama.cpp em um único local usando Hardlinks (zero espaço extra).
- **Lançamento Inteligente**: Inicie servidores Ollama ou Llama.cpp diretamente da interface em um novo terminal.
- **Hardware Telemetry**: Detecção real de VRAM (NVIDIA-SMI) e análise de compatibilidade.
- **AI Model Hub**: Explore e baixe modelos do HuggingFace com indicadores de performance para sua máquina.
- **Test & Chat**: Teste seus modelos locais em uma interface de chat integrada com suporte a múltiplos motores.

### Como rodar:
1. `node server.js` (Raiz)
2. `npm run dev` (Pasta frontend)

Consulte o [README_V2.md](./README_V2.md) para mais detalhes técnicos.
