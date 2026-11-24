# 📝 Especificação: Centraliza Coder & Integrações com Editores

**Data:** Novembro de 2026
**Versão:** 0.5.0
**Objetivo:** Definir o agente de engenharia de software nativo da plataforma
(agente DeepSeek), o seu ciclo de vida em dois modos de arranque, a
auto-atualização da aplicação e as integrações automáticas com o VS Code
(Continue.dev e Roo Code).

> **Nota de versão:** a partir da v0.5.0 o Centraliza **deixou de integrar o
> agente CLI de terceiros**. O clone/`git pull` do repositório, a instalação
> global do CLI e todas as referências na UI e no código foram removidos. O
> `data/dsh/` contém apenas o patch de perfil do agente nativo.

---

## 1. Sistema de Autocompletar Comandos (Test & Chat)

**Conceito:** Uma interface visual (popup flutuante) que aparece no chat assim que
o utilizador digita `/`.

*   **Gatilho:** Input de texto inicia com `/`.
*   **UI/Visual:** Menu suspenso (estilo *Command Palette*) com *backdrop-blur*.
*   **Comandos:** `/gsd`, `/clear`, `/compact`, `/attach`, `/info`, `/ajuda`,
    `/analyze`, `/context`.
*   **Navegação:** setas do teclado + `Enter`, além do clique do rato.

---

## 2. Centraliza Coder (agente DeepSeek nativo)

**Conceito:** O agente de engenharia de software da plataforma, servido pelo
DeepSeek Harness (`dsh web`) e alimentado pelos modelos locais do Centraliza.

### 2.1. Arranque em dois modos

| Modo | Gatilho na UI | Comportamento |
|------|----------------|----------------|
| **A — Modelo por defeito** | "Iniciar Motor" (com a opção *"Lançar também o agente"* ativa) | Arranca o `llama.cpp` com o modelo por defeito (`coderAgentModel` → `activeRouterModel` → primeiro GGUF com capacidade de agente) e lança o agente sobre esse motor |
| **B — Lançamento independente** | "Iniciar com o modelo selecionado" | Usa o modelo escolhido no seletor da página Coder. Se for `.gguf`, garante o motor llama.cpp; se for um modelo Ollama, garante o Ollama e carrega o modelo (`keep_alive`) |

Ambos os modos devolvem a URL da Web UI do agente (`http://127.0.0.1:3090` por
defeito) e o estado atualizado (motor/modelo/agente).

### 2.2. Perfil isolado

O agente arranca com `dsh web --patch data/dsh/local.patch.json`, que define o
provider `centraliza-local` (`api: openai-completions`) apontado para:

*   `http://127.0.0.1:<porta do llama-server>/v1` — modo llama.cpp; ou
*   `http://127.0.0.1:11434/v1` — modo Ollama.

Os providers/settings reais do utilizador (`~/.dsh`) **não são tocados**.

### 2.3. Estado integrado

`GET /api/coder/status` agrega:

*   **motor** (a correr/parado, modelo, porta, binário encontrado);
*   **modelo ativo** (o que o gateway expõe como `centraliza-router`);
*   **agente** (a correr/parado, URL, modo, modelo);
*   **atualização** (versão atual, última verificação, disponibilidade).

Os botões iniciar/parar refletem sempre este estado.

### 2.4. Resumo dos editores na página Coder

O cartão **Editores** do Coder reutiliza `GET /api/extensions/status` (a mesma
fonte da página Extensões) para mostrar, de forma resumida:

* chip de prontidão (**Pronto para integrar** / **Integração bloqueada**);
* o bloqueio atual (motor parado, modelo não carregado) com o botão
  **Iniciar motor e modelo** (`POST /api/extensions/start-stack`);
* duas linhas compactas — Continue.dev e Roo Code — com o estado real
  (**Configurado**, **Não configurado** ou **Não detetada**) e um botão
  **Integrar** (bloqueado enquanto o motor/modelo não estiverem a correr);
* ligação **Ver detalhes em Extensões**, onde ficam a configuração completa,
  o teste de fumo e o diagnóstico.

O estado de cada integração é lido do backend (`integrations.continue` e
`integrations.roo` em `/api/extensions/status`), sem qualquer lógica duplicada
no frontend.

