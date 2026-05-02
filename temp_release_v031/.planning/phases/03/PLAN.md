# Phase 3 Plan: Gestão de Modelos (CRUD & UI)

## Goal
Transform "My Models" into a professional model management hub with full CRUD capabilities and a premium, customizable UI.

## Requirements
- **MOD-01 to MOD-04**: CRUD (Rename, Move, Delete, Open Folder).
- **MOD-05**: Sanity Check (Broken hardlinks).
- **UI-01 to UI-04**: Collapsable, Scrollable, Sortable sections.
- **UI-05**: Global Toast Notifications.

## 🛠️ Step 1: Backend CRUD API (MOD-*)
1. Implement `POST /api/models/rename`.
2. Implement `POST /api/models/move`.
3. Implement `DELETE /api/models`.
4. Implement `POST /api/models/sanity-check`.

## 🛠️ Step 2: Toast Notification System (UI-05)
1. Create `frontend/src/components/Toast.tsx` and a `ToastContext`.
2. Wrap `App.tsx` with the provider.
3. Replace `alert()` calls with `showToast()`.

## 🛠️ Step 3: My Models UI Overhaul (UI-01 to UI-04)
1. Refactor `MyModels.tsx` to use a `Section` component.
2. Implement expand/collapse state per source (Ollama, ComfyUI, etc.).
3. Add a "Max Height" constraint with internal scrolling for each section.
4. Add Rename/Move modals/inputs.

## 🛠️ Step 4: Sanity Check Logic (MOD-05)
1. In `server.js`, implement a function to scan the Link Repository.
2. If a link points to a non-existent file, remove the link.
3. Trigger this check on `/api/models` GET or via a manual button in "Centralization".

## Verification
- [ ] Renaming a model updates disk and UI.
- [ ] Moving a model updates disk and UI.
- [ ] Deleting a model removes it from disk.
- [ ] Toast notification appears when an action is performed.
- [ ] Sections in "My Models" can be collapsed and expanded.
