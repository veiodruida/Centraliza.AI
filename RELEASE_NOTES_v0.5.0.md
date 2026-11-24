# Centraliza.ai v0.5.0 — Hub, Centralização, Motores, Agente Nativo e Extensões

Esta versão fecha as deficiências reportadas na v0.4.1 e transforma o orquestrador
numa plataforma mais usável e autónoma: a busca do Hub fica legível em ecrãs
grandes, a centralização ganha visão de espaço, os motores passam a ser detetados
e controlados a partir do dashboard, o agente de código passa a ser nativo
(DeepSeek) e as integrações com o VS Code passam a ser automáticas e dependentes
do estado do motor.

## ✨ Destaques

### Hub de Modelos
- **Busca corrigida (RF-001)**: o campo ocupa **46% da largura** do conteúdo em 2560 px (mínimo exigido: 40%), com texto de **18 px**, caret visível, `min-height` de 56 px e sem corte horizontal. O placeholder deixou de competir com o valor digitado.
- **Subcategorias Abliterated e Uncensored (RF-002/RF-003)**: dois filtros permanentes na barra, com **contador** de modelos e destaque visual próprio (violeta), combináveis com os filtros existentes e com os *facets* HuggingFace.
- **Etiquetagem automática**: o backend classifica cada modelo (nome do repositório, tags e metadados) e expõe `is_abliterated`, `is_uncensored` e `flavors` no catálogo, na busca ao vivo e nos detalhes. Modelos como "…-abliterated" ou "…-uncensored" aparecem na subcategoria correta sem intervenção manual.
- Contador de resultados, *chips* para limpar filtros e busca ativa.

### Centralização
- **Espaço total dos modelos (RF-010)**: soma de todos os ficheiros detetados, com conversão automática GB/TB (validado com tolerância < 1% face à soma das entradas).
- **Espaço por localização (RF-011)**: agregação por pasta, com caminho completo em tooltip e número de modelos.
- **Gráfico interativo (RF-012/RF-013)**: donut em Recharts com percentagem por fatia, tooltip com GB + n.º de modelos, legenda clicável e **filtro da lista ao clicar numa fatia** (com botão para limpar).
- **Espaço físico real vs. poupado (RF-014)**: cartões separados, com tooltip a explicar que os hardlinks partilham os mesmos dados.
- Layout revisto a 1440 px e 360 px: números sem quebra, textos com `line-clamp` + tooltip.

### Test & Chat
- **Deteção automática de motores (RF-020/RF-021)**: Ollama, llama.cpp, LM Studio e ComfyUI, por binário/PATH, pastas comuns e health-check de porta. Apenas os motores instalados aparecem, com indicador **a correr/parado** e botão "Atualizar deteção". Sem motores, a UI mostra "Nenhum motor detetado".
- **Abrir UI Web do Motor (RF-022)**: abre a UI na porta correta; com o motor parado pede confirmação e **arranca-o antes de abrir**.
- **Logs do servidor (RF-023/RF-024)**: painel em tempo real via Socket.io (`server-log`) com histórico inicial, autoscroll, limpar e expandir; a preferência "mostrar sempre os logs" fica **persistida em `config.json`**.
- **Parar / Unload (RF-025)**: `unload` gracioso primeiro (Ollama `keep_alive: 0`, LM Studio `lms unload --all`) e só depois terminação de processos, com verificação posterior do estado. Botões separados para "Parar motor" e "Só descarregar".
- **Envio bloqueado com motor parado (RF-026)**: banner explicativo com "Iniciar motor"; após iniciar, a mensagem é enviada automaticamente.

### Centraliza Coder
- **Integração com o CLI de terceiros removida (RF-030)**: sem clone/`git pull`, sem instalação global do CLI, sem referências na UI, no `server.js` ou na documentação ativa.
- **Agente DeepSeek nativo (RF-031)**: arranca a partir do dashboard, com estado visível (motor, modelo e agente) e botões iniciar/parar.
- **Modo A (RF-032)**: "Iniciar Motor" arranca o modelo por defeito e lança o agente sobre ele (opção ativa por omissão).
- **Modo B (RF-033)**: lançamento independente com o modelo escolhido no seletor — GGUF local (llama.cpp) ou modelo Ollama.
- **Auto-atualização (RF-034)**: verificação no arranque e a cada 24 h, aplicação transacional com **SHA-256**, backup, **rollback** e notificação; sem rede ou sem fonte configurada, o arranque não é bloqueado.
- **Estado integrado (RF-035)**: `/api/coder/status` agrega motor + modelo ativo + agente + atualização.
- **Resumo dos editores no Coder**: o cartão "Editores" mostra agora o estado real das integrações (Continue.dev e Roo Code: configurado / não configurado / não detetado), o bloqueio do motor com "Iniciar motor e modelo", um botão **Integrar** por extensão e o atalho **Ver detalhes em Extensões** — sem duplicar a página Extensões.

