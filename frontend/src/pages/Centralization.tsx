import { useState, useEffect } from 'react';
import { Shield, HardDrive, RefreshCw, Layers, Trash2, CheckSquare, Square, ChevronDown, ChevronUp } from 'lucide-react';

export default function Centralization() {
  const [models, setModels] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState(false);
  const [showAll, setShowAll] = useState(false);
  const [selectedPaths, setSelectedPaths] = useState<Set<string>>(new Set());

  const fetchModels = () => {
    setLoading(true);
    fetch('/api/models')
      .then(res => res.json())
      .then(data => {
        setModels(data);
        const locals = data.filter((m: any) => !m.isSymlink);
        setSelectedPaths(new Set(locals.map((m: any) => m.path)));
        setLoading(false);
      });
  };

  useEffect(() => { fetchModels(); }, []);

  const localModels = models.filter(m => !m.isSymlink);
  const centralizedModels = models.filter(m => m.isSymlink);
  const spaceSaved = centralizedModels.reduce((acc, m) => acc + m.size, 0);

  const toggleSelect = (path: string) => {
    const next = new Set(selectedPaths);
    if (next.has(path)) next.delete(path);
    else next.add(path);
    setSelectedPaths(next);
  };

  const handleSelectAll = () => {
    if (selectedPaths.size === localModels.length) setSelectedPaths(new Set());
    else setSelectedPaths(new Set(localModels.map(m => m.path)));
  };

  const handleCentralizeSelected = async () => {
    if (selectedPaths.size === 0) return;
    if (!confirm(`Centralize ${selectedPaths.size} models?`)) return;
    setProcessing(true);
    const toProcess = localModels.filter(m => selectedPaths.has(m.path));
    for (const m of toProcess) {
      await fetch('/api/centralize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ modelPath: m.path, finalModelName: m.finalModelName })
      });
    }
    setProcessing(false);
    fetchModels();
  };

  if (loading) return <div className="p-20 text-center animate-pulse text-slate-500 font-black tracking-widest">ANALYZING LINK REPOSITORY...</div>;

  return (
    <div className="p-12 max-w-6xl mx-auto animate-in fade-in duration-700">
      <header className="mb-12 flex justify-between items-start">
        <div>
           <h2 className="text-4xl font-black text-white mb-2">Centralization Engine</h2>
           <p className="text-slate-500">Manage link integrity and storage optimization.</p>
        </div>
        <button onClick={fetchModels} className="bg-slate-900 p-3 rounded-2xl border border-slate-800 text-slate-500 hover:text-white transition-colors">
           <RefreshCw size={20} className={loading ? 'animate-spin' : ''} />
        </button>
      </header>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-8 mb-12">
         <div className="bg-slate-900 border border-slate-800 p-10 rounded-[3rem] relative overflow-hidden group">
            <div className="absolute top-0 right-0 p-8 opacity-5 text-blue-500"><HardDrive size={100} /></div>
            <h3 className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-4">Total Space Saved</h3>
            <p className="text-6xl font-black text-white">{(spaceSaved / (1024**3)).toFixed(1)}<span className="text-xl">GB</span></p>
         </div>
         <div className="bg-slate-900 border border-slate-800 p-10 rounded-[3rem] relative overflow-hidden group">
            <div className="absolute top-0 right-0 p-8 opacity-5 text-purple-500"><Layers size={100} /></div>
            <h3 className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-4">Standalone Models</h3>
            <p className="text-6xl font-black text-white">{localModels.length}</p>
         </div>
      </div>

      <div className="bg-slate-900/50 border border-slate-800 rounded-[3rem] p-12 mb-12">
         <div className="flex justify-between items-center mb-8">
            <h3 className="text-xl font-black text-white flex items-center gap-3">
               <Shield className="text-blue-500" /> STANDALONE REGISTRY
            </h3>
            <div className="flex gap-4">
               <button onClick={handleSelectAll} className="text-[10px] font-black text-slate-500 hover:text-white uppercase tracking-widest flex items-center gap-2">
                  {selectedPaths.size === localModels.length ? <CheckSquare size={14} /> : <Square size={14} />} 
                  {selectedPaths.size === localModels.length ? 'Deselect All' : 'Select All'}
               </button>
               <button 
                 onClick={handleCentralizeSelected}
                 disabled={selectedPaths.size === 0 || processing}
                 className="bg-blue-600 hover:bg-blue-500 text-white text-[10px] font-black uppercase tracking-widest px-6 py-2 rounded-xl transition-all shadow-lg shadow-blue-600/20 disabled:opacity-50"
               >
                  Centralize Selected ({selectedPaths.size})
               </button>
            </div>
         </div>

         <div className="space-y-4 max-h-[500px] overflow-y-auto pr-4 custom-scrollbar">
            {localModels.length === 0 ? (
               <div className="p-12 text-center text-slate-600 font-black uppercase tracking-widest bg-black/20 rounded-[2rem] border border-dashed border-slate-800">
                  All models are optimized
               </div>
            ) : (
               (showAll ? localModels : localModels.slice(0, 5)).map(m => (
                  <div key={m.path} className={`flex items-center justify-between p-6 rounded-3xl border transition-all cursor-pointer ${
                    selectedPaths.has(m.path) ? 'bg-blue-600/10 border-blue-500/50' : 'bg-slate-950 border-slate-900 hover:border-slate-800'
                  }`} onClick={() => toggleSelect(m.path)}>
                     <div className="flex items-center gap-4">
                        <div className={`w-6 h-6 rounded-md flex items-center justify-center border ${
                          selectedPaths.has(m.path) ? 'bg-blue-600 border-blue-500 text-white' : 'border-slate-800 text-transparent'
                        }`}>
                           <CheckSquare size={14} />
                        </div>
                        <div className="flex flex-col">
                           <span className="text-white font-bold text-sm">{m.name}</span>
                           <span className="text-[9px] text-slate-600 font-mono truncate max-w-lg">{m.path}</span>
                        </div>
                     </div>
                     <div className="flex items-center gap-6">
                        <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest">{(m.size / (1024**3)).toFixed(1)}GB</span>
                        <button className="text-slate-700 hover:text-red-500 transition-colors">
                           <Trash2 size={16} />
                        </button>
                     </div>
                  </div>
               ))
            )}
         </div>

         {localModels.length > 5 && (
            <button 
              onClick={() => setShowAll(!showAll)}
              className="w-full mt-8 py-4 border border-dashed border-slate-800 rounded-2xl text-[10px] font-black text-slate-500 hover:text-white hover:border-slate-600 transition-all uppercase tracking-[0.3em] flex items-center justify-center gap-2"
            >
               {showAll ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
               {showAll ? 'Collapse List' : `And ${localModels.length - 5} more standalone models`}
            </button>
         )}
      </div>

      <div className="bg-gradient-to-br from-slate-900 to-slate-950 border border-slate-800 p-12 rounded-[4rem] text-center relative overflow-hidden">
         <div className="absolute top-0 right-0 w-64 h-64 bg-blue-600/5 blur-[100px]" />
         <h3 className="text-2xl font-black text-white mb-4">Zero-Space Management</h3>
         <p className="text-slate-500 max-w-2xl mx-auto text-sm leading-relaxed">
            Excluding a model from here only removes it from the "Standalone" list (it won't be tracked for centralization). Including a model manually will attempt to create a link in the Central Repository immediately.
         </p>
      </div>
    </div>
  );
}
