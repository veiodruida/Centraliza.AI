# 📝 Especificação: Centraliza Coder & Sistema de Comandos

**Data:** Maio de 2026
**Objetivo:** Introduzir um sistema visual de ajuda para comandos no chat (Slash Commands) e criar um novo ecossistema integrado (Centraliza Coder) baseado no `free-claude-code` para atuar como um agente de engenharia de software no terminal, alimentado pelos modelos locais/nuvem do Centraliza.ai.

---

## 1. Sistema de Autocompletar Comandos (Test & Chat)

**Conceito:** Uma interface visual (popup flutuante) que aparece no chat assim que o utilizador digita `/`.

*   **Gatilho:** Input de texto inicia com `/`.
*   **UI/Visual:** Menu suspenso (estilo *Command Palette*) renderizado por cima do input de texto, com suporte a *backdrop-blur* para combinar com o design premium do Centraliza.
*   **Comandos Suportados Inicialmente:**
    *   `/gsd` - Ativa a persona "Get Shit Done".
    *   `/clear` - Limpa o histórico de chat.
    *   `/compact` - Compacta o histórico para poupar tokens.
    *   `/attach` - Abre a janela de upload de arquivos.
*   **Navegação:** Suporte para usar as setas do teclado (Cima/Baixo) e a tecla `Enter` para selecionar, além do clique do rato.

---

## 2. Nova Aplicação: Centraliza Coder (Integração `free-claude-code`)

**Conceito:** Um agente de terminal para desenvolvimento de software altamente autônomo (estilo Claude Code), gerenciado nativamente pelo Centraliza.ai.

### 2.1. Fonte e Sincronização (Auto-Update)
*   **Repositório Base:** `https://github.com/Alishahryar1/free-claude-code`
*   **Mecanismo de Sync:** O Centraliza.ai terá um serviço em background que verifica updates no repositório.
*   **Rotina de Atualização:**
    *   Quando o Node.js inicia, ou a cada 24 horas.
    *   Faz o download do código-fonte mais recente (via API do GitHub ou `git pull`).
    *   Aplica `npm install` e `npm run build` invisivelmente.
    *   Notifica o utilizador via WebSocket: *"Centraliza Coder atualizado para a versão mais recente da comunidade."*

### 2.2. A Interface (Nova Aba no Dashboard)
*   Será criada uma nova rota e botão no menu lateral: **"Coder Terminal"** ou **"Centraliza Coder"**.
*   **Instalação com 1-Clique:** Se a ferramenta ainda não estiver instalada na máquina do utilizador, a aba mostrará um botão para clonar, configurar e instalar globalmente o pacote CLI.
*   **Terminal Integrado:** Opção para abrir um emulador de terminal web (ex: `xterm.js`) diretamente no dashboard, rodando o agente de código, ou um botão para "Lançar Terminal Externo".

### 2.3. Roteamento de Modelos (A "Magia" do Gateway)
*   O `free-claude-code` original geralmente espera chaves de API da Anthropic/OpenAI.
*   O Centraliza.ai injetará dinamicamente variáveis de ambiente (ex: `OPENAI_API_BASE=http://localhost:4000/v1`) no processo do Coder.
*   **Seletor de Inteligência:** Na nova aba "Coder", o utilizador poderá escolher qual modelo local (Llama.cpp, Ollama, LM Studio) ou de nuvem servirá como "Cérebro" para a ferramenta CLI. O Gateway do Centraliza cuidará de traduzir os pedidos de sistema e chamadas de função (Tools) da ferramenta CLI para um formato que o modelo local entenda (ex: *Function Calling* nativo ou via Llama 3/Mistral/DeepSeek).

---

## 3. Arquitetura e Estratégia de Implementação (Fases)

Para evitar quebrar a estabilidade atual do orquestrador de IA, o desenvolvimento será dividido em etapas:

### Fase 1: O "Quick Win" (UI do Chat Atual)
*   Criar o componente visual para detetar a `/` no `ModelTester.tsx`.
*   Implementar a filtragem do menu de comandos conforme o utilizador digita (ex: `/c` -> sugere `/clear` e `/compact`).

### Fase 2: O Módulo do Coder (Backend)
*   Criar rota `/api/coder/sync` para clonar o repositório `free-claude-code`.
*   Configurar a rotina de cron/intervalo para varredura e atualização diária.
*   Configurar a instalação global do CLI via Node.js (`npm link` ou instalação direta).