### Extensões
- **Continue.dev (RF-040)**: configuração escrita automaticamente em `~/.continue/config.yaml|yml|json`, com **backup** e validação (YAML sem tabs / JSON válido), incluindo autocomplete.
- **Roo Code (RF-041)**: escrita automática na storage do VS Code (`state.vscdb`, SQLite via `node:sqlite`) com backup; em caso de bloqueio, ficheiro de apoio + diagnóstico acionável.
- **Dependência do motor (RF-042)**: as integrações só são ativadas com motor **e** modelo a correr; a UI mostra o passo em falta e oferece "Iniciar motor e modelo".
- **Zero copiar/colar (RF-043)**: URL, chave e model ID deixam de ser pedidos ao utilizador.
- **Teste de fumo (RF-044)**: abre o VS Code e executa "Responde apenas: OK" no gateway, com latência e resultado apresentados.
- **Diagnóstico (RF-045)**: cada falha (motor parado, modelo não carregado, gateway em baixo, Roo não instalado, BD bloqueada) tem mensagem própria.

### Plataforma
- **Novos módulos** em `backend/` (`flavor`, `storage`, `engines`, `extensions`, `updater`) para não saturar o `server.js`.
- **11 idiomas**: todas as chaves novas traduzidas (`pt-BR`, `pt-PT`, `en`, `es`, `fr`, `de`, `it`, `zh`, `ar`, `ko`, `ja`), com placeholders preservados e RTL mantido.
- **Novos endpoints**: `/api/storage/summary`, `/api/engines`, `/api/engines/start|stop|stop-all`, `/api/logs/recent`, `/api/coder/status`, `/api/coder/agent/start|stop`, `/api/update/status|check|apply`, `/api/extensions/*`.
- **Gateway mais robusto**: resolve `centraliza-router` mesmo sem modelo ativo (descobre o modelo servido pelo motor), usa o alias real do llama.cpp e devolve erros acionáveis (`no_active_model`, `engine_offline`).

## 🧪 Testes
- **17 testes de servidor** (vitest + supertest): GGUF, endpoints, classificação Abliterated/Uncensored, resumo de armazenamento, deteção de motores, logs, estado do Coder, auto-update e prontidão das extensões.
- **13 testes de frontend**: motor de estimativas, smoke de componente e **completude i18n nas 11 línguas** (incluindo placeholders).
- **32 verificações funcionais Playwright** (`scripts/verify-v050.mjs`): elementos novos nas 5 páginas, ausência de erros de consola, busca do Hub a 2560 px (46% / 18 px), digitação sem corte e zero overflow a 360 px.
- **Suite de responsividade** (`scripts/resp-scan.mjs`): **9 páginas × 13 viewports = 117 combinações, zero problemas** — sem overflow horizontal, sem elementos fora do ecrã e sem texto cortado (texto truncado apenas quando existe tooltip com o conteúdo completo). O verificador passou a distinguir recortes intencionais (brilhos/ícones decorativos dentro de cartões com `overflow-hidden`) de cortes reais.
- `tsc -b` + `vite build` sem erros.

## 🔧 Notas de migração
- As preferências novas são migradas automaticamente no arranque (`showServerLogs`, `ollamaPort`, `lmStudioPort`, `comfyPort`, `updates`), sem perder `config.json`.
- A pasta `data/free-claude-code/` deixou de ser usada; pode ser apagada.
- Para ativar a auto-atualização, defina `updates.manifestUrl` (ou `updates.githubRepo`) em `config.json`. Sem isso, a aplicação reporta `not-configured` e continua a funcionar normalmente.

---

*Centraliza.ai — O seu orquestrador de IA Local.*
