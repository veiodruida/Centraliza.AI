# Centraliza.ai v0.3.1 - UX/UI Hardening Release

This release focuses on visual stability, accessibility, and user education regarding the Centraliza.ai ecosystem.

## ✨ Highlights
- **Redesigned Dashboard**: New layout featuring a Quick-Start Guide, Core Benefits, and an integrated FAQ section.
- **Extreme Legibility**: No more tiny text. Technical paths, SHA checksums, and model names now use larger fonts and high-contrast colors across all pages.
- **Smart Adaptive Buttons**: The `.btn-premium` component is now fully responsive, automatically stacking on mobile devices to prevent text truncation.
- **Engine-Specific Filtering**: The Test Chat now filters models based on inference engine compatibility (e.g., only `.gguf` models are shown when using the llama.cpp engine).

## 🛠️ Bug Fixes & Refinements
- **ComfyUI Assets**: Models from ComfyUI sources are now identified as 'Passive Assets'. The 'Launch/Play' button is disabled for these resources to prevent system path errors.
- **i18n Improvements**: Fixed missing translation keys in filter menus and updated the application's core purpose description.
- **Layout Polish**: Removed restrictive `line-clamp` utilities from model library cards to ensure long technical filenames (like `.safetensors`) are fully readable.

---
*Centraliza.ai - Your Local AI Orchestrator.*
