import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { io } from 'socket.io-client';
import {
  AlertTriangle,
  CheckCircle,
  ChevronDown,
  ChevronRight,
  Download,
  ExternalLink,
  FileText,
  FolderOpen,
  HardDrive,
  Info,
  Link2,
  Loader2,
  Play,
  RefreshCw,
  RotateCcw,
  Settings2,
  Upload,
  X
} from 'lucide-react';
import { motion } from 'framer-motion';
import { useToast } from './Toast';
import { useApp } from '../context/AppContext';

/* ------------------------------------------------------------------ */
/* Tipos                                                               */
/* ------------------------------------------------------------------ */

type EntryStatus =
  | 'ready'
  | 'unresolved'
  | 'present'
  | 'queued'
  | 'downloading'
  | 'completed'
  | 'failed'
  | 'skipped'
  | 'cancelled'
  | 'interrupted';

interface WorkflowEntry {
  id: string;
  name: string;
  filename: string;
  repo: string | null;
  url: string | null;
  category: string;
  targetDir: string | null;
  targetPath: string | null;
  size: number | null;
  sizeHintBytes: number | null;
  optional: boolean;
  status: EntryStatus;
  progress?: number;
  downloadedBytes?: number;
  totalBytes?: number | null;
  speed?: number;
  error: string | null;
  exists: boolean;
  discoveredRepo?: boolean;
  unverified?: boolean;
  note: string;
  selected?: boolean;
}

interface WorkflowConfig {
  comfyModelsDir: string | null;
  detectedRoot: string | null;
  detectedSource: string | null;
  candidates: { path: string; source: string; exists: boolean; markers: number }[];
  suggested: string;
  hasHfToken: boolean;
  concurrency: number;
  autoDiscover: boolean;
}

interface WorkflowDraft {
  jobId: string;
  title: string;
  fileName: string | null;
  createdAt: number;
  comfy: {
    root: string | null;
    source: string | null;
    candidates: WorkflowConfig['candidates'];
    suggested: string;
    freeBytes: number | null;
    categories?: Record<string, string[]>;
  };
  repos: { repo: string; provider: string; discovered?: boolean }[];
  entries: WorkflowEntry[];
  inputAssets: string[];
  warnings: string[];
  summary: {
    total: number;
    ready: number;
    unresolved: number;
    present: number;
    optional: number;
    selected: number;
    bytes: number;
    totalBytes: number;
  };
}

interface WorkflowJob {
  id: string;
  title: string;
  fileName: string | null;
  status: 'running' | 'cancelling' | 'completed' | 'completed_with_errors' | 'failed' | 'cancelled' | 'interrupted';
  createdAt: number;
  startedAt: number | null;
  finishedAt: number | null;
  root: string | null;
  repos: { repo: string; provider: string; discovered?: boolean }[];
  warnings: string[];
  entries: WorkflowEntry[];
  summary: {
    total: number;
    completed: number;
    failed: number;
    skipped: number;
    cancelled: number;
    queued: number;
    downloading: number;
    bytes: number;
    downloadedBytes: number;
  };
  active?: boolean;
}

interface Props {
  isOpen: boolean;
  onClose: () => void;
  onImported?: () => void;
}

const CATEGORIES = [
  'checkpoints',
  'diffusion_models',
  'text_encoders',
  'vae',
  'loras',
  'controlnet',
  'upscale_models',
  'latent_upscale_models',
  'embeddings',
  'clip_vision',
  'style_models',
  'ipadapter',
  'audio_encoders',
  'animatediff_models',
  'animatediff_motion_lora',
  'model_patches',
  'diffusers',
  'LLM'
];

function formatBytes(bytes?: number | null): string {
  if (!bytes || bytes <= 0) return '—';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let value = bytes;
  let index = 0;
  while (value >= 1024 && index < units.length - 1) {
    value /= 1024;
    index++;
  }
  return `${value.toFixed(value >= 100 || index === 0 ? 0 : value >= 10 ? 1 : 2)} ${units[index]}`;
}

function statusTone(status: EntryStatus): string {
  if (status === 'completed') return 'text-emerald-500 border-emerald-500/20 bg-emerald-500/10';
  if (status === 'failed') return 'text-red-500 border-red-500/20 bg-red-500/10';
  if (status === 'downloading') return 'text-blue-500 border-blue-500/20 bg-blue-500/10';
  if (status === 'present' || status === 'skipped') return 'text-slate-400 border-slate-500/20 bg-slate-500/10';
  if (status === 'cancelled' || status === 'interrupted') return 'text-amber-500 border-amber-500/20 bg-amber-500/10';
  if (status === 'unresolved') return 'text-amber-500 border-amber-500/20 bg-amber-500/10';
  return 'text-[var(--text-secondary)] border-[var(--border)] bg-[var(--bg-input)]/50';
}

