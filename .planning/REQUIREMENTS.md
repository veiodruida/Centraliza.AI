# Requirements: Centraliza.ai

**Defined:** 2026-04-29
**Core Value:** Zero Disk Waste: Users can centralize massive AI models without duplicating storage.

## v1 Requirements

### UX & Settings

- [ ] **SET-01**: Auto-detect paths immediately on Settings page load without manual click.
- [ ] **HLP-01**: Add contextual help/tooltips across all major functions for layman users.

### Model Management (CRUD)

- [ ] **MOD-01**: User can rename a model via API.
- [ ] **MOD-02**: User can move a model physically via API.
- [ ] **MOD-03**: User can delete a model physically via API.
- [ ] **MOD-04**: User can open the model's physical folder via OS explorer.
- [ ] **MOD-05**: Implement sanity check to clear broken hardlinks if deleted externally.
- [ ] **MOD-06**: Implement global Toast notifications for CRUD operations.

### Dashboard UI

- [ ] **UI-01**: "My Models" sections must have max-height and scrollbars.
- [ ] **UI-02**: Sections can be collapsed, expanded, and vertically reordered.
- [ ] **UI-03**: Layout state (collapsed/reordered) persists across sessions.
- [ ] **UI-04**: Models can be sorted/classified within sections.
- [ ] **UI-05**: Global classification/filtering by provider externally.

### Premium Features

- [ ] **FEAT-01**: Centralization tab displays a Disk Analysis Graph using Recharts.
- [ ] **FEAT-02**: Orchestrator has an Advanced Config Modal for Llama.cpp (Context, Layers, Threads).
- [ ] **FEAT-03**: Download Manager uses WebSockets to show real-time Ollama pull progress.

### Architecture & Release

- [ ] **ARCH-01**: Bump version to 0.3.0 globally.
- [ ] **ARCH-02**: Implement and run automated tests.
- [ ] **REL-01**: Update official documentation.
- [ ] **REL-02**: Create release briefing and generate new zip file.

## v2 Requirements

### Future Extensions

- **EXT-01**: LoRA and Embeddings Manager.
- **EXT-02**: P2P Local Network Bridge.
- **EXT-03**: Node-Based Text Workflows.

## Out of Scope

| Feature | Reason |
|---------|--------|
| Inspiration branding | Explicitly forbidden by user request |

## Traceability

| Requirement | Phase | Status |
|-------------|-------|--------|
| ARCH-01 | Phase 1 | Pending |
| ARCH-02 | Phase 1 | Pending |
| FEAT-03 | Phase 1 | Pending |
| SET-01 | Phase 2 | Pending |
| HLP-01 | Phase 2 | Pending |
| UI-01 | Phase 3 | Pending |
| UI-02 | Phase 3 | Pending |
| UI-03 | Phase 3 | Pending |
| UI-04 | Phase 3 | Pending |
| UI-05 | Phase 3 | Pending |
| MOD-01 | Phase 3 | Pending |
| MOD-02 | Phase 3 | Pending |
| MOD-03 | Phase 3 | Pending |
| MOD-04 | Phase 3 | Pending |
| MOD-05 | Phase 3 | Pending |
| MOD-06 | Phase 3 | Pending |
| FEAT-01 | Phase 4 | Pending |
| FEAT-02 | Phase 4 | Pending |
| REL-01 | Phase 5 | Pending |
| REL-02 | Phase 5 | Pending |

**Coverage:**
- v1 requirements: 20 total
- Mapped to phases: 20
- Unmapped: 0 ✓

---
*Requirements defined: 2026-04-29*
*Last updated: 2026-04-29 after milestone v0.3.0 definition*
