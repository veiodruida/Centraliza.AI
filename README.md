# 🌌 Centraliza.ai - The Ultimate Local AI Orchestrator

**Centraliza.ai** é um dashboard premium para unificar o teu ecossistema de IA local — **LM Studio**, **Ollama**, **ComfyUI** e **Llama.cpp** — gerindo modelos sem redundância de disco.

---

## 📦 Notas da Versão v0.4.0 — Configuração Inteligente de Hardware

> Comparação com a versão anterior (**v0.3.1**).

### ✨ Novidades

- **Painel "Impacto no Hardware"** (novo): ao ajustar **Context Size** e **GPU Layers**, o painel mostra em tempo real — com base no teu hardware real (VRAM, RAM, GPU) e nos metadados do modelo:
  - **Velocidade estimada** (tokens/segundo) com classificação (Muito rápido / Bom / Lento / Muito lento);
  - **Memória**: VRAM e RAM usadas vs. disponíveis (pesos do modelo + cache KV do contexto);
  - **Adequação do contexto**: Chat rápido · Uso geral/Programação · Programação/Documentos · Documentos longos/RAG · Contexto extremo (1M);
  - **Avisos** quando a configuração estoura a VRAM/RAM, excede o máximo do modelo ou fica demasiado lenta;
  - **Recomendação automática** de contexto + camadas GPU para o teu hardware, com botão **Aplicar**.
- **Leitura de metadados GGUF** (novo endpoint `/api/gguf/meta`): nº real de camadas, contexto máximo, arquitetura e quantização de cada modelo local — a base de todas as estimativas.
- **Sliders com limites reais do modelo**: as camadas GPU limitam-se ao nº real de camadas do modelo e o contexto vai até ao **máximo suportado (até 1M tokens)**.
- **Contexto grande a funcionar de verdade**: o VRAM Shield do gateway passa a respeitar o contexto que alocas ao motor nativo (antes limitava a 32K mesmo com contexto maior escolhido).
- **Atualização ao vivo com destaque**: os valores "acendem" sempre que mudam, tornando visível o recálculo automático ao arrastar os sliders.

### 🛠️ Melhorias

- Legibilidade reforçada no painel de impacto (textos maiores e com mais contraste).
- Servidor aceita `PORT` por variável de ambiente (ex.: `PORT=4001 node server.js`).
- `/api/system-info` mais robusto (fallback gracioso quando o `nvidia-smi` não está disponível).

### 🧪 Testes

- **6 testes do servidor**: parser GGUF (sintético + ficheiro local), validação do endpoint, system-info e models.
- **7 testes do motor de estimativa**: classificação de contexto, cache KV, recomendações e avisos.

### 🔁 Comparação rápida v0.3.1 → v0.4.0

| Área | v0.3.1 | v0.4.0 |
| :--- | :--- | :--- |
| Contexto máximo no seletor | 131 072 (128K) fixo | **até 1M** (limitado ao máximo real do modelo) |
| Camadas GPU | 0–99 arbitrário | **0–nº real de camadas do modelo** |
| Feedback de desempenho | nenhum | **t/s estimado + classificação em tempo real** |
| Memória prevista | nenhuma | **VRAM/RAM (pesos + cache KV) com barras** |
| Recomendação de hardware | nenhuma | **automática + botão "Aplicar"** |
| Contexto no gateway | limitado a 32K (VRAM Shield) | **respeita o contexto alocado ao motor nativo** |
| Metadados do modelo | só tamanho do ficheiro | **GGUF: camadas, contexto máx., quantização** |

---

## 🚀 Key Features

- **Smart Link Technology**: Share models across different engines (LM Studio <-> Ollama) without duplicating files. Save hundreds of GBs.
- **One-Click Launch**: Start Ollama, Llama.cpp, or ComfyUI environments directly from one unified dashboard.
- **Hardware Intelligence**: Real-time VRAM telemetry, hardware-specific model recommendations and an **Impact Panel** that estimates speed and memory before you load a model.
- **Privacy First**: 100% local. Your data, models, and conversations never leave your machine.

---

## 🛠️ Installation & Setup

### 1. Automated Setup (instalação completa)
Run the setup script to install everything in one go:
`bash
.\setup.bat
`
O **setup.bat** faz tudo de forma consolidada:
1. Verifica o Node.js;
2. Instala as dependências do Root e do Frontend;
3. Compila a interface (build);
4. Adiciona o comando `central` ao PATH do utilizador;
5. **Cria o atalho "Centraliza.ai" no Ambiente de Trabalho** (aponta para o `start.bat`).

### 2. Quick Start
Depois de instalado, podes iniciar a aplicação de qualquer uma destas formas (equivalentes):
- **Atalho "Centraliza.ai"** no Ambiente de Trabalho;
- comando `central` (após reabrir o terminal);
- `.\start.bat` a partir da raiz.

O **start.bat** é o lançador único: encerra qualquer instância anterior na porta 4000, abre o dashboard no browser e inicia o servidor (fechar a janela do servidor para parar a aplicação).

---

## ⌨️ Command Line Interface (CLI)

| Command | Action |
| :--- | :--- |
| central | Launches the Centraliza.ai Dashboard (equivale ao start.bat) |
| .\setup.bat | Instala dependências, compila, configura o PATH e cria o atalho no Ambiente de Trabalho |
| .\start.bat | Lançador único: inicia o servidor e abre o dashboard |
| .\start_app.bat | Alias de compatibilidade do start.bat |
| .\create-shortcut.ps1 | (Re)cria o atalho "Centraliza.ai" no Ambiente de Trabalho |

---

## 📂 Project Structure

- **/frontend**: React + Vite dashboard with modern UI.
  - **src/components/ConfigImpact.tsx**: painel "Impacto no Hardware" (recomendação, velocidade, memória).
  - **src/utils/configAdvisor.ts**: motor de estimativa (t/s, VRAM/RAM, contexto) e recomendação.
  - **src/utils/useGGUFMeta.ts**: hook de carregamento dos metadados GGUF.
- **/server.js**: gateway + parser GGUF (`/api/gguf/meta`) + API de hardware (`/api/system-info`).
- **/scripts**: automação e scripts de verificação (Playwright, exec-compat).

---

*Built for the local AI revolution. Empower your machine.*
