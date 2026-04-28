import { useState, useEffect } from 'react';
import { Shield, Zap, HardDrive, CheckCircle, AlertCircle, RefreshCw, Layers } from 'lucide-react';

export default function Centralization() {
  const [models, setModels] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState(false);

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

  const localModels = models.filter(m => !m.isSymlink);
  const centralizedModels = models.filter(m => m.isSymlink);
  const spaceSaved = centralizedModels.reduce((acc, m) => acc + m.size, 0);

  const handleCentralizeAll = async () => {
    if (!confirm(`This will link ${localModels.length} models to the central repository. Proceed?`)) return;
    setProcessing(true);
    for (const m of localModels) {
      await fetch('/api/centralize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ modelPath: m.path, finalModelName: m.finalModelName })
      });
    }
    setProcessing(false);
    fetchModels();
  };

  if (loading) return <div className="p-20 text-center animate-pulse text-slate-500 font-black">ANALYZING LINKS...</div>;

  return (
    <div className="p-12 max-w-5xl mx-auto animate-in fade-in duration-700">
      <header className="mb-12">
        <h2 className="text-4xl font-black text-white mb-2">Centralization Hub</h2>
        <p className="text-slate-500">Restore storage efficiency by linking standalone models to the master repository.</p>
      </header>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-8 mb-12">
         <div className="bg-slate-900 border border-slate-800 p-10 rounded-[3rem] relative overflow-hidden group">
            <div className="absolute top-0 right-0 p-8 opacity-5 text-blue-500"><HardDrive size={100} /></div>
            <h3 className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-4">Space Recovered</h3>
            <p className="text-6xl font-black text-white">{(spaceSaved / (1024**3)).toFixed(1)}<span className="text-xl">GB</span></p>
            <div className="mt-6 flex items-center gap-2 text-emerald-400 text-xs font-black uppercase tracking-widest">
               <CheckCircle size={14} /> Link Engine Active
            </div>
         </div>
         <div className="bg-slate-900 border border-slate-800 p-10 rounded-[3rem] relative overflow-hidden group">
            <div className="absolute top-0 right-0 p-8 opacity-5 text-purple-500"><Layers size={100} /></div>
            <h3 className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-4">Pending Models</h3>
            <p className="text-6xl font-black text-white">{localModels.length}</p>
            <div className="mt-6 flex items-center gap-2 text-blue-400 text-xs font-black uppercase tracking-widest">
               <Zap size={14} /> Optimization available
            </div>
         </div>
      </div>

      <div className="bg-slate-900/50 border border-slate-800 rounded-[4rem] p-16 text-center">
         <Shield size={48} className="mx-auto mb-8 text-blue-500" />
         <h3 className="text-3xl font-black text-white mb-4">Sync Standalone Models</h3>
         <p className="text-slate-500 max-w-xl mx-auto mb-12 leading-relaxed">
            All models found in your scan directories that are not yet part of the central repository will be linked. This does not move files, it creates zero-space filesystem references.
         </p>
         
         <button 
           onClick={handleCentralizeAll}
           disabled={processing || localModels.length === 0}
           className="bg-blue-600 hover:bg-blue-500 text-white font-black text-xs uppercase tracking-widest px-16 py-5 rounded-[2rem] transition-all shadow-2xl shadow-blue-600/30 disabled:opacity-50 flex items-center gap-4 mx-auto"
         >
            {processing ? <RefreshCw size={20} className="animate-spin" /> : <Zap size={20} />}
            Centralize All Models
         </button>
      </div>

      <div className="mt-12 space-y-4">
         {localModels.slice(0, 5).map(m => (
            <div key={m.path} className="flex items-center justify-between bg-slate-950 p-6 rounded-3xl border border-slate-900">
               <div className="flex flex-col">
                  <span className="text-white font-bold text-sm">{m.name}</span>
                  <span className="text-[10px] text-slate-600 truncate max-w-md">{m.path}</span>
               </div>
               <span className="text-[10px] font-black text-yellow-500 bg-yellow-500/10 px-3 py-1 rounded-full uppercase">Standalone</span>
            </div>
         ))}
         {localModels.length > 5 && <p className="text-center text-slate-700 text-[10px] font-black uppercase tracking-widest">And {localModels.length - 5} more...</p>}
      </div>
    </div>
  );
}
