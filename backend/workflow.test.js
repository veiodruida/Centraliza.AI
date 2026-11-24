import { describe, it, expect, afterAll } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import http from 'http';
import { fileURLToPath } from 'url';
import {
  parseWorkflowMarkdown,
  detectComfyModelsDir,
  buildTargetPath,
  deriveSearchQuery,
  inspectWorkflow,
  downloadFile,
  comfyCategoryFromFilename,
  WORKFLOW_TEMPLATE
} from './workflow.js';
import { classifyModel } from './catalog.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const SAMPLE_MD = `# LTX-2.5 — Workflow

### Model Links

- Hugging Face:Comfy-Org/gemma-4
- ModelScope:Comfy-Org/gemma-4

### Input Asset

- \`neon_cyborg_portrait.png\` — required workflow input ( \`input/neon_cyborg_portrait.png\` )

### text_encoders

- \`gemma4_e2b_it_int8_convrot.safetensors\` (4.84 GB) — optional, only needed when \`prompt_enhance\` is enabled.
- \`gemma4-12b-with-proj_ltx-2.5-comfy-int8-convrot.safetensors\`

### diffusion_models

- \`ltx-2.5-22b-distilled-transformer-comfy-int8-convrot.safetensors\`

### vae

- \`ltx-2.5-video-vae-bf16.safetensors\`
- \`ltx-2.5-audio-vae-bf16.safetensors\`

### latent_upscale_models

- \`ltx-2.5-latent-spatial-upscaler-x2-bf16-1.0.safetensors\`
`;

function jsonResponse(data, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    statusText: String(status),
    async json() { return data; },
    async text() { return JSON.stringify(data); },
    headers: { get: () => null }
  };
}

describe('parseWorkflowMarkdown', () => {
  it('interpreta o formato "Model Links" dos templates ComfyUI', () => {
    const result = parseWorkflowMarkdown(SAMPLE_MD);
    expect(result.title).toBe('LTX-2.5 — Workflow');
    expect(result.repos).toHaveLength(1);
    expect(result.repos[0]).toMatchObject({ repo: 'Comfy-Org/gemma-4', provider: 'huggingface' });
    expect(result.entries).toHaveLength(6);

    const byName = Object.fromEntries(result.entries.map((entry) => [entry.filename, entry]));
    expect(byName['gemma4_e2b_it_int8_convrot.safetensors']).toMatchObject({
      category: 'text_encoders',
      optional: true
    });
    expect(byName['gemma4_e2b_it_int8_convrot.safetensors'].sizeHintBytes).toBeGreaterThan(5_000_000_000);
    expect(byName['ltx-2.5-video-vae-bf16.safetensors'].category).toBe('vae');
    expect(byName['ltx-2.5-latent-spatial-upscaler-x2-bf16-1.0.safetensors'].category).toBe('latent_upscale_models');
    expect(result.inputAssets).toEqual(['input/neon_cyborg_portrait.png']);
    expect(result.warnings.join(' ')).toMatch(/Entrada obrigatória/);
  });

  it('aceita tabelas Markdown com links diretos por ficheiro', () => {
    const markdown = `
| Modelo | Link | Pasta |
| --- | --- | --- |
| \`meu-lora.safetensors\` | https://huggingface.co/Comfy-Org/repo/resolve/main/meu-lora.safetensors | loras |
| \`vae.safetensors\` | https://huggingface.co/Comfy-Org/repo/resolve/main/vae.safetensors | vae |
`;
    const result = parseWorkflowMarkdown(markdown);
    expect(result.entries).toHaveLength(2);
    expect(result.entries[0]).toMatchObject({
      filename: 'meu-lora.safetensors',
      category: 'loras',
      source: 'direct',
      repo: 'Comfy-Org/repo'
    });
    expect(result.entries[1].category).toBe('vae');
  });

  it('não confunde a árvore "Model Storage Location" com ficheiros a descarregar', () => {
    const markdown = `
### Model Storage Location

\`\`\`
ComfyUI/
└── models/
    ├── vae/
    │   └── ltx-2.5-video-vae-bf16.safetensors
\`\`\`
`;
    const result = parseWorkflowMarkdown(markdown);
    expect(result.entries).toHaveLength(0);

    const unfenced = `
Model Storage Location
ComfyUI/
└── models/
    ├── vae/
    │   └── ltx-2.5-video-vae-bf16.safetensors
`;
    expect(parseWorkflowMarkdown(unfenced).entries).toHaveLength(0);
  });

  it('infere a pasta ComfyUI a partir do nome quando não há secção', () => {
    expect(comfyCategoryFromFilename('meu-lora.safetensors')).toBe('loras');
    expect(comfyCategoryFromFilename('modelo-vae.safetensors')).toBe('vae');
    expect(comfyCategoryFromFilename('flux-diffusion-model.safetensors')).toBe('diffusion_models');

    const markdown = '- https://huggingface.co/org/repo/resolve/main/meu-lora.safetensors';
    const result = parseWorkflowMarkdown(markdown);
    expect(result.entries).toHaveLength(1);
    expect(result.entries[0].category).toBe('loras');
  });

  it('o template de exemplo é interpretável e usa pastas válidas', () => {
    const result = parseWorkflowMarkdown(WORKFLOW_TEMPLATE);
    expect(result.entries.length).toBeGreaterThan(5);
    for (const entry of result.entries) {
      expect(buildTargetPath('C:\\ComfyUI\\models', entry.category, entry.filename)).not.toBeNull();
    }
  });
});

