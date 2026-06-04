import { useState, useEffect, useRef, useMemo } from 'react';
import { Search, Download, Star, Zap, CheckCircle, AlertTriangle, XCircle, Image as ImageIcon, MessageSquare, Brain, Clock, TrendingUp, Monitor, Calendar, User, FileText, Shield, X } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { io } from 'socket.io-client';
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

  const setDownloadingModelSync = (val: string | null) => {
    downloadingModelRef.current = val;
    setDownloadingModel(val);
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

    socket.on('models-updated', () => {
      fetchLocalModels();
    });

    return () => {
      socket.off('models-updated');
    };
  }, []);

  const filters = ['All', 'Chat', 'Coding', 'Image', 'Reasoning', 'Vision'];

  const getFitScore = (model: RegistryModel) => {
    if (!sysInfo) return 0;
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
  }, [registry, localModels, search, activeFilter, activeSort, sysInfo]);

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
  }, [search, activeFilter, activeSort]);

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
          </div>

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
              onClick={() => setSelectedModel(model)}
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
                ) : (
                  <div className="flex items-center gap-2 text-red-500 text-xs font-black uppercase tracking-widest bg-red-500/10 px-4 py-2 rounded-full border border-red-500/20 shadow-sm">
                    <XCircle size={14} /> {t('hub_tooLarge')}
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
                
                <div className="flex gap-4 mb-8">
                   <div className="bg-[var(--bg-surface)] px-4 py-2 rounded-2xl border border-[var(--border)] flex items-center gap-3 shadow-inner">
                      <Download size={14} className="text-blue-500" />
                      <span className="text-xs font-black text-[var(--text-secondary)]">{(model.hf_downloads / 1000).toFixed(0)}k</span>
                   </div>
                   <div className="bg-[var(--bg-surface)] px-4 py-2 rounded-2xl border border-[var(--border)] flex items-center gap-3 shadow-inner">
                      <Star size={14} className="text-yellow-500 fill-current" />
                      <span className="text-xs font-black text-[var(--text-secondary)]">{model.hf_likes || 0}</span>
                   </div>
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
                      className="bg-[var(--bg-input)]/40 border border-[var(--border)] border-dashed rounded-[1.5rem] sm:rounded-[2rem] md:rounded-[3rem] p-5 sm:p-7 md:p-10 flex flex-col hover:border-blue-500/50 transition-all group backdrop-blur-3xl hover:shadow-2xl relative overflow-hidden"
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
                        {selectedModel.pipeline_tag?.includes('image') ? <ImageIcon size={56} className="text-rose-400" /> :
                         selectedModel.pipeline_tag?.includes('text') ? <MessageSquare size={56} className="text-blue-400" /> :
                         <Brain size={56} className="text-purple-400" />}
                      </div>
                      <div className="text-center md:text-left">
                         <div className="flex items-center justify-center md:justify-start gap-4 mb-4">
                            <span className="text-xs font-black text-blue-500 uppercase tracking-wider">{selectedModel.provider}</span>
                            <span className="w-1.5 h-1.5 rounded-full bg-[var(--border)]"></span>
                            <span className="text-xs font-black text-[var(--text-muted)] uppercase tracking-widest">{selectedModel.parameter_count}</span>
                         </div>
                         <h3 className="text-2xl sm:text-4xl md:text-5xl lg:text-7xl font-black text-[var(--text-primary)] tracking-tighter leading-[0.9] uppercase break-words">{selectedModel.name.split('/').pop()}</h3>
                      </div>
                   </div>

                   <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-6 md:gap-8 mb-10 md:mb-20">
                      <div className="bg-[var(--bg-input)]/50 p-4 sm:p-6 md:p-8 rounded-[1.5rem] md:rounded-[2.5rem] border border-[var(--border)] shadow-premium relative overflow-hidden group">
                         <div className="absolute -bottom-4 -right-4 text-blue-500/5 group-hover:scale-110 transition-transform"><Download size={96} /></div>
                         <span className="text-xs md:text-sm font-black text-[var(--text-muted)] uppercase tracking-widest mb-4 block">{t('hub_details_downloads')}</span>
                         <span className="text-3xl font-black text-[var(--text-primary)] tracking-tighter">{(selectedModel.hf_downloads / 1000).toFixed(1)}k</span>
                      </div>
                      <div className="bg-[var(--bg-input)]/50 p-4 sm:p-6 md:p-8 rounded-[1.5rem] md:rounded-[2.5rem] border border-[var(--border)] shadow-premium relative overflow-hidden group">
                         <div className="absolute -bottom-4 -right-4 text-yellow-500/5 group-hover:scale-110 transition-transform"><Star size={96} /></div>
                         <span className="text-xs md:text-sm font-black text-[var(--text-muted)] uppercase tracking-widest mb-4 block">{t('hub_details_likes')}</span>
                         <span className="text-3xl font-black text-[var(--text-primary)] tracking-tighter">{selectedModel.hf_likes}</span>
                      </div>
                      <div className="bg-blue-600/5 p-4 sm:p-6 md:p-8 rounded-[1.5rem] md:rounded-[2.5rem] border border-blue-500/20 shadow-premium relative overflow-hidden group">
                         <div className="absolute -bottom-4 -right-4 text-blue-500/10 group-hover:scale-110 transition-transform"><Monitor size={96} /></div>
                         <span className="text-xs md:text-sm font-black text-blue-500 uppercase tracking-widest mb-4 block">{t('hub_details_vram')}</span>
                         <span className="text-3xl font-black text-blue-500 tracking-tighter">{selectedModel.min_vram_gb} GB</span>
                      </div>
                      <div className="bg-[var(--bg-input)]/50 p-4 sm:p-6 md:p-8 rounded-[1.5rem] md:rounded-[2.5rem] border border-[var(--border)] shadow-premium relative overflow-hidden group">
                         <div className="absolute -bottom-4 -right-4 text-purple-500/5 group-hover:scale-110 transition-transform"><Brain size={96} /></div>
                         <span className="text-xs md:text-sm font-black text-[var(--text-muted)] uppercase tracking-widest mb-4 block">{t('hub_details_type')}</span>
                         <span className="text-2xl font-black text-[var(--text-primary)] uppercase truncate block tracking-tighter leading-none">{selectedModel.pipeline_tag}</span>
                      </div>
                   </div>

                   <div className="space-y-8 md:space-y-16 mb-10 md:mb-20">
                      <div>
                         <h4 className="flex items-center gap-4 text-xs font-black text-[var(--text-primary)] uppercase tracking-[0.5em] mb-6 md:mb-8">
                            <div className="w-10 h-10 bg-blue-600/10 rounded-xl flex items-center justify-center text-blue-500"><FileText size={20} /></div>
                            {t('hub_details_desc')}
                         </h4>
                         <div className="bg-[var(--bg-input)]/30 p-5 sm:p-8 md:p-10 rounded-[2rem] md:rounded-[3.5rem] border border-[var(--border)] font-medium shadow-inner">
                            <p className="text-base md:text-xl text-[var(--text-secondary)] leading-relaxed">
                              {selectedModel.description || selectedModel.use_case}
                            </p>
                         </div>
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 md:gap-16">
                         <div className="space-y-8">
                            <div className="flex items-center justify-between border-b border-[var(--border)]/50 pb-8">
                               <span className="text-[var(--text-muted)] flex items-center gap-3 font-black uppercase tracking-widest text-[11px]"><User size={22} className="text-blue-500" /> {t('hub_details_author')}</span>
                               <span className="font-black text-[var(--text-primary)] tracking-tight text-lg">{selectedModel.author || selectedModel.provider}</span>
                            </div>
                            <div className="flex items-center justify-between border-b border-[var(--border)]/50 pb-8">
                               <span className="text-[var(--text-muted)] flex items-center gap-3 font-black uppercase tracking-widest text-[11px]"><Shield size={22} className="text-emerald-500" /> {t('hub_details_license')}</span>
                               <span className="font-black text-emerald-500 tracking-tight uppercase text-lg">{selectedModel.license || 'Apache 2.0'}</span>
                            </div>
                         </div>
                         <div className="space-y-8">
                            <div className="flex items-center justify-between border-b border-[var(--border)]/50 pb-8">
                               <span className="text-[var(--text-muted)] flex items-center gap-3 font-black uppercase tracking-widest text-[11px]"><Calendar size={22} className="text-purple-500" /> {t('hub_details_created')}</span>
                               <span className="font-black text-[var(--text-primary)] tracking-tight text-lg">{selectedModel.release_date || 'N/A'}</span>
                            </div>
                            <div className="flex items-center justify-between border-b border-[var(--border)]/50 pb-8">
                               <span className="text-[var(--text-muted)] flex items-center gap-3 font-black uppercase tracking-widest text-[11px]"><Clock size={22} className="text-rose-500" /> {t('hub_details_updated')}</span>
                               <span className="font-black text-[var(--text-primary)] tracking-tight text-lg">{selectedModel.updated_at || selectedModel.release_date || 'N/A'}</span>
                            </div>
                         </div>
                      </div>
                   </div>

                   <div className="flex gap-6 mb-10">
                     {selectedModel.gguf_sources?.length ? (
                       <button
                         onClick={() => { handleInstallHF(selectedModel); setSelectedModel(null); }}
                         disabled={getFitScore(selectedModel) === 1}
                         className="flex-1 bg-emerald-600/20 text-emerald-400 border border-emerald-500/30 hover:bg-emerald-600 hover:text-white font-black py-5 sm:py-7 md:py-10 rounded-[1.5rem] md:rounded-[3rem] transition-all shadow-premium flex items-center justify-center gap-4 md:gap-8 active:scale-[0.98] disabled:opacity-50 text-sm md:text-xl uppercase tracking-wider"
                       >
                         <Download size={28} />
                         GGUF · llama.cpp
                       </button>
                     ) : null}
                     {(selectedModel.ollama_name || !selectedModel.gguf_sources?.length) ? (
                       <button
                         onClick={() => { handleInstall(selectedModel); setSelectedModel(null); }}
                         disabled={getFitScore(selectedModel) === 1}
                         className="flex-1 bg-[var(--text-primary)] text-[var(--bg-base)] hover:bg-blue-600 hover:text-white font-black py-5 sm:py-7 md:py-10 rounded-[1.5rem] md:rounded-[3rem] transition-all shadow-premium flex items-center justify-center gap-4 md:gap-8 active:scale-[0.98] disabled:opacity-50 text-sm md:text-xl uppercase tracking-wider"
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
