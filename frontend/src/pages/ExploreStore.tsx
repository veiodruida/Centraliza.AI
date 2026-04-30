import { useState, useEffect, useMemo } from 'react';
import { Search, Download, Star, Zap, CheckCircle, AlertTriangle, XCircle, Image as ImageIcon, MessageSquare, Brain, Clock, TrendingUp, Monitor, Calendar, User, FileText, Shield, X } from 'lucide-react';
import { io } from 'socket.io-client';
import { useApp } from '../context/AppContext';
import HelpTooltip from '../components/HelpTooltip';

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
}

type SortOption = 'Popular' | 'Newest' | 'Best Fit';

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
  const [downloadStatus, setDownloadStatus] = useState<string>('');
  const [downloadProgress, setDownloadProgress] = useState<Record<string, number>>({});
  const [selectedModel, setSelectedModel] = useState<RegistryModel | null>(null);

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
      console.log('[Socket] Models updated, refreshing local list...');
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

  const handleInstall = async (model: RegistryModel) => {
    let modelNameForOllama = model.name.split('/').pop() || model.name;
    if (model.gguf_sources && model.gguf_sources.length > 0) {
      modelNameForOllama = `hf.co/${model.gguf_sources[0].repo}`;
    }
    
    setDownloadingModel(modelNameForOllama);
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
        setTimeout(() => setDownloadingModel(null), 3000);
      }
      setDownloadStatus(t('hub_installing'));
    } catch (e) {
      setDownloadStatus(t('error'));
      setTimeout(() => setDownloadingModel(null), 3000);
    }
  };

  useEffect(() => {
    const onProgress = (data: any) => {
      if (data.model === downloadingModel) {
        if (data.progress === -1) {
          setDownloadStatus(t('hub_installing'));
        } else if (data.progress >= 0 && data.progress < 100) {
          setDownloadStatus(`${t('hub_installing')} ${data.progress}%`);
          setDownloadProgress(prev => ({ ...prev, [data.model]: data.progress }));
        } else if (data.progress >= 100) {
          setDownloadStatus(t('hub_installed'));
          setDownloadProgress(prev => ({ ...prev, [data.model]: 100 }));
        }
      }
    };
    
    const onComplete = (data: any) => {
      if (data.model === downloadingModel) {
        if (data.success) {
          setDownloadStatus(t('hub_installed'));
          fetch('/api/models').then(res => res.json()).then(setLocalModels);
        } else if (data.cancelled) {
          setDownloadStatus(t('cancel'));
        } else {
          setDownloadStatus(t('error'));
        }
        const delay = (data.cancelled || !data.success) ? 500 : 3000;
        setTimeout(() => {
          setDownloadingModel(null);
          setDownloadStatus('');
          setDownloadProgress(prev => {
            const next = { ...prev };
            delete next[data.model];
            return next;
          });
        }, delay);
      }
    };

    socket.on('download-progress', onProgress);
    socket.on('download-complete', onComplete);

    return () => {
      socket.off('download-progress', onProgress);
      socket.off('download-complete', onComplete);
    };
  }, [downloadingModel]);

  if (loading) return <div className="p-6 sm:p-12 md:p-20 text-center animate-pulse text-[var(--text-secondary)] font-black uppercase tracking-[0.1em] sm:tracking-widest leading-none text-[9px] sm:text-[10px] md:text-xs">{t('loading')}</div>;

  return (
    <div className="p-3 sm:p-6 md:p-10 lg:p-12 max-w-[90rem] mx-auto animate-in fade-in duration-1000 pb-20">
      <header className="mb-6 sm:mb-8 md:mb-14">
        <div className="flex justify-between items-start mb-6 sm:mb-8 md:mb-12 gap-3 sm:gap-4 md:gap-8 flex-wrap">
          <div className="space-y-2 sm:space-y-3 w-full sm:flex-1">
            <h2 className="text-2xl sm:text-3xl md:text-4xl lg:text-5xl font-black text-[var(--text-primary)] tracking-tighter leading-tight sm:leading-[1.1] uppercase flex items-center gap-2 sm:gap-4 break-words">
              {t('hub_title')}
              <div className="flex-shrink-0"><HelpTooltip text={t('hub_subtitle')} /></div>
            </h2>
            <p className="text-[var(--text-secondary)] text-xs sm:text-sm md:text-base lg:text-lg font-medium max-w-xl opacity-80 break-words">{t('hub_subtitle')}</p>
          </div>
          <div className="bg-[var(--bg-surface)] border border-[var(--border)] px-3 sm:px-6 md:px-10 py-2.5 sm:py-4 md:py-6 rounded-lg sm:rounded-2xl md:rounded-[3.5rem] flex items-center gap-3 sm:gap-6 md:gap-10 shadow-premium backdrop-blur-3xl w-full sm:w-auto flex-shrink-0">
             <div className="flex flex-col min-w-0">
                <span className="text-[7px] sm:text-[8px] md:text-[10px] font-black text-[var(--text-muted)] uppercase tracking-[0.1em] sm:tracking-widest md:tracking-[0.3em] mb-0.5 sm:mb-1">{t('hub_gpu')}</span>
                <span className="text-[10px] sm:text-xs md:text-lg font-black text-[var(--text-primary)] truncate max-w-[120px] sm:max-w-[150px] md:max-w-[240px] tracking-tighter uppercase">{sysInfo?.gpuName || 'Detecting...'}</span>
             </div>
             <div className="h-6 sm:h-8 md:h-12 w-px bg-[var(--border)]"></div>
             <div className="flex flex-col flex-shrink-0">
                <span className="text-[7px] sm:text-[8px] md:text-[10px] font-black text-[var(--text-muted)] uppercase tracking-[0.1em] sm:tracking-widest md:tracking-[0.3em] mb-0.5 sm:mb-1">{t('hub_vram')}</span>
                <span className="text-base sm:text-lg md:text-2xl font-black text-blue-500 tracking-tighter leading-none">
                   {sysInfo ? `${(sysInfo.vram / (1024 ** 3)).toFixed(1)} GB` : '--'}
                </span>
             </div>
          </div>
        </div>

        <div className="flex flex-col lg:flex-row gap-3 sm:gap-4 md:gap-6 lg:gap-8 items-stretch lg:items-center">
          <div className="relative flex-1 group">
            <Search className="absolute left-3 sm:left-4 md:left-5 lg:left-6 top-1/2 -translate-y-1/2 text-[var(--text-muted)] group-focus-within:text-blue-500 transition-colors flex-shrink-0" size={16} />
            <input 
              type="text" 
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={t('hub_search')} 
              className="w-full bg-[var(--bg-surface)] border border-[var(--border)] rounded-lg sm:rounded-xl md:rounded-[2rem] py-2.5 sm:py-3 md:py-4 lg:py-5 pl-10 sm:pl-12 md:pl-16 pr-4 sm:pr-6 md:pr-8 text-xs sm:text-sm md:text-base lg:text-lg text-[var(--text-primary)] focus:outline-none focus:ring-4 focus:ring-blue-600/10 transition-all shadow-premium font-medium"
            />
          </div>
          
          <div className="flex bg-[var(--bg-surface)] p-0.5 sm:p-1 md:p-1.5 rounded-lg sm:rounded-xl md:rounded-[2rem] border border-[var(--border)] shadow-premium overflow-x-auto no-scrollbar scroll-smooth w-full sm:w-auto">
            {filters.map(f => (
              <button 
                key={f}
                onClick={() => setActiveFilter(f)}
                className={`px-2 sm:px-4 md:px-8 py-1.5 sm:py-2 md:py-3.5 rounded-lg md:rounded-[1.5rem] text-[8px] sm:text-[9px] md:text-[11px] font-black uppercase tracking-[0.08em] sm:tracking-[0.1em] md:tracking-widest transition-all active:scale-95 shrink-0 whitespace-nowrap ${
                  activeFilter === f ? 'bg-blue-600 text-white shadow-xl shadow-blue-600/30' : 'text-[var(--text-muted)] hover:text-[var(--text-primary)]'
                }`}
              >
                {f}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-0.5 sm:gap-1 bg-[var(--bg-surface)] p-0.5 sm:p-1 md:p-1.5 rounded-lg sm:rounded-xl md:rounded-[2rem] border border-[var(--border)] shadow-premium overflow-x-auto no-scrollbar scroll-smooth w-full sm:w-auto">
             {(['Best Fit', 'Popular', 'Newest'] as SortOption[]).map(s => (
                <button 
                 key={s}
                 onClick={() => setActiveSort(s)}
                 className={`px-2 sm:px-3 md:px-5 py-1.5 sm:py-2 md:py-3.5 rounded-lg md:rounded-[1.5rem] text-[7px] sm:text-[8px] md:text-[10px] font-black uppercase tracking-[0.08em] sm:tracking-[0.1em] md:tracking-widest flex items-center gap-1 sm:gap-2 md:gap-3 transition-all active:scale-95 shrink-0 whitespace-nowrap ${
                   activeSort === s ? 'bg-[var(--bg-input)] text-[var(--text-primary)] shadow-inner' : 'text-[var(--text-muted)] hover:text-[var(--text-primary)]'
                 }`}
                >
                  {s === 'Popular' && <TrendingUp size={12} className="flex-shrink-0" />}
                  {s === 'Newest' && <Clock size={12} className="flex-shrink-0" />}
                  {s === 'Best Fit' && <Zap size={12} className="flex-shrink-0" />}
                  <span className="hidden sm:inline">{t(`hub_sort_${s.toLowerCase().replace(' ', '')}` as any)}</span>
                  <span className="sm:hidden">{s === 'Best Fit' ? 'Fit' : s}</span>
                </button>
             ))}
          </div>
        </div>
      </header>

      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4 sm:gap-6 md:gap-8 lg:gap-10 mb-12 sm:mb-16 md:mb-20">
        {filteredModels.slice(0, 24).map((model) => {
          const score = getFitScore(model);
          const isDownloading = downloadingModel === model.name;

          return (
            <div 
              key={model.name} 
              onClick={() => setSelectedModel(model)}
              className="bg-[var(--bg-surface)] border border-[var(--border)] rounded-2xl md:rounded-[3.5rem] p-6 md:p-10 flex flex-col hover:border-blue-500/50 transition-all group backdrop-blur-3xl hover:shadow-premium relative overflow-hidden cursor-pointer active:scale-[0.98] shadow-sm"
            >
              <div className={`absolute -top-32 -right-32 w-64 h-64 rounded-full blur-[100px] opacity-0 group-hover:opacity-20 transition-all duration-700 ${
                score === 3 ? 'bg-emerald-500' : score === 2 ? 'bg-yellow-500' : 'bg-red-500'
              }`} />

              <div className="flex justify-between items-start mb-4 md:mb-8 relative z-10">
                <div className={`w-12 h-12 md:w-16 md:h-16 rounded-xl md:rounded-2xl flex items-center justify-center text-white bg-[var(--bg-input)] border border-[var(--border)] shadow-xl transition-transform duration-500 group-hover:scale-110 group-hover:rotate-6`}>
                  {model.pipeline_tag?.includes('image') ? <ImageIcon size={28} className="text-rose-400" /> :
                   model.pipeline_tag?.includes('text') ? <MessageSquare size={28} className="text-blue-400" /> :
                   <Brain size={28} className="text-purple-400" /> }
                </div>
                {score === 3 ? (
                  <div className="flex items-center gap-1.5 text-emerald-500 text-[8px] md:text-[9px] font-black uppercase tracking-widest bg-emerald-500/10 px-3 md:px-4 py-1.5 rounded-full border border-emerald-500/20 shadow-sm">
                    <CheckCircle size={12} /> {t('hub_perfectFit')}
                  </div>
                ) : score === 2 ? (
                  <div className="flex items-center gap-1.5 text-yellow-500 text-[8px] md:text-[9px] font-black uppercase tracking-widest bg-yellow-500/10 px-3 md:px-4 py-1.5 rounded-full border border-yellow-500/20 shadow-sm">
                    <AlertTriangle size={12} /> {t('hub_needsRam')}
                  </div>
                ) : (
                  <div className="flex items-center gap-1.5 text-red-500 text-[8px] md:text-[9px] font-black uppercase tracking-widest bg-red-500/10 px-3 md:px-4 py-1.5 rounded-full border border-red-500/20 shadow-sm">
                    <XCircle size={12} /> {t('hub_tooLarge')}
                  </div>
                )}
              </div>

              <div className="flex-1 relative z-10 min-w-0">
                <div className="flex items-center gap-2 mb-1.5 md:mb-3 flex-wrap">
                  <span className="text-[8px] md:text-[10px] font-black text-[var(--text-muted)] uppercase tracking-widest">{model.provider}</span>
                  <span className="w-0.5 h-0.5 rounded-full bg-[var(--border)]"></span>
                  <span className="text-[8px] md:text-[10px] font-black text-blue-500 uppercase tracking-widest">{model.parameter_count}</span>
                </div>
                <h4 className="text-lg md:text-3xl font-black text-[var(--text-primary)] mb-2 md:mb-3 group-hover:text-blue-500 transition-colors line-clamp-1 tracking-tighter leading-none uppercase">{model.name.split('/').pop()}</h4>
                <p className="text-[var(--text-secondary)] text-xs md:text-base font-medium leading-relaxed mb-4 md:mb-8 line-clamp-2 opacity-80">{model.use_case}</p>
                
                <div className="flex gap-2 md:gap-3 mb-4 md:mb-8">
                   <div className="bg-[var(--bg-input)] px-2.5 md:px-4 py-1 md:py-2 rounded-lg md:rounded-2xl border border-[var(--border)] flex items-center gap-1.5 md:gap-3 shadow-inner">
                      <Download size={12} className="text-blue-500" />
                      <span className="text-[9px] md:text-xs font-black text-[var(--text-secondary)]">{(model.hf_downloads / 1000).toFixed(0)}k</span>
                   </div>
                   <div className="bg-[var(--bg-input)] px-2.5 md:px-4 py-1 md:py-2 rounded-lg md:rounded-2xl border border-[var(--border)] flex items-center gap-1.5 md:gap-3 shadow-inner">
                      <Star size={12} className="text-yellow-500 fill-current" />
                      <span className="text-[9px] md:text-xs font-black text-[var(--text-secondary)]">{model.hf_likes || 0}</span>
                   </div>
                </div>
              </div>

              <div className="flex items-center justify-between mt-auto relative z-10 gap-3 md:gap-4" onClick={(e) => e.stopPropagation()}>
                <div className="flex flex-col min-w-0">
                  <span className="text-[8px] font-black text-[var(--text-muted)] uppercase tracking-widest mb-0.5">{t('hub_details_vram')}</span>
                  <span className="text-lg md:text-2xl font-black text-[var(--text-primary)] tracking-tighter leading-none">{model.min_vram_gb} <span className="text-[10px] md:text-xs text-[var(--text-secondary)] uppercase">GB</span></span>
                </div>
                {isDownloading ? (
                   <div className="flex flex-col gap-1.5 md:gap-2 min-w-[100px] md:min-w-[160px]">
                     <div className="text-[8px] md:text-[10px] font-black text-blue-500 uppercase bg-blue-500/10 px-2 md:px-5 py-2 md:py-3 rounded-lg md:rounded-2xl text-center border border-blue-500/20 shadow-xl shadow-blue-500/10 animate-pulse truncate">
                       {downloadStatus}
                     </div>
                     {downloadProgress[model.name] > 0 && downloadProgress[model.name] < 100 && (
                       <div className="w-full bg-[var(--bg-input)] h-1 rounded-full overflow-hidden p-0.5 border border-[var(--border)]">
                         <div 
                           className="h-full bg-gradient-to-r from-blue-500 to-indigo-500 rounded-full transition-all duration-500" 
                           style={{ width: `${downloadProgress[model.name]}%` }}
                         />
                       </div>
                     )}
                   </div>
                 ) : (
                  <button 
                    onClick={(e) => { e.stopPropagation(); handleInstall(model); }}
                    disabled={score === 1}
                    className={`flex items-center justify-center gap-2 md:gap-4 px-4 md:px-10 py-3 md:py-5 rounded-xl md:rounded-[2rem] font-black text-[9px] md:text-xs uppercase tracking-widest md:tracking-[0.2em] transition-all flex-1 sm:flex-none ${
                      score === 1 
                        ? 'bg-[var(--bg-input)] text-[var(--text-muted)] cursor-not-allowed border border-[var(--border)] opacity-50' 
                        : 'bg-[var(--text-primary)] text-[var(--bg-base)] hover:bg-blue-600 hover:text-white shadow-premium active:scale-95'
                    }`}
                  >
                    <Download size={18} />
                    {t('hub_install')}
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Detail Modal */}
      {selectedModel && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center p-0 sm:p-8 bg-black/95 backdrop-blur-md animate-in fade-in duration-500">
           <div className="bg-[var(--bg-surface)] border-x border-y sm:border border-[var(--border)] rounded-none sm:rounded-[4rem] w-full max-w-4xl h-full sm:h-auto sm:max-h-[90vh] overflow-y-auto shadow-premium relative custom-scrollbar animate-in zoom-in-95 duration-500 no-scrollbar">
              <div className="absolute top-0 right-0 w-full h-48 md:h-96 bg-gradient-to-b from-blue-500/5 to-transparent pointer-events-none" />
              <button 
                onClick={() => setSelectedModel(null)}
                className="fixed sm:absolute top-6 md:top-12 right-6 md:right-12 text-[var(--text-muted)] hover:text-[var(--text-primary)] p-3 md:p-4 bg-[var(--bg-input)] sm:bg-transparent rounded-full transition-all active:scale-90 z-50 border border-[var(--border)] sm:border-transparent"
              >
                <X size={32} />
              </button>

              <div className="p-8 md:p-20 relative z-10 pt-24 sm:pt-20">
                 <div className="flex flex-col md:flex-row items-center gap-6 md:gap-10 mb-10 md:mb-16 text-center md:text-left">
                    <div className={`w-20 h-20 md:w-28 md:h-28 rounded-2xl md:rounded-[2.5rem] flex items-center justify-center text-white bg-[var(--bg-input)] border border-[var(--border)] shadow-3xl shrink-0 transition-transform duration-700 hover:rotate-12`}>
                      {selectedModel.pipeline_tag?.includes('image') ? <ImageIcon size={56} className="text-rose-400" /> :
                       selectedModel.pipeline_tag?.includes('text') ? <MessageSquare size={56} className="text-blue-400" /> :
                       <Brain size={56} className="text-purple-400" />}
                    </div>
                    <div className="min-w-0">
                       <div className="flex items-center justify-center md:justify-start gap-3 md:gap-4 mb-2 md:mb-4">
                          <span className="text-[9px] md:text-xs font-black text-blue-500 uppercase tracking-widest md:tracking-[0.4em]">{selectedModel.provider}</span>
                          <span className="w-1.5 h-1.5 rounded-full bg-[var(--border)]"></span>
                          <span className="text-[9px] md:text-xs font-black text-[var(--text-muted)] uppercase tracking-widest md:tracking-[0.3em]">{selectedModel.parameter_count}</span>
                       </div>
                       <h3 className="text-3xl md:text-6xl font-black text-[var(--text-primary)] tracking-tighter leading-none uppercase truncate">{selectedModel.name.split('/').pop()}</h3>
                    </div>
                 </div>

                 <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 md:gap-8 mb-12 md:mb-20">
                    <div className="bg-[var(--bg-input)]/50 p-6 md:p-8 rounded-2xl md:rounded-[2.5rem] border border-[var(--border)] shadow-premium relative overflow-hidden group">
                       <div className="absolute -bottom-2 -right-2 md:-bottom-4 md:-right-4 text-blue-500/5 group-hover:scale-110 transition-transform"><Download size={72} /></div>
                       <span className="text-[8px] md:text-[10px] font-black text-[var(--text-muted)] uppercase tracking-widest md:tracking-[0.3em] mb-2 md:mb-4 block">{t('hub_details_downloads')}</span>
                       <span className="text-xl md:text-3xl font-black text-[var(--text-primary)] tracking-tighter">{(selectedModel.hf_downloads / 1000).toFixed(1)}k</span>
                    </div>
                    <div className="bg-[var(--bg-input)]/50 p-6 md:p-8 rounded-2xl md:rounded-[2.5rem] border border-[var(--border)] shadow-premium relative overflow-hidden group">
                       <div className="absolute -bottom-2 -right-2 md:-bottom-4 md:-right-4 text-yellow-500/5 group-hover:scale-110 transition-transform"><Star size={72} /></div>
                       <span className="text-[8px] md:text-[10px] font-black text-[var(--text-muted)] uppercase tracking-widest md:tracking-[0.3em] mb-2 md:mb-4 block">{t('hub_details_likes')}</span>
                       <span className="text-xl md:text-3xl font-black text-[var(--text-primary)] tracking-tighter">{selectedModel.hf_likes}</span>
                    </div>
                    <div className="bg-[var(--bg-input)]/50 p-6 md:p-8 rounded-2xl md:rounded-[2.5rem] border border-[var(--border)] shadow-premium relative overflow-hidden group border-blue-500/20">
                       <div className="absolute -bottom-2 -right-2 md:-bottom-4 md:-right-4 text-blue-500/5 group-hover:scale-110 transition-transform"><Monitor size={72} /></div>
                       <span className="text-[8px] md:text-[10px] font-black text-blue-500 uppercase tracking-widest md:tracking-[0.3em] mb-2 md:mb-4 block">{t('hub_details_vram')}</span>
                       <span className="text-xl md:text-3xl font-black text-blue-500 tracking-tighter">{selectedModel.min_vram_gb} GB</span>
                    </div>
                    <div className="bg-[var(--bg-input)]/50 p-6 md:p-8 rounded-2xl md:rounded-[2.5rem] border border-[var(--border)] shadow-premium relative overflow-hidden group">
                       <div className="absolute -bottom-2 -right-2 md:-bottom-4 md:-right-4 text-purple-500/5 group-hover:scale-110 transition-transform"><Brain size={72} /></div>
                       <span className="text-[8px] md:text-[10px] font-black text-[var(--text-muted)] uppercase tracking-widest md:tracking-[0.3em] mb-2 md:mb-4 block">{t('hub_details_type')}</span>
                       <span className="text-lg md:text-2xl font-black text-[var(--text-primary)] uppercase truncate block tracking-tighter">{selectedModel.pipeline_tag}</span>
                    </div>
                 </div>

                 <div className="space-y-10 md:space-y-16 mb-12 md:mb-20">
                    <div>
                       <h4 className="flex items-center gap-3 md:gap-4 text-[10px] md:text-xs font-black text-[var(--text-primary)] uppercase tracking-[0.3em] md:tracking-[0.5em] mb-4 md:mb-8">
                          <div className="w-8 h-8 md:w-10 md:h-10 bg-blue-600/10 rounded-xl flex items-center justify-center text-blue-500"><FileText size={20} /></div>
                          {t('hub_details_desc')}
                       </h4>
                       <div className="bg-[var(--bg-input)]/30 p-6 md:p-12 rounded-[2rem] md:rounded-[3.5rem] border border-[var(--border)]/50 font-medium shadow-inner">
                          <p className="text-sm md:text-xl text-[var(--text-secondary)] leading-relaxed">
                            {selectedModel.description || selectedModel.use_case}
                          </p>
                       </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-8 md:gap-16">
                       <div className="space-y-4 md:space-y-8">
                          <div className="flex items-center justify-between border-b border-[var(--border)]/50 pb-4 md:pb-8">
                             <span className="text-[var(--text-muted)] flex items-center gap-3 font-black uppercase tracking-widest text-[9px] md:text-[11px]"><User size={22} className="text-blue-500" /> {t('hub_details_author')}</span>
                             <span className="font-black text-[var(--text-primary)] tracking-tight text-xs md:text-lg">{selectedModel.author || selectedModel.provider}</span>
                          </div>
                          <div className="flex items-center justify-between border-b border-[var(--border)]/50 pb-4 md:pb-8">
                             <span className="text-[var(--text-muted)] flex items-center gap-3 font-black uppercase tracking-widest text-[9px] md:text-[11px]"><Shield size={22} className="text-emerald-500" /> {t('hub_details_license')}</span>
                             <span className="font-black text-emerald-500 tracking-tight uppercase text-xs md:text-lg">{selectedModel.license || 'Apache 2.0'}</span>
                          </div>
                       </div>
                       <div className="space-y-4 md:space-y-8">
                          <div className="flex items-center justify-between border-b border-[var(--border)]/50 pb-4 md:pb-8">
                             <span className="text-[var(--text-muted)] flex items-center gap-3 font-black uppercase tracking-widest text-[9px] md:text-[11px]"><Calendar size={22} className="text-purple-500" /> {t('hub_details_created')}</span>
                             <span className="font-black text-[var(--text-primary)] tracking-tight text-xs md:text-lg">{selectedModel.release_date || 'N/A'}</span>
                          </div>
                          <div className="flex items-center justify-between border-b border-[var(--border)]/50 pb-4 md:pb-8">
                             <span className="text-[var(--text-muted)] flex items-center gap-3 font-black uppercase tracking-widest text-[9px] md:text-[11px]"><Clock size={22} className="text-rose-500" /> {t('hub_details_updated')}</span>
                             <span className="font-black text-[var(--text-primary)] tracking-tight text-xs md:text-lg">{selectedModel.updated_at || selectedModel.release_date || 'N/A'}</span>
                          </div>
                       </div>
                    </div>
                 </div>

                 <button 
                   onClick={() => { handleInstall(selectedModel); setSelectedModel(null); }}
                   disabled={getFitScore(selectedModel) === 1}
                   className="w-full bg-[var(--text-primary)] text-[var(--bg-base)] hover:bg-blue-600 hover:text-white font-black py-6 md:py-10 rounded-2xl md:rounded-[3rem] transition-all shadow-premium flex items-center justify-center gap-4 md:gap-8 active:scale-[0.98] disabled:opacity-50 text-xs md:text-xl uppercase tracking-widest md:tracking-[0.4em] mb-10"
                 >
                    <Download size={40} />
                    {t('hub_install')}
                 </button>
              </div>
           </div>
        </div>
      )}

      <div className="bg-gradient-to-br from-[var(--bg-surface)] to-[var(--bg-base)] border border-[var(--border)] rounded-[2.5rem] md:rounded-[5rem] p-10 md:p-24 text-center shadow-premium relative overflow-hidden group">
         <div className="absolute -top-32 -right-32 w-[20rem] md:w-[35rem] h-[20rem] md:h-[35rem] bg-blue-600/5 blur-[100px] md:blur-[150px] rounded-full group-hover:scale-125 transition-all duration-1000" />
         <div className="w-16 h-16 md:w-24 md:h-24 bg-blue-600/10 rounded-2xl md:rounded-[2.5rem] flex items-center justify-center mx-auto mb-6 md:mb-10 text-blue-500 shadow-premium group-hover:rotate-12 transition-transform duration-700">
            <Monitor size={48} />
         </div>
         <h3 className="text-2xl md:text-5xl font-black text-[var(--text-primary)] mb-4 md:mb-6 tracking-tighter uppercase leading-none">Add Custom Models</h3>
         <p className="text-sm md:text-xl text-[var(--text-secondary)] max-w-2xl mx-auto mb-8 md:mb-14 font-medium opacity-80 leading-relaxed">
            Can't find a specific DeepSeek or Llama version? Enter a HuggingFace URL to scan and add it to your local registry.
         </p>
         <div className="flex flex-col sm:flex-row gap-4 justify-center max-w-2xl mx-auto bg-[var(--bg-input)]/50 p-2 rounded-2xl md:rounded-[3rem] border border-[var(--border)] shadow-inner">
            <input 
              type="text" 
              placeholder="https://huggingface.co/..." 
              className="flex-1 bg-transparent border-none rounded-xl md:rounded-2xl px-6 md:px-10 py-4 md:py-5 text-sm md:text-lg focus:outline-none text-[var(--text-primary)] font-medium" 
            />
            <button className="bg-blue-600 hover:bg-blue-500 text-white font-black text-[10px] md:text-sm uppercase tracking-widest md:tracking-[0.2em] px-8 md:px-12 py-4 md:py-5 rounded-xl md:rounded-[2.5rem] transition-all shadow-xl shadow-blue-600/30 active:scale-95">
               {t('save')}
            </button>
         </div>
      </div>
    </div>
  );
}
