# Phase 4 Plan: Premium Features

## Goal
Implement advanced visual analytics and fine-grained control over model execution.

## Requirements
- **FEAT-01**: Disk Analysis Graph (Visual).
- **FEAT-02**: Advanced Launch Modal for Llama.cpp.

## 🛠️ Step 1: Disk Analysis Infrastructure (FEAT-01)
1. Install `check-disk-space` (Backend) and `recharts` (Frontend).
2. Implement `GET /api/system/disk` in `server.js` to return:
   - Total space.
   - Free space.
   - Space used by Centraliza.ai (Link Repository).
   - Space used by other apps (Ollama, etc.).
3. Create a `DiskUsageGraph` component using a PieChart or BarChart from Recharts.
4. Integrate the graph into the **Dashboard**.

## 🛠️ Step 2: Llama.cpp Advanced Modal (FEAT-02)
1. Create `frontend/src/components/LaunchModal.tsx`.
2. Fields: `Threads`, `GPU Layers`, `Context Size`.
3. Update `handleLaunch` in `MyModels.tsx` to open the modal if the type is `llama.cpp`.
4. Update `/api/launch` in `server.js` to accept these parameters.

## Verification
- [ ] Dashboard shows a visual disk usage graph with Centraliza.ai slice.
- [ ] Launching a GGUF via Llama.cpp opens a modal for configuration.
- [ ] Llama.cpp starts with the correct CLI arguments based on modal input.
