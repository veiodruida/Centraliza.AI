import { useState, useEffect, useMemo } from 'react';
import { io } from 'socket.io-client';
import { Search, RefreshCw, FileText, Play, Terminal, Box, ArrowLeft, Zap, ChevronDown, Edit3, Trash2, FolderOpen, HardDrive, Info, ExternalLink } from 'lucide-react';
import HelpTooltip from '../components/HelpTooltip';
import { useToast } from '../components/Toast';
import DeleteModal, { type ModelItem } from '../components/DeleteModal';
import { useApp } from '../context/AppContext';

interface Model {
  name: string;
  path: string;
  size: number;
  isSymlink: boolean;
  targetPath?: string;
  finalModelName: string;
  source: string;
  ollamaTag?: string;
  repoId?: string;
  extension?: string;
  description?: string;
  centralPath?: string;
}

export default function MyModels() {
  const { t } = useApp();
  const [models, setModels] = useState<Model[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [viewingModel, setViewingModel] = useState<Model | null>(null);
  const [description, setDescription] = useState('');
  const [expandedSections, setExpandedSections] = useState<Record<string, boolean>>({
    'Ollama': true,
    'ComfyUI': true,
    'LM Studio': true,
    'Hugging Face': true
  });
  const [sectionOrder, setSectionOrder] = useState<string[]>(['Ollama', 'ComfyUI', 'LM Studio', 'Hugging Face', 'Standalone']);
  const [deleteModalData, setDeleteModalData] = useState<{ isOpen: boolean; models: ModelItem[]; initialAction?: 'delete' | 'decentralize' | 'centralize' | null }>({ isOpen: false, models: [], initialAction: null });
  const { showToast } = useToast();

  const fetchModels = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/models');
      const data = await res.json();
      // Deduplicate by path to prevent UI glitches
      const uniqueModels = data.filter((m: Model, index: number, self: Model[]) => 
        index === self.findIndex((t) => t.path === m.path)
      );
      setModels(uniqueModels);
    } catch (err) { 
      console.error('Backend unreachable.'); 
      showToast('Backend connection failed', 'error');
    }
    finally { setLoading(false); }
  };

  useEffect(() => { 
    fetchModels(); 
    const socket = io();
    socket.on('models-updated', () => fetchModels());
    fetch('/api/config').then(res => res.json()).then(data => {
      if (data.sectionOrder) setSectionOrder(data.sectionOrder);
    });
    return () => { socket.disconnect(); };
  }, []);

  useEffect(() => {
    if (viewingModel) {
      setDescription(t('loading'));
      fetch(`/api/model-readme?repoId=${viewingModel.repoId || ''}&localPath=${encodeURIComponent(viewingModel.path)}`)
        .then(res => res.text())
        .then(data => setDescription(data));
    }
  }, [viewingModel, t]);

  const handleLaunch = async (model: Model, type: string, extraParams: any = {}) => {
    if (type === 'llama.cpp' && !extraParams.threads) {
      showToast('Configuration required for llama.cpp', 'error');
      return;
    }
    try {
      const res = await fetch('/api/launch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type, modelPath: model.path, modelName: model.name, ollamaTag: model.ollamaTag, params: extraParams })
      });
      const data = await res.json();
      if (data.error) showToast(data.error, 'error');
      else showToast(data.message, 'success');
    } catch (e) { showToast(t('error'), 'error'); }
  };

  const handleOpenFolder = (path: string) => {
    fetch('/api/open-folder', { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify({folderPath: path})});
  };

  const handleCentralize = async (model: Model) => {
    try {
      const res = await fetch('/api/centralize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ modelPath: model.path, finalModelName: model.finalModelName || model.name })
      });
      if (res.ok) { showToast(t('central_centralized'), 'success'); fetchModels(); }
    } catch (err) { showToast(t('error'), 'error'); }
  };

  const handleRename = async (model: Model) => {
    const newName = prompt(t('name'), model.name.split('.')[0]);
    if (!newName) return;
    try {
      const res = await fetch('/api/models/rename', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ oldPath: model.path, newName })
      });
      if (res.ok) { showToast(t('settings_saved'), 'success'); fetchModels(); setViewingModel(null); }
      else { const data = await res.json(); showToast(data.error || t('error'), 'error'); }
    } catch (e) { showToast(t('error'), 'error'); }
  };

  const handleDelete = async (model: Model) => {
    setDeleteModalData({ isOpen: true, models: [model], initialAction: model.isSymlink ? 'decentralize' : 'delete' });
  };

  const handleModalConfirm = async (action: 'delete' | 'decentralize' | 'centralize') => {
    const targetModels = deleteModalData.models;
    if (targetModels.length === 0) return;
    for (const m of targetModels) {
      try {
        if (action === 'delete') await fetch('/api/models', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ modelPath: m.path, ollamaTag: m.ollamaTag }) });
        else if (action === 'centralize') await fetch('/api/centralize', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ modelPath: m.path, finalModelName: m.finalModelName || m.name }) });
        else if (action === 'decentralize') await fetch('/api/models', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ centralPath: m.centralPath }) });
      } catch (e) { console.error(e); }
    }
    showToast(t('settings_saved'), 'success');
    setDeleteModalData({ ...deleteModalData, isOpen: false });
    fetchModels();
  };

  const groupedModels = useMemo(() => {
    const filtered = models.filter(m => m.name.toLowerCase().includes(search.toLowerCase()) || m.source.toLowerCase().includes(search.toLowerCase()));
    const groups: Record<string, Model[]> = {};
    filtered.forEach(m => { if (!groups[m.source]) groups[m.source] = []; groups[m.source].push(m); });
    return groups;
  }, [models, search]);

  const formatSize = (bytes: number) => (bytes / (1024 ** 3)).toFixed(2) + ' GB';

  if (viewingModel) {
    return (
      <div className="p-3 sm:p-6 md:p-10 lg:p-12 max-w-7xl mx-auto animate-in slide-in-from-right-10 duration-700 pb-20">
        <button onClick={() => setViewingModel(null)} className="flex items-center gap-2 sm:gap-3 text-[var(--text-secondary)] hover:text-[var(--text-primary)] mb-6 sm:mb-8 md:mb-10 transition-all font-black text-[8px] sm:text-[9px] md:text-xs uppercase tracking-[0.15em] sm:tracking-[0.2em] group">
          <ArrowLeft size={16} className="sm:size-20 group-hover:-translate-x-2 transition-transform flex-shrink-0" /> {t('close')}
        </button>
        <div className="bg-[var(--bg-surface)] border border-[var(--border)] rounded-2xl sm:rounded-[2.5rem] md:rounded-[3rem] lg:rounded-[4rem] p-6 sm:p-8 md:p-10 lg:p-12 shadow-premium relative overflow-hidden backdrop-blur-3xl">
          <div className="absolute -top-32 -right-32 w-64 h-64 sm:w-96 sm:h-96 bg-blue-600/5 blur-[120px] rounded-full" />
          
          <header className="border-b border-[var(--border)] pb-6 sm:pb-8 md:pb-12 mb-6 sm:mb-8 md:mb-12 flex justify-between items-start flex-wrap gap-4 sm:gap-6 md:gap-8 lg:gap-10">
             <div className="space-y-3 sm:space-y-4 min-w-0 w-full sm:w-auto">
                <h2 className="text-2xl sm:text-3xl md:text-5xl lg:text-6xl font-black text-[var(--text-primary)] tracking-tighter leading-tight sm:leading-none truncate uppercase">{viewingModel.name}</h2>
                <div className="flex gap-1.5 sm:gap-2 md:gap-4 flex-wrap">
                   <span className="bg-[var(--bg-input)] px-2 sm:px-4 md:px-6 py-1 sm:py-2 md:py-2.5 rounded-lg sm:rounded-xl md:rounded-2xl text-[8px] sm:text-[9px] md:text-[10px] font-black text-[var(--text-secondary)] border border-[var(--border)] uppercase tracking-widest whitespace-nowrap">{viewingModel.source}</span>
                   <span className="bg-emerald-500/10 text-emerald-500 px-2 sm:px-4 md:px-6 py-1 sm:py-2 md:py-2.5 rounded-lg sm:rounded-xl md:rounded-2xl text-[8px] sm:text-[9px] md:text-[10px] font-black border border-emerald-500/20 uppercase tracking-widest shadow-sm whitespace-nowrap">{viewingModel.extension || 'MODULE'}</span>
                   <span className="bg-blue-500/10 text-blue-500 px-2 sm:px-4 md:px-6 py-1 sm:py-2 md:py-2.5 rounded-lg sm:rounded-xl md:rounded-2xl text-[8px] sm:text-[9px] md:text-[10px] font-black border border-blue-500/20 uppercase tracking-widest shadow-sm whitespace-nowrap">{formatSize(viewingModel.size)}</span>
                </div>
             </div>
             <div className="flex gap-2 sm:gap-3 md:gap-4 w-full sm:w-auto">
                <button onClick={() => handleLaunch(viewingModel, viewingModel.source.toLowerCase())} className="flex-1 sm:flex-none bg-[var(--text-primary)] text-[var(--bg-base)] hover:bg-blue-600 hover:text-white px-4 sm:px-8 md:px-12 py-3 sm:py-4 md:py-5 rounded-lg sm:rounded-xl md:rounded-[2.5rem] font-black text-[8px] sm:text-[9px] md:text-xs uppercase tracking-[0.1em] sm:tracking-[0.15em] md:tracking-[0.2em] transition-all flex items-center justify-center gap-2 sm:gap-3 md:gap-4 shadow-premium active:scale-95 whitespace-nowrap">
                   <Play size={16} className="sm:size-18 md:size-20" /> {t('dash_status')}
                </button>
                <button onClick={() => handleOpenFolder(viewingModel.path)} className="bg-[var(--bg-input)] border border-[var(--border)] hover:bg-[var(--border)] text-[var(--text-primary)] p-3 sm:p-4 md:p-5 rounded-lg sm:rounded-xl md:rounded-[1.5rem] transition-all shadow-premium active:scale-95 flex-shrink-0">
                   <FolderOpen size={20} className="sm:size-24" />
                </button>
             </div>
          </header>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 sm:gap-8 md:gap-10 lg:gap-14">
             <div className="lg:col-span-2 space-y-6 sm:space-y-8 md:space-y-10">
                <div>
                   <h3 className="text-[var(--text-primary)] font-black text-[8px] sm:text-[9px] md:text-[10px] lg:text-[11px] uppercase tracking-[0.2em] sm:tracking-[0.3em] md:tracking-[0.4em] lg:tracking-[0.5em] mb-4 sm:mb-6 md:mb-8 flex items-center gap-2 sm:gap-3 md:gap-4">
                      <div className="w-6 h-6 sm:w-8 sm:h-8 md:w-10 md:h-10 bg-blue-600/10 rounded-lg sm:rounded-lg md:rounded-xl flex items-center justify-center text-blue-500 flex-shrink-0"><FileText size={16} className="sm:size-18 md:size-20" /></div>
                      <span className="break-words">{t('hub_details_desc')}</span>
                   </h3>
                   <div className="bg-[var(--bg-input)]/30 p-4 sm:p-6 md:p-8 lg:p-10 rounded-lg sm:rounded-[2rem] md:rounded-[2.5rem] lg:rounded-[3.5rem] border border-[var(--border)] max-h-[300px] sm:max-h-[400px] md:max-h-[500px] lg:max-h-[600px] overflow-y-auto custom-scrollbar shadow-inner no-scrollbar">
                      <pre className="whitespace-pre-wrap font-sans text-xs sm:text-sm md:text-base text-[var(--text-secondary)] leading-relaxed font-medium">{description}</pre>
                   </div>
                </div>
             </div>

             <div className="space-y-6 sm:space-y-8 md:space-y-10">
                <div className="bg-[var(--bg-input)]/30 p-6 sm:p-8 md:p-10 rounded-lg sm:rounded-[2rem] md:rounded-[2.5rem] lg:rounded-[3.5rem] border border-[var(--border)] shadow-premium">
                   <h4 className="text-[8px] sm:text-[9px] md:text-[10px] lg:text-[11px] font-black text-[var(--text-muted)] uppercase tracking-[0.2em] sm:tracking-[0.3em] md:tracking-[0.4em] mb-4 sm:mb-6 md:mb-8 flex items-center gap-2 sm:gap-3">
                      <Info size={14} className="sm:size-16 text-purple-500 flex-shrink-0" /> {t('models_source')}
                   </h4>
                   <div className="space-y-3 sm:space-y-4 md:space-y-6">
                      <div className="flex justify-between items-center border-b border-[var(--border)]/50 pb-3 sm:pb-4 md:pb-6 gap-2">
                         <span className="text-[8px] sm:text-[9px] md:text-[10px] lg:text-[11px] font-black text-[var(--text-muted)] uppercase tracking-widest whitespace-nowrap">{t('size')}</span>
                         <span className="text-base sm:text-lg md:text-xl font-black text-[var(--text-primary)] tracking-tighter text-right">{formatSize(viewingModel.size)}</span>
                      </div>
                      <div className="flex justify-between items-center border-b border-[var(--border)]/50 pb-4 md:pb-6">
                         <span className="text-[9px] md:text-[11px] font-black text-[var(--text-muted)] uppercase tracking-widest">{t('central_centralized')}</span>
                         <span className={`text-[10px] md:text-xs font-black uppercase tracking-widest ${viewingModel.isSymlink ? 'text-emerald-500' : 'text-purple-500'}`}>{viewingModel.isSymlink ? t('yes') : t('no')}</span>
                      </div>
                   </div>
                   {!viewingModel.isSymlink && (
                      <button onClick={() => handleCentralize(viewingModel)} className="w-full bg-blue-600 hover:bg-blue-500 text-white font-black text-[10px] md:text-xs uppercase tracking-[0.2em] py-4 md:py-5 rounded-xl md:rounded-2xl mt-8 md:mt-10 transition-all flex items-center justify-center gap-3 md:gap-4 shadow-xl shadow-blue-600/30 active:scale-95">
                         <Zap size={20} /> {t('central_centralizeBtn')}
                      </button>
                   )}
                </div>

                <div className="bg-[var(--bg-input)]/30 p-8 md:p-10 rounded-[2rem] md:rounded-[3.5rem] border border-[var(--border)] shadow-premium">
                   <h4 className="text-[10px] md:text-[11px] font-black text-[var(--text-muted)] uppercase tracking-[0.3em] md:tracking-[0.4em] mb-6 md:mb-8 flex items-center gap-3">
                      <Terminal size={16} className="text-emerald-500" /> {t('models_actions')}
                   </h4>
                   <div className="flex flex-col gap-3 md:gap-4">
                      <button onClick={() => handleRename(viewingModel)} className="w-full bg-[var(--bg-surface)] hover:bg-[var(--border)] text-[var(--text-primary)] font-black py-4 md:py-5 rounded-xl md:rounded-2xl transition-all flex items-center justify-center gap-3 md:gap-4 text-[9px] md:text-[10px] uppercase tracking-[0.2em] border border-[var(--border)] shadow-sm active:scale-95">
                         <Edit3 size={18} /> {t('save')}
                      </button>
                      <button onClick={() => handleDelete(viewingModel)} className="w-full bg-red-500/10 hover:bg-red-500 text-red-500 hover:text-white font-black py-4 md:py-5 rounded-xl md:rounded-2xl transition-all flex items-center justify-center gap-3 md:gap-4 text-[9px] md:text-[10px] uppercase tracking-[0.2em] border border-red-500/20 shadow-sm active:scale-95">
                         <Trash2 size={18} /> {t('delete')}
                      </button>
                   </div>
                </div>
             </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 md:p-12 max-w-[90rem] mx-auto animate-in fade-in duration-1000 pb-20">
      <div className="flex flex-col lg:flex-row justify-between items-stretch lg:items-end mb-10 md:mb-14 gap-6 md:gap-8">
        <div className="space-y-2">
          <h2 className="text-3xl md:text-5xl font-black text-[var(--text-primary)] tracking-tighter leading-none flex items-center gap-4 uppercase">
            {t('models_title')}
            <HelpTooltip text={t('models_subtitle')} />
          </h2>
          <p className="text-[var(--text-secondary)] text-base md:text-xl font-medium opacity-80">{t('models_subtitle')}</p>
        </div>
        <div className="flex gap-3 md:gap-5 flex-wrap">
          <div className="relative group flex-1 sm:flex-none">
             <Search size={22} className="absolute left-4 md:left-6 top-1/2 -translate-y-1/2 text-[var(--text-muted)] group-focus-within:text-blue-500 transition-colors" />
             <input 
              type="text" 
              placeholder={t('models_search')} 
              value={search} 
              onChange={(e) => setSearch(e.target.value)} 
              className="w-full sm:w-64 md:w-96 bg-[var(--bg-surface)] border border-[var(--border)] rounded-xl md:rounded-[2rem] py-3.5 md:py-5 pl-12 md:pl-16 pr-6 md:pr-8 text-sm md:text-base focus:outline-none focus:ring-4 focus:ring-blue-600/10 text-[var(--text-primary)] shadow-premium transition-all font-medium" 
             />
          </div>
          <button onClick={fetchModels} className="bg-[var(--bg-surface)] hover:bg-[var(--bg-input)] text-[var(--text-primary)] p-4 md:p-5 rounded-xl md:rounded-[1.5rem] border border-[var(--border)] transition-all shadow-premium active:scale-95">
            <RefreshCw size={24} className={loading ? 'animate-spin' : ''} />
          </button>
        </div>
      </div>

      {!loading && models.length === 0 && (
        <div className="flex flex-col items-center justify-center py-12 sm:py-20 md:py-40 text-center bg-[var(--bg-surface)] rounded-xl sm:rounded-[2.5rem] md:rounded-[5rem] border border-[var(--border)] shadow-premium relative overflow-hidden">
          <div className="absolute top-0 left-0 w-full h-full bg-gradient-to-br from-blue-500/5 via-transparent to-purple-500/5" />
          <div className="w-20 h-20 sm:w-24 sm:h-24 md:w-32 md:h-32 rounded-lg sm:rounded-2xl md:rounded-[2.5rem] bg-[var(--bg-input)] border border-[var(--border)] flex items-center justify-center mb-4 sm:mb-6 md:mb-8 shadow-premium relative z-10">
            <HardDrive size={40} className="sm:size-56 md:size-14 text-[var(--text-muted)] opacity-50" />
          </div>
          <h3 className="text-[var(--text-primary)] font-black text-xl sm:text-2xl md:text-4xl mb-2 sm:mb-3 md:mb-4 tracking-tighter relative z-10 break-words">{t('models_noModels')}</h3>
          <p className="text-[var(--text-secondary)] max-w-xs sm:max-w-sm md:max-w-md text-sm sm:text-base md:text-lg font-medium relative z-10 leading-relaxed opacity-80">{t('models_noModelsDesc')}</p>
        </div>
      )}

      <div className="space-y-6 sm:space-y-8 md:space-y-12">
        {sectionOrder.map(source => {
          const items = groupedModels[source] || [];
          if (items.length === 0) return null;
          const isExpanded = expandedSections[source] !== false;
          return (
            <div key={source} className="bg-[var(--bg-surface)] border border-[var(--border)] rounded-lg sm:rounded-[2rem] md:rounded-[4rem] overflow-hidden shadow-premium backdrop-blur-3xl group\">
              <div 
                className="flex items-center justify-between p-4 sm:p-6 md:p-10 cursor-pointer hover:bg-[var(--bg-input)]/30 transition-all\" 
                onClick={() => setExpandedSections(prev => ({ ...prev, [source]: !isExpanded }))}
              >
                 <div className="flex items-center gap-4 md:gap-8">
                    <div className={`w-14 h-14 md:w-20 md:h-20 rounded-xl md:rounded-[2rem] flex items-center justify-center text-white shadow-premium transition-all duration-700 shrink-0 ${isExpanded ? 'scale-110 rotate-3 shadow-blue-500/30' : 'scale-90 opacity-40'} ${source === 'Ollama' ? 'bg-gradient-to-br from-blue-600 to-blue-400' : source === 'ComfyUI' ? 'bg-gradient-to-br from-purple-600 to-pink-500' : 'bg-gradient-to-br from-slate-800 to-slate-600'}`}>
                      <Box size={40} />
                    </div>
                    <div className="min-w-0">
                       <h3 className="text-xl md:text-3xl font-black text-[var(--text-primary)] tracking-tighter uppercase truncate">{source}</h3>
                       <div className="flex items-center gap-2 md:gap-3">
                          <span className="w-1.5 h-1.5 rounded-full bg-blue-500 animate-pulse" />
                          <p className="text-[9px] md:text-xs text-[var(--text-muted)] font-black uppercase tracking-widest md:tracking-[0.3em] truncate">{items.length} {t('models_title')}</p>
                       </div>
                    </div>
                 </div>
                 <div className="flex items-center gap-4 md:gap-6 shrink-0">
                    <div className={`w-10 h-10 md:w-12 md:h-12 rounded-full border border-[var(--border)] flex items-center justify-center text-[var(--text-muted)] transition-all duration-500 ${isExpanded ? 'rotate-180' : ''}`}>
                       <ChevronDown size={24} />
                    </div>
                 </div>
              </div>

              {isExpanded && (
                <div className="border-t border-[var(--border)] p-6 md:p-10 grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-6 md:gap-8 animate-in fade-in duration-700 zoom-in-95">
                   {items.map(m => (
                      <div 
                        key={m.path} 
                        onClick={() => setViewingModel(m)} 
                        className="bg-[var(--bg-input)]/40 border border-[var(--border)] rounded-[2rem] md:rounded-[3rem] p-6 md:p-8 hover:border-blue-500/50 transition-all cursor-pointer group/card relative overflow-hidden shadow-sm hover:shadow-premium active:scale-[0.98] flex flex-col"
                      >
                         <div className="absolute top-0 right-0 p-4 md:p-6 opacity-0 group-hover/card:opacity-100 transition-all translate-x-4 group-hover/card:translate-x-0">
                            <ExternalLink size={20} className="text-blue-500" />
                         </div>
                         
                         <div className="flex justify-between items-start mb-4 md:mb-6">
                            <span className={`text-[8px] md:text-[9px] font-black px-3 md:px-4 py-1 md:py-1.5 rounded-full uppercase tracking-widest border shadow-sm ${m.isSymlink ? 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20' : 'bg-[var(--bg-surface)] text-[var(--text-muted)] border-[var(--border)]'}`}>
                               {m.isSymlink ? t('central_centralized') : t('central_standalone')}
                            </span>
                         </div>
                         
                         <h4 className="text-xl md:text-2xl font-black text-[var(--text-primary)] mb-2 line-clamp-1 tracking-tighter group-hover/card:text-blue-500 transition-colors uppercase">{m.name}</h4>
                         <p className="text-[var(--text-muted)] text-[9px] md:text-[11px] font-mono mb-6 md:mb-10 truncate font-bold opacity-60">{m.path}</p>
                         
                         <div className="flex justify-between items-end mt-auto gap-4">
                            <div className="flex flex-col gap-0.5 md:gap-1 min-w-0">
                               <span className="text-[9px] md:text-[10px] font-black text-[var(--text-muted)] uppercase tracking-widest">{t('size')}</span>
                               <span className="text-lg md:text-xl font-black text-[var(--text-primary)] tracking-tighter">{formatSize(m.size)}</span>
                            </div>
                            <div className="flex gap-2 md:gap-3 relative z-10 shrink-0">
                               <button 
                                onClick={(e) => { e.stopPropagation(); handleOpenFolder(m.path); }} 
                                className="w-10 h-10 md:w-12 md:h-12 bg-[var(--bg-surface)] text-[var(--text-muted)] hover:text-blue-500 rounded-xl md:rounded-2xl border border-[var(--border)] flex items-center justify-center transition-all hover:shadow-md active:scale-90"
                                title={t('search')}
                               >
                                  <FolderOpen size={20} />
                               </button>
                               <button 
                                onClick={(e) => { e.stopPropagation(); handleDelete(m); }} 
                                className="w-10 h-10 md:w-12 md:h-12 bg-red-500/5 text-red-500 hover:bg-red-500 hover:text-white rounded-xl md:rounded-2xl border border-red-500/10 flex items-center justify-center transition-all hover:shadow-md active:scale-90"
                                title={t('delete')}
                               >
                                  <Trash2 size={20} />
                               </button>
                            </div>
                         </div>
                      </div>
                   ))}
                </div>
              )}
            </div>
          );
        })}
      </div>

      <DeleteModal 
        isOpen={deleteModalData.isOpen}
        onClose={() => setDeleteModalData({ ...deleteModalData, isOpen: false })}
        onConfirm={handleModalConfirm}
        models={deleteModalData.models}
        initialAction={deleteModalData.initialAction}
      />
    </div>
  );
}