describe('detectComfyModelsDir e destinos', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'centraliza-comfy-'));

  it('deteta <ComfyUI>/models a partir das pastas de varrimento', () => {
    const models = path.join(tmp, 'ComfyUI', 'models');
    for (const sub of ['checkpoints', 'vae', 'loras']) fs.mkdirSync(path.join(models, sub), { recursive: true });
    const detected = detectComfyModelsDir({ scanDirectories: [models], centralDir: path.join(tmp, 'central') });
    expect(detected.root).toBe(path.resolve(models));
    expect(detected.candidates.length).toBeGreaterThan(0);
  });

  it('impede path traversal e nomes inválidos', () => {
    const root = path.join(tmp, 'ComfyUI', 'models');
    const target = buildTargetPath(root, 'checkpoints', '../../evil.safetensors');
    expect(target).not.toBeNull();
    expect(target.filename).toBe('evil.safetensors');
    expect(target.targetPath.startsWith(path.join(root, 'checkpoints'))).toBe(true);
    expect(buildTargetPath(root, 'checkpoints', 'a:b?.safetensors').filename).toBe('a_b_.safetensors');
  });
});

describe('deriveSearchQuery', () => {
  it('reduz o nome do ficheiro a uma pesquisa útil no HF', () => {
    expect(deriveSearchQuery('ltx-2.5-22b-distilled-transformer-comfy-int8-convrot.safetensors')).toBe('ltx-2.5');
    expect(deriveSearchQuery('flux1-dev-fp8.safetensors')).toBe('flux1');
  });
});

describe('classifyModel', () => {
  it('classifica pela pasta ComfyUI', () => {
    expect(classifyModel({ name: 'x.safetensors', path: 'C:\\ComfyUI\\models\\vae\\x.safetensors', source: 'ComfyUI' }).category).toBe('vae');
    expect(classifyModel({ name: 'y.safetensors', path: 'C:\\ComfyUI\\models\\loras\\y.safetensors', source: 'ComfyUI' }).category).toBe('lora');
  });

  it('classifica modelos de linguagem e extrai quantização/parâmetros', () => {
    const result = classifyModel({ name: 'Qwen3.5-9B-Coder-Q4_K_M.gguf', path: 'C:\\AI_Models\\x.gguf', source: 'Standalone' });
    expect(result.category).toBe('coding');
    expect(result.quant).toBe('Q4_K_M');
    expect(result.params).toBe('9B');
  });
});

