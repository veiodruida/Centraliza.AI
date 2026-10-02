# Centraliza.ai v0.4.0 - Hardware-Aware Configuration

This release makes the runtime parameters (**Context Size** and **GPU Layers**) **aware of the client's hardware**: real model limits, live impact prediction, and automatic recommendations.

## ✨ Highlights
- **Hardware Impact Panel**: changing Context Size or GPU Layers shows in real time the estimated speed (tokens/sec), VRAM/RAM usage (weights + KV cache), context suitability (Quick Chat · Coding · Documents · RAG · 1M) and danger warnings (VRAM/RAM overflow, context above the model maximum).
- **Automatic recommendation** of context + GPU layers for your hardware, with an **Apply** button.
- **Real GGUF metadata** (new `/api/gguf/meta` endpoint): layers, maximum context, architecture, and quantization read from the file.
- **Sliders with real limits**: GPU layers capped at the model's layer count; context up to **1M tokens** (limited to the model's maximum).
- **VRAM Shield updated**: the gateway now honors the context allocated to the native engine (previously capped at 32K).

## 🛠️ Fixes & Improvements
- Estimated speed now reacts to context (KV cache read cost per token) with 1-decimal precision.
- Initial values outside model limits are auto-corrected (e.g., 99 layers → real maximum).
- Stronger legibility in the panel (larger, higher-contrast text).
- Server accepts `PORT` via environment variable.
- `/api/system-info` more robust when `nvidia-smi` is unavailable.

## 🧪 Tests
- 6 server tests (synthetic + local GGUF parser, endpoints).
- 7 estimator engine tests (context, KV cache, recommendations, warnings).

---
*Centraliza.ai - Your Local AI Orchestrator.*
