# 🏗️ Centraliza.ai — Arquitetura do Sistema

> Documento de referência da arquitetura técnica do orquestrador local de IA.
> Última atualização: 2026-11-24 | Versão: 0.5.0

---

## Visão Geral

Centraliza.ai é um orquestrador local de modelos de IA que unifica o gerenciamento
de múltiplas ferramentas (Ollama, ComfyUI, LM Studio, Llama.cpp, Hugging Face) em
um dashboard premium. O sistema opera inteiramente local, sem dependências de nuvem
para funcionalidade core.

### Proposta de Valor
- **Zero Desperdício de Disco**: Centralização via NTFS Hardlinks — modelos gigantes
  compartilhados entre apps sem duplicação.
- **Painel Unificado**: Um único ponto de controle para descobrir, baixar, lançar
  e testar modelos de IA.
- **Telemetria de Hardware**: Análise em tempo real de GPU/CPU/VRAM para decisões
  informadas de deployment.
- **Agente Nativo**: O Centraliza Coder (agente DeepSeek) arranca a partir do
  dashboard, em dois modos, sobre os modelos locais.

---

## Stack Tecnológica

| Camada       | Tecnologia                                | Responsabilidade                    |
|--------------|-------------------------------------------|-------------------------------------|
| **Backend**  | Node.js 18+ + Express (porta 4000)        | API REST, WebSocket, file system    |
| **Frontend** | React 19 + Vite + TypeScript              | Dashboard SPA com i18n              |
| **Styling**  | Tailwind CSS + CSS Variables              | Design system glassmórfico          |
| **Realtime** | Socket.io                                 | Progresso de downloads, logs, sync  |
| **Storage**  | NTFS Hardlinks / Symlinks (fallback)      | Centralização sem duplicação        |
| **Icons**    | Lucide React                              | Iconografia consistente             |
| **Charts**   | Recharts                                  | Gráficos de disco e de localizações |
| **SQLite**   | `node:sqlite` (Node 22+)                  | Escrita da config do Roo Code       |
| **i18n**     | Engine reativa customizada                | 11 idiomas + RTL (Árabe)            |

---

## Arquitetura de 3 Camadas (+ módulos v0.5.0)

### Módulos do backend (v0.5.0)

O `server.js` continua a ser o ponto de entrada, mas a lógica nova vive em módulos
isolados em `backend/` (evita saturar o ficheiro e facilita testes):

| Módulo                  | Responsabilidade                                                        |
|-------------------------|-------------------------------------------------------------------------|
| `backend/flavor.js`     | Etiquetagem automática Abliterated/Uncensored (nome, tags, metadados)   |
| `backend/storage.js`    | Espaço total, por localização e poupado por hardlinks                   |
| `backend/engines.js`    | Deteção/arranque/paragem (unload) de Ollama, llama.cpp, LM Studio, ComfyUI |
| `backend/extensions.js` | Configuração automática de Continue.dev e Roo Code + smoke test         |
| `backend/updater.js`    | Auto-atualização transacional (manifesto/GitHub, SHA-256, rollback)      |

### Camada 1: Motor de Descoberta (Scan Engine)
Responsável por varrer diretórios configurados e mapear modelos de IA.

- **Entrada**: Lista de `scanDirectories` do `config.json`
- **Processo**: Varredura recursiva, filtragem por extensão
  (`.gguf`, `.safetensors`, `.ckpt`, `.bin`, `.pt`, `.pth`),
  parsing de manifestos Ollama para resolver hashes SHA256 em nomes legíveis
- **Saída**: Lista normalizada com metadata (nome, caminho, tamanho, fonte, status
  de centralização, `is_abliterated`, `is_uncensored`, `flavors`)
- **Cache**: TTL de 10s no endpoint `/api/models`

### Camada 2: Motor de Linking (Centralization Engine)
Responsável por criar links sem duplicação de dados.

- **Estratégia Primária**: `fs.link()` (NTFS Hardlink) — zero espaço adicional
- **Fallback**: `fs.symlink()` — quando hardlink falha (volumes diferentes)
- **Validação**: Comparação de `inode` ou `(size + mtime)` para detectar
  centralização existente
- **Destino**: `{centralDir}/Centraliza.ai/{modelBaseName}/{fileName}`
- **Métricas**: `/api/storage/summary` agrega espaço por pasta e distingue
  espaço físico real de espaço que seria duplicado sem os links

### Camada 3: Motor de Orquestração (Launch Engine)
Responsável por lançar e gerenciar inferência.

- **Ollama**: `ollama serve` / `ollama run {tag}` (descarregamento via `keep_alive: 0`)
- **Llama.cpp**: `llama-server` gerido pela app (args configuráveis, health-check)
- **ComfyUI**: Detecção automática de root + launch via `run_nvidia_gpu.bat`
- **LM Studio**: `lms server start/stop`
- **Chat Proxy / Gateway**: `/v1/chat/completions` compatível com OpenAI
  (roteia para o llama.cpp ou Ollama conforme o modelo pedido)

