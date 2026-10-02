import { useState, useEffect, useRef, useMemo } from 'react';
import { Search, Download, Star, Zap, CheckCircle, AlertTriangle, XCircle, Image as ImageIcon, MessageSquare, Brain, Clock, TrendingUp, Monitor, Calendar, User, FileText, Shield, X, SlidersHorizontal, ExternalLink, HardDrive, RotateCcw } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { io } from 'socket.io-client';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { useApp } from '../context/AppContext';


const socket = io();

interface RegistryModel {
  name: string;
  provider: string;
  parameter_count: string;
  parameters_raw: number;
  min_vram_gb: number;
  recommended_ram_gb: number;
  use_case: string;
  hf_downloads: number;
  hf_likes: number;
  pipeline_tag: string;
  description?: string;
  release_date?: string;
  updated_at?: string;
  author?: string;
  license?: string;
  gguf_sources?: any[];
  ollama_name?: string;
  hf_tags?: string[];
  hf_library?: string | null;
  params_estimated?: boolean;
  file_size_gb?: number;
  quantization?: string;
  context_length?: number;
  from_live?: boolean;
}

interface HfGgufFile {
  file: string;
  name: string;
  size: number;
  quant: string | null;
  isShard: boolean;
  isAux?: boolean;
  url: string;
}

interface HfDetail {
  id: string;
  name: string;
  provider: string;
  author: string;
  pipeline_tag: string;
  library: string | null;
  license: string | null;
  base_model: string | null;
  downloads: number;
  likes: number;
  created: string | null;
  lastModified: string | null;
  tags: string[];
  parameter_count: string;
  parameters_raw: number;
  quantization: string;
  min_vram_gb: number;
  file_size_gb: number;
  context_length: number | null;
  architecture: string | null;
  gguf_files: HfGgufFile[];
  description: string;
  hf_url: string;
}

type SortOption = 'Popular' | 'Newest' | 'Best Fit';

interface HFLiveResult {
  id: string;
  name: string;
  provider: string;
  pipeline_tag: string;
  hf_downloads: number;
  hf_likes: number;
  has_gguf: boolean;
  updated_at: string | null;
}

const CONTAINER_VARIANTS = {
  hidden: { opacity: 0 },
  visible: { 
    opacity: 1,
    transition: { staggerChildren: 0.05 }
  }
};

const ITEM_VARIANTS = {
  hidden: { opacity: 0, y: 20 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.4, ease: [0.22, 1, 0.36, 1] as [number, number, number, number] } }
};

const PAGE_VARIANTS = {
  initial: { opacity: 0, y: 10 },
  animate: { opacity: 1, y: 0, transition: { duration: 0.6, ease: [0.22, 1, 0.36, 1] as [number, number, number, number] } },
  exit: { opacity: 0, y: -10, transition: { duration: 0.3 } }
};

