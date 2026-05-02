# 🛠️ Centraliza.ai — Guia de Desenvolvimento

> Padrões, convenções e workflows para desenvolver no Centraliza.ai.
> Última atualização: 2026-05-02 | Versão: 3.2.0

---

## 1. Setup do Ambiente

### Pré-requisitos
- Node.js ≥ 18
- npm ≥ 9
- Ollama instalado (para funcionalidades de download/chat)
- GPU NVIDIA (opcional, para telemetria de VRAM via `nvidia-smi`)

### Instalação
```bash
# Clone e instale tudo com um comando
setup.bat
```

O `setup.bat` faz:
1. `npm install` na raiz (backend)
2. `npm install` no `frontend/`
3. `npm run build` no `frontend/` (gera `dist/`)
4. Adiciona o diretório ao PATH do usuário (comando `central`)

### Desenvolvimento Local
```bash
# Terminal 1 — Backend
node server.js

# Terminal 2 — Frontend (hot reload)
cd frontend && npm run dev
```

- **Backend**: http://localhost:4000
- **Frontend Dev**: http://localhost:5173 (proxy automático para API na 4000)

---

## 2. Design System

### Filosofia Visual
O Centraliza.ai segue uma estética **glassmórfica premium** com dark mode.
Cada interação deve parecer **precisa e profissional** — sem elementos
genéricos ou amadores.

### CSS Variables (definidas em `theme.css`)
```css
/* Superfícies */
--bg-base        /* Fundo principal da aplicação */
--bg-surface     /* Cards, sidebar, modais */
--bg-input       /* Inputs, áreas interativas */

/* Texto */
--text-primary   /* Texto principal */
--text-secondary /* Texto de suporte */
--text-muted     /* Labels, metadata */

/* Bordas */
--border         /* Bordas de containers */
```

### Princípios de Design
1. **Glassmorphism**: Usar `backdrop-blur-xl` + `bg-opacity` em superfícies
   elevadas
2. **Gradientes de Marca**: `from-blue-500 via-indigo-500 to-purple-600`
   para elementos de identidade
3. **Cantos Arredondados**: `rounded-2xl` para cards mobile,
   `rounded-[3rem]` para cards desktop
4. **Sombras Premium**: `shadow-xl` + `shadow-{cor}/20` para
   profundidade contextual
5. **Micro-Animações**: `transition-all duration-300` em todos os
   elementos interativos, `active:scale-95` para feedback tátil
6. **Tipografia Bold**: `font-black` + `uppercase` + `tracking-widest`
   para labels de sistema

### Paleta de Acentos
| Contexto          | Cor                  | Uso                              |
|-------------------|----------------------|----------------------------------|
| Primário / CTA    | `blue-600`           | Botões ativos, links da sidebar  |
| Sucesso           | `emerald-500`        | Centralizado, completado         |
| Alerta            | `amber-500`          | Avisos, estados parciais         |
| Perigo            | `red-500`            | Delete, erros                    |
| Info / Premium    | `purple-500`         | Status, métricas especiais       |
| Neutro            | `var(--text-muted)`  | Labels, metadata                 |

---

## 3. Estrutura de Componentes

### Páginas (`src/pages/`)
| Arquivo              | Rota          | Função                                  |
|----------------------|---------------|-----------------------------------------|
| `MyModels.tsx`       | `/models`     | CRUD de modelos detectados              |
| `ExploreStore.tsx`   | `/explore`    | Catálogo HuggingFace + download manager |
| `Centralization.tsx` | `/centralize` | Gestão de hardlinks + disk analysis     |
| `HardwareLab.tsx`    | `/hardware`   | Telemetria GPU/CPU/VRAM em tempo real   |
| `ModelTester.tsx`    | `/test`       | Chat proxy para testar modelos locais   |
| `Settings.tsx`       | `/settings`   | Configuração de diretórios e detecção   |
| `Extensions.tsx`     | `/extensions` | Placeholder para SDK de extensões       |

### Componentes Reutilizáveis (`src/components/`)
| Arquivo               | Função                                        |
|------------------------|-----------------------------------------------|
| `DownloadTracker.tsx`  | Overlay global de progresso de downloads       |
| `DeleteModal.tsx`      | Modal de confirmação de exclusão               |
| `LaunchModal.tsx`      | Modal de configuração de launch                |
| `DiskUsageGraph.tsx`   | Gráfico Recharts de uso de disco               |
| `HelpTooltip.tsx`      | Tooltip contextual de ajuda                    |
| `Toast.tsx`            | Sistema de notificações toast                  |