### Camada 4: Agente e Integrações (v0.5.0)
- **Centraliza Coder**: agente DeepSeek Harness (`dsh web`) com patch de perfil
  isolado (`data/dsh/`), apontado ao motor local (llama.cpp **ou** Ollama).
  - **Modo A**: "Iniciar Motor" arranca o modelo por defeito e lança o agente.
  - **Modo B**: lançamento independente com um modelo já configurado.
- **Extensões**: Continue.dev (`~/.continue/config.{json,yaml}`) e Roo Code
  (`state.vscdb` do VS Code, com backup) apontam para
  `http://localhost:4000/v1` (`centraliza-local` / `centraliza-router`).
  Só são ativadas com motor + modelo a correr (pré-requisito verificado).
- **Auto-update**: verificação no arranque + a cada 24 h, aplicação transacional
  com backup/rollback e notificação ao utilizador.

---

## Superfície de API

### Endpoints de Leitura
| Rota                      | Método | Descrição                                  | Cache  |
|---------------------------|--------|--------------------------------------------|--------|
| `/api/models`             | GET    | Lista modelos (`?filter=coder/abliterated/uncensored`) | 10s |
| `/api/config`             | GET    | Configuração atual                         | —      |
| `/api/system-info`        | GET    | Telemetria CPU/RAM/GPU/VRAM                | 5s     |
| `/api/system/disk`        | GET    | Uso de disco e tamanho central             | 15s    |
| `/api/storage/summary`    | GET    | Espaço total, por localização e poupado    | 15s    |
| `/api/engines`            | GET    | Motores detetados + estado (a correr/parado)| 3s    |
| `/api/logs/recent`        | GET    | Últimos logs do servidor (buffer circular) | —      |
| `/api/registry`           | GET    | Catálogo HuggingFace local (com flavors)   | 30min  |
| `/api/model-readme`       | GET    | README de modelo (HF API ou local)         | 1h     |
| `/api/coder/status`       | GET    | Motor + modelo + agente + atualização      | —      |
| `/api/update/status`      | GET    | Estado da auto-atualização                 | —      |
| `/api/extensions/status`  | GET    | Prontidão das integrações + bloqueios      | —      |

### Endpoints de Escrita
| Rota                        | Método | Descrição                                |
|-----------------------------|--------|------------------------------------------|
| `/api/config`               | POST   | Atualiza configuração (inclui preferências v0.5.0) |
| `/api/centralize`           | POST   | Cria hardlink para modelo                |
| `/api/download`             | POST   | Inicia download via `ollama pull`        |
| `/api/download/pause`       | POST   | Pausa download ativo                     |
| `/api/download/cancel`      | POST   | Cancela + limpa parciais                 |
| `/api/launch`               | POST   | Lança motor de inferência (legacy)       |
| `/api/chat`                 | POST   | Proxy para chat com modelo local (legacy)|
| `/api/engines/start`        | POST   | Arranca um motor (`{ id, modelPath? }`)  |
| `/api/engines/stop`         | POST   | Para/descarrega um motor (`unloadOnly`)  |
| `/api/engines/stop-all`     | POST   | Para todos os motores detetados          |
| `/api/coder/agent/start`    | POST   | Arranca o agente (`{ mode: engine|model, modelPath? }`) |
| `/api/coder/agent/stop`     | POST   | Para o agente DeepSeek                   |
| `/api/coder/dsh/*`          | GET/POST | Compatibilidade (status/launch/stop)   |
| `/api/update/check`         | POST   | Verifica atualizações                    |
| `/api/update/apply`         | POST   | Aplica atualização (SHA-256 + rollback)  |
| `/api/extensions/continue`  | POST   | Escreve config do Continue.dev           |
| `/api/extensions/roo`       | POST   | Escreve config do Roo Code (state.vscdb) |
| `/api/extensions/smoke-test`| POST   | Pergunta "Responde apenas: OK" ao gateway|
| `/api/extensions/open-vscode`| POST  | Abre o VS Code no projeto                |
| `/api/extensions/start-stack`| POST  | Arranca motor + modelo por defeito       |
| `/api/pick-folder`          | GET    | Abre picker nativo de pastas             |
| `/api/open-folder`          | POST   | Abre pasta no explorador do OS           |
| `/v1/chat/completions`      | POST   | Gateway OpenAI-compatible (streaming SSE)|
| `/v1/models`                | GET    | Modelos expostos pelo gateway            |

