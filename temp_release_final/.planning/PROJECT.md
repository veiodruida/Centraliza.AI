# Centraliza.ai

## What This Is

Centraliza.ai is a premium local AI orchestrator and dashboard for Windows, macOS, and Linux. It allows users to centralize models from multiple sources (Ollama, ComfyUI, LM Studio) into a single repository using hardlinks, and provides a management interface to launch and test those models.

## Core Value

Zero Disk Waste: Users can centralize massive AI models without duplicating storage, while maintaining full compatibility with all their existing AI tools.

## Requirements

### Validated

- ✓ Basic model detection and registry — v0.2.2
- ✓ Cross-platform native folder picker — v0.2.2
- ✓ One-click launch for basic engines — v0.2.2
- ✓ Chat proxy for local inference — v0.2.2

### Active

- [ ] REQ-01: Auto-detect paths on Settings load
- [ ] REQ-02: Advanced Model Management (Move, Delete, Rename, Open Folder)
- [ ] REQ-03: My Models UI (Max height, scroll, collapse/expand, reorder sections)
- [ ] REQ-04: Model Sorting (Within sections and by provider)
- [ ] REQ-05: Disk Analysis Graph (Recharts in Centralization)
- [ ] REQ-06: Llama.cpp Advanced Config Modal
- [ ] REQ-07: Download Manager with WebSockets
- [ ] REQ-08: Global Help System (Tooltips/Onboarding)
- [ ] REQ-09: Automated Testing Setup
- [ ] REQ-10: Release v0.3.0 tasks (Briefing, Zip)

### Out of Scope

- Mobile app — App relies on local OS file system APIs.
- Multi-user authentication — This is a local desktop utility.

## Context

- The app is currently transitioning from v0.2.2 to v0.3.0.
- User wants a premium feel (inspiration cannot be named).
- Must use Get Shit Done (GSD) workflow for structured development.

## Constraints

- **Tech Stack**: Node.js Backend, React + Vite Frontend (Tailwind).
- **Architecture**: Single unified port (4000) for both backend and static frontend.
- **File System**: Must support hardlinks and symlinks securely without corrupting external apps.

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| Implement Global Toasts | Destructive CRUD operations require visual confirmation | — Pending |
| Add Sanity Checks | Avoid broken hardlinks if models deleted externally | — Pending |

---
*Last updated: 2026-04-29 after milestone v0.3.0 definition*
