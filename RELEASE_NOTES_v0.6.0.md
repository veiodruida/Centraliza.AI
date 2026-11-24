# Centraliza.ai v0.6.0 — ComfyUI Workflow Import & Model Library

This release turns Centraliza.ai into a complete model acquisition and
organization layer for ComfyUI. Drop the `.md` file that ships with a ComfyUI
template and the app resolves every model on Hugging Face, downloads it into the
correct `ComfyUI/models` folder, and lets you sort and filter your local library
by date, size, function and format.

## ✨ Highlights

### ComfyUI Workflow Import
- **New "Import workflow" action in My Models** — upload or paste the Markdown
  **Model Links** block from a ComfyUI template.
- **Three-step flow** — upload → review → download, with a full preview of every
  file, size, repository, destination folder and warning before anything is
  downloaded.
- **Correct destination folders** — `text_encoders`, `diffusion_models`, `vae`,
  `loras`, `checkpoints`, `controlnet`, `upscale_models`,
  `latent_upscale_models`, `embeddings`, `clip_vision`, `style_models`,
  `ipadapter`, `audio_encoders`, `animatediff_models`, `model_patches`, `LLM`.
- **Optional models** — entries marked `optional` are detected and left
  unchecked by default.
- **Input assets** — workflow input images are reported as a separate warning
  instead of being treated as models.
- **Direct links and tables** — the parser also accepts per-file Hugging Face
  links, Markdown tables and `Name — URL` lists.

### Automatic Hugging Face discovery
- Files that are not present in the repositories listed in the document are
  searched across public Hugging Face repositories by exact filename.
- Discovered repositories are shown with an **AUTO** badge in the review step.
- Real file sizes are fetched before download so the free-space summary is
  accurate.
- Gated or private repositories are supported through an optional Hugging Face
  token stored locally in `config.json`.

### Reliable downloads
- Concurrent downloads (1–4, default 2) with per-file progress, speed and status.
- Cancel and retry failed entries from the import history.
- Resume partial files with `.part` + HTTP `Range`.
- Automatic ComfyUI models folder detection, with a manual override.
- Job history persisted in `data/workflow-jobs.json` (last 30 jobs).

### Model Library organization
- **Per-section sorting** in My Models: date added, size, name, function and
  format, ascending or descending.
- **Per-section functional filters**: LLM/Chat, Coding, Reasoning, Vision,
  Embedding, Image, Video, Audio, Upscaler, LoRA, VAE, ControlNet, Text encoder,
  Diffusion model, CLIP Vision, Style model and IP-Adapter.
- **Automatic classification** from the ComfyUI folder and filename.
- **Richer cards**: function badge, date added, quantization and parameter count.
- Preferences are stored per section in `config.json` and restored on reload.

### Platform
- New backend modules: `backend/workflow.js` (parser, HF resolution, download
  queue) and `backend/catalog.js` (functional classification).
- New endpoints: `/api/workflows/config`, `/api/workflows/template`,
  `/api/workflows/inspect`, `/api/workflows/start`, `/api/workflows`,
  `/api/workflows/:id`, `/api/workflows/:id/cancel`,
  `/api/workflows/:id/retry`.
- Socket.io events: `workflow-progress` and `workflow-complete`.
- `/api/models` now exposes `addedAt`, `modifiedAt`, `functionCategory`,
  `comfyCategory`, `quant` and `params`.
- Version bumped to **0.6.0**.

## 📄 Documentation

- [ComfyUI Workflow Import & Model Library](documentation/WORKFLOW_IMPORT.md)
- [README](README.md)
- [Architecture](documentation/ARCHITECTURE.md)

## 🧪 Tests and build

- **30 automated tests pass** (`npm test`), including the new Markdown parser,
  Hugging Face resolution with mocked repositories, path traversal protection,
  and real downloads from a local HTTP server with `Range` resume.
- `tsc -b` and `vite build` complete without errors.
- The full import flow was verified end-to-end with a real Hugging Face file
  (453 KB) downloaded into a test ComfyUI folder.
- The interface was checked at desktop (1440 px) and mobile (390 px) widths
  with no horizontal overflow or console errors.

## 🔧 Upgrade notes

- `config.json` is migrated automatically on startup: `comfyModelsDir`,
  `hfToken`, `workflowConcurrency` and `workflowAutoDiscover` receive safe
  defaults when missing.
- Existing models are unaffected. New fields are added to the `/api/models`
  response without breaking current clients.
- To use gated repositories, add a Hugging Face token in the importer's
  **Advanced settings** or set `hfToken` in `config.json`.
- The ComfyUI models folder is detected from `comfyModelsDir`, `comfyDir` or the
  existing scan folders. It can be changed in the review step.

## 📦 Assets

- `centraliza-ai-v0.6.0-ready.zip` — ready-to-run package with backend, built
  frontend and sources.
- `README.md` — project overview.
- `RELEASE_NOTES_v0.6.0.md` — this document.

---

*Centraliza.ai — your local AI orchestrator.*