### Eventos WebSocket (Socket.io)
| Evento               | Direção       | Payload                                       |
|----------------------|---------------|-----------------------------------------------|
| `download-progress`  | Server→Client | `{ model, progress }` (-1 = indeterminado)    |
| `download-complete`  | Server→Client | `{ model, success, cancelled, paused }`       |
| `models-updated`     | Server→Client | (sem payload) — sinal para re-fetch           |
| `server-log`         | Server→Client | `{ level, msg, time }` — logs em tempo real   |
| `update-available`   | Server→Client | `{ version, current, notes }`                 |
| `update-applied`     | Server→Client | `{ version, restartRequired, files }`         |
| `test-progress`      | Client→Server | Trigger para teste de conexão WebSocket       |

---

## Fluxos de Dados

### Download de Modelo
```
Usuário → POST /api/download { modelName }
   ↓
spawn('cmd.exe', ['ollama pull modelName'])
   ↓
stdout/stderr → parse linhas → extrai % → io.emit('download-progress')
   ↓
Sucesso → finishDownload() → io.emit('download-complete', { success: true })
```

### Início de motor + agente (Modo A)
```
UI → POST /api/coder/agent/start { mode: 'engine' }
   ↓
startLlamaEngine(modelo por defeito) → health check /health
   ↓
writeDshPatch(baseURL do motor, alias) → `dsh web --patch ...`
   ↓
GET /                     → agente pronto (URL devolvida à UI)
```

### Integração com editores
```
UI → GET /api/extensions/status   (motor + modelo + gateway)
   ↓ (ready)
POST /api/extensions/roo
   ↓
backup state.vscdb → node:sqlite → merge apiConfiguration → verificação
   ↓ (fallback se o VS Code estiver aberto)
ficheiro de apoio + diagnóstico legível
```

---

## Sistema de Cache

| Chave            | TTL      | Invalidação                    |
|------------------|----------|--------------------------------|
| `models-list`    | 10s      | `cache.clear()` em mutações    |
| `system-info`    | 5s       | Expiração natural              |
| `system-disk`    | 15s      | Expiração natural              |
| `storage-summary`| 15s      | Expiração natural              |
| `engines`        | 3s       | Expiração natural              |
| `registry`       | 30min    | Expiração natural              |
| `readme-{id}`    | 1h       | Expiração natural              |

**Regra**: Toda a mutação (`POST`, `DELETE`) chama `cache.clear()` para garantir
consistência.

---

## Estrutura de Arquivos

```
CentralizaIA/
├── server.js                  # Backend Express + Socket.io (porta 4000)
├── backend/                   # Módulos v0.5.0 (flavor, storage, engines, extensions, updater)
├── config.json                # Persistência de configuração
├── package.json               # Dependências do backend
├── setup.bat                  # Instalação zero-config
├── start_app.bat              # Launch script
├── central.bat                # Atalho global
├── picker.ps1                 # Picker nativo de pastas (PowerShell -sta)
├── data/
│   ├── hf_models.json         # Catálogo local do Hugging Face
│   └── dsh/                   # Patch de perfil isolado do agente DeepSeek
├── frontend/
│   ├── package.json            # Dependências do frontend
│   ├── vite.config.ts          # Configuração Vite
│   └── src/
│       ├── App.tsx             # Router + Dashboard + Sidebar
│       ├── main.tsx            # Entry point React
│       ├── theme.css           # CSS Variables do design system
│       ├── index.css           # Estilos globais
│       ├── pages/              # 9 páginas (MyModels, ExploreStore, ModelTester, Coder…)
│       ├── components/         # Componentes reutilizáveis (inclui StorageLocationChart)
│       ├── context/            # AppContext (estado global)
│       └── i18n/               # Traduções (11 idiomas, v050.ts com as chaves novas)
└── documentation/
    ├── ARCHITECTURE.md         # ← ESTE ARQUIVO
    ├── CENTRALIZA_CODER_SPEC.md
    └── DEVELOPMENT_GUIDE.md
```

---

## Regras Operacionais

1. **Single Port**: Backend e frontend servidos pela mesma porta (4000).
   O frontend é compilado (`dist/`) e servido como estático pelo Express.
2. **Hardlink First**: Sempre tentar `fs.link()` antes de `fs.symlink()`.
3. **Skip Parciais**: Arquivos terminados em `-partial`, `.partial`, `.part`
   são ignorados pelo scanner.
4. **Ollama Dedup**: Blobs Ollama sem mapeamento em manifest são ignorados
   (orphans/parciais).
5. **Process Isolation**: Processos de inferência lançados via `start cmd /k`
   para sobreviver ao fechamento do dashboard.
6. **Path Safety**: Caminhos Windows com espaços tratados com double escaping
   em `exec`.
7. **Graceful Stop (v0.5.0)**: parar um motor faz primeiro *unload* dos modelos
   (`keep_alive: 0`, `lms unload --all`) e só depois termina os processos.
8. **Deteção por múltiplas fontes (v0.5.0)**: binário no PATH + pastas comuns +
   porta/health-check; timeouts curtos para não bloquear a UI.
9. **Config não é código (v0.5.0)**: as integrações guardam backup antes de
   escrever; o auto-update nunca toca em `config.json`, `data/` ou `node_modules`.
