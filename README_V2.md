# CentralizaIA V2 - AI Model Hub & Orchestrator

Bem-vindo à Versão 2.0 do CentralizaIA. A aplicação foi totalmente reconstruída com uma arquitetura moderna (React + Node.js) para oferecer uma experiência premium de gestão de modelos de IA.

## 🏗️ Arquitetura
- **Frontend (React + Vite + Tailwind)**: Interface de alta performance com design "Glassmorphism", filtros avançados e gestão de estado em tempo real.
- **Backend (Node.js + Express)**: Engine de gerenciamento de arquivos (Hardlinks/Symlinks), telemetria de hardware via WMI/NVIDIA-SMI e orquestrador de processos (Launch Engine).
- **Registry System**: Banco de dados local de modelos com metadados de hardware (VRAM/RAM) para análise de compatibilidade automática.

## 🚀 Como Rodar a Aplicação

Para garantir que tudo funcione, você precisa rodar dois comandos em terminais separados:

### 1. Iniciar o Backend (API)
Abra um terminal na pasta raiz e rode:
```bash
node server.js
```
*O servidor rodará em http://localhost:4000*

### 2. Iniciar o Frontend (Interface)
Abra outro terminal na pasta `frontend` e rode:
```bash
npm run dev
```
*A interface abrirá em http://localhost:5173*

## 🛠️ O que Testar agora

1.  **Dashboard**: Veja o resumo do seu espaço em disco economizado e status do sistema.
2.  **My Models**:
    -   Clique nos ícones de **Play** ou **Terminal** para lançar um modelo no Ollama ou Llama.cpp.
    -   Clique no nome de um modelo para ver os detalhes técnicos profundos.
    -   Use o botão **Centralize** para criar links e economizar espaço.
3.  **AI Model Hub**:
    -   Explore modelos do HuggingFace.
    -   Confira o status de compatibilidade (Perfect Fit) baseado na sua GPU real.
4.  **Hardware Lab**:
    -   Confirme se sua GPU NVIDIA (e os 16GB de VRAM) estão sendo detectados corretamente.
5.  **Test & Chat**:
    -   Selecione o motor (Ollama ou Llama.cpp) e converse com seus modelos locais.

---
**Nota de Segurança**: O CentralizaIA v2 não move seus arquivos originais, ele utiliza links de sistema para garantir que seus programas (ComfyUI, LM Studio) continuem funcionando enquanto você centraliza sua biblioteca.
