import { useState, useEffect, useMemo } from 'react';
import { Search, Download, Star, Filter, ArrowRight, Zap, Info, CheckCircle, AlertTriangle, XCircle, Terminal, Image as ImageIcon, MessageSquare, Brain, Clock, TrendingUp, Monitor } from 'lucide-react';

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
  gguf_sources?: any[];
}

type SortOption = 'Popular' | 'Newest' | 'Best Fit';

export default function ExploreStore() {
  const [sysInfo, setSysInfo] = useState<any>(null);
  const [registry, setRegistry] = useState<RegistryModel[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [activeFilter, setActiveFilter] = useState('All');
  const [activeSort, setActiveSort] = useState<SortOption>('Best Fit');
  const [downloadingModel, setDownloadingModel] = useState<string | null>(null);
  const [downloadStatus, setDownloadStatus] = useState<string>('');

  useEffect(() => {
    fetch('/api/registry')
      .then(res => res.json())
      .then(data => {
        setRegistry(data);
        setLoading(false);
      })
      .catch(() => setLoading(false));

    fetch('/api/system-info')
      .then(res => res.json())
      .then(setSysInfo);
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
    let list = [...registry];
    
    // Filter
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

    // Sort
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
  }, [registry, search, activeFilter, activeSort, sysInfo]);

  const handleInstall = async (model: RegistryModel) => {
    setDownloadingModel(model.name);
    setDownloadStatus('Requesting...');
    try {
      const res = await fetch('/api/download', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ modelName: model.name.split('/').pop() })
      });
      const data = await res.json();
      setDownloadStatus('Ollama Pulling...');
      setTimeout(() => setDownloadingModel(null), 5000);
    } catch (e) {
      setDownloadStatus('Download error');
      setTimeout(() => setDownloadingModel(null), 3000);
    }
  };

  if (loading) return <div className="p-20 text-center animate-pulse text-slate-500 font-black">SYNCING WITH MODEL HUB...</div>;

  return (
    <div className="p-8 max-w-7xl mx-auto animate-in fade-in duration-700">
      <header className="mb-10">
        <div className="flex justify-between items-start mb-8 gap-4 flex-wrap">
          <div>
            <h2 className="text-4xl font-black text-white mb-2">AI Model Hub</h2>
            <p className="text-slate-500 max-w-md">Discover top-tier models from HuggingFace and Ollama library.</p>
          </div>
          <div className="bg-slate-900 border border-slate-800 px-6 py-4 rounded-[2.5rem] flex items-center gap-6 shadow-2xl">
             <div className="flex flex-col">
                <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Active GPU</span>
                <span className="text-sm font-bold text-slate-200 truncate max-w-[180px]">{sysInfo?.gpuName || 'Detecting...'}</span>
             </div>
             <div className="h-8 w-px bg-slate-800"></div>
             <div className="flex flex-col">
                <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest">VRAM Status</span>
                <span className="text-sm font-bold text-blue-400">
                  {sysInfo ? `${(sysInfo.vram / (1024 ** 3)).toFixed(1)} GB` : '--'}
                </span>
             </div>
          </div>
        </div>

        <div className="flex flex-wrap gap-6 items-center">
          <div className="relative flex-1 min-w-[300px]">
            <Search className="absolute left-5 top-1/2 -translate-y-1/2 text-slate-500" size={20} />
            <input 
              type="text" 
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search DeepSeek, Llama, Stable Diffusion..." 
              className="w-full bg-slate-900 border border-slate-800 rounded-[1.5rem] py-4 pl-14 pr-6 text-white focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all shadow-lg"
            />
          </div>
          
          <div className="flex bg-slate-900 p-1 rounded-2xl border border-slate-800 shadow-lg flex-wrap">
            {filters.map(f => (
              <button 
                key={f}
                onClick={() => setActiveFilter(f)}
                className={`px-4 py-2 rounded-xl text-[10px] font-black uppercase transition-all ${
                  activeFilter === f ? 'bg-blue-600 text-white shadow-lg' : 'text-slate-500 hover:text-slate-300'
                }`}
              >
                {f}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-2 bg-slate-900 p-1 rounded-2xl border border-slate-800 ml-auto">
             {(['Best Fit', 'Popular', 'Newest'] as SortOption[]).map(s => (
               <button 
                key={s}
                onClick={() => setActiveSort(s)}
                className={`px-3 py-2 rounded-xl text-[10px] font-black uppercase flex items-center gap-2 transition-all ${
                  activeSort === s ? 'bg-slate-700 text-white' : 'text-slate-500 hover:text-slate-400'
                }`}
               >
                 {s === 'Popular' && <TrendingUp size={12} />}
                 {s === 'Newest' && <Clock size={12} />}
                 {s === 'Best Fit' && <Zap size={12} />}
                 {s}
               </button>
             ))}
          </div>
        </div>
      </header>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-8 mb-12">
        {filteredModels.slice(0, 24).map((model) => {
          const score = getFitScore(model);
          const isDownloading = downloadingModel === model.name;

          return (
            <div key={model.name} className="bg-slate-900/40 border border-slate-800 rounded-[3rem] p-8 flex flex-col hover:border-blue-500/50 transition-all group backdrop-blur-xl hover:shadow-2xl hover:shadow-blue-500/10 relative overflow-hidden">
              {/* Background Glow */}
              <div className={`absolute -top-24 -right-24 w-48 h-48 rounded-full blur-[80px] opacity-0 group-hover:opacity-20 transition-opacity ${
                score === 3 ? 'bg-emerald-500' : score === 2 ? 'bg-yellow-500' : 'bg-red-500'
              }`} />

              <div className="flex justify-between items-start mb-6">
                <div className={`w-14 h-14 rounded-2xl flex items-center justify-center text-white bg-slate-800 border border-slate-700`}>
                  {model.pipeline_tag?.includes('image') ? <ImageIcon size={28} className="text-rose-400" /> :
                   model.pipeline_tag?.includes('text') ? <MessageSquare size={28} className="text-blue-400" /> :
                   <Brain size={28} className="text-purple-400" />}
                </div>
                {score === 3 ? (
                  <div className="flex items-center gap-1.5 text-emerald-400 text-[9px] font-black uppercase bg-emerald-400/10 px-4 py-1.5 rounded-full border border-emerald-400/20 shadow-sm shadow-emerald-400/10">
                    <CheckCircle size={10} /> Perfect Fit
                  </div>
                ) : score === 2 ? (
                  <div className="flex items-center gap-1.5 text-yellow-400 text-[9px] font-black uppercase bg-yellow-400/10 px-4 py-1.5 rounded-full border border-yellow-400/20">
                    <AlertTriangle size={10} /> Needs RAM
                  </div>
                ) : (
                  <div className="flex items-center gap-1.5 text-red-400 text-[9px] font-black uppercase bg-red-400/10 px-4 py-1.5 rounded-full border border-red-400/20">
                    <XCircle size={10} /> Too Large
                  </div>
                )}
              </div>

              <div className="flex-1">
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest">{model.provider}</span>
                  <span className="w-1 h-1 rounded-full bg-slate-800"></span>
                  <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest">{model.parameter_count}</span>
                </div>
                <h4 className="text-2xl font-black text-white mb-3 group-hover:text-blue-400 transition-colors line-clamp-1">{model.name.split('/').pop()}</h4>
                <p className="text-slate-500 text-xs font-medium leading-relaxed mb-8 line-clamp-2">{model.use_case}</p>
                
                <div className="flex gap-2 mb-8">
                   <div className="bg-slate-800/50 px-3 py-1.5 rounded-xl border border-slate-700/50 flex items-center gap-2">
                      <Download size={12} className="text-slate-500" />
                      <span className="text-[10px] font-bold text-slate-400">{(model.hf_downloads / 1000).toFixed(0)}k</span>
                   </div>
                   <div className="bg-slate-800/50 px-3 py-1.5 rounded-xl border border-slate-700/50 flex items-center gap-2">
                      <Star size={12} className="text-yellow-500" />
                      <span className="text-[10px] font-bold text-slate-400">{model.hf_likes || 0}</span>
                   </div>
                </div>
              </div>

              <div className="flex items-center justify-between mt-auto">
                <div className="flex flex-col">
                  <span className="text-[9px] font-black text-slate-600 uppercase tracking-widest">Weight</span>
                  <span className="text-lg font-black text-slate-100">{model.min_vram_gb} <span className="text-xs text-slate-500">GB</span></span>
                </div>
                {isDownloading ? (
                   <div className="bg-blue-600/10 text-blue-400 px-6 py-3 rounded-2xl text-[10px] font-black uppercase animate-pulse border border-blue-500/20">
                      {downloadStatus}
                   </div>
                ) : (
                  <button 
                    onClick={() => handleInstall(model)}
                    disabled={score === 1}
                    className={`flex items-center gap-3 px-8 py-3.5 rounded-[1.25rem] font-black text-xs transition-all ${
                      score === 1 
                        ? 'bg-slate-800/50 text-slate-600 cursor-not-allowed border border-slate-700/50' 
                        : 'bg-white text-black hover:bg-blue-600 hover:text-white shadow-2xl hover:shadow-blue-600/40 active:scale-95'
                    }`}
                  >
                    <Download size={18} />
                    INSTALL
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>

      <div className="bg-gradient-to-br from-slate-900 to-black border border-slate-800 rounded-[4rem] p-16 text-center shadow-3xl">
         <Monitor size={48} className="mx-auto mb-6 text-blue-500 opacity-50" />
         <h3 className="text-3xl font-black text-white mb-4">Add Custom Models</h3>
         <p className="text-slate-500 max-w-xl mx-auto mb-10 leading-relaxed">
            Can't find a specific DeepSeek or Llama version? Enter a HuggingFace URL to scan and add it to your local registry.
         </p>
         <div className="flex gap-4 justify-center max-w-md mx-auto">
            <input type="text" placeholder="https://huggingface.co/..." className="flex-1 bg-slate-800 border border-slate-700 rounded-2xl px-6 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
            <button className="bg-blue-600 hover:bg-blue-500 text-white font-black text-xs uppercase tracking-widest px-8 py-3 rounded-2xl transition-all shadow-lg shadow-blue-600/20">
               ADD
            </button>
         </div>
      </div>
    </div>
  );
}