### Fase 3: O Terminal do Coder (Frontend)
*   Criar a página `Coder.tsx` com o design do Centraliza.
*   Adicionar seletores de contexto e modelos específicos para tarefas de programação.
*   Integrar logs e saídas do CLI no frontend.

### Fase 4: O Gateway de Funções (Function Calling / Tool Use)
*   O `free-claude-code` usa *Tools* extensivamente (ler arquivos, executar comandos bash). 
*   Adaptar o `server.js` na rota `/v1/chat/completions` para suportar adequadamente requisições contendo a chave `tools` e `tool_choice`, mapeando corretamente isso para a sintaxe suportada pelo Ollama e Llama.cpp.

---

## 4. Notas de Risco / Pontos de Atenção
*   **Qualidade do Modelo Local (< 8B):** Modelos pequenos sofrem com alucinação de formatação ao usar *Tools*.
    *   *Mitigação 1 (GBNF):* O Gateway do Centraliza traduzirá o esquema de Tools para Grammar (GBNF) forçando o motor Llama.cpp a gerar apenas JSON estritamente válido.
    *   *Mitigação 2 (Auto-Correction):* O Gateway interceptará erros de *parsing* e fará um "Retry Loop" automático e invisível, instruindo a IA do seu erro sintático para que ela se corrija antes de devolver a resposta ao Coder.
*   **Segurança:** Como o Coder executa comandos de terminal local, ele precisa rodar com precaução. Garantir que os alertas estejam visíveis e os comandos de alto risco (ex: `rm -rf`) exijam aprovação interativa.

---

## 5. Estratégia de Integração com Editores (VS Code)

Para garantir uma experiência impecável de programação assistida por IA, o Centraliza atuará como um **Gateway OpenAI Compatible**, servindo os modelos locais na porta `:4000`. Não é necessário reinventar a roda criando uma nova extensão, mas sim potenciar as ferramentas líderes da comunidade de forma automatizada.

A integração com o VS Code (ou Cursor) funcionará da seguinte forma:

### Abordagem 1: Extensão Continue.dev (Auto-Configuração com 1-Clique)
O **Continue** é a extensão open-source mais madura para autocompletar código e chat no editor.

*   **A "Magia" do 1-Clique:** Na interface do Centraliza, o usuário clica em **"Integrar com Continue.dev"**.
*   **O que a integração faz:**
    1. Executa um deep-link no navegador (`vscode:extension/Continue.continue`) para abrir a instalação da extensão diretamente no VS Code.
    2. O backend do Centraliza altera automaticamente o arquivo `~/.continue/config.json` injetando nativamente o provedor local apontando para `http://localhost:4000/v1` com o modelo de roteamento automático.
*   Dessa forma, o usuário abre o editor e, imediatamente, a IA local do Centraliza assume o controle do autocompletar e do chat de programação.

### Abordagem 2: Roo Code / Roo-Cline (Para Agentes Autônomos Visuais)
Para os usuários que preferem um agente autônomo (capaz de editar, ler arquivos, rodar comandos e aprovar modificações em cadeia com aprovação visual), o **Roo Code** é o padrão ouro. Como as configurações do Roo Code ficam numa "store" interna do VS Code de difícil acesso externo, a automação baseia-se num assistente visual:
*   O painel do Centraliza exibe o link direto de instalação: `vscode:extension/RooPlay.roo-cline`
*   Fornece os valores exatos de "Copiar e Colar" para o provedor **OpenAI Compatible**:
    *   **Base URL:** `http://localhost:4000/v1`
    *   **API Key:** `centraliza-local`
    *   **Model ID:** `centraliza-router` (O Centraliza cuida do roteamento internamente com base no modelo ativo no Dashboard).

### Abordagem 3: Terminal CLI Integrado (free-claude-code)
Como o agente do `free-claude-code` opera nativamente no terminal:
*   Após a instalação via `/api/coder/sync`, o usuário abre o Terminal Integrado do VS Code (`Ctrl + \``) e digita `claude`.
*   O `free-claude-code` possui seu próprio servidor proxy que converte as chamadas da API da Anthropic para requisições compatíveis com a inteligência local e/ou repassa as requisições Open-AI para o Gateway do Centraliza.