describe('inspectWorkflow', () => {
  it('resolve ficheiros nos repos listados e descobre repos em falta', async () => {
    const gemmaRepo = {
      siblings: [
        { rfilename: 'text_encoders/gemma4_e2b_it_int8_convrot.safetensors', size: 5199997904 }
      ]
    };
    const ltxRepo = {
      siblings: [
        { rfilename: 'text_encoders/gemma4-12b-with-proj_ltx-2.5-comfy-int8-convrot.safetensors', size: 15372969374 },
        { rfilename: 'diffusion_models/ltx-2.5-22b-distilled-transformer-comfy-int8-convrot.safetensors', size: 21504034224 },
        { rfilename: 'vae/ltx-2.5-video-vae-bf16.safetensors', size: 1472223346 },
        { rfilename: 'vae/ltx-2.5-audio-vae-bf16.safetensors', size: 364866540 },
        { rfilename: 'latent_upscale_models/ltx-2.5-latent-spatial-upscaler-x2-bf16-1.0.safetensors', size: 995778752 }
      ]
    };
    const fakeFetch = async (url) => {
      if (url.includes('/api/models?search=')) {
        return jsonResponse([
          { id: 'Lightricks/LTX-2.5', siblings: ltxRepo.siblings }
        ]);
      }
      if (url.includes('/api/models/Comfy-Org/gemma-4')) return jsonResponse(gemmaRepo);
      if (url.includes('/api/models/Lightricks/LTX-2.5')) return jsonResponse(ltxRepo);
      return jsonResponse({ error: 'not found' }, 404);
    };

    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'centraliza-inspect-'));
    const models = path.join(tmp, 'ComfyUI', 'models');
    for (const sub of ['checkpoints', 'vae', 'loras', 'text_encoders', 'diffusion_models', 'latent_upscale_models']) {
      fs.mkdirSync(path.join(models, sub), { recursive: true });
    }

    const draft = await inspectWorkflow({
      markdown: SAMPLE_MD,
      fileName: 'workflow.md',
      config: { scanDirectories: [models], centralDir: path.join(tmp, 'central') },
      fetchImpl: fakeFetch
    });

    expect(draft.comfy.root).toBe(path.resolve(models));
    expect(draft.repos.map((r) => r.repo)).toContain('Lightricks/LTX-2.5');
    expect(draft.entries).toHaveLength(6);
    expect(draft.entries.every((e) => e.status === 'ready')).toBe(true);
    expect(draft.entries.filter((e) => e.selected)).toHaveLength(5);
    expect(draft.summary.bytes).toBeGreaterThan(0);
    expect(draft.entries[0].targetPath).toContain(path.join('models', 'text_encoders'));
  });
});

describe('downloadFile', () => {
  const payload = Buffer.alloc(512 * 1024);
  for (let i = 0; i < payload.length; i++) payload[i] = i % 251;

  let server;
  let baseUrl;
  let requests = [];

  afterAll(async () => {
    if (server) await new Promise((resolve) => server.close(resolve));
  });

  async function startServer() {
    requests = [];
    server = http.createServer((req, res) => {
      requests.push(req.headers.range || null);
      const range = req.headers.range;
      if (range) {
        const start = Number(range.match(/bytes=(\d+)-/)[1]);
        res.writeHead(206, {
          'Content-Length': payload.length - start,
          'Content-Range': `bytes ${start}-${payload.length - 1}/${payload.length}`
        });
        res.end(payload.subarray(start));
      } else {
        res.writeHead(200, { 'Content-Length': payload.length });
        res.end(payload);
      }
    });
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
    baseUrl = `http://127.0.0.1:${server.address().port}/model.safetensors`;
  }

  it('descarrega, reporta progresso e grava o ficheiro final', async () => {
    await startServer();
    const dest = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'centraliza-dl-')), 'model.safetensors');
    let lastProgress = null;
    const result = await downloadFile({
      url: baseUrl,
      destPath: dest,
      onProgress: (p) => { lastProgress = p; }
    });
    expect(result.bytes).toBe(payload.length);
    expect(fs.readFileSync(dest).equals(payload)).toBe(true);
    expect(fs.existsSync(`${dest}.part`)).toBe(false);
    expect(lastProgress.percent).toBe(100);
    expect(lastProgress.downloadedBytes).toBe(payload.length);
    server.close();
  });

  it('retoma a partir de um .part usando HTTP Range', async () => {
    await startServer();
    const dest = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'centraliza-dl-')), 'model.safetensors');
    const half = Math.floor(payload.length / 2);
    fs.writeFileSync(`${dest}.part`, payload.subarray(0, half));
    const result = await downloadFile({ url: baseUrl, destPath: dest });
    expect(requests[0]).toBe(`bytes=${half}-`);
    expect(result.resumed).toBe(true);
    expect(fs.readFileSync(dest).equals(payload)).toBe(true);
    server.close();
  });
});