### Padrão de Componente
```tsx
// ✅ Correto — Componente premium
function ModelCard({ model }: { model: Model }) {
  return (
    <div className="bg-[var(--bg-surface)] p-6 rounded-2xl border
      border-[var(--border)] backdrop-blur-xl shadow-xl
      hover:border-blue-500/30 transition-all duration-300
      active:scale-[0.98] group">

      {/* Icon com animação de hover */}
      <Icon className="group-hover:rotate-12 group-hover:scale-110
        transition-all duration-500" />

      {/* Label de sistema */}
      <span className="font-black text-[8px] uppercase
        tracking-[0.2em] text-[var(--text-muted)]">
        {label}
      </span>
    </div>
  );
}

// ❌ Errado — Genérico
function ModelCard({ model }) {
  return (
    <div className="bg-gray-800 p-4 rounded border">
      <span>{model.name}</span>
    </div>
  );
}
```

---

## 4. Sistema de Internacionalização (i18n)

### Idiomas Suportados
PT-BR, PT-PT, EN, ES, FR, DE, IT, ZH, AR, KO, JA

### Como Usar
```tsx
const { t } = useApp();

// No JSX
<h1>{t('nav_dashboard')}</h1>
<p>{t('dash_subtitle')}</p>
```

### Adicionando Traduções
1. Abra `src/i18n/index.ts`
2. Adicione a chave em **todos** os idiomas
3. Use nomes descritivos: `{pagina}_{elemento}`

### RTL (Árabe)
O layout inverte automaticamente via `dir="rtl"` no container raiz
quando `lang === 'ar'`.

---

## 5. Padrões de Código

### Nomenclatura
- **Arquivos**: PascalCase para componentes (`MyModels.tsx`),
  camelCase para utilitários
- **Funções**: camelCase (`scanDirectory`, `getOllamaMap`)
- **Constantes**: UPPER_SNAKE para constantes globais
  (`MODEL_EXTENSIONS`, `LOG_FILE`)
- **Chaves i18n**: snake_case com prefixo de página
  (`dash_title`, `nav_settings`)

### Padrões do Backend
```javascript
// ✅ Sempre usar o logger, nunca console.log direto
logger.info(`[Contexto] Mensagem descritiva`);
logger.error(`[Contexto] Descrição do erro`, errorObj);

// ✅ Sempre limpar cache após mutações
cache.clear();

// ✅ Sempre emitir evento WebSocket quando dados mudam
io.emit('models-updated');
```

### Padrões do Frontend
```tsx
// ✅ Sempre usar CSS Variables, nunca cores hardcoded
className="text-[var(--text-primary)]"     // ✅
className="text-white"                      // ❌

// ✅ Sempre usar o sistema de tradução
{t('key')}                                  // ✅
{"Static text"}                             // ❌

// ✅ Sempre aplicar responsividade
className="p-3 sm:p-6 md:p-10"             // ✅
className="p-10"                            // ❌
```

---

## 6. Gestão de Estado

### AppContext (`src/context/AppContext.tsx`)
Estado global gerenciado via React Context:
- `lang`: Idioma ativo
- `t(key)`: Função de tradução
- Configurações de preferência do usuário

### Padrão de Fetch
```tsx
// ✅ Com cache-busting via WebSocket
useEffect(() => {
  const fetchModels = () => fetch('/api/models').then(r => r.json()).then(setModels);
  fetchModels();

  // Re-fetch automático quando backend sinaliza mudança
  socket.on('models-updated', fetchModels);
  return () => socket.off('models-updated', fetchModels);
}, []);
```

---

## 7. Build & Deploy

### Build de Produção
```bash
cd frontend && npm run build    # Gera frontend/dist/
```

O Express serve automaticamente `dist/` como estático na porta 4000.

### Criando Release
1. Atualizar versão em `package.json` (root e frontend)
2. `npm run build` no frontend
3. Testar via `node server.js`
4. Criar zip com: server.js, config.json, frontend/dist/,
   package.json, data/, setup.bat, start_app.bat, picker.ps1

### Comando Global
Após `setup.bat`, o usuário pode iniciar de qualquer terminal:
```bash
central
```

---

## 8. Debugging

### Logs
Todos os logs vão para `server.log` na raiz do projeto com timestamps ISO.

### Problemas Comuns
| Problema | Causa | Solução |
|----------|-------|---------|
| Hardlink falha | Volumes diferentes (C: vs D:) | Fallback para symlink automático |
| VRAM mostra 0 | `nvidia-smi` não disponível | Fallback para WMI via PowerShell |
| Modelos Ollama não aparecem | Manifestos corrompidos | Re-pull via `ollama pull` |
| Porta 4000 em uso | Outra instância rodando | `taskkill /F /IM node.exe` |
| Picker não abre | PowerShell bloqueado | Verificar ExecutionPolicy |

---

## 9. Roadmap Técnico

### v3.x (Atual)
- [x] Motor de centralização via hardlinks
- [x] Download manager com WebSockets
- [x] Telemetria de hardware
- [x] i18n com 11 idiomas
- [ ] Redesign premium da interface
- [ ] Extensions SDK

### v4.x (Futuro)
- [ ] LoRA e Embeddings Manager
- [ ] P2P Local Network Bridge
- [ ] Node-Based Text Workflows
- [ ] Agentes autônomos com pipelines visuais
