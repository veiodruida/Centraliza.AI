# Plano de Implementação Estruturada: Evolução do Centraliza.ai

Este documento detalha o plano de ação passo a passo para incorporar as melhorias propostas no arquivo `SUGESTOES.md`. A prioridade máxima desta estratégia é **não colidir nem quebrar** o ecossistema e as funcionalidades atuais (como a criação de links simbólicos e gerenciamento de pastas).

---

## 1. Estratégia de Versionamento: Branch Separado vs. Continuar

**Recomendação Estratégica: Usar Feature Branches Separadas.**

Devido à complexidade das melhorias propostas (como embutir um motor de inferência C++ ou alterar o Express.js para servir como gateway API), **a melhor estratégia é manter a branch `main` apenas para correções de bugs das funcionalidades de centralização/storage**.

A evolução deve ser dividida em **épicos (Epics)**, e cada um deles deverá ter a sua própria branch (ex: `feat/inference-engine`, `feat/advanced-chat`), garantindo que a base de usuários do Centraliza.ai `v0.3.x` não sinta instabilidades enquanto o sistema de inferência estiver a ser acoplado.

---

## 2. Fases de Implementação (Roadmap Seguro)

A implementação ocorrerá em 4 Fases, desenhadas para garantir escalabilidade gradual.

### FASE 1: Melhorias Incrementais na Interface de Chat Atual
**Objetivo:** Adicionar controlos avançados para o motor Ollama/externo sem mexer na estrutura do backend.
**Branch sugerida:** `feat/chat-controls`

1. **Frontend (`frontend/src/pages/ModelTester.tsx`)**
   - Criar um painel lateral retrátil (Sidebar) na interface de chat.
   - Adicionar sliders para `Temperature`, `Top P`, `Top K` e um campo de texto (TextArea) para o `System Prompt`.
   - Modificar a chamada `fetch` existente que comunica com `/api/chat` para incluir estes novos parâmetros no payload (se suportado).
   - *Verificação de Segurança*: O fallback para as predefinições (defaults) deve ser mantido se o utilizador não interagir com o painel lateral.

### FASE 2: API Gateway Compatível (Express.js)
**Objetivo:** Transformar o Express.js num ponto único de roteamento, interceptando pedidos e imitando a API da OpenAI.
**Branch sugerida:** `feat/api-gateway`

1. **Backend (`server.js` ou criação de um novo módulo `api-gateway.js`)**
   - Criar a rota `POST /v1/chat/completions`.
   - Desenvolver um sistema de "Adapters":
     - Se o modelo ativo for Ollama, o pedido `/v1` é reescrito e mapeado para o endpoint do Ollama.
     - Se for ComfyUI, mapeia-se para a respetiva interface.
   - O Express passará a lidar com *Streaming* (Server-Sent Events) usando bibliotecas ou as implementações nativas do Node.js, enviando os pacotes (chunks) para o frontend (e.g. `ModelTester.tsx`).
   - *Verificação de Segurança*: As antigas rotas (como `/api/chat`) devem permanecer intocadas durante a transição. Após o novo Gateway estabilizar, migra-se o Frontend para consumi-lo.

### FASE 3: Motor de Inferência Nativo (`llama.cpp` Binaries)
**Objetivo:** Rodar modelos Standalone GGUF a partir do zero sem necessitar de LM Studio ou Ollama.
**Branch sugerida:** `feat/native-inference`

1. **Backend & Tooling (`scripts/` e `server.js`)**
   - Adicionar os binários pré-compilados do `llama.cpp` (ex: `llama-server.exe`) como dependência opcional na pasta do projeto ou baixar automaticamente durante o `setup.bat`.
   - Adicionar uma nova rota `POST /api/inference/start` que aceita um caminho de modelo (`.gguf`).
   - O backend usará a função `spawn` do Node.js para iniciar o binário `llama-server` recebendo o caminho do arquivo do modelo (com suporte a offloading de VRAM auto-detectado através da API de GPU existente).
   - O Node.js fica à escuta e rastreia o PID do processo. O "Adapter" da Fase 2 é atualizado para fazer o proxy dos pedidos para a porta alocada pelo `llama-server`.
   - *Verificação de Segurança*: Como é um processo secundário gerido pelo Node.js, qualquer erro no binário apenas afetará o chat, não derrubando o dashboard de gerenciamento de disco.

### FASE 4: Módulo RAG Local (Retrieval-Augmented Generation)
**Objetivo:** Permitir ao utilizador fazer upload de PDFs e falar com os documentos.
**Branch sugerida:** `feat/rag-module`

1. **Backend (Banco Vetorial e Embeddings)**
   - Integrar uma base de dados vetorial leve local, como `ChromaDB` (via chamadas externas a um micro-serviço em Python empacotado) ou usando uma lib Node.js baseada em SQLite-VSS.
   - Implementar rota para ingestão e conversão de PDF para texto (ex: `pdf-parse`).
2. **Frontend**
   - Na página de testes ou numa nova página `Knowledge`, adicionar área de "Dropzone" para anexar documentos a um "Knowledge Profile".
3. **Gateway (Modificação RAG)**
   - Ao enviar a mensagem para a `/v1/chat/completions`, se houver documentos selecionados, o backend realiza uma busca semântica, concatena o texto como contexto no *System Prompt* e só então repassa o pedido ao motor de inferência.

---

## 3. Arquitetura Modular Recomendada (Para não colidir com o `server.js` atual)

O ficheiro atual `server.js` tem **400 linhas** e processa chamadas de hardware, ficheiros e gestão de rede. A injeção de Lógica de Inferência e RAG vai saturar este ficheiro.

**Plano de Refatorização Suave (Safe Refactoring):**
1. Na raiz, criar a pasta `backend/`.
2. Mover lógica de armazenamento, rotas de modelos e o novo API Gateway para ficheiros separados (ex: `backend/routes/models.js`, `backend/routes/gateway.js`).
3. O `server.js` na raiz atuará apenas como o montador do express, importando estes módulos.

> *Este refactoring pode ser feito numa branch puramente de Manutenção Técnica antes de avançar para a Fase 2, garantindo zero colisão e fácil rollback se a nova arquitetura falhar.*