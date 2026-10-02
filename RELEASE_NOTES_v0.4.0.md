# Centraliza.ai v0.4.0 - Configuração Inteligente de Hardware

Esta versão torna os parâmetros de execução (Context Size e GPU Layers) **conscientes do hardware do cliente**: valores com limites reais do modelo, previsão de impacto ao vivo e recomendação automática.

## ✨ Destaques
- **Painel "Impacto no Hardware"**: ao mudar Context Size ou GPU Layers, mostra em tempo real a velocidade estimada (tokens/segundo), o consumo de VRAM/RAM (pesos + cache KV), a adequação do contexto (Chat rápido · Programação · Documentos · RAG · 1M) e avisos de perigo (VRAM/RAM insuficiente, contexto acima do máximo do modelo).
- **Recomendação automática** de contexto + camadas GPU para o teu hardware, com botão **Aplicar**.
- **Metadados GGUF reais** (novo endpoint `/api/gguf/meta`): camadas, contexto máximo, arquitetura e quantização lidos do ficheiro.
- **Sliders com limites reais**: GPU Layers limitado ao nº de camadas do modelo; contexto até **1M tokens** (limitado ao máximo suportado pelo modelo).
- **VRAM Shield atualizado**: o gateway respeita o contexto alocado ao motor nativo (antes limitava a 32K).

## 🛠️ Correções e melhorias
- Velocidade estimada agora reage ao contexto (custo de leitura da cache KV por token) e mostra 1 casa decimal.
- Valores iniciais fora dos limites do modelo são auto-corrigidos (ex.: 99 camadas → máximo real).
- Legibilidade reforçada no painel (textos maiores, mais contraste).
- Servidor aceita `PORT` por variável de ambiente.
- `/api/system-info` mais robusto quando o `nvidia-smi` não está disponível.

## 🧪 Testes
- 6 testes do servidor (parser GGUF sintético e local, endpoints).
- 7 testes do motor de estimativa (contexto, cache KV, recomendações, avisos).

---
*Centraliza.ai - O seu orquestrador de IA Local.*
