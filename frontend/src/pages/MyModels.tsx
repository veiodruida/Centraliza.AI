import { useState, useEffect, useMemo } from 'react';
import { Search, RefreshCw, Trash2, Link, FileText, CheckCircle, AlertCircle, HardDrive, ExternalLink, ArrowUpDown, FolderOpen, ArrowLeft, Info, FileCode, ShieldCheck, ChevronRight, ChevronDown, Play, Zap, Terminal, Box } from 'lucide-react';

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
}

export default function MyModels() {
  const [models, setModels] = useState<Model[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [viewingModel, setViewingModel] = useState<Model | null>(null);
  const [description, setDescription] = useState('Carregando descrição...');
  const [expandedSources, setExpandedSources] = useState<Set<string>>(new Set());

  const fetchModels = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/models');
      const data = await res.json();
      setModels(data);
      const sources = new Set(data.map((m: any) => m.source));
      setExpandedSources(sources);
    } catch (err) { setError('Backend unreachable.'); }
    finally { setLoading(false); }
  };

  useEffect(() => { fetchModels(); }, []);

  useEffect(() => {
    if (viewingModel) {
      setDescription('Carregando descrição do modelo...');
      fetch(`/api/model-readme?repoId=${viewingModel.repoId || ''}&localPath=${encodeURIComponent(viewingModel.path)}`)
        .then(res => res.text())
        .then(data => setDescription(data));
    }
  }, [viewingModel]);

  const handleLaunch = async (model: Model, type: string) => {
    try {
      const res = await fetch('/api/launch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type, modelPath: model.path, modelName: model.name, ollamaTag: model.ollamaTag })
      });
      const data = await res.json();
      if (data.error) alert(data.error);
      else alert(data.message);
    } catch (e) { alert('Launch failed.'); }
  };

  const handleCentralize = async (model: Model) => {
    try {
      await fetch('/api/centralize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ modelPath: model.path, finalModelName: model.finalModelName })
      });
      fetchModels();
    } catch (err) {}
  };

  const groupedModels = useMemo(() => {
    const filtered = models.filter(m => m.name.toLowerCase().includes(search.toLowerCase()) || m.source.toLowerCase().includes(search.toLowerCase()));
    const groups: Record<string, Model[]> = {};
    filtered.forEach(m => {
      if (!groups[m.source]) groups[m.source] = [];
      groups[m.source].push(m);
    });
    return groups;
  }, [models, search]);

  const formatSize = (bytes: number) => (bytes / (1024 ** 3)).toFixed(2) + ' GB';

  // Logic to show ONLY relevant launch options
  const getLaunchOptions = (model: Model) => {
    const options = [];
    if (model.source === 'Ollama') {
        options.push({ type: 'ollama', icon: Play, label: 'LAUNCH OLLAMA' });
    } else if (model.source === 'ComfyUI') {
        options.push({ type: 'comfyui', icon: Box, label: 'LAUNCH COMFYUI' });
    } else if (model.source === 'LM Studio') {
        options.push({ type: 'lm-studio', icon: Play, label: 'LAUNCH LM STUDIO' });
    }
    
    // GGUF models can run via Llama.cpp ONLY if they are NOT from Ollama
    if (model.source !== 'Ollama' && (model.name.toLowerCase().endsWith('.gguf'))) {
        options.push({ type: 'llama.cpp', icon: Terminal, label: 'LAUNCH LLAMA.CPP' });
    }
    return options;
  };

  if (viewingModel) {
    const launchOptions = getLaunchOptions(viewingModel);
    return (
      <div className="p-12 max-w-6xl mx-auto animate-in slide-in-from-right-8">
        <button onClick={() => setViewingModel(null)} className="flex items-center gap-2 text-slate-500 hover:text-white mb-8 transition-colors font-bold text-sm uppercase">
          <ArrowLeft size={16} /> Back to Library
        </button>
        <div className="bg-slate-900 border border-slate-800 rounded-[3rem] p-10 shadow-2xl relative overflow-hidden">
          <header className="border-b border-slate-800 pb-10 mb-10 flex justify-between items-start">
             <div>
                <h2 className="text-4xl font-black text-white mb-4 tracking-tighter">{viewingModel.name}</h2>
                <div className="flex gap-4">
                   <span className="bg-slate-800 px-4 py-2 rounded-2xl text-xs font-bold text-slate-300 border border-slate-700">{viewingModel.source}</span>
                   <span className="bg-emerald-500/10 text-emerald-400 px-4 py-2 rounded-2xl text-xs font-bold border border-emerald-500/10 uppercase">
                      {viewingModel.extension}
                   </span>
                </div>
             </div>
             <div className="flex flex-col gap-3">
                {launchOptions.map(opt => (
                   <button key={opt.type} onClick={() => handleLaunch(viewingModel, opt.type)} className="bg-white text-black hover:bg-blue-600 hover:text-white px-10 py-4 rounded-[1.5rem] font-black text-xs transition-all flex items-center gap-3 shadow-xl shadow-white/5 active:scale-95">
                      <opt.icon size={18} /> {opt.label}
                   </button>
                ))}
             </div>
          </header>
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-12">
             <div className="lg:col-span-2 space-y-8">
                <div>
                   <h3 className="text-white font-black text-[10px] uppercase tracking-[0.4em] mb-6 flex items-center gap-2">
                      <FileText size={16} className="text-blue-500" /> Model Description & README
                   </h3>
                   <div className="bg-black/30 p-8 rounded-[2.5rem] border border-slate-800/50 max-h-[500px] overflow-y-auto custom-scrollbar">
                      <div className="prose prose-invert prose-slate max-w-none">
                         <pre className="whitespace-pre-wrap font-sans text-sm text-slate-400 leading-relaxed">
                            {description}
                         </pre>
                      </div>
                   </div>
                </div>
             </div>
             <div className="space-y-6">
                <div className="bg-slate-800/20 p-8 rounded-[2.5rem] border border-slate-800/50">
                   <h4 className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-6">File Info</h4>
                   <div className="space-y-4">
                      <div className="flex justify-between border-b border-slate-800/50 pb-4 text-sm"><span className="text-slate-500 font-bold">Size</span><span className="text-white font-black">{formatSize(viewingModel.size)}</span></div>
                      <div className="flex justify-between border-b border-slate-800/50 pb-4 text-sm"><span className="text-slate-500 font-bold">Centralized</span><span className="text-white font-black">{viewingModel.isSymlink ? 'YES' : 'NO'}</span></div>
                   </div>
                   {!viewingModel.isSymlink && (
                      <button onClick={() => handleCentralize(viewingModel)} className="w-full bg-blue-600 hover:bg-blue-500 text-white font-black py-4 rounded-2xl mt-8 transition-all flex items-center justify-center gap-2">
                         <Zap size={18} /> Centralize
                      </button>
                   )}
                </div>
                <div className="bg-slate-800/20 p-8 rounded-[2.5rem] border border-slate-800/50">
                   <h4 className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-4">Location</h4>
                   <p className="text-[10px] text-slate-600 break-all font-mono mb-4">{viewingModel.path}</p>
                   <button onClick={() => fetch('/api/open-folder', { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify({folderPath: viewingModel.path})})} className="text-blue-500 font-bold text-[10px] uppercase hover:underline">
                      Reveal in Explorer
                   </button>
                </div>
             </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="p-8 max-w-7xl mx-auto">
      <div className="flex justify-between items-end mb-12">
        <div>
          <h2 className="text-4xl font-black text-white mb-2">My Models</h2>
          <p className="text-slate-500">Intelligent context-aware management of your AI assets.</p>
        </div>
        <div className="flex gap-4">
          <div className="relative">
             <Search size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500" />
             <input type="text" placeholder="Filter models..." value={search} onChange={(e) => setSearch(e.target.value)} className="bg-slate-900 border border-slate-800 rounded-2xl py-3 pl-12 pr-6 text-sm focus:outline-none focus:ring-2 focus:ring-blue-600 text-white w-72" />
          </div>
          <button onClick={fetchModels} className="bg-slate-900 hover:bg-slate-800 text-white p-3 rounded-2xl border border-slate-800 transition-colors">
            <RefreshCw size={20} className={loading ? 'animate-spin' : ''} />
          </button>
        </div>
      </div>

      <div className="space-y-8">
        {Object.entries(groupedModels).map(([source, items]) => (
          <div key={source} className="bg-slate-900/50 border border-slate-800 rounded-[3rem] overflow-hidden backdrop-blur-xl group">
            <div className="flex items-center justify-between p-8">
               <div className="flex items-center gap-5">
                  <div className={`w-14 h-14 rounded-3xl flex items-center justify-center text-white shadow-2xl ${
                    source === 'Ollama' ? 'bg-blue-600 shadow-blue-600/20' : source === 'ComfyUI' ? 'bg-purple-600 shadow-purple-600/20' : 'bg-slate-800 shadow-black/50'
                  }`}>
                    <Box size={28} />
                  </div>
                  <div className="text-left">
                     <h3 className="text-xl font-black text-white uppercase tracking-wider">{source}</h3>
                     <p className="text-[10px] text-slate-500 font-bold uppercase tracking-widest">{items.length} Local Intelligence Files</p>
                  </div>
               </div>
            </div>

            <div className="border-t border-slate-800/50">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-950/50 text-slate-600 font-black uppercase tracking-[0.2em]">
                  <tr>
                    <th className="p-8">Model & Intelligence</th>
                    <th className="p-8 text-center">Status</th>
                    <th className="p-8 text-right">Adaptive Launch</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/30">
                  {items.map(m => {
                    const lOptions = getLaunchOptions(m);
                    return (
                      <tr key={m.path} className="hover:bg-slate-800/20 transition-all group/row">
                        <td className="p-8">
                           <div className="flex flex-col">
                              <span onClick={() => setViewingModel(m)} className="text-white font-black text-base cursor-pointer hover:text-blue-500 transition-colors mb-1">{m.name}</span>
                              <span className="text-[10px] text-slate-600 font-mono truncate max-w-sm">{m.path}</span>
                           </div>
                        </td>
                        <td className="p-8 text-center">
                           {m.isSymlink ? <span className="text-[9px] font-black text-emerald-400 bg-emerald-400/10 px-4 py-2 rounded-full border border-emerald-400/10 uppercase tracking-widest">CENTRALIZED</span> 
                           : <span className="text-[9px] font-black text-slate-600 bg-slate-800 px-4 py-2 rounded-full border border-slate-700 uppercase tracking-widest">STANDALONE</span>}
                        </td>
                        <td className="p-8 text-right">
                          <div className="flex justify-end gap-3">
                            {lOptions.map(opt => (
                               <button key={opt.type} onClick={() => handleLaunch(m, opt.type)} className="p-3 bg-slate-800 hover:bg-blue-600 hover:text-white rounded-2xl text-slate-500 transition-all shadow-lg" title={opt.label}>
                                  <opt.icon size={18} />
                               </button>
                            ))}
                            <button onClick={() => setViewingModel(m)} className="p-3 text-slate-700 hover:text-white transition-colors">
                               <ChevronRight size={24} />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