export default function ExploreStore() {
  const { t } = useApp();
  const [sysInfo, setSysInfo] = useState<any>(null);
  const [registry, setRegistry] = useState<RegistryModel[]>([]);
  const [localModels, setLocalModels] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [activeFilter, setActiveFilter] = useState('All');
  const [activeSort, setActiveSort] = useState<SortOption>('Best Fit');
  const [downloadingModel, setDownloadingModel] = useState<string | null>(null);
  const downloadingModelRef = useRef<string | null>(null);
  const [downloadStatus, setDownloadStatus] = useState<string>('');
  const [downloadProgress, setDownloadProgress] = useState<Record<string, number>>({});
  const [selectedModel, setSelectedModel] = useState<RegistryModel | null>(null);
  const [liveResults, setLiveResults] = useState<HFLiveResult[]>([]);
  const [liveLoading, setLiveLoading] = useState(false);
  const [visibleCount, setVisibleCount] = useState(24);
  const [customUrl, setCustomUrl] = useState('');
  const [customUrlError, setCustomUrlError] = useState('');
  const [refreshing, setRefreshing] = useState(false);
  const [refreshMsg, setRefreshMsg] = useState('');
  const [showFacets, setShowFacets] = useState(false);
  const [facets, setFacets] = useState<Record<string, string>>({});
  const [detail, setDetail] = useState<HfDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState('');

  const setDownloadingModelSync = (val: string | null) => {
    downloadingModelRef.current = val;
    setDownloadingModel(val);
  };

  const loadRegistry = async () => {
    try {
      const res = await fetch('/api/registry', { cache: 'no-store' });
      const data = await res.json();
      if (Array.isArray(data)) setRegistry(data);
    } catch {}
  };

  const handleRefresh = async () => {
    setRefreshing(true);
    setRefreshMsg('');
    try {
      const res = await fetch('/api/registry/refresh', { cache: 'no-store' });
      const data = await res.json();
      await loadRegistry();
      if (data.success) {
        setRefreshMsg(data.added > 0 ? `+${data.added} novos modelos adicionados` : 'Catálogo já atualizado');
      } else {
        setRefreshMsg(data.error || 'Erro ao atualizar');
      }
    } catch {
      setRefreshMsg('Erro ao atualizar catálogo');
    }
    setRefreshing(false);
    setTimeout(() => setRefreshMsg(''), 4000);
  };

  const handleAddToRegistry = async (item: HFLiveResult) => {
    try {
      const res = await fetch('/api/registry/add', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: item.id,
          pipeline_tag: item.pipeline_tag,
          hf_downloads: item.hf_downloads,
          hf_likes: item.hf_likes,
          has_gguf: item.has_gguf
        })
      });
      const data = await res.json();
      await loadRegistry();
      setSearch(item.name.split('/').pop() || '');
      if (data.message) setRefreshMsg(data.message);
      setTimeout(() => setRefreshMsg(''), 4000);
    } catch {}
  };

  useEffect(() => {
    const fetchLocalModels = () => {
      fetch('/api/models').then(res => res.json()).then(setLocalModels);
    };

    Promise.all([
      fetch('/api/registry').then(res => res.json()),
      fetch('/api/models').then(res => res.json()),
      fetch('/api/system-info').then(res => res.json())
    ]).then(([registryData, modelsData, sysData]) => {
      setRegistry(registryData);
      setLocalModels(modelsData);
      setSysInfo(sysData);
      setLoading(false);
    }).catch(() => setLoading(false));

    // Auto-refresh registry em background (10 min) — novos modelos entram sozinhos
    const refreshRegistry = async () => {
      try {
        await fetch('/api/registry/refresh', { cache: 'no-store' });
        await loadRegistry();
      } catch {}
    };
    const registryRefreshId = setInterval(refreshRegistry, 600000);
    refreshRegistry();

    socket.on('models-updated', () => {
      fetchLocalModels();
    });

    return () => {
      socket.off('models-updated');
      clearInterval(registryRefreshId);
    };
  }, []);

  const filters = ['All', 'Chat', 'Coding', 'Image', 'Reasoning', 'Vision'];

  // --- Filtros no estilo HuggingFace (Tasks / Libraries / Apps / Inference Providers / Hardware / Parameters) ---
  const LIBRARY_TAGS = ['transformers', 'pytorch', 'tensorflow', 'jax', 'diffusers', 'gguf', 'mlx', 'safetensors', 'keras', 'flax', 'onnx', 'openvino', 'ctranslate2', 'spacy', 'allennlp', 'sentence-transformers', 'timm', 'fastai', 'peft', 'tokenizers', 'accelerate', 'bitsandbytes'];
  const APP_TAGS = ['vllm', 'llamacpp', 'llama.cpp', 'ollama', 'mlx-lm', 'lmstudio', 'jan', 'drawthings', 'tgi', 'text-generation-inference', 'sglang', 'exllama', 'koboldcpp', 'ctransformers', 'tensorrt-llm', 'onnxruntime-genai', 'gptq', 'awq'];
  const PROVIDER_TAGS = ['groq', 'novita', 'cerebras', 'nscale', 'fal', 'together', 'together-ai', 'fireworks', 'featherless', 'baseten', 'deepinfra', 'replicate', 'sambanova', 'reka', 'writer', 'xinference'];
  const HARDWARE_TAGS = ['rtx', 'cuda', 'ampere', 'ada', 'hopper', 'a100', 'h100', 'l40s', 'l4', 't4', 'v100', 'gpu', 'rtx-4070-ti-super'];

  const TASK_LABELS: Record<string, string> = {
    'text-generation': 'Text Generation',
    'any-to-any': 'Any-to-Any',
    'image-text-to-text': 'Image-Text-to-Text',
    'image-to-text': 'Image-to-Text',
    'image-to-image': 'Image-to-Image',
    'text-to-image': 'Text-to-Image',
    'text-to-video': 'Text-to-Video',
    'text-to-speech': 'Text-to-Speech',
    'automatic-speech-recognition': 'Automatic Speech Recognition',
    'question-answering': 'Question Answering',
    'fill-mask': 'Fill-Mask',
    'feature-extraction': 'Feature Extraction',
    'sentence-similarity': 'Sentence Similarity',
    'image-classification': 'Image Classification',
    'object-detection': 'Object Detection',
    'image-segmentation': 'Image Segmentation',
    'zero-shot-classification': 'Zero-Shot Classification',
    'summarization': 'Summarization',
    'translation': 'Translation',
    'audio-classification': 'Audio Classification',
    'reinforcement-learning': 'Reinforcement Learning',
    'text-classification': 'Text Classification',
    'token-classification': 'Token Classification'
  };

  const parseParamLabel = (label: string | undefined): number | null => {
    if (!label) return null;
    const m = String(label).match(/(\d+(?:\.\d+)?)\s*([BbMm])/);
    if (!m) return null;
    const n = parseFloat(m[1]);
    return m[2] === 'M' ? n / 1000 : n;
  };

  const paramBucket = (b: number) => b < 1 ? '<1B' : b < 3 ? '1B–3B' : b < 7 ? '3B–7B' : b < 13 ? '7B–13B' : b < 30 ? '13B–30B' : b < 70 ? '30B–70B' : '70B+';

  // Remove HTML cru (ex.: <div>, <p style="...">, <strong>) que alguns READMEs do HF contêm,
  // convertendo blocos em quebras de linha para o texto ficar legível sem tags.
  const cleanReadme = (md: string): string => {
    let s = String(md || '');
    s = s
      // front matter YAML do HF (--- language: ... ---) — o HF não o mostra
      .replace(/^---[\s\S]*?---\s*/, '')
      .replace(/<\/(p|div|h[1-6]|li|ul|ol|table|tr|td|th|blockquote|pre|section|article|details|summary)>/gi, '\n')
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<li[^>]*>/gi, '\n- ')
      .replace(/<h([1-6])[^>]*>/gi, (_m, n: string) => '\n' + '#'.repeat(Number(n)) + ' ')
      .replace(/<td[^>]*>/gi, ' | ')
      .replace(/<\/?tr[^>]*>/gi, '\n')
      .replace(/<[^>]+>/g, '')
      .replace(/&nbsp;/gi, ' ')
      .replace(/&amp;/gi, '&')
      .replace(/&lt;/gi, '<')
      .replace(/&gt;/gi, '>')
      .replace(/&quot;/gi, '"')
      .replace(/&#39;/gi, "'")
      .replace(/&mdash;/gi, '—')
      .replace(/&ndash;/gi, '–')
      .replace(/&hellip;/gi, '…')
      .replace(/&#(\d+);/g, (_m, n: string) => String.fromCharCode(Number(n)))
      .replace(/\n{3,}/g, '\n\n')
      .trim();
    return s;
  };

  const facetOptions = useMemo(() => {
    const count = (map: Map<string, number>, key: string) => { if (key) map.set(key, (map.get(key) || 0) + 1); };
    const tasks = new Map<string, number>();
    const libraries = new Map<string, number>();
    const apps = new Map<string, number>();
    const providers = new Map<string, number>();
    const hardware = new Map<string, number>();
    const params = new Map<string, number>();

    for (const m of registry) {
      if (m.pipeline_tag && m.pipeline_tag !== 'unknown') count(tasks, m.pipeline_tag);
      if (m.hf_library) count(libraries, m.hf_library.toLowerCase());
      const tags = (m.hf_tags || []).map(t => String(t).toLowerCase());
      for (const t of tags) {
        if (LIBRARY_TAGS.includes(t)) count(libraries, t);
        if (APP_TAGS.includes(t)) count(apps, t);
        if (PROVIDER_TAGS.includes(t)) count(providers, t);
        if (HARDWARE_TAGS.includes(t)) count(hardware, t);
      }
      const pb = parseParamLabel(m.parameter_count);
      if (pb) count(params, paramBucket(pb));
    }
    const toOpts = (map: Map<string, number>) => [...map.entries()].sort((a, b) => b[1] - a[1]).map(([key, c]) => ({ key, label: key, count: c }));
    return {
      tasks: toOpts(tasks).map(o => ({ ...o, label: TASK_LABELS[o.key] || o.key })),
      libraries: toOpts(libraries),
      apps: toOpts(apps),
      providers: toOpts(providers),
      hardware: toOpts(hardware),
      params: toOpts(params)
    };
  }, [registry]);

  const activeFacetCount = Object.values(facets).filter(Boolean).length;

  const setFacet = (key: string, val: string) => {
    setFacets(f => {
      const next = { ...f };
      if (val) next[key] = val; else delete next[key];
      return next;
    });
  };

  const clearFacets = () => setFacets({});

  const openModelDetail = (model: RegistryModel) => {
    setSelectedModel(model);
    setDetail(null);
    setDetailError('');
    setDetailLoading(true);
    const repo = model.gguf_sources?.[0]?.repo || model.name;
    fetch(`/api/models/hf/detail?repo=${encodeURIComponent(repo)}`, { cache: 'no-store' })
      .then(r => r.json())
      .then(d => { if (d && d.error) setDetailError(d.error); else setDetail(d); })
      .catch(() => setDetailError('Erro ao carregar detalhes do HuggingFace'))
      .finally(() => setDetailLoading(false));
  };

  const openLiveDetail = (item: HFLiveResult) => {
    openModelDetail({
      name: item.id,
      provider: item.provider,
      parameter_count: '?',
      parameters_raw: 0,
      min_vram_gb: 0,
      recommended_ram_gb: 0,
      use_case: item.pipeline_tag || 'General purpose',
      hf_downloads: item.hf_downloads,
      hf_likes: item.hf_likes,
      pipeline_tag: item.pipeline_tag || 'text-generation',
      gguf_sources: item.has_gguf ? [{ repo: item.id, provider: item.provider }] : [],
      from_live: true
    });
  };

  const handleInstallHFFile = async (model: RegistryModel, file: string) => {
    const repo = model.gguf_sources?.[0]?.repo || model.name;
    setDownloadingModelSync(model.name);
    setDownloadStatus(t('loading'));
    try {
      const res = await fetch('/api/download/hf', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ repo, modelName: model.name, file })
      });
      const data = await res.json();
      if (data.error) {
        setDownloadStatus(`Erro: ${data.error}`);
        setTimeout(() => setDownloadingModelSync(null), 4000);
        return;
      }
      setDownloadStatus(`${t('hub_installing')} (${data.file})`);
    } catch {
      setDownloadStatus(t('error'));
      setTimeout(() => setDownloadingModelSync(null), 3000);
    }
  };

  const getFitScore = (model: RegistryModel) => {
    if (!sysInfo) return 0;
    // VRAM desconhecida (modelo vindo do refresh ao vivo) → neutro, sem badge
    if (!model.min_vram_gb || model.min_vram_gb <= 0) return 0;
    const vramGB = sysInfo.vram / (1024 ** 3);
    const totalRamGB = sysInfo.totalRam / (1024 ** 3);
    
    if (model.min_vram_gb <= vramGB * 0.95) return 3; // Perfect
    if (model.min_vram_gb <= (vramGB + totalRamGB * 0.5)) return 2; // Marginal
    return 1; // Too large
  };

  const filteredModels = useMemo(() => {
    let list = registry.filter(reg => {
      return !localModels.some(loc => {
        if (loc.ollamaTag && reg.gguf_sources?.[0]?.repo) {
            const tag = loc.ollamaTag.toLowerCase();
            const repo = reg.gguf_sources[0].repo.toLowerCase();
            if (tag.includes(repo)) return true;
        }
        if (loc.repoId && reg.gguf_sources?.[0]?.repo) {
            if (loc.repoId.toLowerCase() === reg.gguf_sources[0].repo.toLowerCase()) return true;
        }
        return loc.name.toLowerCase() === reg.name.toLowerCase();
      });
    });
    
    if (activeFilter !== 'All') {
      const f = activeFilter.toLowerCase();
      list = list.filter(m => {
        const tag = m.pipeline_tag?.toLowerCase() || '';
        const useCase = (m.use_case || '').toLowerCase();
        const name = m.name.toLowerCase();
        
        if (f === 'chat') return useCase.includes('chat') || tag.includes('generation') || name.includes('chat');
        if (f === 'coding') return useCase.includes('coding') || useCase.includes('programming') || name.includes('code') || name.includes('coder');
        if (f === 'image') return tag.includes('image') || tag.includes('diffusion') || name.includes('diffusion') || name.includes('sdxl');
        if (f === 'reasoning') return useCase.includes('reasoning') || useCase.includes('logic') || name.includes('distill') || name.includes('r1');
        if (f === 'vision') return useCase.includes('vision') || tag.includes('vision') || name.includes('vision');
        return true;
      });
    }

    // Filtros estilo HuggingFace
    if (facets.tasks) {
      list = list.filter(m => (m.pipeline_tag || '').toLowerCase() === facets.tasks);
    }
    if (facets.libraries) {
      list = list.filter(m =>
        (m.hf_library || '').toLowerCase() === facets.libraries ||
        (m.hf_tags || []).some(t => String(t).toLowerCase() === facets.libraries)
      );
    }
    if (facets.apps) {
      list = list.filter(m => (m.hf_tags || []).some(t => String(t).toLowerCase() === facets.apps));
    }
    if (facets.providers) {
      list = list.filter(m => (m.hf_tags || []).some(t => String(t).toLowerCase() === facets.providers));
    }
    if (facets.hardware) {
      list = list.filter(m => (m.hf_tags || []).some(t => String(t).toLowerCase() === facets.hardware));
    }
    if (facets.params) {
      list = list.filter(m => {
        const pb = parseParamLabel(m.parameter_count);
        return pb ? paramBucket(pb) === facets.params : false;
      });
    }

    if (search) {
      const s = search.toLowerCase();
      list = list.filter(m => m.name.toLowerCase().includes(s) || m.provider.toLowerCase().includes(s));
    }

    list.sort((a, b) => {
      if (activeSort === 'Popular') return (b.hf_downloads || 0) - (a.hf_downloads || 0);
      if (activeSort === 'Newest') return new Date(b.release_date || 0).getTime() - new Date(a.release_date || 0).getTime();
      if (activeSort === 'Best Fit') {
        const fitA = getFitScore(a);
        const fitB = getFitScore(b);
        if (fitA !== fitB) return fitB - fitA;
        return (b.hf_downloads || 0) - (a.hf_downloads || 0);
      }
      return 0;
    });

    return list;
  }, [registry, localModels, search, activeFilter, activeSort, sysInfo, facets]);

  const handleInstallHF = async (model: RegistryModel) => {
    if (!model.gguf_sources?.length) return;
    const repo = model.gguf_sources[0].repo;
    setDownloadingModelSync(model.name);
    setDownloadStatus(t('loading'));
    try {
      const res = await fetch('/api/download/hf', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ repo, modelName: model.name })
      });
      const data = await res.json();
      if (data.error) {
        setDownloadStatus(`Erro: ${data.error}`);
        setTimeout(() => setDownloadingModelSync(null), 4000);
        return;
      }
      setDownloadStatus(`${t('hub_installing')} (${data.file})`);
    } catch {
      setDownloadStatus(t('error'));
      setTimeout(() => setDownloadingModelSync(null), 3000);
    }
  };

  const handleInstall = async (model: RegistryModel) => {
    let modelNameForOllama: string;
    if (model.ollama_name) {
      modelNameForOllama = model.ollama_name;
    } else if (model.gguf_sources && model.gguf_sources.length > 0) {
      modelNameForOllama = `hf.co/${model.gguf_sources[0].repo}`;
    } else {
      modelNameForOllama = model.name.split('/').pop() || model.name;
    }

    setDownloadingModelSync(modelNameForOllama);
    setDownloadStatus(t('loading'));
    try {
      const res = await fetch('/api/download', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ modelName: modelNameForOllama })
      });
      const data = await res.json();
      if (data.error) {
        setDownloadStatus(data.error);
        setTimeout(() => setDownloadingModelSync(null), 3000);
        return;
      }
      setDownloadStatus(t('hub_installing'));
    } catch (e) {
      setDownloadStatus(t('error'));
      setTimeout(() => setDownloadingModelSync(null), 3000);
    }
  };

  useEffect(() => {
    const onProgress = (data: any) => {
      if (data.model !== downloadingModelRef.current) return;
      if (data.progress === -1) {
        setDownloadStatus(t('hub_installing'));
      } else if (data.progress >= 0 && data.progress < 100) {
        setDownloadStatus(`${t('hub_installing')} ${data.progress}%`);
        setDownloadProgress(prev => ({ ...prev, [data.model]: data.progress }));
      } else if (data.progress >= 100) {
        setDownloadStatus(t('hub_installed'));
        setDownloadProgress(prev => ({ ...prev, [data.model]: 100 }));
      }
    };

    const onComplete = (data: any) => {
      if (data.model !== downloadingModelRef.current) return;
      if (data.success) {
        setDownloadStatus(t('hub_installed'));
        fetch('/api/models').then(res => res.json()).then(setLocalModels);
      } else if (data.cancelled) {
        setDownloadStatus(t('cancel'));
      } else {
        setDownloadStatus(data.error ? `Erro: ${data.error}` : t('error'));
      }
      const delay = (data.cancelled || !data.success) ? 500 : 3000;
      setTimeout(() => {
        setDownloadingModelSync(null);
        setDownloadStatus('');
        setDownloadProgress(prev => {
          const next = { ...prev };
          delete next[data.model];
          return next;
        });
      }, delay);
    };

    socket.on('download-progress', onProgress);
    socket.on('download-complete', onComplete);

    return () => {
      socket.off('download-progress', onProgress);
      socket.off('download-complete', onComplete);
    };
  }, []);

  useEffect(() => {
    setVisibleCount(24);
    setLiveResults([]);
  }, [search, activeFilter, activeSort, facets]);

  useEffect(() => {
    if (search.length < 3 || filteredModels.length >= 3) {
      setLiveResults([]);
      setLiveLoading(false);
      return;
    }
    setLiveLoading(true);
    const timer = setTimeout(async () => {
      try {
        const res = await fetch(`/api/search/hf?q=${encodeURIComponent(search)}&limit=12`);
        const data = await res.json();
        setLiveResults(data);
      } catch {}
      setLiveLoading(false);
    }, 600);
    return () => clearTimeout(timer);
  }, [search, filteredModels.length]);

  const handleInstallLive = async (item: HFLiveResult, useGGUF: boolean) => {
    if (useGGUF) {
      await handleInstallHF({ gguf_sources: [{ repo: item.id }], name: item.id } as any);
    } else {
      const ollamaName = `hf.co/${item.id}`;
      setDownloadingModelSync(ollamaName);
      setDownloadStatus(t('loading'));
      try {
        const res = await fetch('/api/download', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ modelName: ollamaName })
        });
        const data = await res.json();
        if (data.error) {
          setDownloadStatus(data.error);
          setTimeout(() => setDownloadingModelSync(null), 3000);
        } else {
          setDownloadStatus(t('hub_installing'));
        }
      } catch {
        setDownloadStatus(t('error'));
        setTimeout(() => setDownloadingModelSync(null), 3000);
      }
    }
  };

  const handleCustomUrl = async () => {
    const match = customUrl.match(/huggingface\.co\/([^/\s?#]+\/[^/\s?#]+)/);
    if (!match) {
      setCustomUrlError('URL inválida. Formato: https://huggingface.co/org/repo');
      return;
    }
    const repo = match[1];
    const modelName = repo.split('/').pop() || repo;
    setCustomUrlError('');
    try {
      const res = await fetch('/api/download/hf', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ repo, modelName })
      });
      const data = await res.json();
      if (data.error) {
        setCustomUrlError(data.error);
      } else {
        setCustomUrl('');
      }
    } catch {
      setCustomUrlError('Erro ao iniciar download');
    }
  };

  if (loading) return <div className="p-12 md:p-20 text-center animate-pulse text-[var(--text-secondary)] font-black uppercase tracking-widest text-xs">{t('loading')}</div>;

  return (
    <motion.div 
      variants={PAGE_VARIANTS}
      initial="initial"
      animate="animate"
      exit="exit"
      className="p-4 sm:p-6 md:p-12 lg:p-16 max-w-[100rem] mx-auto pb-20"
    >
      <header className="mb-8 md:mb-16">
        <div className="flex justify-between items-start mb-6 md:mb-12 gap-4 md:gap-10 flex-wrap">
          <div className="space-y-4 flex-1">
            <h2 className="text-2xl md:text-4xl xl:text-6xl font-black text-[var(--text-primary)] tracking-tighter leading-none uppercase flex items-center gap-4 md:gap-6 break-words">
              {t('hub_title')}
              <div className="w-2 h-2 rounded-full bg-blue-500 animate-pulse" />
            </h2>
            <p className="text-[var(--text-secondary)] text-lg md:text-2xl font-medium max-w-2xl opacity-80 leading-relaxed">{t('hub_subtitle')}</p>
          </div>
          <div className="card-premium py-4 px-6 md:py-6 md:px-10 flex items-center gap-6 md:gap-10 shadow-premium backdrop-blur-3xl shrink-0 flex-wrap">
             <div className="flex flex-col">
                <span className="text-xs md:text-sm font-black text-[var(--text-muted)] uppercase tracking-widest mb-1">{t('hub_gpu')}</span>
                <span className="text-lg font-black text-[var(--text-primary)] tracking-tighter uppercase">{sysInfo?.gpuName || 'Detecting...'}</span>
             </div>
             <div className="h-12 w-px bg-[var(--border)]"></div>
             <div className="flex flex-col">
                <span className="text-xs md:text-sm font-black text-[var(--text-muted)] uppercase tracking-widest mb-1">{t('hub_vram')}</span>
                <span className="text-3xl font-black text-blue-500 tracking-tighter leading-none">
                   {sysInfo ? `${(sysInfo.vram / (1024 ** 3)).toFixed(1)} GB` : '--'}
                </span>
             </div>
          </div>
        </div>

        <div className="flex flex-col xl:flex-row gap-8 items-stretch xl:items-center">
          <div className="relative flex-1 group">
            <Search className="absolute left-6 top-1/2 -translate-y-1/2 text-[var(--text-muted)] group-focus-within:text-blue-500 transition-colors" size={20} />
            <input 
              type="text" 
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={t('hub_search')} 
              className="w-full bg-[var(--bg-surface)] border border-[var(--border)] rounded-[2rem] py-3 md:py-5 pl-14 md:pl-16 pr-6 md:pr-8 text-sm md:text-base text-[var(--text-primary)] focus:outline-none focus:ring-4 focus:ring-blue-600/10 transition-all shadow-xl font-medium"
            />
          </div>
          
          <div className="grid grid-cols-2 sm:flex sm:flex-row bg-[var(--bg-input)] p-2 rounded-[2rem] border border-[var(--border)] shadow-inner w-full xl:w-fit gap-2">
            {filters.map(f => (
              <button
                key={f}
                onClick={() => setActiveFilter(f)}
                className={`px-3 py-2.5 md:px-5 md:py-3 xl:px-8 xl:py-4 rounded-[1.5rem] text-xs md:text-sm font-black uppercase tracking-widest transition-all active:scale-95 flex-1 sm:flex-none justify-center ${
                  activeFilter === f ? 'bg-blue-600 text-white shadow-xl shadow-blue-600/30' : 'text-[var(--text-muted)] hover:text-[var(--text-primary)]'
                }`}
              >
                {f}
              </button>
            ))}
            <button
              onClick={handleRefresh}
              disabled={refreshing}
              className="px-4 py-2 rounded-[1.5rem] text-xs font-black uppercase tracking-widest transition-all bg-[var(--primary)] text-white hover:bg-blue-600/90 disabled:opacity-50"
              title="Atualizar catálogo do HuggingFace"
            >
              {refreshing ? '...' : 'Atualizar'}
            </button>
          </div>
          {refreshMsg && (
            <p className="text-xs font-black text-blue-500 uppercase tracking-widest text-center">{refreshMsg}</p>
          )}

          <div className="grid grid-cols-1 sm:flex sm:flex-row items-center gap-2 bg-[var(--bg-input)] p-2 rounded-[2rem] border border-[var(--border)] shadow-inner w-full xl:w-fit">
             {(['Best Fit', 'Popular', 'Newest'] as SortOption[]).map(s => (
                <button
                 key={s}
                 onClick={() => setActiveSort(s)}
                 className={`px-3 py-2.5 md:px-5 md:py-3 xl:px-6 xl:py-4 rounded-[1.5rem] text-xs md:text-sm font-black uppercase tracking-widest flex items-center gap-3 transition-all active:scale-95 flex-1 sm:flex-none justify-center ${
                   activeSort === s ? 'bg-[var(--bg-surface)] text-[var(--text-primary)] shadow-lg' : 'text-[var(--text-muted)] hover:text-[var(--text-primary)]'
                 }`}
                >
                  {s === 'Popular' && <TrendingUp size={14} className="shrink-0" />}
                  {s === 'Newest' && <Clock size={14} className="shrink-0" />}
                  {s === 'Best Fit' && <Zap size={14} className="shrink-0" />}
                  <span className="truncate">{s}</span>
                </button>
             ))}
          </div>
        </div>

        {/* Filtros estilo HuggingFace */}
        <div className="mt-6 md:mt-10">
          <div className="flex items-center gap-4 flex-wrap">
            <button
              onClick={() => setShowFacets(!showFacets)}
              className={`px-5 py-3 rounded-[1.5rem] text-xs font-black uppercase tracking-widest transition-all active:scale-95 flex items-center gap-2.5 border ${
                showFacets || activeFacetCount > 0 ? 'bg-blue-600 text-white border-blue-500 shadow-xl shadow-blue-600/30' : 'bg-[var(--bg-input)] text-[var(--text-muted)] border-[var(--border)] hover:text-[var(--text-primary)]'
              }`}
            >
              <SlidersHorizontal size={15} />
              Filtros HuggingFace
              {activeFacetCount > 0 && (
                <span className="bg-white/20 px-2 py-0.5 rounded-full text-[10px]">{activeFacetCount}</span>
              )}
            </button>
            {activeFacetCount > 0 && (
              <>
                <button
                  onClick={clearFacets}
                  className="px-4 py-3 rounded-[1.5rem] text-xs font-black uppercase tracking-widest text-red-400 hover:text-red-300 bg-red-500/10 border border-red-500/20 transition-all flex items-center gap-2"
                >
                  <RotateCcw size={13} /> Limpar filtros
                </button>
                <span className="text-xs font-black text-[var(--text-muted)] uppercase tracking-widest">
                  {filteredModels.length} modelos
                </span>
              </>
            )}
          </div>

          <AnimatePresence initial={false}>
            {showFacets && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: 'auto', opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{ duration: 0.3 }}
                className="overflow-hidden"
              >
                <div className="mt-4 grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                  {([
                    { key: 'tasks', label: 'Tasks' },
                    { key: 'libraries', label: 'Libraries' },
                    { key: 'apps', label: 'Apps' },
                    { key: 'providers', label: 'Inference Providers' },
                    { key: 'hardware', label: 'Hardware' },
                    { key: 'params', label: 'Parameters' }
                  ] as { key: keyof typeof facetOptions; label: string }[]).map(sec => {
                    const opts = facetOptions[sec.key];
                    if (!opts.length) return null;
                    const active = facets[sec.key];
                    return (
                      <div key={sec.key} className="bg-[var(--bg-input)]/40 border border-[var(--border)] rounded-[1.5rem] p-4 sm:p-5 shadow-inner">
                        <div className="flex items-center justify-between mb-3 gap-3">
                          <span className="text-xs font-black text-[var(--text-muted)] uppercase tracking-widest">{sec.label}</span>
                          {active && (
                            <button
                              onClick={() => setFacet(sec.key, '')}
                              className="text-[10px] font-black uppercase tracking-widest text-red-400 hover:text-red-300 flex items-center gap-1"
                            >
                              <X size={11} /> {opts.find(o => o.key === active)?.label}
                            </button>
                          )}
                        </div>
                        <div className="flex flex-wrap gap-2">
                          {opts.map(o => {
                            const isActive = active === o.key;
                            return (
                              <button
                                key={o.key}
                                onClick={() => setFacet(sec.key, isActive ? '' : o.key)}
                                title={o.label}
                                className={`px-3 py-1.5 rounded-full text-[11px] font-black uppercase tracking-wider border transition-all active:scale-95 ${
                                  isActive
                                    ? 'bg-blue-600 text-white border-blue-500 shadow-lg shadow-blue-600/30'
                                    : 'bg-[var(--bg-surface)] text-[var(--text-secondary)] border-[var(--border)] hover:border-blue-500/50 hover:text-[var(--text-primary)]'
                                }`}
                              >
                                {o.label} <span className={isActive ? 'opacity-80' : 'text-[var(--text-muted)]'}>{o.count}</span>
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </header>

      <motion.div 
        variants={CONTAINER_VARIANTS}
        initial="hidden"
        animate="visible"
        className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4 sm:gap-6 md:gap-10 mb-20"
      >
        {filteredModels.slice(0, visibleCount).map((model) => {
          const score = getFitScore(model);
          const ollamaTarget = model.ollama_name || (model.gguf_sources?.length ? `hf.co/${model.gguf_sources[0].repo}` : (model.name.split('/').pop() || model.name));
          const isDownloading = downloadingModel === model.name || downloadingModel === ollamaTarget;
          const hasGGUF = !!(model.gguf_sources?.length);
          const hasOllama = !!model.ollama_name;
          const progressVal = downloadProgress[model.name] ?? downloadProgress[ollamaTarget] ?? 0;

          return (
            <motion.div 
              key={model.name} 
              variants={ITEM_VARIANTS}
              onClick={() => openModelDetail(model)}
              className="bg-[var(--bg-input)]/40 border border-[var(--border)] rounded-[1.5rem] sm:rounded-[2rem] md:rounded-[3rem] p-5 sm:p-7 md:p-10 flex flex-col hover:border-blue-500/50 transition-all group backdrop-blur-3xl hover:shadow-2xl relative overflow-hidden cursor-pointer active:scale-[0.98] shadow-sm min-h-[360px] sm:min-h-[420px] md:min-h-[480px]"
            >
              <div className={`absolute -top-32 -right-32 w-80 h-80 rounded-full blur-[100px] opacity-0 group-hover:opacity-10 transition-all duration-700 ${
                score === 3 ? 'bg-emerald-500' : score === 2 ? 'bg-amber-500' : 'bg-red-500'
              }`} />

              <div className="flex justify-between items-start mb-10 relative z-10">
                <div className="w-16 h-16 rounded-2xl flex items-center justify-center text-white bg-[var(--bg-surface)] border border-[var(--border)] shadow-xl transition-transform duration-500 group-hover:scale-110 group-hover:rotate-6">
                  {model.pipeline_tag?.includes('image') ? <ImageIcon size={28} className="text-rose-400" /> :
                   model.pipeline_tag?.includes('text') ? <MessageSquare size={28} className="text-blue-400" /> :
                   <Brain size={28} className="text-purple-400" /> }
                </div>
                {score === 3 ? (
                  <div className="flex items-center gap-2 text-emerald-500 text-xs font-black uppercase tracking-widest bg-emerald-500/10 px-4 py-2 rounded-full border border-emerald-500/20 shadow-sm">
                    <CheckCircle size={14} /> {t('hub_perfectFit')}
                  </div>
                ) : score === 2 ? (
                  <div className="flex items-center gap-2 text-amber-500 text-xs font-black uppercase tracking-widest bg-amber-500/10 px-4 py-2 rounded-full border border-amber-500/20 shadow-sm">
                    <AlertTriangle size={14} /> {t('hub_needsRam')}
                  </div>
                ) : score === 1 ? (
                  <div className="flex items-center gap-2 text-red-500 text-xs font-black uppercase tracking-widest bg-red-500/10 px-4 py-2 rounded-full border border-red-500/20 shadow-sm">
                    <XCircle size={14} /> {t('hub_tooLarge')}
                  </div>
                ) : (
                  <div className="flex items-center gap-2 text-[var(--text-muted)] text-xs font-black uppercase tracking-widest bg-[var(--bg-surface)] px-4 py-2 rounded-full border border-[var(--border)] shadow-sm">
                    <Zap size={14} /> Novo no HF
                  </div>
                )}
              </div>

              <div className="flex-1 relative z-10 min-w-0">
                <div className="flex items-center gap-3 mb-3 flex-wrap">
                  <span className="text-xs md:text-sm font-black text-[var(--text-muted)] uppercase tracking-widest">{model.provider}</span>
                  <span className="w-1 h-1 rounded-full bg-[var(--border)]"></span>
                  <span className="text-xs md:text-sm font-black text-blue-500 uppercase tracking-widest">{model.parameter_count}</span>
                </div>
                <h4 className="text-xl md:text-2xl lg:text-3xl font-black text-[var(--text-primary)] mb-4 group-hover:text-blue-500 transition-colors tracking-tighter uppercase break-words line-clamp-3">{model.name.split('/').pop()}</h4>
                <p className="text-[var(--text-secondary)] text-base font-medium leading-relaxed mb-8 line-clamp-2 opacity-70">{model.use_case}</p>
                
                <div className="flex gap-4 mb-8 flex-wrap">
                   <div className="bg-[var(--bg-surface)] px-4 py-2 rounded-2xl border border-[var(--border)] flex items-center gap-3 shadow-inner">
                      <Download size={14} className="text-blue-500" />
                      <span className="text-xs font-black text-[var(--text-secondary)]">{(model.hf_downloads / 1000).toFixed(0)}k</span>
                   </div>
                   <div className="bg-[var(--bg-surface)] px-4 py-2 rounded-2xl border border-[var(--border)] flex items-center gap-3 shadow-inner">
                      <Star size={14} className="text-yellow-500 fill-current" />
                      <span className="text-xs font-black text-[var(--text-secondary)]">{model.hf_likes || 0}</span>
                   </div>
                   {model.file_size_gb ? (
                     <div className="bg-[var(--bg-surface)] px-4 py-2 rounded-2xl border border-[var(--border)] flex items-center gap-3 shadow-inner" title="Tamanho do ficheiro GGUF (estimado)">
                       <HardDrive size={14} className="text-purple-500" />
                       <span className="text-xs font-black text-[var(--text-secondary)]">{model.file_size_gb} GB</span>
                     </div>
                   ) : null}
                </div>
              </div>

              <div className="flex items-center justify-between mt-auto relative z-10 gap-6 flex-wrap" onClick={(e) => e.stopPropagation()}>
                <div className="flex flex-col">
                  <span className="text-xs font-black text-[var(--text-muted)] uppercase tracking-widest mb-1">{t('hub_details_vram')}</span>
                  <span className="text-2xl font-black text-[var(--text-primary)] tracking-tighter">{model.min_vram_gb} <span className="text-xs text-[var(--text-secondary)]">GB</span></span>
                </div>
                {isDownloading ? (
                   <div className="flex flex-col gap-2 min-w-[160px]">
                     <div className="text-xs md:text-sm font-black text-blue-500 uppercase bg-blue-500/10 px-5 py-3 rounded-2xl text-center border border-blue-500/20 shadow-xl shadow-blue-500/10 animate-pulse truncate">
                       {downloadStatus}
                     </div>
                     {progressVal > 0 && progressVal < 100 && (
                       <div className="w-full bg-[var(--bg-input)] h-1 rounded-full overflow-hidden p-0.5 border border-[var(--border)]">
                         <div
                           className="h-full bg-gradient-to-r from-blue-500 to-indigo-500 rounded-full transition-all duration-500"
                           style={{ width: `${progressVal}%` }}
                         />
                       </div>
                     )}
                   </div>
                 ) : (
                  <div className="flex gap-3 flex-wrap" onClick={(e) => e.stopPropagation()}>
                    {hasGGUF && (
                      <button
                        onClick={() => handleInstallHF(model)}
                        disabled={score === 1}
                        title="Download GGUF para llama.cpp"
                        className={`btn-premium px-6 py-4 text-xs ${score === 1 ? 'opacity-30 cursor-not-allowed grayscale' : 'bg-emerald-600/20 text-emerald-400 border border-emerald-500/30 hover:bg-emerald-600 hover:text-white'}`}
                      >
                        <Download size={16} />
                        GGUF
                      </button>
                    )}
                    {(hasOllama || !hasGGUF) && (
                      <button
                        onClick={() => handleInstall(model)}
                        disabled={score === 1}
                        title="Baixar via Ollama"
                        className={`btn-premium px-6 py-4 text-xs ${score === 1 ? 'opacity-30 cursor-not-allowed grayscale' : 'bg-[var(--text-primary)] text-[var(--bg-base)] hover:bg-blue-600 hover:text-white'}`}
                      >
                        <Download size={16} />
                        Ollama
                      </button>
                    )}
                  </div>
                )}
              </div>
            </motion.div>
          );
        })}
      </motion.div>

      {filteredModels.length > visibleCount && (
        <div className="flex justify-center mb-16">
          <button
            onClick={() => setVisibleCount(c => c + 24)}
            className="btn-premium px-16 py-6 text-sm font-black uppercase tracking-widest text-[var(--text-secondary)] hover:text-[var(--text-primary)] border border-[var(--border)] hover:border-blue-500/50"
          >
            Mostrar mais ({filteredModels.length - visibleCount} restantes)
          </button>
        </div>
      )}

      {filteredModels.length === 0 && search.length >= 3 && (
        <div className="mb-16">
          {liveLoading ? (
            <div className="text-center py-16 text-[var(--text-muted)] font-black uppercase tracking-widest text-xs animate-pulse">
              Buscando no HuggingFace...
            </div>
          ) : liveResults.length > 0 ? (
            <>
              <div className="flex items-center gap-4 mb-10">
                <span className="text-xs font-black text-[var(--text-muted)] uppercase tracking-widest">Resultados do HuggingFace</span>
                <div className="flex-1 h-px bg-[var(--border)]" />
                <span className="text-xs font-black text-blue-500 uppercase tracking-widest bg-blue-500/10 px-4 py-2 rounded-full border border-blue-500/20">Live</span>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4 sm:gap-6 md:gap-10">
                {liveResults.map(item => {
                  const isDownloadingLive = downloadingModel === item.id || downloadingModel === `hf.co/${item.id}`;
                  return (
                    <div
                      key={item.id}
                      onClick={() => openLiveDetail(item)}
                      className="bg-[var(--bg-input)]/40 border border-[var(--border)] border-dashed rounded-[1.5rem] sm:rounded-[2rem] md:rounded-[3rem] p-5 sm:p-7 md:p-10 flex flex-col hover:border-blue-500/50 transition-all group backdrop-blur-3xl hover:shadow-2xl relative overflow-hidden cursor-pointer active:scale-[0.98]"
                    >
                      <div className="flex justify-between items-start mb-8">
                        <div className="w-16 h-16 rounded-2xl flex items-center justify-center bg-[var(--bg-surface)] border border-[var(--border)] shadow-xl">
                          {item.pipeline_tag?.includes('image') ? <ImageIcon size={28} className="text-rose-400" /> :
                           item.pipeline_tag?.includes('text') ? <MessageSquare size={28} className="text-blue-400" /> :
                           <Brain size={28} className="text-purple-400" />}
                        </div>
                        <div className="flex items-center gap-2 text-[var(--text-muted)] text-xs font-black uppercase tracking-widest bg-[var(--bg-surface)] px-4 py-2 rounded-full border border-[var(--border)]">
                          HuggingFace
                        </div>
                      </div>
                      <div className="flex-1 min-w-0">
                        <span className="text-xs font-black text-[var(--text-muted)] uppercase tracking-widest block mb-2">{item.provider}</span>
                        <h4 className="text-xl font-black text-[var(--text-primary)] mb-3 tracking-tighter uppercase break-words line-clamp-2">{item.name.split('/').pop()}</h4>
                        <p className="text-[var(--text-muted)] text-xs font-black uppercase tracking-widest mb-6">{item.pipeline_tag}</p>
                        <div className="flex gap-4 mb-8">
                          <div className="bg-[var(--bg-surface)] px-4 py-2 rounded-2xl border border-[var(--border)] flex items-center gap-3 shadow-inner">
                            <Download size={14} className="text-blue-500" />
                            <span className="text-xs font-black text-[var(--text-secondary)]">{(item.hf_downloads / 1000).toFixed(0)}k</span>
                          </div>
                          <div className="bg-[var(--bg-surface)] px-4 py-2 rounded-2xl border border-[var(--border)] flex items-center gap-3 shadow-inner">
                            <Star size={14} className="text-yellow-500 fill-current" />
                            <span className="text-xs font-black text-[var(--text-secondary)]">{item.hf_likes}</span>
                          </div>
                          {item.has_gguf && (
                            <div className="bg-emerald-500/10 px-4 py-2 rounded-2xl border border-emerald-500/20 flex items-center gap-2">
                              <span className="text-xs font-black text-emerald-500">GGUF</span>
                            </div>
                          )}
                        </div>
                      </div>
                      <div className="flex gap-3 flex-wrap mt-auto" onClick={e => e.stopPropagation()}>
                        {isDownloadingLive ? (
                          <div className="text-xs font-black text-blue-500 uppercase bg-blue-500/10 px-5 py-3 rounded-2xl border border-blue-500/20 animate-pulse">
                            {downloadStatus}
                          </div>
                        ) : (
                          <>
                            {item.has_gguf && (
                              <button
                                onClick={() => handleInstallLive(item, true)}
                                className="btn-premium px-6 py-4 text-xs bg-emerald-600/20 text-emerald-400 border border-emerald-500/30 hover:bg-emerald-600 hover:text-white"
                              >
                                <Download size={16} /> GGUF
                              </button>
                            )}
                            <button
                              onClick={() => handleInstallLive(item, false)}
                              className="btn-premium px-6 py-4 text-xs bg-[var(--text-primary)] text-[var(--bg-base)] hover:bg-blue-600 hover:text-white"
                            >
                              <Download size={16} /> Ollama
                            </button>
                            <button
                              onClick={() => handleAddToRegistry(item)}
                              className="btn-premium px-6 py-4 text-xs bg-purple-600/20 text-purple-400 border border-purple-500/30 hover:bg-purple-600 hover:text-white"
                              title="Adicionar ao catálogo para aparecer sempre na lista"
                            >
                              <Star size={16} /> Fixar no catálogo
                            </button>
                          </>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </>
          ) : (
            <div className="text-center py-16 text-[var(--text-muted)] font-black uppercase tracking-widest text-xs">
              Nenhum modelo encontrado para "{search}"
            </div>
          )}
        </div>
      )}

      <AnimatePresence>
        {selectedModel && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setSelectedModel(null)}
             className="fixed inset-0 z-[200] flex items-center justify-center p-3 sm:p-6 md:p-8 bg-black/90 backdrop-blur-xl"
          >
             <motion.div 
               initial={{ scale: 0.95, y: 20 }}
               animate={{ scale: 1, y: 0 }}
               exit={{ scale: 0.95, y: 20 }}
               className="bg-[var(--bg-surface)] border border-[var(--border)] rounded-[2rem] sm:rounded-[3rem] md:rounded-[4rem] w-full max-w-5xl h-[90vh] overflow-y-auto shadow-premium relative custom-scrollbar p-4 sm:p-8 md:p-12 lg:p-20"
             >
                <div className="absolute top-0 right-0 w-full h-96 bg-gradient-to-b from-blue-500/10 to-transparent pointer-events-none" />
                <button 
                  onClick={() => setSelectedModel(null)}
                  className="fixed md:absolute top-4 right-4 sm:top-8 sm:right-8 md:top-12 md:right-12 text-[var(--text-muted)] hover:text-red-500 p-3 md:p-4 bg-[var(--bg-input)] rounded-full transition-all active:scale-90 z-50 border border-[var(--border)]"
                >
                  <X size={32} />
                </button>

                <div className="relative z-10">
                   <div className="flex flex-col md:flex-row items-center gap-6 md:gap-10 mb-8 md:mb-16">
                      <div className="w-28 h-28 rounded-[2.5rem] flex items-center justify-center text-white bg-[var(--bg-input)] border border-[var(--border)] shadow-3xl shrink-0">
                        {(detail?.pipeline_tag || selectedModel.pipeline_tag)?.includes('image') ? <ImageIcon size={56} className="text-rose-400" /> :
                         (detail?.pipeline_tag || selectedModel.pipeline_tag)?.includes('text') ? <MessageSquare size={56} className="text-blue-400" /> :
                         <Brain size={56} className="text-purple-400" />}
                      </div>
                      <div className="text-center md:text-left flex-1 min-w-0">
                         <div className="flex items-center justify-center md:justify-start gap-4 mb-4 flex-wrap">
                            <span className="text-xs font-black text-blue-500 uppercase tracking-wider">{detail?.provider || selectedModel.provider}</span>
                            <span className="w-1.5 h-1.5 rounded-full bg-[var(--border)]"></span>
                            <span className="text-xs font-black text-[var(--text-muted)] uppercase tracking-widest">{detail?.parameter_count || selectedModel.parameter_count || '?'}</span>
                            {detail?.quantization && (
                              <>
                                <span className="w-1.5 h-1.5 rounded-full bg-[var(--border)]"></span>
                                <span className="text-xs font-black text-emerald-500 uppercase tracking-widest">{detail.quantization}</span>
                              </>
                            )}
                         </div>
                         <h3 className="text-2xl sm:text-4xl md:text-5xl lg:text-7xl font-black text-[var(--text-primary)] tracking-tighter leading-[0.9] uppercase break-words">{detail?.name || selectedModel.name.split('/').pop()}</h3>
                         {detail?.base_model && (
                           <p className="text-sm font-black text-[var(--text-muted)] uppercase tracking-widest mt-3">Base model: {detail.base_model}</p>
                         )}
                      </div>
                      <a
                        href={detail?.hf_url || `https://huggingface.co/${selectedModel.name}`}
                        target="_blank"
                        rel="noreferrer"
                        className="btn-premium bg-[var(--bg-input)] text-[var(--text-secondary)] border border-[var(--border)] hover:border-blue-500/50 hover:text-blue-400 px-6 py-4 text-xs shrink-0"
                      >
                        <ExternalLink size={16} /> HuggingFace
                      </a>
                   </div>

                   <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3 sm:gap-4 md:gap-5 mb-10 md:mb-16">
                      <div className="bg-[var(--bg-input)]/50 p-4 sm:p-5 rounded-[1.25rem] border border-[var(--border)] shadow-premium relative overflow-hidden group">
                         <div className="absolute -bottom-4 -right-4 text-blue-500/5 group-hover:scale-110 transition-transform"><Download size={72} /></div>
                         <span className="text-[10px] md:text-xs font-black text-[var(--text-muted)] uppercase tracking-widest mb-3 block">{t('hub_details_downloads')}</span>
                         <span className="text-2xl font-black text-[var(--text-primary)] tracking-tighter">{(((detail?.downloads ?? selectedModel.hf_downloads) || 0) / 1000).toFixed(1)}k</span>
                      </div>
                      <div className="bg-[var(--bg-input)]/50 p-4 sm:p-5 rounded-[1.25rem] border border-[var(--border)] shadow-premium relative overflow-hidden group">
                         <div className="absolute -bottom-4 -right-4 text-yellow-500/5 group-hover:scale-110 transition-transform"><Star size={72} /></div>
                         <span className="text-[10px] md:text-xs font-black text-[var(--text-muted)] uppercase tracking-widest mb-3 block">{t('hub_details_likes')}</span>
                         <span className="text-2xl font-black text-[var(--text-primary)] tracking-tighter">{detail?.likes ?? selectedModel.hf_likes ?? 0}</span>
                      </div>
                      <div className="bg-blue-600/5 p-4 sm:p-5 rounded-[1.25rem] border border-blue-500/20 shadow-premium relative overflow-hidden group">
                         <div className="absolute -bottom-4 -right-4 text-blue-500/10 group-hover:scale-110 transition-transform"><Monitor size={72} /></div>
                         <span className="text-[10px] md:text-xs font-black text-blue-500 uppercase tracking-widest mb-3 block">{t('hub_details_vram')}</span>
                         <span className="text-2xl font-black text-blue-500 tracking-tighter">{detail?.min_vram_gb || selectedModel.min_vram_gb || 0} <span className="text-xs">GB</span></span>
                      </div>
                      <div className="bg-[var(--bg-input)]/50 p-4 sm:p-5 rounded-[1.25rem] border border-[var(--border)] shadow-premium relative overflow-hidden group">
                         <div className="absolute -bottom-4 -right-4 text-purple-500/5 group-hover:scale-110 transition-transform"><HardDrive size={72} /></div>
                         <span className="text-[10px] md:text-xs font-black text-[var(--text-muted)] uppercase tracking-widest mb-3 block">Tamanho GGUF</span>
                         <span className="text-2xl font-black text-[var(--text-primary)] tracking-tighter">{detail?.file_size_gb || selectedModel.file_size_gb ? `${(detail?.file_size_gb ?? selectedModel.file_size_gb)?.toFixed(1)} GB` : '—'}</span>
                      </div>
                      <div className="bg-[var(--bg-input)]/50 p-4 sm:p-5 rounded-[1.25rem] border border-[var(--border)] shadow-premium relative overflow-hidden group">
                         <div className="absolute -bottom-4 -right-4 text-purple-500/5 group-hover:scale-110 transition-transform"><Brain size={72} /></div>
                         <span className="text-[10px] md:text-xs font-black text-[var(--text-muted)] uppercase tracking-widest mb-3 block">Parâmetros</span>
                         <span className="text-2xl font-black text-[var(--text-primary)] tracking-tighter">{detail?.parameter_count || selectedModel.parameter_count || '?'}</span>
                      </div>
                      <div className="bg-[var(--bg-input)]/50 p-4 sm:p-5 rounded-[1.25rem] border border-[var(--border)] shadow-premium relative overflow-hidden group">
                         <div className="absolute -bottom-4 -right-4 text-blue-500/5 group-hover:scale-110 transition-transform"><MessageSquare size={72} /></div>
                         <span className="text-[10px] md:text-xs font-black text-[var(--text-muted)] uppercase tracking-widest mb-3 block">Contexto</span>
                         <span className="text-2xl font-black text-[var(--text-primary)] tracking-tighter">{detail?.context_length ? `${(detail.context_length / 1000).toFixed(0)}k` : '—'}</span>
                      </div>
                   </div>

                   <div className="space-y-8 md:space-y-16 mb-10 md:mb-20">
                      <div>
                         <h4 className="flex items-center gap-4 text-xs font-black text-[var(--text-primary)] uppercase tracking-[0.5em] mb-6 md:mb-8">
                            <div className="w-10 h-10 bg-blue-600/10 rounded-xl flex items-center justify-center text-blue-500"><FileText size={20} /></div>
                            {t('hub_details_desc')} <span className="text-[var(--text-muted)]">(do HuggingFace)</span>
                         </h4>
                         {detailLoading ? (
                           <div className="bg-[var(--bg-input)]/30 p-8 md:p-10 rounded-[2rem] md:rounded-[3.5rem] border border-[var(--border)] animate-pulse">
                             <p className="text-base md:text-xl text-[var(--text-secondary)] leading-relaxed">A carregar a descrição real do HuggingFace…</p>
                           </div>
                         ) : detailError ? (
                           <div className="bg-[var(--bg-input)]/30 p-8 md:p-10 rounded-[2rem] md:rounded-[3.5rem] border border-red-500/30">
                             <p className="text-base md:text-xl text-red-400 leading-relaxed">{detailError}</p>
                           </div>
                         ) : (
                           <div className="bg-[var(--bg-input)]/30 p-5 sm:p-8 md:p-10 rounded-[2rem] md:rounded-[3.5rem] border border-[var(--border)] shadow-inner">
                             {detail?.description ? (() => {
                               let readmeText = cleanReadme(detail.description);
                               if (readmeText.length > 200000) {
                                 readmeText = readmeText.slice(0, 200000) + '\n\n> *README truncado — consulte o HuggingFace para o conteúdo completo.*';
                               }
                               return (
                                 <div className="md-prose max-w-none">
                                   <ReactMarkdown remarkPlugins={[remarkGfm]}>{readmeText}</ReactMarkdown>
                                 </div>
                               );
                             })() : (
                               <p className="text-base md:text-xl text-[var(--text-secondary)] leading-relaxed">
                                 {selectedModel.description || selectedModel.use_case}
                               </p>
                             )}
                           </div>
                         )}
                      </div>

                      {detail && detail.gguf_files.length > 0 && (
                        <div>
                          <h4 className="flex items-center gap-4 text-xs font-black text-[var(--text-primary)] uppercase tracking-[0.5em] mb-6 md:mb-8">
                            <div className="w-10 h-10 bg-emerald-600/10 rounded-xl flex items-center justify-center text-emerald-500"><HardDrive size={20} /></div>
                            Versões GGUF ({detail.gguf_files.filter(f => !f.isAux).length}) — cada quantização
                          </h4>
                          <div className="space-y-3">
                            {detail.gguf_files.filter(f => !f.isAux).map(f => (
                              <div key={f.file} className="bg-[var(--bg-input)]/30 border border-[var(--border)] rounded-2xl p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center gap-3 sm:gap-5">
                                <div className="flex items-center gap-3 min-w-0 flex-1">
                                  <div className="w-10 h-10 rounded-xl bg-emerald-600/10 flex items-center justify-center text-emerald-500 shrink-0"><FileText size={18} /></div>
                                  <div className="min-w-0">
                                    <p className="font-black text-[var(--text-primary)] text-sm tracking-tight break-all">{f.name}</p>
                                    <div className="flex items-center gap-2 mt-1 flex-wrap">
                                      {f.quant ? <span className="text-[10px] font-black uppercase tracking-widest text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded-full border border-emerald-500/20">{f.quant}</span> : null}
                                      {f.isShard ? <span className="text-[10px] font-black uppercase tracking-widest text-amber-400 bg-amber-500/10 px-2 py-0.5 rounded-full border border-amber-500/20">shard</span> : null}
                                      <span className="text-[10px] font-black uppercase tracking-widest text-[var(--text-muted)]">{(f.size / (1024 ** 3)).toFixed(2)} GB</span>
                                    </div>
                                  </div>
                                </div>
                                <div className="flex gap-2 sm:ml-auto shrink-0" onClick={e => e.stopPropagation()}>
                                  <button
                                    onClick={() => handleInstallHFFile(selectedModel, f.file)}
                                    disabled={downloadingModel === selectedModel.name}
                                    className="btn-premium px-5 py-3 text-[10px] bg-emerald-600/20 text-emerald-400 border border-emerald-500/30 hover:bg-emerald-600 hover:text-white"
                                  >
                                    <Download size={14} /> Baixar
                                  </button>
                                  <a
                                    href={f.url}
                                    target="_blank"
                                    rel="noreferrer"
                                    className="btn-premium px-5 py-3 text-[10px] bg-[var(--bg-input)] text-[var(--text-secondary)] border border-[var(--border)] hover:border-blue-500/50 hover:text-blue-400"
                                    title="Link direto para o ficheiro no HuggingFace"
                                  >
                                    <ExternalLink size={14} /> Link
                                  </a>
                                </div>
                              </div>
                            ))}
                          </div>
                          {downloadingModel === selectedModel.name && downloadStatus && (
                            <p className="mt-4 text-xs font-black text-blue-500 uppercase tracking-widest text-center animate-pulse">{downloadStatus}</p>
                          )}
                        </div>
                      )}

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 md:gap-16">
                         <div className="space-y-8">
                            <div className="flex items-center justify-between border-b border-[var(--border)]/50 pb-8">
                               <span className="text-[var(--text-muted)] flex items-center gap-3 font-black uppercase tracking-widest text-[11px]"><User size={22} className="text-blue-500" /> {t('hub_details_author')}</span>
                               <span className="font-black text-[var(--text-primary)] tracking-tight text-lg">{detail?.author || selectedModel.author || selectedModel.provider}</span>
                            </div>
                            <div className="flex items-center justify-between border-b border-[var(--border)]/50 pb-8">
                               <span className="text-[var(--text-muted)] flex items-center gap-3 font-black uppercase tracking-widest text-[11px]"><Shield size={22} className="text-emerald-500" /> {t('hub_details_license')}</span>
                               <span className="font-black text-emerald-500 tracking-tight uppercase text-lg">{detail?.license || selectedModel.license || 'Apache 2.0'}</span>
                            </div>
                            <div className="flex items-center justify-between border-b border-[var(--border)]/50 pb-8">
                               <span className="text-[var(--text-muted)] flex items-center gap-3 font-black uppercase tracking-widest text-[11px]"><Brain size={22} className="text-purple-500" /> Arquitetura</span>
                               <span className="font-black text-[var(--text-primary)] tracking-tight text-lg uppercase">{detail?.architecture || '—'}</span>
                            </div>
                         </div>
                         <div className="space-y-8">
                            <div className="flex items-center justify-between border-b border-[var(--border)]/50 pb-8">
                               <span className="text-[var(--text-muted)] flex items-center gap-3 font-black uppercase tracking-widest text-[11px]"><Calendar size={22} className="text-purple-500" /> {t('hub_details_created')}</span>
                               <span className="font-black text-[var(--text-primary)] tracking-tight text-lg">{detail?.created || selectedModel.release_date || 'N/A'}</span>
                            </div>
                            <div className="flex items-center justify-between border-b border-[var(--border)]/50 pb-8">
                               <span className="text-[var(--text-muted)] flex items-center gap-3 font-black uppercase tracking-widest text-[11px]"><Clock size={22} className="text-rose-500" /> {t('hub_details_updated')}</span>
                               <span className="font-black text-[var(--text-primary)] tracking-tight text-lg">{detail?.lastModified || selectedModel.updated_at || selectedModel.release_date || 'N/A'}</span>
                            </div>
                            <div className="flex items-center justify-between border-b border-[var(--border)]/50 pb-8">
                               <span className="text-[var(--text-muted)] flex items-center gap-3 font-black uppercase tracking-widest text-[11px]"><Zap size={22} className="text-amber-500" /> Biblioteca</span>
                               <span className="font-black text-[var(--text-primary)] tracking-tight text-lg uppercase">{detail?.library || '—'}</span>
                            </div>
                         </div>
                      </div>

                      {detail && detail.tags.length > 0 && (
                        <div>
                          <h4 className="flex items-center gap-4 text-xs font-black text-[var(--text-primary)] uppercase tracking-[0.5em] mb-6 md:mb-8">
                            <div className="w-10 h-10 bg-purple-600/10 rounded-xl flex items-center justify-center text-purple-500"><Zap size={20} /></div>
                            Tags
                          </h4>
                          <div className="flex flex-wrap gap-2">
                            {detail.tags
                              .filter(t => [...LIBRARY_TAGS, ...APP_TAGS, ...PROVIDER_TAGS].includes(String(t).toLowerCase()))
                              .map(tag => (
                                <span key={tag} className="px-3 py-1.5 rounded-full text-[11px] font-black uppercase tracking-wider bg-[var(--bg-input)] border border-[var(--border)] text-[var(--text-secondary)]">{tag}</span>
                              ))}
                          </div>
                        </div>
                      )}
                   </div>

                   <div className="flex gap-6 mb-10 flex-wrap">
                     {selectedModel.gguf_sources?.length ? (
                       <button
                         onClick={() => { handleInstallHF(selectedModel); setSelectedModel(null); }}
                         disabled={getFitScore(selectedModel) === 1}
                         className="flex-1 min-w-[200px] bg-emerald-600/20 text-emerald-400 border border-emerald-500/30 hover:bg-emerald-600 hover:text-white font-black py-5 sm:py-7 md:py-10 rounded-[1.5rem] md:rounded-[3rem] transition-all shadow-premium flex items-center justify-center gap-4 md:gap-8 active:scale-[0.98] disabled:opacity-50 text-sm md:text-xl uppercase tracking-wider"
                       >
                         <Download size={28} />
                         GGUF · llama.cpp
                       </button>
                     ) : null}
                     {(selectedModel.ollama_name || !selectedModel.gguf_sources?.length) ? (
                       <button
                         onClick={() => { handleInstall(selectedModel); setSelectedModel(null); }}
                         disabled={getFitScore(selectedModel) === 1}
                         className="flex-1 min-w-[200px] bg-[var(--text-primary)] text-[var(--bg-base)] hover:bg-blue-600 hover:text-white font-black py-5 sm:py-7 md:py-10 rounded-[1.5rem] md:rounded-[3rem] transition-all shadow-premium flex items-center justify-center gap-4 md:gap-8 active:scale-[0.98] disabled:opacity-50 text-sm md:text-xl uppercase tracking-wider"
                       >
                         <Download size={40} />
                         Ollama
                       </button>
                     ) : null}
                   </div>
                </div>
             </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <section className="card-premium bg-gradient-to-br from-[var(--bg-surface)] to-[var(--bg-base)] p-6 sm:p-10 md:p-16 lg:p-24 text-center shadow-premium relative overflow-hidden group">
         <div className="absolute -top-32 -right-32 w-[35rem] h-[35rem] bg-blue-600/5 blur-[150px] rounded-full group-hover:scale-125 transition-all duration-1000" />
         <div className="w-24 h-24 bg-blue-600/10 rounded-[2.5rem] flex items-center justify-center mx-auto mb-10 text-blue-500 shadow-premium group-hover:rotate-12 transition-transform duration-700">
            <Monitor size={48} />
         </div>
         <h3 className="text-2xl sm:text-4xl md:text-6xl font-black text-[var(--text-primary)] mb-6 tracking-tighter uppercase leading-none break-words">Add Custom Models</h3>
         <p className="text-xl text-[var(--text-secondary)] max-w-2xl mx-auto mb-14 font-medium opacity-80 leading-relaxed">
            Can't find a specific DeepSeek or Llama version? Enter a HuggingFace URL to scan and add it to your local registry.
         </p>
         <div className="flex flex-col gap-3 max-w-3xl mx-auto">
           <div className="flex flex-col sm:flex-row gap-6 bg-[var(--bg-input)]/50 p-3 rounded-[3rem] border border-[var(--border)] shadow-inner">
              <input
                type="text"
                value={customUrl}
                onChange={e => { setCustomUrl(e.target.value); setCustomUrlError(''); }}
                onKeyDown={e => e.key === 'Enter' && handleCustomUrl()}
                placeholder="https://huggingface.co/unsloth/Llama-3.2-3B-Instruct-GGUF"
                className="flex-1 bg-transparent border-none rounded-[2rem] px-10 py-5 text-lg focus:outline-none text-[var(--text-primary)] font-medium"
              />
              <button
                onClick={handleCustomUrl}
                disabled={!customUrl.trim()}
                className="btn-premium bg-blue-600 hover:bg-blue-500 text-white px-12 py-5 rounded-[2.5rem] disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <Download size={20} />
                Download
              </button>
           </div>
           {customUrlError && (
             <p className="text-red-500 text-xs font-black uppercase tracking-widest text-center px-4">{customUrlError}</p>
           )}
         </div>
      </section>
    </motion.div>
  );
}
