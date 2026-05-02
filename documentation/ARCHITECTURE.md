# 🏗️ Centraliza.ai — Arquitetura do Sistema

> Documento de referência da arquitetura técnica do orquestrador local de IA.
> Última atualização: 2026-05-02 | Versão: 3.2.0

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

---

## Stack Tecnológica

| Camada       | Tecnologia                                | Responsabilidade                    |
|--------------|-------------------------------------------|-------------------------------------|
| **Backend**  | Node.js + Express (porta 4000)            | API REST, WebSocket, file system    |
| **Frontend** | React 18 + Vite + TypeScript              | Dashboard SPA com i18n              |
| **Styling**  | Tailwind CSS + CSS Variables              | Design system glassmórfico          |
| **Realtime** | Socket.io                                 | Progresso de downloads, sync de UI  |
| **Storage**  | NTFS Hardlinks / Symlinks (fallback)      | Centralização sem duplicação        |
| **Icons**    | Lucide React                              | Iconografia consistente             |
| **Charts**   | Recharts                                  | Gráficos de uso de disco            |
| **i18n**     | Engine reativa customizada                | 11 idiomas + RTL (Árabe)            |

---

## Arquitetura de 3 Camadas

### Camada 1: Motor de Descoberta (Scan Engine)
Responsável por varrer diretórios configurados e mapear modelos de IA.

- **Entrada**: Lista de `scanDirectories` do `config.json`
- **Processo**: Varredura recursiva, filtragem por extensão
  (`.gguf`, `.safetensors`, `.ckpt`, `.bin`, `.pt`, `.pth`),
  parsing de manifestos Ollama para resolver hashes SHA256 em nomes legíveis
- **Saída**: Lista normalizada com metadata (nome, caminho, tamanho, fonte, status
  de centralização)
- **Cache**: TTL de 10s no endpoint `/api/models` para performance

### Camada 2: Motor de Linking (Centralization Engine)
Responsável por criar links sem duplicação de dados.

- **Estratégia Primária**: `fs.link()` (NTFS Hardlink) — zero espaço adicional
- **Fallback**: `fs.symlink()` — quando hardlink falha (volumes diferentes)
- **Validação**: Comparação de `inode` ou `(size + mtime)` para detectar
  centralização existente
- **Destino**: `{centralDir}/Centraliza.ai/{modelBaseName}/{fileName}`

### Camada 3: Motor de Orquestração (Launch Engine)
Responsável por lançar e gerenciar inferência.

- **Ollama**: `ollama run {tag}` via processo desacoplado
- **Llama.cpp**: `llama-cli` com parâmetros configuráveis
  (threads, GPU layers, context)
- **ComfyUI**: Detecção automática de root + launch via `run_nvidia_gpu.bat`
- **LM Studio**: Launch via `lms.exe`
- **Chat Proxy**: Proxy transparente para `localhost:11434/api/generate`

---

## Superfície de API

### Endpoints de Leitura
| Rota                   | Método | Descrição                           | Cache  |
|------------------------|--------|-------------------------------------|--------|
| `/api/models`          | GET    | Lista todos os modelos detectados   | 10s    |
| `/api/config`          | GET    | Retorna configuração atual          | —      |
| `/api/system-info`     | GET    | Telemetria CPU/RAM/GPU/VRAM         | 5s     |
| `/api/system/disk`     | GET    | Uso de disco e tamanho central      | 15s    |
| `/api/registry`        | GET    | Catálogo HuggingFace local          | 30min  |
| `/api/model-readme`    | GET    | README de modelo (HF API ou local)  | 1h     |

### Endpoints de Escrita
| Rota                      | Método | Descrição                          |
|---------------------------|--------|------------------------------------|
| `/api/config`             | POST   | Atualiza configuração              |
| `/api/centralize`         | POST   | Cria hardlink para modelo          |
| `/api/download`           | POST   | Inicia download via `ollama pull`  |
| `/api/download/pause`     | POST   | Pausa download ativo               |
| `/api/download/cancel`    | POST   | Cancela + limpa parciais           |
| `/api/launch`             | POST   | Lança motor de inferência          |
| `/api/chat`               | POST   | Proxy para chat com modelo local   |
| `/api/auto-detect`        | POST   | Auto-detecta caminhos de IA        |
| `/api/models/rename`      | POST   | Renomeia modelo no filesystem      |
| `/api/models/move`        | POST   | Move modelo entre diretórios       |
| `/api/models/sanity-check`| POST   | Limpa hardlinks quebrados          |
| `/api/models`             | DELETE | Remove modelo (Ollama RM + unlink) |
| `/api/pick-folder`        | GET    | Abre picker nativo de pastas       |
| `/api/open-folder`        | POST   | Abre pasta no explorador do OS     |

### Eventos WebSocket (Socket.io)
| Evento               | Direção       | Payload                                       |
|----------------------|---------------|-----------------------------------------------|
| `download-progress`  | Server→Client | `{ model, progress }` (-1 = indeterminado)    |
| `download-complete`  | Server→Client | `{ model, success, cancelled, paused }`       |
| `models-updated`     | Server→Client | (sem payload) — sinal para re-fetch           |
| `test-progress`      | Client→Server | Trigger para teste de conexão WebSocket        |

---

## Fluxo de Dados: Download de Modelo

```
Usuário → POST /api/download { modelName }
   ↓
spawn('cmd.exe', ['ollama pull modelName'])
   ↓
stdout/stderr → parse linhas → extrai % → io.emit('download-progress')
   ↓
Sucesso → finishDownload() → io.emit('download-complete', { success: true })
   ↓
Cancelamento → taskkill + ollama rm + limpeza de parciais + io.emit('models-updated')
```

---

## Estrutura de Arquivos

```
CentralizaIA/
├── server.js                  # Backend Express + Socket.io (porta 4000)
├── config.json                # Persistência de configuração
├── package.json               # Dependências do backend
├── setup.bat                  # Instalação zero-config
├── start_app.bat              # Launch script
├── central.bat                # Atalho global
├── picker.ps1                 # Picker nativo de pastas (PowerShell -sta)
├── data/
│   └── hf_models.json         # Catálogo local do Hugging Face
├── frontend/
│   ├── package.json            # Dependências do frontend
│   ├── vite.config.ts          # Configuração Vite
│   └── src/
│       ├── App.tsx             # Router + Dashboard + Sidebar
│       ├── main.tsx            # Entry point React
│       ├── theme.css           # CSS Variables do design system
│       ├── index.css           # Estilos globais
│       ├── App.css             # Estilos do App
│       ├── pages/              # 7 páginas (MyModels, ExploreStore, etc.)
│       ├── components/         # 6 componentes reutilizáveis
│       ├── context/            # AppContext (estado global + i18n)
│       └── i18n/               # Traduções (11 idiomas)
└── documentation/
    ├── ARCHITECTURE.md         # ← ESTE ARQUIVO
    └── DEVELOPMENT_GUIDE.md    # Guia de desenvolvimento
```

---

## Sistema de Cache

O backend implementa cache in-memory com TTL para evitar operações
repetidas de I/O:

| Chave            | TTL      | Invalidação                    |
|------------------|----------|--------------------------------|
| `models-list`    | 10s      | `cache.clear()` em mutações    |
| `system-info`    | 5s       | Expiração natural              |
| `system-disk`    | 15s      | Expiração natural              |
| `registry`       | 30min    | Expiração natural              |
| `readme-{id}`    | 1h       | Expiração natural              |

**Regra**: Toda mutação (`POST`, `DELETE`) chama `cache.clear()` para garantir
consistência.

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
