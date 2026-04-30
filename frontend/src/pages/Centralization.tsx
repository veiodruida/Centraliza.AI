import { useState, useEffect, useMemo } from 'react';
import { Shield, HardDrive, RefreshCw, Layers, Trash2, CheckSquare, Square, Filter, SortAsc, SortDesc, Zap, Link as LinkIcon, Unlink, Box } from 'lucide-react';
import HelpTooltip from '../components/HelpTooltip';
import { useApp } from '../context/AppContext';
import { useToast } from '../components/Toast';

type SortField = 'name' | 'size' | 'source';

export default function Centralization() {
  const { t } = useApp();
  const { showToast } = useToast();
  const [models, setModels] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState(false);
  const [selectedPaths, setSelectedPaths] = useState<Set<string>>(new Set());
  const [activeFilter, setActiveFilter] = useState<'all' | 'standalone' | 'centralized'>('all');
  const [sortField, setSortField] = useState<SortField>('name');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('asc');

  const fetchModels = () => {
    setLoading(true);
    fetch('/api/models')
      .then(res => res.json())
      .then(data => {
        setModels(data);
        setLoading(false);
      });
  };

  useEffect(() => { fetchModels(); }, []);

  const filteredAndSortedModels = useMemo(() => {
    let list = [...models];

    // Filter
    if (activeFilter === 'standalone') list = list.filter(m => !m.isSymlink);
    else if (activeFilter === 'centralized') list = list.filter(m => m.isSymlink);

    // Sort
    list.sort((a, b) => {
      let valA, valB;
      if (sortField === 'name') { valA = a.name.toLowerCase(); valB = b.name.toLowerCase(); }
      else if (sortField === 'size') { valA = a.size; valB = b.size; }
      else { valA = a.source.toLowerCase(); valB = b.source.toLowerCase(); }

      if (valA < valB) return sortOrder === 'asc' ? -1 : 1;
      if (valA > valB) return sortOrder === 'asc' ? 1 : -1;
      return 0;
    });

    return list;
  }, [models, activeFilter, sortField, sortOrder]);

  const toggleSelect = (path: string) => {
    const next = new Set(selectedPaths);
    if (next.has(path)) next.delete(path);
    else next.add(path);
    setSelectedPaths(next);
  };

  const handleSelectAll = () => {
    const standalones = filteredAndSortedModels.filter(m => !m.isSymlink);
    if (selectedPaths.size === standalones.length) setSelectedPaths(new Set());
    else setSelectedPaths(new Set(standalones.map(m => m.path)));
  };

  const handleCentralizeSelected = async () => {
    if (selectedPaths.size === 0) return;
    setProcessing(true);
    const toProcess = models.filter(m => selectedPaths.has(m.path) && !m.isSymlink);
    
    let count = 0;
    for (const m of toProcess) {
      try {
        const res = await fetch('/api/centralize', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ modelPath: m.path, finalModelName: m.finalModelName })
        });
        if (res.ok) count++;
      } catch (e) { console.error(e); }
    }
    
    showToast(`${count} models centralized`, 'success');
    setProcessing(false);
    setSelectedPaths(new Set());
    fetchModels();
  };

  const handleDecentralize = async (model: any) => {
    if (!confirm(t('confirm'))) return;
    try {
      const res = await fetch('/api/models/remove-link', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path: model.path })
      });
      if (res.ok) {
        showToast(t('central_decentralizeBtn'), 'success');
        fetchModels();
      }
    } catch (e) { showToast(t('error'), 'error'); }
  };

  const spaceSaved = models.filter(m => m.isSymlink).reduce((acc, m) => acc + m.size, 0);
  const standaloneCount = models.filter(m => !m.isSymlink).length;

  if (loading) return <div className="p-12 md:p-20 text-center animate-pulse text-[var(--text-secondary)] font-black uppercase tracking-widest text-xs">{t('loading')}</div>;

  return (
    <div className="p-6 md:p-12 max-w-6xl mx-auto animate-in fade-in duration-1000 pb-20">
      <header className="mb-10 md:mb-14 flex justify-between items-start flex-wrap gap-8">
        <div className="space-y-2">
            <h2 className="text-3xl md:text-5xl font-black text-[var(--text-primary)] tracking-tighter leading-none flex items-center gap-4 uppercase">
             {t('central_title')}
             <HelpTooltip text={t('central_subtitle')} />
           </h2>
           <p className="text-[var(--text-secondary)] text-base md:text-xl font-medium opacity-80">{t('central_subtitle')}</p>
        </div>
        <div className="flex gap-3 md:gap-4 w-full sm:w-auto">
          <button 
            onClick={async () => {
              const res = await fetch('/api/models/sanity-check', { method: 'POST' });
              const data = await res.json();
              showToast(t('central_sanityCheck') + `: ${data.cleaned}`, 'success');
              fetchModels();
            }}
            className="flex-1 sm:flex-none bg-[var(--bg-surface)] px-6 md:px-10 py-4 md:py-5 rounded-2xl md:rounded-[2rem] border border-[var(--border)] text-[10px] md:text-xs font-black uppercase tracking-widest text-[var(--text-primary)] hover:border-emerald-500/50 transition-all flex items-center justify-center gap-3 md:gap-4 shadow-premium active:scale-95 group"
          >
            <Shield size={18} className="text-emerald-500 group-hover:scale-110 transition-transform" /> {t('central_sanityCheck')}
          </button>
          <button onClick={fetchModels} className="bg-[var(--bg-surface)] p-4 md:p-5 rounded-xl md:rounded-[1.5rem] border border-[var(--border)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-all shadow-premium active:scale-95">
             <RefreshCw size={24} className={loading ? 'animate-spin' : ''} />
          </button>
        </div>
      </header>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 md:gap-10 mb-10 md:mb-14">
         <div className="bg-[var(--bg-surface)] border border-[var(--border)] p-8 md:p-12 rounded-[2.5rem] md:rounded-[4rem] relative overflow-hidden group shadow-premium">
            <div className="absolute top-0 right-0 p-8 md:p-12 opacity-5 text-blue-500 group-hover:scale-125 transition-all"><HardDrive size={160} /></div>
            <h3 className="text-[10px] md:text-xs font-black text-[var(--text-muted)] uppercase tracking-[0.2em] md:tracking-[0.3em] mb-4 md:mb-6 flex items-center gap-3">
              {t('central_spaceSaved')}
              <HelpTooltip text={t('central_spaceSavedHelp')} />
            </h3>
            <div className="flex items-baseline gap-2 relative z-10">
               <p className="text-5xl md:text-8xl font-black text-[var(--text-primary)] tracking-tighter">{(spaceSaved / (1024**3)).toFixed(1)}</p>
               <span className="text-lg md:text-2xl font-black text-blue-500 uppercase tracking-widest">GB</span>
            </div>
         </div>
         <div className="bg-[var(--bg-surface)] border border-[var(--border)] p-8 md:p-12 rounded-[2.5rem] md:rounded-[4rem] relative overflow-hidden group shadow-premium">
            <div className="absolute top-0 right-0 p-8 md:p-12 opacity-5 text-purple-500 group-hover:scale-125 transition-all"><Layers size={160} /></div>
            <h3 className="text-[10px] md:text-xs font-black text-[var(--text-muted)] uppercase tracking-[0.2em] md:tracking-[0.3em] mb-4 md:mb-6 flex items-center gap-3">
              {t('central_standalone')}
              <HelpTooltip text={t('central_standaloneHelp')} />
            </h3>
            <div className="flex items-baseline gap-2 relative z-10">
               <p className="text-5xl md:text-8xl font-black text-[var(--text-primary)] tracking-tighter">{standaloneCount}</p>
               <span className="text-lg md:text-2xl font-black text-purple-500 uppercase tracking-widest">MODS</span>
            </div>
         </div>
      </div>

      <div className="bg-[var(--bg-surface)]/50 border border-[var(--border)] rounded-[2.5rem] md:rounded-[4rem] p-6 md:p-12 mb-10 md:mb-14 shadow-premium backdrop-blur-3xl">
         <div className="flex flex-col lg:flex-row justify-between items-stretch lg:items-center mb-8 md:mb-12 gap-6 md:gap-8">
            <div className="flex bg-[var(--bg-input)] p-1 md:p-1.5 rounded-xl md:rounded-[1.5rem] border border-[var(--border)] shadow-inner overflow-x-auto no-scrollbar scroll-smooth">
               {(['all', 'standalone', 'centralized'] as const).map(f => (
                 <button 
                  key={f}
                  onClick={() => setActiveFilter(f)}
                  className={`px-6 md:px-8 py-2.5 md:py-3.5 rounded-lg md:rounded-xl text-[9px] md:text-[10px] font-black uppercase tracking-widest transition-all flex items-center gap-2 md:gap-3 active:scale-95 shrink-0 ${
                    activeFilter === f ? 'bg-blue-600 text-white shadow-xl shadow-blue-600/30' : 'text-[var(--text-muted)] hover:text-[var(--text-primary)]'
                  }`}
                 >
                   <Filter size={14} /> {t(`central_filter${f.charAt(0).toUpperCase() + f.slice(1)}` as any)}
                 </button>
               ))}
            </div>

            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-4 md:gap-6">
               <div className="flex bg-[var(--bg-input)] p-1 md:p-1.5 rounded-xl md:rounded-[1.5rem] border border-[var(--border)] shadow-inner overflow-x-auto no-scrollbar scroll-smooth">
                  {(['name', 'size', 'source'] as SortField[]).map(field => (
                    <button 
                      key={field}
                      onClick={() => {
                        if (sortField === field) setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
                        else { setSortField(field); setSortOrder('asc'); }
                      }}
                      className={`px-4 md:px-6 py-2.5 md:py-3.5 rounded-lg md:rounded-xl text-[9px] md:text-[10px] font-black uppercase tracking-widest flex items-center gap-2 md:gap-3 transition-all active:scale-95 shrink-0 ${
                        sortField === field ? 'bg-[var(--border)] text-[var(--text-primary)] shadow-lg' : 'text-[var(--text-muted)] hover:text-[var(--text-primary)]'
                      }`}
                    >
                      {t(`central_sort${field.charAt(0).toUpperCase() + field.slice(1)}` as any)}
                      {sortField === field && (sortOrder === 'asc' ? <SortAsc size={14} className="text-blue-500" /> : <SortDesc size={14} className="text-blue-500" />)}
                    </button>
                  ))}
               </div>
               
               <div className="hidden sm:block h-8 w-px bg-[var(--border)] mx-1"></div>

               <button onClick={handleSelectAll} className="text-[9px] md:text-[10px] font-black text-[var(--text-muted)] hover:text-[var(--text-primary)] uppercase tracking-widest flex items-center justify-center gap-2 md:gap-3 px-4 md:px-6 py-3 md:py-3.5 hover:bg-[var(--bg-input)] rounded-xl md:rounded-2xl transition-all active:scale-95">
                  {selectedPaths.size === models.filter(m => !m.isSymlink).length ? <CheckSquare size={20} className="text-blue-500" /> : <Square size={20} />} 
                  <span className="hidden sm:inline">{selectedPaths.size > 0 ? t('central_deselectAll') : t('central_selectAll')}</span>
                  <span className="sm:hidden">{selectedPaths.size > 0 ? 'DESELECT' : 'SELECT ALL'}</span>
               </button>

               <button 
                 onClick={handleCentralizeSelected}
                 disabled={selectedPaths.size === 0 || processing}
                 className="bg-blue-600 hover:bg-blue-500 text-white text-[10px] md:text-[11px] font-black uppercase tracking-widest md:tracking-[0.2em] px-8 md:px-12 py-4 md:py-5 rounded-xl md:rounded-[2rem] transition-all shadow-xl shadow-blue-600/40 disabled:opacity-50 flex items-center justify-center gap-3 md:gap-4 active:scale-95"
               >
                  {processing ? <RefreshCw size={18} className="animate-spin" /> : <Zap size={18} />}
                  {t('central_centralizeBtn')} ({selectedPaths.size})
               </button>
            </div>
         </div>

         <div className="space-y-3 md:space-y-4 max-h-[600px] md:max-h-[800px] overflow-y-auto pr-2 md:pr-6 custom-scrollbar no-scrollbar">
            {filteredAndSortedModels.length === 0 ? (
               <div className="p-16 md:p-32 text-center text-[var(--text-muted)] font-black uppercase tracking-widest md:tracking-[0.5em] bg-[var(--bg-input)]/20 rounded-[2rem] md:rounded-[4rem] border border-dashed border-[var(--border)] text-[10px] md:text-sm">
                  {t('models_noModels')}
               </div>
            ) : (
               filteredAndSortedModels.map(m => (
                  <div 
                    key={m.path} 
                    className={`flex flex-col sm:flex-row sm:items-center justify-between p-6 md:p-8 rounded-2xl md:rounded-[2.5rem] border transition-all cursor-pointer group relative overflow-hidden gap-6 ${
                      selectedPaths.has(m.path) 
                        ? 'bg-blue-600/10 border-blue-500 shadow-2xl shadow-blue-600/10' 
                        : 'bg-[var(--bg-input)]/30 border-[var(--border)] hover:border-[var(--text-secondary)] hover:bg-[var(--bg-input)]'
                    }`} 
                    onClick={() => !m.isSymlink && toggleSelect(m.path)}
                  >
                     <div className="flex items-center gap-4 md:gap-8 relative z-10 min-w-0">
                        {!m.isSymlink ? (
                          <div className={`w-8 h-8 md:w-10 md:h-10 rounded-xl md:rounded-2xl flex items-center justify-center border-2 transition-all shrink-0 ${
                            selectedPaths.has(m.path) ? 'bg-blue-600 border-blue-500 text-white shadow-xl shadow-blue-600/30' : 'bg-transparent border-[var(--border)] text-transparent group-hover:border-[var(--text-secondary)]'
                          }`}>
                             <CheckSquare size={22} />
                          </div>
                        ) : (
                          <div className="w-10 h-10 md:w-12 md:h-12 rounded-xl md:rounded-2xl flex items-center justify-center bg-emerald-500/10 border-2 border-emerald-500/20 text-emerald-500 shadow-premium shrink-0">
                             <LinkIcon size={24} />
                          </div>
                        )}
                        <div className="flex flex-col gap-1 md:gap-2 min-w-0">
                           <div className="flex items-center gap-3 md:gap-4 flex-wrap">
                              <span className={`font-black text-lg md:text-xl tracking-tighter truncate max-w-[150px] md:max-w-none ${m.isSymlink ? 'text-emerald-500' : 'text-[var(--text-primary)]'}`}>{m.name}</span>
                              <span className={`text-[8px] md:text-[9px] font-black px-2 md:px-3 py-0.5 md:py-1 rounded-full uppercase tracking-widest ${m.isSymlink ? 'bg-emerald-500/10 text-emerald-500 border border-emerald-500/20' : 'bg-[var(--bg-input)] text-[var(--text-muted)] border border-[var(--border)]'}`}>
                                 {m.isSymlink ? t('central_centralized') : t('central_standalone')}
                              </span>
                           </div>
                           <div className="flex items-center gap-4 md:gap-6">
                              <span className="text-[9px] md:text-[11px] font-mono text-[var(--text-muted)] truncate max-w-[120px] md:max-w-lg font-bold">{m.path}</span>
                              <div className="flex items-center gap-1.5 md:gap-2 shrink-0">
                                 <Box size={14} className="text-blue-500/50" />
                                 <span className="text-[9px] md:text-[10px] font-black text-blue-500 uppercase tracking-widest">{m.source}</span>
                              </div>
                           </div>
                        </div>
                     </div>
                     <div className="flex items-center justify-between sm:justify-end gap-6 md:gap-12 relative z-10 shrink-0">
                        <div className="flex flex-col items-end">
                           <span className="text-[8px] md:text-[10px] font-black text-[var(--text-muted)] uppercase tracking-widest mb-0.5">{t('models_size')}</span>
                           <span className="text-xl md:text-2xl font-black text-[var(--text-primary)] tracking-tighter">{(m.size / (1024**3)).toFixed(1)} <span className="text-xs md:text-sm text-[var(--text-secondary)]">GB</span></span>
                        </div>
                        <div className="flex items-center gap-2">
                           {m.isSymlink ? (
                             <button 
                               onClick={(e) => { e.stopPropagation(); handleDecentralize(m); }}
                               className="w-10 h-10 md:w-14 md:h-14 rounded-xl md:rounded-2xl text-[var(--text-muted)] hover:text-red-500 hover:bg-red-500/10 transition-all flex items-center justify-center border border-transparent hover:border-red-500/20 active:scale-90"
                               title={t('central_decentralizeBtn')}
                             >
                                <Unlink size={24} />
                             </button>
                           ) : (
                             <button className="w-10 h-10 md:w-14 md:h-14 rounded-xl md:rounded-2xl text-[var(--text-muted)] hover:text-red-500 hover:bg-red-500/10 transition-all flex items-center justify-center border border-transparent hover:border-red-500/20 active:scale-90">
                                <Trash2 size={24} />
                             </button>
                           )}
                        </div>
                     </div>
                  </div>
               ))
            )}
         </div>
      </div>

      <div className="bg-gradient-to-br from-[var(--bg-surface)] to-[var(--bg-base)] border border-[var(--border)] p-10 md:p-20 rounded-[2.5rem] md:rounded-[4rem] text-center relative overflow-hidden shadow-premium">
         <div className="absolute -top-32 -right-32 w-[30rem] h-[30rem] bg-emerald-500/5 blur-[120px] rounded-full" />
         <div className="w-16 h-16 md:w-24 md:h-24 bg-emerald-500/10 rounded-2xl md:rounded-[2rem] flex items-center justify-center mx-auto mb-6 md:mb-8 text-emerald-500 shadow-premium">
            <Shield size={48} />
         </div>
         <h3 className="text-2xl md:text-4xl font-black text-[var(--text-primary)] mb-4 md:mb-6 tracking-tighter uppercase">
            {t('central_sanityCheck')}
         </h3>
         <p className="text-[var(--text-secondary)] max-w-3xl mx-auto text-base md:text-xl leading-relaxed mb-8 md:mb-12 font-medium opacity-80">
            {t('central_sanityHelp')}
         </p>
         <button 
           onClick={async () => {
              const res = await fetch('/api/models/sanity-check', { method: 'POST' });
              const data = await res.json();
              showToast(t('central_sanityCheck') + `: ${data.cleaned}`, 'success');
              fetchModels();
           }}
           className="w-full sm:w-auto bg-[var(--text-primary)] text-[var(--bg-base)] hover:bg-emerald-600 hover:text-white font-black text-xs md:text-sm uppercase tracking-widest md:tracking-[0.3em] px-10 md:px-20 py-5 md:py-7 rounded-xl md:rounded-[2.5rem] transition-all shadow-premium active:scale-95"
         >
            {t('central_sanityCheck')}
         </button>
      </div>
    </div>
  );
}
