import { useState, useEffect, useMemo } from 'react';
import { Shield, HardDrive, RefreshCw, Layers, CheckSquare, Square, Filter, SortAsc, SortDesc, Zap, Link as LinkIcon, Unlink, Box, ShieldCheck, ChevronRight } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import HelpTooltip from '../components/HelpTooltip';
import { useApp } from '../context/AppContext';
import { useToast } from '../components/Toast';

type SortField = 'name' | 'size' | 'source';

const PAGE_VARIANTS = {
  initial: { opacity: 0, y: 10 },
  animate: { opacity: 1, y: 0, transition: { duration: 0.6, ease: [0.22, 1, 0.36, 1] as [number, number, number, number] } },
  exit: { opacity: 0, y: -10, transition: { duration: 0.3 } }
};

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

    if (activeFilter === 'standalone') list = list.filter(m => !m.isSymlink);
    else if (activeFilter === 'centralized') list = list.filter(m => m.isSymlink);

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

  return (
    <motion.div 
      variants={PAGE_VARIANTS}
      initial="initial"
      animate="animate"
      exit="exit"
      className="p-6 md:p-12 lg:p-16 max-w-[100rem] mx-auto pb-20"
    >
      <header className="mb-16 flex justify-between items-start flex-wrap gap-10">
        <div className="space-y-4">
            <h2 className="text-4xl md:text-6xl font-black text-[var(--text-primary)] tracking-tighter leading-none flex items-center gap-6 uppercase">
             {t('central_title')}
             <ShieldCheck size={40} className="text-emerald-500" />
            </h2>
            <p className="text-[var(--text-secondary)] text-lg md:text-2xl font-medium opacity-80 max-w-xl leading-relaxed">
              {t('central_subtitle')}
            </p>
        </div>
        <div className="flex gap-4 w-full sm:w-auto">
          <button 
            onClick={async () => {
              const res = await fetch('/api/models/sanity-check', { method: 'POST' });
              const data = await res.json();
              showToast(t('central_sanityCheck') + `: ${data.cleaned}`, 'success');
              fetchModels();
            }}
            className="btn-premium flex-1 md:flex-none bg-[var(--bg-surface)] border border-[var(--border)] text-blue-500 flex items-center justify-center gap-4 shadow-xl"
          >
            <Shield size={18} /> {t('central_sanityCheck')}
          </button>
          <button onClick={fetchModels} className="bg-[var(--bg-surface)] p-5 rounded-2xl border border-[var(--border)] text-[var(--text-secondary)] hover:text-blue-500 transition-all shadow-xl active:scale-95">
             <RefreshCw size={24} className={loading ? 'animate-spin' : ''} />
          </button>
        </div>
      </header>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-10 mb-16">
         <div className="card-premium relative group">
            <div className="absolute top-0 right-0 p-12 opacity-[0.05] text-blue-500 group-hover:scale-125 transition-all"><HardDrive size={240} /></div>
            <h3 className="text-sm md:text-base font-black text-blue-500 uppercase tracking-widest mb-8 flex items-center gap-3">
              {t('central_spaceSaved')}
              <HelpTooltip text={t('central_spaceSavedHelp')} />
            </h3>
            <div className="flex items-baseline gap-3 relative z-10">
               <p className="text-6xl md:text-9xl font-black text-[var(--text-primary)] tracking-tighter leading-none">{(spaceSaved / (1024**3)).toFixed(1)}</p>
               <span className="text-2xl font-black text-blue-500 uppercase tracking-widest">GB</span>
            </div>
            <p className="mt-6 text-sm md:text-base font-black text-[var(--text-secondary)] uppercase tracking-widest">Recovered Storage Potential</p>
         </div>
         <div className="card-premium relative group">
            <div className="absolute top-0 right-0 p-12 opacity-[0.05] text-purple-500 group-hover:scale-125 transition-all"><Layers size={240} /></div>
            <h3 className="text-sm md:text-base font-black text-blue-500 uppercase tracking-widest mb-8 flex items-center gap-3">
              {t('central_standalone')}
              <HelpTooltip text={t('central_standaloneHelp')} />
            </h3>
            <div className="flex items-baseline gap-3 relative z-10">
               <p className="text-6xl md:text-9xl font-black text-[var(--text-primary)] tracking-tighter leading-none">{standaloneCount}</p>
               <span className="text-2xl font-black text-purple-500 uppercase tracking-widest">MODS</span>
            </div>
            <p className="mt-6 text-sm md:text-base font-black text-[var(--text-secondary)] uppercase tracking-widest">Pending Centralization</p>
         </div>
      </div>

      <div className="card-premium bg-[var(--bg-surface)]/40 p-6 md:p-10 mb-16 shadow-premium backdrop-blur-3xl overflow-hidden">
         <div className="flex flex-col xl:flex-row justify-between items-stretch xl:items-center mb-10 gap-8">
            <div className="flex flex-wrap bg-[var(--bg-input)] p-2 rounded-[2rem] border border-[var(--border)] shadow-inner w-full xl:w-fit gap-2">
               {(['all', 'standalone', 'centralized'] as const).map(f => (
                 <button 
                  key={f}
                  onClick={() => setActiveFilter(f)}
                  className={`px-6 py-4 rounded-[1.5rem] text-xs md:text-sm font-black uppercase tracking-widest transition-all flex items-center gap-3 active:scale-95 flex-1 xl:flex-none justify-center ${
                    activeFilter === f ? 'bg-blue-600 text-white shadow-xl shadow-blue-600/30' : 'text-[var(--text-muted)] hover:text-[var(--text-primary)]'
                  }`}
                 >
                   <Filter size={14} className="shrink-0" /> <span>{t(`central_filter${f.charAt(0).toUpperCase() + f.slice(1)}` as any)}</span>
                 </button>
               ))}
            </div>

            <div className="flex flex-wrap items-stretch xl:items-center gap-4 md:gap-6 w-full xl:w-auto">
               <div className="flex flex-wrap bg-[var(--bg-input)] p-2 rounded-[2rem] border border-[var(--border)] shadow-inner w-full xl:w-fit gap-2">
                  {(['name', 'size', 'source'] as SortField[]).map(field => (
                    <button 
                      key={field}
                      onClick={() => {
                        if (sortField === field) setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
                        else { setSortField(field); setSortOrder('asc'); }
                      }}
                      className={`px-6 py-4 rounded-[1.5rem] text-xs md:text-sm font-black uppercase tracking-widest flex items-center gap-3 transition-all active:scale-95 flex-1 xl:flex-none justify-center ${
                        sortField === field ? 'bg-[var(--border)] text-[var(--text-primary)] shadow-lg' : 'text-[var(--text-muted)] hover:text-[var(--text-primary)]'
                      }`}
                    >
                      <span>{t(`central_sort${field.charAt(0).toUpperCase() + field.slice(1)}` as any)}</span>
                      {sortField === field && (sortOrder === 'asc' ? <SortAsc size={14} className="text-blue-500 shrink-0" /> : <SortDesc size={14} className="text-blue-500 shrink-0" />)}
                    </button>
                  ))}
               </div>
               
               <div className="flex flex-wrap gap-4 w-full xl:w-auto">
                  <button onClick={handleSelectAll} className="text-xs md:text-sm font-black text-[var(--text-muted)] hover:text-[var(--text-primary)] uppercase tracking-widest flex items-center justify-center gap-4 px-8 py-5 bg-[var(--bg-input)] rounded-[2rem] transition-all active:scale-95 border border-[var(--border)] flex-1 xl:flex-none">
                     {selectedPaths.size === models.filter(m => !m.isSymlink).length ? <CheckSquare size={22} className="text-blue-500 shrink-0" /> : <Square size={22} className="shrink-0" />} 
                     <span>{selectedPaths.size > 0 ? t('central_deselectAll') : t('central_selectAll')}</span>
                  </button>

                  <button 
                    onClick={handleCentralizeSelected}
                    disabled={selectedPaths.size === 0 || processing}
                    className="btn-premium bg-blue-600 hover:bg-blue-500 text-white flex items-center justify-center gap-4 disabled:opacity-30 flex-1 xl:flex-none xl:min-w-[200px]"
                  >
                     {processing ? <RefreshCw size={20} className="animate-spin shrink-0" /> : <Zap size={20} className="shrink-0" />}
                     <span>{t('central_centralizeBtn')} ({selectedPaths.size})</span>
                  </button>
               </div>
            </div>
         </div>

         <div className="space-y-4 max-h-[800px] overflow-y-auto pr-6 custom-scrollbar">
            <AnimatePresence mode="popLayout">
              {filteredAndSortedModels.length === 0 ? (
                 <motion.div 
                   initial={{ opacity: 0 }}
                   animate={{ opacity: 1 }}
                   className="p-32 text-center text-[var(--text-muted)] font-black uppercase tracking-[0.5em] bg-[var(--bg-input)]/20 rounded-[4rem] border border-dashed border-[var(--border)] text-sm"
                 >
                    {t('models_noModels')}
                 </motion.div>
              ) : (
                filteredAndSortedModels.map(m => (
                  <motion.div 
                    key={m.path} 
                    layout
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, scale: 0.95 }}
                    className={`flex flex-col md:flex-row md:items-center justify-between p-8 rounded-[2.5rem] border transition-all cursor-pointer group relative overflow-hidden gap-8 ${
                      selectedPaths.has(m.path) 
                        ? 'bg-blue-600/10 border-blue-500 shadow-2xl shadow-blue-600/10' 
                        : 'bg-[var(--bg-input)]/40 border-[var(--border)] hover:border-blue-500/30 hover:bg-[var(--bg-input)]'
                    }`} 
                    onClick={() => !m.isSymlink && toggleSelect(m.path)}
                  >
                     <div className="flex items-center gap-10 relative z-10 min-w-0 flex-1">
                        {!m.isSymlink ? (
                          <div className={`w-12 h-12 rounded-2xl flex items-center justify-center border-2 transition-all shrink-0 ${
                            selectedPaths.has(m.path) ? 'bg-blue-600 border-blue-500 text-white shadow-2xl' : 'bg-transparent border-[var(--border)] text-transparent group-hover:border-[var(--text-secondary)]'
                          }`}>
                             <CheckSquare size={24} />
                          </div>
                        ) : (
                          <div className="w-14 h-14 rounded-2xl flex items-center justify-center bg-emerald-500/10 border border-emerald-500/20 text-emerald-500 shadow-xl shrink-0">
                             <LinkIcon size={28} />
                          </div>
                        )}
                        <div className="flex flex-col gap-3 min-w-0">
                           <div className="flex items-center gap-4 flex-wrap">
                              <span className={`font-black text-xl md:text-2xl tracking-tighter break-all ${m.isSymlink ? 'text-emerald-500' : 'text-[var(--text-primary)]'}`}>{m.name}</span>
                              <span className={`text-xs font-black px-4 py-1.5 rounded-full uppercase tracking-widest ${m.isSymlink ? 'bg-emerald-500/10 text-emerald-500 border border-emerald-500/20 shadow-glow-emerald' : 'bg-[var(--bg-input)] text-[var(--text-muted)] border border-[var(--border)]'}`}>
                                 {m.isSymlink ? t('central_centralized') : t('central_standalone')}
                              </span>
                           </div>
                           <div className="flex items-center gap-6">
                              <p className="text-base font-mono text-[var(--text-primary)] break-all font-bold tracking-normal">{m.path}</p>
                              <div className="flex items-center gap-2 shrink-0 bg-blue-500/5 px-3 py-1 rounded-lg border border-blue-500/10">
                                 <Box size={14} className="text-blue-500" />
                                 <span className="text-xs md:text-sm font-black text-blue-500 uppercase tracking-widest">{m.source}</span>
                              </div>
                           </div>
                        </div>
                     </div>
                     <div className="flex items-center justify-between md:justify-end gap-12 relative z-10 shrink-0">
                        <div className="flex flex-col items-end">
                           <span className="text-xs md:text-sm font-black text-[var(--text-muted)] uppercase tracking-widest mb-1">{t('models_size')}</span>
                           <span className="text-3xl font-black text-[var(--text-primary)] tracking-tighter">{(m.size / (1024**3)).toFixed(1)} <span className="text-base text-[var(--text-secondary)]">GB</span></span>
                        </div>
                        <div className="flex items-center gap-3">
                           {m.isSymlink ? (
                             <button 
                               onClick={(e) => { e.stopPropagation(); handleDecentralize(m); }}
                               className="w-14 h-14 rounded-2xl text-[var(--text-muted)] hover:text-red-500 hover:bg-red-500/10 transition-all flex items-center justify-center border border-transparent hover:border-red-500/20 active:scale-90"
                               title={t('central_decentralizeBtn')}
                             >
                                <Unlink size={28} />
                             </button>
                           ) : (
                             <div className="w-14 h-14 rounded-2xl text-[var(--text-muted)] opacity-20 flex items-center justify-center">
                                <ChevronRight size={28} />
                             </div>
                           )}
                        </div>
                     </div>
                  </motion.div>
                ))
              )}
            </AnimatePresence>
         </div>
      </div>

      <section className="bg-gradient-to-br from-blue-700 via-indigo-900 to-black p-12 md:p-24 rounded-[4rem] text-center relative overflow-hidden shadow-premium">
         <div className="absolute top-0 right-0 w-full h-full bg-[radial-gradient(circle_at_top_right,rgba(255,255,255,0.1),transparent)]" />
         <div className="absolute -bottom-20 -right-20 w-[30rem] h-[30rem] bg-emerald-500/10 blur-[120px] rounded-full animate-pulse" />
         
         <div className="relative z-10 space-y-10">
            <div className="w-24 h-24 bg-white/10 rounded-[2rem] flex items-center justify-center mx-auto text-emerald-400 shadow-2xl backdrop-blur-3xl border border-white/10">
               <ShieldCheck size={56} />
            </div>
            <div className="space-y-4">
              <h3 className="text-4xl md:text-6xl font-black text-white tracking-tighter uppercase leading-[0.9]">
                 {t('central_sanityCheck')}
              </h3>
              <p className="text-blue-100/70 max-w-2xl mx-auto text-lg md:text-2xl leading-relaxed font-medium">
                 {t('central_sanityHelp')}
              </p>
            </div>
            <button 
              onClick={async () => {
                 const res = await fetch('/api/models/sanity-check', { method: 'POST' });
                 const data = await res.json();
                 showToast(t('central_sanityCheck') + `: ${data.cleaned}`, 'success');
                 fetchModels();
              }}
              className="btn-premium bg-white text-blue-900 hover:bg-blue-50 px-20 py-7 rounded-[2.5rem] w-full md:w-auto"
            >
               {t('central_sanityCheck')}
            </button>
         </div>
      </section>
    </motion.div>
  );
}