export default function WorkflowImporter({ isOpen, onClose, onImported }: Props) {
  const { t } = useApp();
  const { showToast } = useToast();

  const [step, setStep] = useState<'upload' | 'review' | 'running' | 'done'>('upload');
  const [markdown, setMarkdown] = useState('');
  const [fileName, setFileName] = useState<string | null>(null);
  const [dragActive, setDragActive] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [draft, setDraft] = useState<WorkflowDraft | null>(null);
  const [entries, setEntries] = useState<WorkflowEntry[]>([]);
  const [job, setJob] = useState<WorkflowJob | null>(null);
  const [history, setHistory] = useState<WorkflowJob[]>([]);
  const [config, setConfig] = useState<WorkflowConfig | null>(null);
  const [token, setToken] = useState('');
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [showRootEditor, setShowRootEditor] = useState(false);
  const [rootInput, setRootInput] = useState('');
  const [savingRoot, setSavingRoot] = useState(false);
  const [starting, setStarting] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [filter, setFilter] = useState('');

  const jobIdRef = useRef<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const onImportedRef = useRef(onImported);

  useEffect(() => {
    onImportedRef.current = onImported;
  }, [onImported]);

  const resetState = useCallback(() => {
    setStep('upload');
    setMarkdown('');
    setFileName(null);
    setDraft(null);
    setEntries([]);
    setJob(null);
    setError(null);
    setAnalyzing(false);
    setShowRootEditor(false);
    setRootInput('');
    setShowAdvanced(false);
    setExpanded(null);
    setFilter('');
    jobIdRef.current = null;
  }, []);

  const loadConfigAndHistory = useCallback(async () => {
    try {
      const res = await fetch('/api/workflows', { cache: 'no-store' });
      const data = await res.json();
      if (data && data.config) setConfig(data.config);
      if (data && Array.isArray(data.jobs)) setHistory(data.jobs);
    } catch {
      try {
        const res = await fetch('/api/workflows/config', { cache: 'no-store' });
        if (res.ok) setConfig(await res.json());
      } catch { /* backend indisponível */ }
    }
  }, []);

  useEffect(() => {
    if (!isOpen) {
      resetState();
      return;
    }
    loadConfigAndHistory();
  }, [isOpen, loadConfigAndHistory, resetState]);

  useEffect(() => {
    if (!isOpen) return;
    const socket = io(window.location.origin);

    const onProgress = (data: {
      jobId: string;
      entryId?: string;
      status?: EntryStatus;
      progress?: number;
      downloadedBytes?: number;
      totalBytes?: number | null;
      speed?: number;
      error?: string | null;
    }) => {
      const activeJob = jobIdRef.current;
      if (!activeJob || data.jobId !== activeJob) return;
      if (!data.entryId) return;
      setEntries((prev) => prev.map((entry) => entry.id === data.entryId
        ? {
            ...entry,
            status: data.status || entry.status,
            progress: data.progress ?? entry.progress,
            downloadedBytes: data.downloadedBytes ?? entry.downloadedBytes,
            totalBytes: data.totalBytes ?? entry.totalBytes,
            speed: data.speed ?? entry.speed,
            error: data.error ?? (data.status === 'failed' ? entry.error : entry.error)
          }
        : entry));
    };

    const onComplete = async (data: { jobId: string; status: WorkflowJob['status']; summary: WorkflowJob['summary'] }) => {
      if (!jobIdRef.current || data.jobId !== jobIdRef.current) return;
      setJob((prev) => prev ? { ...prev, status: data.status, summary: data.summary } : prev);
      setStep('done');
      setCancelling(false);
      onImportedRef.current?.();
      try {
        const res = await fetch(`/api/workflows/${data.jobId}`, { cache: 'no-store' });
        if (res.ok) {
          const finished = await res.json() as WorkflowJob;
          setJob(finished);
          setEntries(finished.entries.map((entry) => ({ ...entry })));
        }
      } catch { /* mantém o estado recebido por socket */ }
      loadConfigAndHistory();
    };

    socket.on('workflow-progress', onProgress);
    socket.on('workflow-complete', onComplete);
    return () => {
      socket.off('workflow-progress', onProgress);
      socket.off('workflow-complete', onComplete);
      socket.disconnect();
    };
  }, [isOpen, loadConfigAndHistory]);

  useEffect(() => {
    if (!isOpen || step !== 'running' || !job?.id) return;
    let cancelled = false;
    const sync = async () => {
      try {
        const res = await fetch(`/api/workflows/${job.id}`, { cache: 'no-store' });
        if (!res.ok) return;
        const data = await res.json() as WorkflowJob;
        if (cancelled) return;
        setJob(data);
        setEntries(data.entries.map((entry) => ({ ...entry })));
        if (data.status !== 'running' && data.status !== 'cancelling') {
          setStep('done');
          setCancelling(false);
          onImportedRef.current?.();
          loadConfigAndHistory();
        }
      } catch { /* mantém os eventos socket */ }
    };
    const timer = setTimeout(sync, 900);
    const interval = setInterval(sync, 1500);
    return () => {
      cancelled = true;
      clearTimeout(timer);
      clearInterval(interval);
    };
  }, [isOpen, step, job?.id, loadConfigAndHistory]);

  // Rede de segurança: se o evento de conclusão chegar antes de o cliente
  // conhecer o jobId (ficheiros pequenos), a sincronização acima resolve.
  const analyze = useCallback(async (text: string, name: string | null) => {
    if (!text.trim()) {
      setError(t('wf_parseError'));
      return;
    }
    setAnalyzing(true);
    setError(null);
    try {
      const res = await fetch('/api/workflows/inspect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ markdown: text, fileName: name || undefined, token: token || undefined })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || t('wf_parseError'));
      if (!Array.isArray(data.entries) || data.entries.length === 0) throw new Error(t('wf_parseError'));
      setDraft(data);
      setEntries(data.entries.map((entry: WorkflowEntry) => ({ ...entry })));
      setConfig((prev) => prev ? { ...prev, detectedRoot: data.comfy.root } : prev);
      setStep('review');
    } catch (err) {
      setError(err instanceof Error ? err.message : t('wf_parseError'));
    } finally {
      setAnalyzing(false);
    }
  }, [t, token]);

  const handleFile = async (file?: File | null) => {
    if (!file) return;
    if (!/\.(md|markdown|txt)$/i.test(file.name)) {
      setError(t('wf_readError'));
      return;
    }
    if (file.size > 2 * 1024 * 1024) {
      setError(t('wf_readError'));
      return;
    }
    setFileName(file.name);
    try {
      const text = await file.text();
      setMarkdown(text);
      await analyze(text, file.name);
    } catch {
      setError(t('wf_readError'));
    }
  };

  const applyRoot = async () => {
    if (!rootInput.trim()) return;
    setSavingRoot(true);
    try {
      const res = await fetch('/api/workflows/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ comfyModelsDir: rootInput.trim() })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || t('error'));
      setConfig((prev) => prev ? { ...prev, ...data.config, detectedRoot: data.config.detectedRoot } : data.config);
      showToast(t('settings_saved'), 'success');
      setShowRootEditor(false);
      if (markdown.trim()) await analyze(markdown, fileName);
    } catch (err) {
      showToast(err instanceof Error ? err.message : t('error'), 'error');
    } finally {
      setSavingRoot(false);
    }
  };

  const updateEntry = (id: string, patch: Partial<WorkflowEntry>) => {
    setEntries((prev) => prev.map((entry) => entry.id === id ? { ...entry, ...patch } : entry));
  };

  const categoryTargetDir = (category: string): string | null => {
    const root = draft?.comfy.root;
    if (!root) return null;
    const dirs = draft?.comfy.categories?.[category];
    const folder = dirs && dirs.length ? dirs[0] : category;
    return `${root.replace(/[\\/]+$/, '')}\\${folder}`;
  };

  const changeCategory = (entry: WorkflowEntry, category: string) => {
    const targetDir = categoryTargetDir(category);
    updateEntry(entry.id, {
      category,
      targetDir,
      targetPath: targetDir ? `${targetDir}\\${entry.filename}` : null
    });
  };

  const setUrlOverride = (entry: WorkflowEntry, url: string) => {
    const clean = url.trim();
    let filename = entry.filename;
    if (clean) {
      try {
        const last = new URL(clean).pathname.split('/').filter(Boolean).pop();
        if (last && /\.(safetensors|ckpt|pt|pth|bin|gguf|onnx|pkl|sft)$/i.test(decodeURIComponent(last))) {
          filename = decodeURIComponent(last);
        }
      } catch { /* mantém o nome atual */ }
    }
    const targetDir = categoryTargetDir(entry.category);
    updateEntry(entry.id, {
      url: clean || null,
      filename,
      targetPath: targetDir ? `${targetDir}\\${filename}` : null,
      status: clean ? 'ready' : 'unresolved',
      selected: clean ? true : false,
      error: null
    });
  };

  const visibleEntries = useMemo(() => {
    const term = filter.trim().toLowerCase();
    if (!term) return entries;
    return entries.filter((entry) =>
      entry.filename.toLowerCase().includes(term)
      || entry.category.toLowerCase().includes(term)
      || (entry.repo || '').toLowerCase().includes(term)
    );
  }, [entries, filter]);

  const groupedEntries = useMemo(() => {
    const groups = new Map<string, WorkflowEntry[]>();
    for (const entry of visibleEntries) {
      if (!groups.has(entry.category)) groups.set(entry.category, []);
      groups.get(entry.category)!.push(entry);
    }
    return Array.from(groups.entries()).sort((a, b) => a[0].localeCompare(b[0]));
  }, [visibleEntries]);

  const selectedEntries = entries.filter((entry) => entry.selected);
  const selectedBytes = selectedEntries.reduce((sum, entry) => sum + (entry.size || 0), 0);
  const freeBytes = draft?.comfy.freeBytes ?? null;
  const notEnoughSpace = !!(freeBytes && selectedBytes > freeBytes);

  const setSelection = (mode: 'all' | 'required' | 'none') => {
    setEntries((prev) => prev.map((entry) => {
      if (mode === 'none') return { ...entry, selected: false };
      if (!entry.url) return { ...entry, selected: false };
      if (mode === 'required') {
        return { ...entry, selected: entry.status === 'ready' && !entry.optional && !entry.exists };
      }
      return { ...entry, selected: entry.status === 'ready' };
    }));
  };

  const startDownloads = async () => {
    if (!draft) return;
    if (!draft.comfy.root) {
      setShowRootEditor(true);
      setError(t('wf_statusNoRoot'));
      return;
    }
    if (selectedEntries.length === 0) {
      setError(t('wf_noResults'));
      return;
    }
    setStarting(true);
    setError(null);
    try {
      const res = await fetch('/api/workflows/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jobId: draft.jobId,
          token: token || undefined,
          entries: entries.map((entry) => ({
            id: entry.id,
            selected: !!entry.selected,
            category: entry.category,
            url: entry.url || undefined
          }))
        })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || t('wf_startError'));
      const startedJob = data as WorkflowJob;
      jobIdRef.current = startedJob.id;
      setJob(startedJob);
      setEntries(startedJob.entries.map((entry) => ({ ...entry })));
      setStep('running');
    } catch (err) {
      setError(err instanceof Error ? err.message : t('wf_startError'));
    } finally {
      setStarting(false);
    }
  };

  const cancelJob = async () => {
    if (!job) return;
    setCancelling(true);
    try {
      await fetch(`/api/workflows/${job.id}/cancel`, { method: 'POST' });
    } catch { /* o evento socket atualiza o estado */ }
  };

  const retryJob = async () => {
    if (!job) return;
    try {
      const res = await fetch(`/api/workflows/${job.id}/retry`, { method: 'POST' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || t('error'));
      setJob(data);
      setEntries(data.entries.map((entry: WorkflowEntry) => ({ ...entry })));
      setStep('running');
      setCancelling(false);
    } catch (err) {
      showToast(err instanceof Error ? err.message : t('error'), 'error');
    }
  };

  const resumeHistoryJob = async (item: WorkflowJob) => {
    try {
      const res = await fetch(`/api/workflows/${item.id}/retry`, { method: 'POST' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || t('error'));
      jobIdRef.current = data.id;
      setJob(data);
      setEntries(data.entries.map((entry: WorkflowEntry) => ({ ...entry })));
      setStep('running');
      setCancelling(false);
    } catch (err) {
      showToast(err instanceof Error ? err.message : t('error'), 'error');
    }
  };

  const updateConcurrency = async (value: number) => {
    setConfig((prev) => prev ? { ...prev, concurrency: value } : prev);
    try {
      await fetch('/api/workflows/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ workflowConcurrency: value })
      });
    } catch { /* mantém a preferência local */ }
  };

  const openRootFolder = () => {
    const folder = job?.root || draft?.comfy.root;
    if (!folder) return;
    fetch('/api/open-folder', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ folderPath: folder })
    }).catch(() => {});
  };

  const statusLabel = (status: EntryStatus) => {
    switch (status) {
      case 'queued': return t('wf_queued');
      case 'downloading': return t('wf_downloading');
      case 'completed': return t('wf_completed');
      case 'failed': return t('wf_failed');
      case 'skipped': return t('wf_skipped');
      case 'cancelled': return t('wf_cancelled');
      case 'interrupted': return t('wf_jobInterrupted');
      case 'present': return t('wf_present');
      case 'unresolved': return t('wf_unresolved');
      default: return t('wf_statusReady');
    }
  };

  const jobStatusLabel = (status: WorkflowJob['status']) => {
    switch (status) {
      case 'running':
      case 'cancelling': return t('wf_jobRunning');
      case 'completed': return t('wf_jobCompleted');
      case 'completed_with_errors':
      case 'failed': return t('wf_jobFailed');
      case 'cancelled': return t('wf_jobCancelled');
      case 'interrupted': return t('wf_jobInterrupted');
      default: return status;
    }
  };

  const overall = useMemo(() => {
    const total = entries.length;
    if (total === 0) return 0;
    const finished = entries.filter((entry) => ['completed', 'failed', 'skipped', 'cancelled', 'interrupted'].includes(entry.status)).length;
    const partial = entries.reduce((sum, entry) => {
      if (entry.status === 'downloading' && entry.totalBytes && entry.totalBytes > 0) {
        return sum + Math.min(1, (entry.downloadedBytes || 0) / entry.totalBytes);
      }
      return sum;
    }, 0);
    return Math.min(100, Math.round(((finished + partial) / total) * 100));
  }, [entries]);

  const liveSummary = useMemo(() => ({
    total: entries.length,
    completed: entries.filter((entry) => entry.status === 'completed').length,
    failed: entries.filter((entry) => entry.status === 'failed').length,
    skipped: entries.filter((entry) => entry.status === 'skipped' || entry.status === 'present').length,
    downloadedBytes: entries.reduce((sum, entry) => sum + (entry.downloadedBytes || 0), 0),
    bytes: entries.reduce((sum, entry) => sum + (entry.size || 0), 0)
  }), [entries]);

  if (!isOpen) return null;

  const jobRunning = step === 'running' && !!job && (job.status === 'running' || job.status === 'cancelling');
  const busy = analyzing || starting || savingRoot;

  return (
    <div className="fixed inset-0 z-[9000] flex items-center justify-center p-2 sm:p-4 md:p-8">
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        className="absolute inset-0 bg-black/80 backdrop-blur-md"
        onClick={() => { if (!starting && !jobRunning) onClose(); }}
      />

      <motion.div
        initial={{ opacity: 0, y: 24, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.25 }}
        className="relative w-full max-w-6xl max-h-[94vh] bg-[var(--bg-surface)] border border-[var(--border)] rounded-[1.5rem] sm:rounded-[2rem] shadow-2xl flex flex-col overflow-hidden"
      >
        <header className="p-5 sm:p-6 md:p-8 border-b border-[var(--border)] flex items-start justify-between gap-4">
          <div className="flex items-start gap-4 min-w-0">
            <div className="w-12 h-12 sm:w-14 sm:h-14 rounded-2xl bg-gradient-to-br from-blue-600 to-indigo-500 text-white flex items-center justify-center shrink-0 shadow-lg shadow-blue-600/30">
              <FileText size={26} />
            </div>
            <div className="min-w-0">
              <h2 className="text-xl sm:text-2xl md:text-3xl font-black tracking-tighter uppercase text-[var(--text-primary)] leading-none">
                {t('wf_title')}
              </h2>
              <p className="text-xs sm:text-sm text-[var(--text-secondary)] font-medium mt-2 max-w-2xl leading-relaxed">
                {t('wf_subtitle')}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            disabled={starting || jobRunning}
            title={jobRunning ? t('wf_runningTitle') : t('wf_close')}
            className="p-2.5 rounded-xl bg-[var(--bg-input)] border border-[var(--border)] text-[var(--text-muted)] hover:text-red-500 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <X size={20} />
          </button>
        </header>

        <div className="px-5 sm:px-8 pt-5 flex items-center gap-2 sm:gap-4 text-[10px] sm:text-xs font-black uppercase tracking-widest">
          {(['upload', 'review', 'running'] as const).map((item, index) => {
            const active = step === item || (step === 'done' && item === 'running');
            const done = (step === 'review' && item === 'upload')
              || (step === 'running' && item !== 'running')
              || (step === 'done');
            return (
              <div key={item} className="flex items-center gap-2 sm:gap-4 min-w-0">
                <div className={`flex items-center gap-2 ${active ? 'text-blue-500' : done ? 'text-emerald-500' : 'text-[var(--text-muted)]'}`}>
                  <span className={`w-7 h-7 rounded-full border flex items-center justify-center text-[11px] ${active ? 'border-blue-500 bg-blue-500/10' : done ? 'border-emerald-500 bg-emerald-500/10' : 'border-[var(--border)]'}`}>
                    {done ? <CheckCircle size={14} /> : index + 1}
                  </span>
                  <span className="hidden sm:inline">{item === 'upload' ? t('wf_stepUpload') : item === 'review' ? t('wf_stepReview') : t('wf_stepDownload')}</span>
                </div>
                {index < 2 && <span className="w-5 sm:w-10 h-px bg-[var(--border)]" />}
              </div>
            );
          })}
        </div>

        <div className="flex-1 overflow-y-auto custom-scrollbar px-5 sm:px-8 py-5 sm:py-6">
          {error && (
            <div className="mb-5 p-4 rounded-2xl border border-red-500/20 bg-red-500/5 text-red-400 text-xs sm:text-sm font-bold flex items-start gap-3">
              <AlertTriangle size={18} className="shrink-0 mt-0.5" />
              <span className="break-words">{error}</span>
            </div>
          )}

          {step === 'upload' && (
            <div className="space-y-6">
              <div
                onDragOver={(event) => { event.preventDefault(); setDragActive(true); }}
                onDragLeave={() => setDragActive(false)}
                onDrop={(event) => {
                  event.preventDefault();
                  setDragActive(false);
                  handleFile(event.dataTransfer.files?.[0]);
                }}
                onClick={() => fileInputRef.current?.click()}
                className={`relative cursor-pointer rounded-[1.5rem] sm:rounded-[2rem] border-2 border-dashed p-6 sm:p-10 text-center transition-all ${
                  dragActive
                    ? 'border-blue-500 bg-blue-500/10'
                    : 'border-[var(--border)] bg-[var(--bg-input)]/30 hover:border-blue-500/50 hover:bg-blue-500/5'
                }`}
              >
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".md,.markdown,.txt,text/markdown,text/plain"
                  className="hidden"
                  onChange={(event) => handleFile(event.target.files?.[0])}
                />
                <div className="w-16 h-16 sm:w-20 sm:h-20 rounded-[1.5rem] bg-[var(--bg-surface)] border border-[var(--border)] flex items-center justify-center mx-auto mb-5 text-blue-500 shadow-xl">
                  {analyzing ? <Loader2 size={32} className="animate-spin" /> : <Upload size={32} />}
                </div>
                <h3 className="text-lg sm:text-xl font-black text-[var(--text-primary)] tracking-tight">
                  {analyzing ? t('wf_analyzing') : t('wf_dropTitle')}
                </h3>
                <p className="text-xs sm:text-sm text-[var(--text-secondary)] font-medium mt-2">{t('wf_dropHint')}</p>
                <div className="mt-5 inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-blue-600 text-white text-[11px] font-black uppercase tracking-widest shadow-lg shadow-blue-600/20">
                  <Upload size={15} /> {t('wf_browse')}
                </div>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
                <div className="lg:col-span-2 rounded-2xl border border-[var(--border)] bg-[var(--bg-input)]/30 p-4 sm:p-5">
                  <label className="text-[11px] font-black uppercase tracking-widest text-[var(--text-muted)] mb-3 block">
                    {t('wf_pasteLabel')}
                  </label>
                  <textarea
                    value={markdown}
                    onChange={(event) => setMarkdown(event.target.value)}
                    placeholder={t('wf_pastePlaceholder')}
                    rows={7}
                    className="w-full bg-[var(--bg-surface)] border border-[var(--border)] rounded-xl p-4 text-xs sm:text-sm font-mono text-[var(--text-primary)] focus:outline-none focus:ring-4 focus:ring-blue-600/10 resize-y custom-scrollbar"
                  />
                  <div className="flex flex-wrap items-center justify-between gap-3 mt-3">
                    <a
                      href="/api/workflows/template"
                      className="inline-flex items-center gap-2 text-[11px] font-black uppercase tracking-widest text-[var(--text-muted)] hover:text-blue-500 transition-colors"
                    >
                      <Download size={14} /> {t('wf_template')}
                    </a>
                    <button
                      onClick={() => analyze(markdown, fileName)}
                      disabled={busy || !markdown.trim()}
                      className="inline-flex items-center gap-2 px-5 py-3 rounded-xl bg-blue-600 hover:bg-blue-500 disabled:opacity-40 text-white text-[11px] font-black uppercase tracking-widest transition-all active:scale-95"
                    >
                      {analyzing ? <Loader2 size={16} className="animate-spin" /> : <Play size={16} />}
                      {t('wf_analyze')}
                    </button>
                  </div>
                </div>

                <div className="rounded-2xl border border-[var(--border)] bg-[var(--bg-input)]/30 p-4 sm:p-5">
                  <h4 className="text-[11px] font-black uppercase tracking-widest text-[var(--text-muted)] mb-3 flex items-center gap-2">
                    <RefreshCw size={14} /> {t('wf_history')}
                  </h4>
                  <div className="space-y-2 max-h-64 overflow-y-auto custom-scrollbar pr-1">
                    {history.length === 0 && (
                      <p className="text-xs text-[var(--text-muted)] font-medium">{t('wf_noHistory')}</p>
                    )}
                    {history.slice(0, 6).map((item) => (
                      <div key={item.id} className="p-3 rounded-xl bg-[var(--bg-surface)] border border-[var(--border)]">
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-[11px] font-black text-[var(--text-primary)] truncate">{item.title}</span>
                          <span className={`text-[9px] font-black uppercase tracking-widest px-2 py-0.5 rounded-full border shrink-0 ${
                            item.status === 'completed' ? 'text-emerald-500 border-emerald-500/20 bg-emerald-500/10'
                              : item.status === 'completed_with_errors' || item.status === 'failed' ? 'text-red-500 border-red-500/20 bg-red-500/10'
                                : 'text-[var(--text-muted)] border-[var(--border)]'
                          }`}>
                            {jobStatusLabel(item.status)}
                          </span>
                        </div>
                        <p className="text-[10px] text-[var(--text-muted)] font-medium mt-1">
                          {new Date(item.createdAt).toLocaleString()} · {item.summary.completed}/{item.summary.total}
                        </p>
                        {['failed', 'completed_with_errors', 'cancelled', 'interrupted'].includes(item.status) && (
                          <button
                            onClick={() => resumeHistoryJob(item)}
                            className="mt-2 inline-flex items-center gap-1 text-[9px] font-black uppercase tracking-widest text-blue-500 hover:text-blue-400 transition-colors"
                          >
                            <RotateCcw size={11} /> {t('wf_retry')}
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          )}

          {step === 'review' && draft && (
            <div className="space-y-5">
              <div className="flex flex-col lg:flex-row lg:items-start justify-between gap-4">
                <div className="min-w-0">
                  <h3 className="text-lg sm:text-xl font-black text-[var(--text-primary)] tracking-tight">
                    {t('wf_reviewTitle')} — <span className="text-blue-500">{draft.title}</span>
                  </h3>
                  <p className="text-xs text-[var(--text-muted)] font-medium mt-1">
                    {t('wf_entriesFound', { n: entries.length })}
                    {draft.fileName ? ` · ${draft.fileName}` : ''}
                  </p>
                </div>
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="px-3 py-1.5 rounded-full bg-blue-500/10 border border-blue-500/20 text-blue-500 text-[10px] font-black uppercase tracking-widest">
                    {selectedEntries.length} / {entries.length}
                  </span>
                  <span className="px-3 py-1.5 rounded-full bg-[var(--bg-input)] border border-[var(--border)] text-[var(--text-secondary)] text-[10px] font-black uppercase tracking-widest">
                    {formatBytes(selectedBytes)}
                  </span>
                </div>
              </div>

              <div className="rounded-2xl border border-[var(--border)] bg-[var(--bg-input)]/30 p-4 space-y-4">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div className="flex items-center gap-2 text-[11px] font-black uppercase tracking-widest text-[var(--text-muted)]">
                    <HardDrive size={14} className="text-blue-500" /> {t('wf_rootTitle')}
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className={`text-[10px] font-black uppercase tracking-widest ${draft.comfy.root ? 'text-emerald-500' : 'text-amber-500'}`}>
                      {draft.comfy.root ? `${t('wf_detected')} · ${formatBytes(freeBytes)}` : t('wf_rootMissing')}
                    </span>
                    <button
                      onClick={() => { setShowRootEditor((value) => !value); setRootInput(config?.comfyModelsDir || draft.comfy.root || draft.comfy.suggested); }}
                      className="px-3 py-1.5 rounded-lg border border-[var(--border)] bg-[var(--bg-surface)] text-[10px] font-black uppercase tracking-widest text-[var(--text-secondary)] hover:text-blue-500 hover:border-blue-500/40 transition-colors"
                    >
                      {t('wf_changeRoot')}
                    </button>
                  </div>
                </div>
                <p className="text-[11px] text-[var(--text-secondary)] font-mono break-all">
                  {draft.comfy.root || draft.comfy.suggested}
                </p>
                {showRootEditor && (
                  <div className="flex flex-col sm:flex-row gap-2">
                    <input
                      value={rootInput}
                      onChange={(event) => setRootInput(event.target.value)}
                      list="comfy-root-options"
                      className="flex-1 bg-[var(--bg-surface)] border border-[var(--border)] rounded-xl px-4 py-3 text-xs font-mono text-[var(--text-primary)] focus:outline-none focus:ring-4 focus:ring-blue-600/10"
                    />
                    <datalist id="comfy-root-options">
                      {draft.comfy.candidates.map((candidate) => <option key={candidate.path} value={candidate.path} />)}
                      <option value={draft.comfy.suggested} />
                    </datalist>
                    <button
                      onClick={applyRoot}
                      disabled={savingRoot || !rootInput.trim()}
                      className="px-5 py-3 rounded-xl bg-blue-600 hover:bg-blue-500 disabled:opacity-40 text-white text-[10px] font-black uppercase tracking-widest"
                    >
                      {savingRoot ? <Loader2 size={14} className="animate-spin" /> : t('wf_applyRoot')}
                    </button>
                  </div>
                )}
                {draft.repos.length > 0 && (
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-[10px] font-black uppercase tracking-widest text-[var(--text-muted)]">{t('wf_repos')}:</span>
                    {draft.repos.map((repo) => (
                      <span key={`${repo.provider}-${repo.repo}`} className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-[10px] font-bold ${
                        repo.discovered
                          ? 'bg-amber-500/10 border-amber-500/20 text-amber-500'
                          : 'bg-[var(--bg-surface)] border-[var(--border)] text-[var(--text-secondary)]'
                      }`}>
                        <Link2 size={11} /> {repo.repo}
                        {repo.discovered && <span title={t('wf_unverified')}>*</span>}
                      </span>
                    ))}
                  </div>
                )}
              </div>

              <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
                <div className="flex flex-wrap gap-2">
                  <button onClick={() => setSelection('all')} className="px-3 py-2 rounded-lg border border-[var(--border)] bg-[var(--bg-surface)] text-[10px] font-black uppercase tracking-widest text-[var(--text-secondary)] hover:text-blue-500 transition-colors">
                    {t('wf_selectAll')}
                  </button>
                  <button onClick={() => setSelection('required')} className="px-3 py-2 rounded-lg border border-[var(--border)] bg-[var(--bg-surface)] text-[10px] font-black uppercase tracking-widest text-[var(--text-secondary)] hover:text-blue-500 transition-colors">
                    {t('wf_selectRequired')}
                  </button>
                  <button onClick={() => setSelection('none')} className="px-3 py-2 rounded-lg border border-[var(--border)] bg-[var(--bg-surface)] text-[10px] font-black uppercase tracking-widest text-[var(--text-secondary)] hover:text-red-500 transition-colors">
                    {t('wf_selectNone')}
                  </button>
                </div>
                <input
                  value={filter}
                  onChange={(event) => setFilter(event.target.value)}
                  placeholder={t('search')}
                  className="w-full sm:w-64 bg-[var(--bg-surface)] border border-[var(--border)] rounded-xl px-4 py-2.5 text-xs text-[var(--text-primary)] focus:outline-none focus:ring-4 focus:ring-blue-600/10"
                />
              </div>

              {notEnoughSpace && (
                <div className="p-3 rounded-xl border border-amber-500/30 bg-amber-500/10 text-amber-500 text-[11px] font-bold flex items-center gap-2">
                  <AlertTriangle size={15} /> {t('wf_notEnoughSpace', { size: formatBytes(freeBytes) })}
                </div>
              )}

              <div className="space-y-4">
                {groupedEntries.map(([category, items]) => (
                  <section key={category} className="rounded-2xl border border-[var(--border)] bg-[var(--bg-input)]/20 overflow-hidden">
                    <header className="px-4 py-3 bg-[var(--bg-input)]/40 border-b border-[var(--border)] flex items-center justify-between gap-3">
                      <div className="flex items-center gap-2 min-w-0">
                        <FolderOpen size={15} className="text-blue-500 shrink-0" />
                        <h4 className="text-[11px] font-black uppercase tracking-widest text-[var(--text-primary)] truncate">{category}</h4>
                        <span className="text-[9px] font-black text-[var(--text-muted)]">{items.length}</span>
                      </div>
                      <span className="text-[10px] font-bold text-[var(--text-muted)] shrink-0">
                        {formatBytes(items.reduce((sum, entry) => sum + (entry.size || 0), 0))}
                      </span>
                    </header>
                    <div className="divide-y divide-[var(--border)]">
                      {items.map((entry) => {
                        const isExpanded = expanded === entry.id;
                        const currentTarget = entry.targetPath || (entry.targetDir ? `${entry.targetDir}\\${entry.filename}` : null);
                        return (
                          <div key={entry.id} className={`p-4 ${entry.selected ? 'bg-blue-500/[0.03]' : ''}`}>
                            <div className="flex items-start gap-3">
                              <input
                                type="checkbox"
                                checked={!!entry.selected}
                                disabled={!entry.url}
                                onChange={(event) => updateEntry(entry.id, { selected: event.target.checked })}
                                className="mt-1 w-4 h-4 accent-blue-600 shrink-0"
                              />
                              <div className="flex-1 min-w-0">
                                <div className="flex flex-wrap items-center gap-2">
                                  <span className="text-xs sm:text-sm font-bold text-[var(--text-primary)] break-all">{entry.filename}</span>
                                  {entry.optional && <span className="px-2 py-0.5 rounded-full bg-purple-500/10 border border-purple-500/20 text-purple-400 text-[9px] font-black uppercase tracking-widest">{t('wf_optional')}</span>}
                                  {entry.exists && <span className="px-2 py-0.5 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-500 text-[9px] font-black uppercase tracking-widest">{t('wf_present')}</span>}
                                  {entry.status === 'unresolved' && <span className="px-2 py-0.5 rounded-full bg-amber-500/10 border border-amber-500/20 text-amber-500 text-[9px] font-black uppercase tracking-widest">{t('wf_unresolved')}</span>}
                                  {entry.discoveredRepo && <span className="px-2 py-0.5 rounded-full bg-amber-500/10 border border-amber-500/20 text-amber-500 text-[9px] font-black uppercase tracking-widest">auto</span>}
                                  {entry.unverified && <span className="px-2 py-0.5 rounded-full bg-amber-500/10 border border-amber-500/20 text-amber-500 text-[9px] font-black uppercase tracking-widest">{t('wf_unverified')}</span>}
                                </div>
                                <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-1.5 text-[10px] text-[var(--text-muted)] font-medium">
                                  <span className={`px-2 py-0.5 rounded-full border text-[9px] font-black uppercase tracking-widest ${statusTone(entry.status)}`}>{statusLabel(entry.status)}</span>
                                  <span>{entry.size ? formatBytes(entry.size) : entry.sizeHintBytes ? formatBytes(entry.sizeHintBytes) : t('wf_sizeUnknown')}</span>
                                  {entry.repo && <span className="truncate max-w-[16rem]">{entry.repo}</span>}
                                </div>
                                {entry.note && <p className="text-[10px] text-[var(--text-muted)] mt-1 italic leading-relaxed">{entry.note}</p>}
                                {entry.error && <p className="text-[10px] text-amber-500 mt-1 font-bold break-words">{entry.error}</p>}
                                <div className="mt-2 flex flex-wrap items-center gap-2">
                                  <select
                                    value={entry.category}
                                    onChange={(event) => changeCategory(entry, event.target.value)}
                                    className="bg-[var(--bg-surface)] border border-[var(--border)] rounded-lg px-2 py-1.5 text-[10px] font-bold text-[var(--text-secondary)] focus:outline-none focus:ring-2 focus:ring-blue-600/20"
                                  >
                                    {CATEGORIES.map((category) => <option key={category} value={category}>{category}</option>)}
                                  </select>
                                  <button
                                    onClick={() => setExpanded(isExpanded ? null : entry.id)}
                                    className="inline-flex items-center gap-1 text-[10px] font-black uppercase tracking-widest text-[var(--text-muted)] hover:text-blue-500 transition-colors"
                                  >
                                    {isExpanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
                                    {t('wf_showDetails')}
                                  </button>
                                  {entry.repo && (
                                    <a
                                      href={`https://huggingface.co/${entry.repo}`}
                                      target="_blank"
                                      rel="noreferrer"
                                      className="inline-flex items-center gap-1 text-[10px] font-black uppercase tracking-widest text-[var(--text-muted)] hover:text-blue-500 transition-colors"
                                    >
                                      <ExternalLink size={12} /> HF
                                    </a>
                                  )}
                                </div>
                                {isExpanded && (
                                  <div className="mt-3 space-y-2">
                                    <p className="text-[10px] text-[var(--text-muted)] font-mono break-all">
                                      {currentTarget || t('wf_statusNoRoot')}
                                    </p>
                                    {entry.status === 'unresolved' && (
                                      <div>
                                        <label className="text-[9px] font-black uppercase tracking-widest text-[var(--text-muted)] block mb-1">
                                          {t('wf_directUrl')}
                                        </label>
                                        <input
                                          defaultValue={entry.url || ''}
                                          onBlur={(event) => setUrlOverride(entry, event.target.value)}
                                          onKeyDown={(event) => { if (event.key === 'Enter') setUrlOverride(entry, (event.target as HTMLInputElement).value); }}
                                          placeholder="https://huggingface.co/.../resolve/main/..."
                                          className="w-full bg-[var(--bg-surface)] border border-[var(--border)] rounded-lg px-3 py-2 text-[10px] font-mono text-[var(--text-primary)] focus:outline-none focus:ring-2 focus:ring-blue-600/20"
                                        />
                                      </div>
                                    )}
                                  </div>
                                )}
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </section>
                ))}
                {groupedEntries.length === 0 && (
                  <p className="text-center py-10 text-sm text-[var(--text-muted)] font-medium">{t('wf_noResults')}</p>
                )}
              </div>

              {draft.warnings.length > 0 && (
                <div className="rounded-2xl border border-amber-500/20 bg-amber-500/5 p-4">
                  <h4 className="text-[10px] font-black uppercase tracking-widest text-amber-500 mb-2 flex items-center gap-2">
                    <Info size={13} /> {t('wf_warnings')}
                  </h4>
                  <ul className="space-y-1">
                    {draft.warnings.map((warning, index) => (
                      <li key={index} className="text-[11px] text-[var(--text-secondary)] font-medium leading-relaxed">• {warning}</li>
                    ))}
                  </ul>
                </div>
              )}

              <div className="rounded-2xl border border-[var(--border)] bg-[var(--bg-input)]/30 p-4">
                <button
                  onClick={() => setShowAdvanced((value) => !value)}
                  className="w-full flex items-center justify-between gap-3 text-[11px] font-black uppercase tracking-widest text-[var(--text-muted)] hover:text-blue-500 transition-colors"
                >
                  <span className="flex items-center gap-2"><Settings2 size={14} /> {t('wf_advanced')}</span>
                  {showAdvanced ? <ChevronDown size={15} /> : <ChevronRight size={15} />}
                </button>
                {showAdvanced && (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
                    <div>
                      <label className="text-[10px] font-black uppercase tracking-widest text-[var(--text-muted)] block mb-2">{t('wf_token')}</label>
                      <input
                        type="password"
                        value={token}
                        onChange={(event) => setToken(event.target.value)}
                        placeholder={config?.hasHfToken ? t('wf_tokenSaved') : 'hf_...'}
                        className="w-full bg-[var(--bg-surface)] border border-[var(--border)] rounded-xl px-4 py-3 text-xs text-[var(--text-primary)] focus:outline-none focus:ring-4 focus:ring-blue-600/10"
                      />
                      <p className="text-[10px] text-[var(--text-muted)] mt-1.5 leading-relaxed">{t('wf_tokenHint')}</p>
                    </div>
                    <div>
                      <label className="text-[10px] font-black uppercase tracking-widest text-[var(--text-muted)] block mb-2">{t('wf_concurrency')}</label>
                      <select
                        value={config?.concurrency || 2}
                        onChange={(event) => updateConcurrency(parseInt(event.target.value, 10))}
                        className="w-full bg-[var(--bg-surface)] border border-[var(--border)] rounded-xl px-4 py-3 text-xs text-[var(--text-primary)] focus:outline-none focus:ring-4 focus:ring-blue-600/10"
                      >
                        {[1, 2, 3, 4].map((value) => <option key={value} value={value}>{value}</option>)}
                      </select>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {(step === 'running' || step === 'done') && job && (
            <div className="space-y-5">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div>
                  <h3 className="text-lg sm:text-xl font-black text-[var(--text-primary)] tracking-tight">
                    {step === 'done' ? t('wf_completeTitle') : t('wf_runningTitle')}
                  </h3>
                  <p className="text-xs text-[var(--text-muted)] font-medium mt-1">
                    {job.title}{job.fileName ? ` · ${job.fileName}` : ''}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  {job.status === 'running' && (
                    <button
                      onClick={cancelJob}
                      disabled={cancelling}
                      className="px-4 py-2.5 rounded-xl border border-red-500/20 bg-red-500/10 text-red-500 text-[10px] font-black uppercase tracking-widest hover:bg-red-500 hover:text-white transition-all disabled:opacity-50"
                    >
                      {cancelling ? t('wf_cancelling') : t('wf_cancel')}
                    </button>
                  )}
                  {step === 'done' && liveSummary.failed > 0 && (
                    <button
                      onClick={retryJob}
                      className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-[10px] font-black uppercase tracking-widest transition-all"
                    >
                      <RotateCcw size={13} /> {t('wf_retry')}
                    </button>
                  )}
                  <button
                    onClick={openRootFolder}
                    className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl border border-[var(--border)] bg-[var(--bg-surface)] text-[var(--text-secondary)] hover:text-blue-500 text-[10px] font-black uppercase tracking-widest transition-all"
                  >
                    <FolderOpen size={13} /> {t('wf_openFolder')}
                  </button>
                </div>
              </div>

              <div className="rounded-2xl border border-[var(--border)] bg-[var(--bg-input)]/30 p-4 sm:p-5">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-[10px] font-black uppercase tracking-widest text-[var(--text-muted)]">{t('wf_overall')}</span>
                  <span className="text-xs font-black text-blue-500">{overall}%</span>
                </div>
                <div className="h-2.5 rounded-full bg-[var(--bg-base)] border border-[var(--border)] overflow-hidden">
                  <motion.div
                    animate={{ width: `${overall}%` }}
                    className={`h-full ${job.status === 'completed' ? 'bg-emerald-500' : 'bg-gradient-to-r from-blue-600 to-indigo-500'}`}
                  />
                </div>
                <div className="flex flex-wrap items-center justify-between gap-2 mt-3 text-[10px] font-bold text-[var(--text-muted)]">
                  <span>{liveSummary.completed + liveSummary.skipped}/{liveSummary.total} · {formatBytes(liveSummary.downloadedBytes)} / {formatBytes(liveSummary.bytes)}</span>
                  <span>{jobStatusLabel(job.status)}</span>
                </div>
              </div>

              {step === 'done' && (
                <div className={`p-4 rounded-2xl border text-xs font-bold flex items-start gap-3 ${
                  liveSummary.failed > 0
                    ? 'border-amber-500/20 bg-amber-500/5 text-amber-500'
                    : 'border-emerald-500/20 bg-emerald-500/5 text-emerald-500'
                }`}>
                  {liveSummary.failed > 0 ? <AlertTriangle size={18} /> : <CheckCircle size={18} />}
                  <span>
                    {t('wf_completeSummary', {
                      ok: liveSummary.completed,
                      failed: liveSummary.failed,
                      skipped: liveSummary.skipped
                    })}
                  </span>
                </div>
              )}

              <div className="space-y-2">
                {entries.map((entry) => (
                  <div key={entry.id} className="p-4 rounded-2xl border border-[var(--border)] bg-[var(--bg-input)]/20">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-xs font-bold text-[var(--text-primary)] break-all">{entry.filename}</p>
                        <p className="text-[10px] text-[var(--text-muted)] font-medium mt-0.5 break-all">{entry.category} · {entry.repo || '—'}</p>
                      </div>
                      <span className={`px-2 py-0.5 rounded-full border text-[9px] font-black uppercase tracking-widest shrink-0 ${statusTone(entry.status)}`}>
                        {statusLabel(entry.status)}
                      </span>
                    </div>
                    <div className="h-1.5 mt-3 rounded-full bg-[var(--bg-base)] overflow-hidden">
                      <div
                        className={`h-full transition-all duration-300 ${entry.status === 'failed' ? 'bg-red-500' : entry.status === 'completed' || entry.status === 'skipped' ? 'bg-emerald-500' : 'bg-blue-500'}`}
                        style={{ width: `${entry.status === 'completed' || entry.status === 'skipped' ? 100 : Math.max(0, Math.min(100, entry.progress || 0))}%` }}
                      />
                    </div>
                    <div className="flex flex-wrap items-center justify-between gap-2 mt-2 text-[10px] font-medium text-[var(--text-muted)]">
                      <span>
                        {entry.totalBytes ? `${formatBytes(entry.downloadedBytes)} / ${formatBytes(entry.totalBytes)}` : formatBytes(entry.size)}
                      </span>
                      <span className="flex items-center gap-2">
                        {entry.status === 'downloading' && <Loader2 size={11} className="animate-spin text-blue-500" />}
                        {entry.status === 'downloading' && entry.speed ? t('wf_speed', { speed: `${formatBytes(entry.speed)}` }) : ''}
                        {entry.progress !== undefined && entry.progress >= 0 && entry.status === 'downloading' ? `${entry.progress}%` : ''}
                      </span>
                    </div>
                    {entry.error && <p className="text-[10px] text-red-400 font-bold mt-1 break-words">{entry.error}</p>}
                  </div>
                ))}
              </div>

              {step === 'done' && (
                <div className="flex flex-wrap items-center justify-end gap-2">
                  <button
                    onClick={() => { onImported?.(); onClose(); }}
                    className="inline-flex items-center gap-2 px-5 py-3 rounded-xl bg-[var(--text-primary)] text-[var(--bg-base)] hover:bg-blue-600 hover:text-white text-[10px] font-black uppercase tracking-widest transition-all"
                  >
                    <ExternalLink size={14} /> {t('wf_viewModels')}
                  </button>
                </div>
              )}
            </div>
          )}
        </div>

        <footer className="p-4 sm:p-6 border-t border-[var(--border)] bg-[var(--bg-surface)] flex items-center justify-between gap-3 flex-wrap">
          <div className="text-[10px] font-bold text-[var(--text-muted)]">
            {step === 'review' && selectedEntries.length > 0
              ? t('wf_selectedSummary', { n: selectedEntries.length, size: formatBytes(selectedBytes) })
              : step === 'running'
                ? job?.status || ''
                : ''}
          </div>
          <div className="flex items-center gap-2">
            {step === 'upload' && (
              <button onClick={onClose} className="px-4 py-2.5 rounded-xl border border-[var(--border)] text-[10px] font-black uppercase tracking-widest text-[var(--text-secondary)] hover:text-[var(--text-primary)]">
                {t('wf_close')}
              </button>
            )}
            {step === 'review' && (
              <>
                <button
                  onClick={() => { setStep('upload'); setError(null); }}
                  className="px-4 py-2.5 rounded-xl border border-[var(--border)] text-[10px] font-black uppercase tracking-widest text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
                >
                  {t('cancel')}
                </button>
                <button
                  onClick={startDownloads}
                  disabled={starting || selectedEntries.length === 0 || !draft?.comfy.root}
                  className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 disabled:opacity-40 disabled:cursor-not-allowed text-white text-[10px] font-black uppercase tracking-widest transition-all active:scale-95"
                >
                  {starting ? <Loader2 size={14} className="animate-spin" /> : <Download size={14} />}
                  {starting ? t('wf_starting') : t('wf_start')}
                </button>
              </>
            )}
            {step === 'done' && (
              <button
                onClick={resetState}
                className="px-4 py-2.5 rounded-xl border border-[var(--border)] text-[10px] font-black uppercase tracking-widest text-[var(--text-secondary)] hover:text-blue-500"
              >
                {t('wf_newImport')}
              </button>
            )}
          </div>
        </footer>
      </motion.div>
    </div>
  );
}