### 2.5. Auto-atualização da aplicação (RF-034)

*   Verificação no arranque (após ~8 s) e a cada 24 h (configurável).
*   Fonte: `updates.manifestUrl` (manifesto JSON) ou `updates.githubRepo`
    (release mais recente). Sem fonte configurada, o estado é
    `not-configured` e **o arranque não é bloqueado**.
*   Aplicação transacional: download → verificação SHA-256 → extração →
    backup dos ficheiros substituídos → cópia → `restartRequired`.
*   Em caso de falha: **rollback** automático para a versão anterior.
*   Nunca substitui `config.json`, `data/`, `node_modules` nem `.git`.

---

## 3. Gateway OpenAI-compatible

O Centraliza expõe um gateway local compatível com a API OpenAI:

*   `POST /v1/chat/completions` (streaming SSE e não-streaming);
*   `GET /v1/models` (devolve sempre `centraliza-router`).

Resolução do modelo:

1. `centraliza-router` → `config.activeRouterModel`;
2. se não existir, descobre o modelo servido pelo motor local (`/v1/models`);
3. se o modelo for um path GGUF e o motor estiver a correr → roteia para o
   llama.cpp (com o alias realmente servido);
4. caso contrário → Ollama (`/v1`).

Erros devolvem mensagens acionáveis (`no_active_model`, `engine_offline`).

---

## 4. Integrações com editores (VS Code)

As integrações **só são ativadas quando o motor e o modelo local estão a correr**
(`/api/extensions/status` → `ready`), e toda a configuração é escrita
automaticamente — sem copiar/colar URLs, chaves ou model IDs.

### 4.1. Continue.dev

*   Ficheiro alvo: `~/.continue/config.yaml` (preferido), `config.yml` ou
    `config.json` (criado se não existir).
*   **Backup** do ficheiro original antes de escrever
    (`<ficheiro>.centraliza-backup-<timestamp>`).
*   Entrada adicionada/substituída:

```yaml
models:
  - name: Centraliza.ai Gateway
    provider: openai
    model: centraliza-router
    apiBase: http://localhost:4000/v1
    apiKey: centraliza-local
tabAutocompleteModel:
  name: Centraliza.ai Autocomplete
  provider: openai
  model: centraliza-router
  apiBase: http://localhost:4000/v1
  apiKey: centraliza-local
```

*   O ficheiro é validado (JSON válido / YAML sem tabulações) após a escrita.

### 4.2. Roo Code

*   Deteta a `globalStorage` do VS Code e variantes (Code, Insiders, VSCodium,
    Cursor, Windsurf) e as pastas da extensão (`roo*`/`cline*`).
*   Escreve o `apiConfiguration` na base de dados de estado (`state.vscdb`,
    SQLite via `node:sqlite`), com **backup** prévio do ficheiro.
*   Se a BD estiver bloqueada (VS Code aberto) ou o formato for desconhecido:
    escreve um ficheiro de apoio com os valores exatos e devolve um
    **diagnóstico legível** (`db-locked`, `fallback-file`, …).

### 4.3. Teste de fumo

`POST /api/extensions/smoke-test` envia ao gateway
`"Responde apenas: OK"` (máx. 32 tokens, temperatura 0) e devolve o texto, a
latência e o estado, com timeout de 30 s. O resultado é apresentado na página.

### 4.4. Diagnóstico

Cada cenário de falha tem mensagem própria e acionável:
motor parado, modelo não carregado, gateway em baixo, Roo Code não instalado,
BD do VS Code bloqueada, binário do llama.cpp em falta.

---

## 5. Notas de risco

*   **Qualidade de function calling em modelos pequenos**: usar modelos
  recomendados para agentes; o gateway limita contexto e faz retry/compaction.
*   **Escrita automática de configs**: sempre com backup; merge não destrutivo.
*   **Paragem de motores**: unload gracioso antes de `taskkill`, com verificação
  posterior do estado.
*   **Auto-update**: SHA-256 obrigatório quando fornecido, backup + rollback.
*   **Segurança**: o agente executa comandos locais — manter o utilizador a par
  das permissões do DeepSeek Harness.
