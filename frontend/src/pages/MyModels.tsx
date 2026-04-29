import { useState, useEffect, useMemo } from 'react';
import { Search, RefreshCw, FileText, Play, Terminal, Box, ArrowLeft, Zap, ChevronDown, ChevronUp, Edit3, Trash2, FolderOpen } from 'lucide-react';
import HelpTooltip from '../components/HelpTooltip';
import { useToast } from '../components/Toast';
import LaunchModal from '../components/LaunchModal';

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
}

export default function MyModels() {
  const [models, setModels] = useState<Model[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [viewingModel, setViewingModel] = useState<Model | null>(null);
  const [description, setDescription] = useState('Carregando descrição...');
  const [expandedSections, setExpandedSections] = useState<Record<string, boolean>>({
    'Ollama': true,
    'ComfyUI': true,
    'LM Studio': true,
    'Hugging Face': true
  });
  const [sectionOrder, setSectionOrder] = useState<string[]>(['Ollama', 'ComfyUI', 'LM Studio', 'Hugging Face', 'Standalone']);
  const [launchModalData, setLaunchModalData] = useState<{ isOpen: boolean; model: Model | null }>({ isOpen: false, model: null });
  const [selectedModels, setSelectedModels] = useState<Set<string>>(new Set());
  const { showToast } = useToast();

  const fetchModels = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/models');
      const data = await res.json();
      setModels(data);
    } catch (err) { console.error('Backend unreachable.'); }
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

  const handleLaunch = async (model: Model, type: string, extraParams: any = {}) => {
    if (type === 'llama.cpp' && !extraParams.threads) {
      setLaunchModalData({ isOpen: true, model });
      return;
    }

    try {
      const res = await fetch('/api/launch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          type, 
          modelPath: model.path, 
          modelName: model.name, 
          ollamaTag: model.ollamaTag,
          params: extraParams 
        })
      });
      const data = await res.json();
      if (data.error) showToast(data.error, 'error');
      else showToast(data.message, 'success');
      setLaunchModalData({ isOpen: false, model: null });
    } catch (e) { showToast('Launch failed.', 'error'); }
  };

  const handleOpenFolder = (path: string) => {
    fetch('/api/open-folder', { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify({folderPath: path})});
  };

  const handleCentralize = async (model: Model) => {
    try {
      const res = await fetch('/api/centralize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ modelPath: model.path, finalModelName: model.finalModelName })
      });
      if (res.ok) {
        showToast('Modelo centralizado com sucesso!', 'success');
        fetchModels();
      }
    } catch (err) { showToast('Erro ao centralizar.', 'error'); }
  };

  const handleRename = async (model: Model) => {
    // Cannot rename Ollama blobs safely
    if (model.path.includes('.ollama\\models\\blobs') || model.path.includes('.ollama/models/blobs')) {
        showToast('Não é possível renomear arquivos internos do Ollama.', 'error');
        return;
    }
    const newName = prompt('Novo nome para o modelo (sem extensão):', model.name.split('.')[0]);
    if (!newName) return;
    try {
      const res = await fetch('/api/models/rename', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ oldPath: model.path, newName })
      });
      if (res.ok) {
        showToast('Modelo renomeado com sucesso!', 'success');
        fetchModels();
        if (viewingModel?.path === model.path) setViewingModel(null);
      } else {
        const data = await res.json();
        showToast('Erro ao renomear: ' + (data.error || 'Desconhecido'), 'error');
      }
    } catch (e) { showToast('Erro de conexão ao renomear.', 'error'); }
  };

  const handleDelete = async (model: Model) => {
    if (model.path.includes('.ollama\\models\\blobs') || model.path.includes('.ollama/models/blobs')) {
        showToast('Para remover modelos do Ollama, use o CLI do Ollama.', 'error');
        return;
    }
    const isSymlink = model.isSymlink;
    const msg = isSymlink 
      ? `Deseja remover a centralização (atalho) do modelo?\nO arquivo original em seu respectivo provedor não será apagado.`
      : `TEM CERTEZA que deseja excluir permanentemente o arquivo:\n${model.path}`;
      
    if (!confirm(msg)) return;
    try {
      const res = await fetch('/api/models', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ modelPath: model.path })
      });
      if (res.ok) {
        showToast('Modelo excluído permanentemente.', 'success');
        fetchModels();
        if (viewingModel?.path === model.path) setViewingModel(null);
      } else {
        const data = await res.json();
        showToast('Erro ao excluir: ' + (data.error || 'Desconhecido'), 'error');
      }
    } catch (e) { showToast('Erro de conexão ao excluir.', 'error'); }
  };

  const handleBatchDelete = async () => {
    const toDelete = models.filter(m => selectedModels.has(m.path));
    if (toDelete.length === 0) return;
    
    // Check if any Ollama
    const hasOllama = toDelete.some(m => m.path.includes('.ollama\\models\\blobs') || m.path.includes('.ollama/models/blobs'));
    if (hasOllama) {
        showToast('Seleção contém modelos do Ollama. Eles não podem ser removidos em lote por aqui.', 'error');
        return;
    }

    if (!confirm(`TEM CERTEZA que deseja excluir ${toDelete.length} modelos selecionados?`)) return;
    
    let successCount = 0;
    for (const model of toDelete) {
      try {
        const res = await fetch('/api/models', {
          method: 'DELETE',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ modelPath: model.path })
        });
        if (res.ok) successCount++;
      } catch (e) {}
    }
    
    showToast(`${successCount} modelos excluídos permanentemente.`, 'success');
    setSelectedModels(new Set());
    fetchModels();
  };

  const handleBatchCentralize = async () => {
    const toCentralize = models.filter(m => selectedModels.has(m.path) && !m.isSymlink);
    if (toCentralize.length === 0) {
        showToast('Nenhum modelo standalone selecionado para centralizar.', 'info');
        return;
    }

    let successCount = 0;
    for (const model of toCentralize) {
      try {
        const res = await fetch('/api/centralize', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ modelPath: model.path, finalModelName: model.finalModelName })
        });
        if (res.ok) successCount++;
      } catch (e) {}
    }

    showToast(`${successCount} modelos centralizados.`, 'success');
    setSelectedModels(new Set());
    fetchModels();
  };

  const toggleModelSelection = (path: string) => {
    setSelectedModels(prev => {
      const next = new Set(prev);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });
  };

  const toggleSectionSelection = (items: Model[], select: boolean) => {
    setSelectedModels(prev => {
      const next = new Set(prev);
      items.forEach(m => {
        if (select) next.add(m.path);
        else next.delete(m.path);
      });
      return next;
    });
  };



  const toggleSection = (source: string) => {
    setExpandedSections(prev => ({ ...prev, [source]: !prev[source] }));
  };

  const handleDragStart = (e: React.DragEvent, source: string) => {
    e.dataTransfer.setData("text/plain", source);
    e.currentTarget.classList.add("opacity-50");
  };

  const handleDragEnd = (e: React.DragEvent) => {
    e.currentTarget.classList.remove("opacity-50");
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault(); // Necessary to allow dropping
  };

  const handleDrop = (e: React.DragEvent, targetSource: string) => {
    e.preventDefault();
    const source = e.dataTransfer.getData("text/plain");
    if (!source || source === targetSource) return;
    
    const oldIdx = sectionOrder.indexOf(source);
    const newIdx = sectionOrder.indexOf(targetSource);
    if (oldIdx === -1 || newIdx === -1) return;

    const newOrder = [...sectionOrder];
    newOrder.splice(oldIdx, 1);
    newOrder.splice(newIdx, 0, source);
    setSectionOrder(newOrder);
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

  const getLaunchOptions = (model: Model) => {
    const options = [];
    if (model.source === 'Ollama') {
        options.push({ type: 'ollama', icon: Play, label: 'LAUNCH OLLAMA' });
    } else if (model.source === 'ComfyUI') {
        options.push({ type: 'comfyui', icon: Box, label: 'LAUNCH COMFYUI' });
    } else if (model.source === 'LM Studio') {
        options.push({ type: 'lm-studio', icon: Play, label: 'LAUNCH LM STUDIO' });
    }
    
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
                   <h4 className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-6">Management</h4>
                   <div className="flex flex-col gap-3">
                      <button onClick={() => handleRename(viewingModel)} className="w-full bg-slate-800 hover:bg-slate-700 text-white font-black py-4 rounded-2xl transition-all flex items-center justify-center gap-2 text-xs uppercase tracking-widest">
                         <Edit3 size={16} /> Rename
                      </button>
                      <button onClick={() => handleDelete(viewingModel)} className="w-full bg-red-500/10 hover:bg-red-500 text-red-500 hover:text-white font-black py-4 rounded-2xl transition-all flex items-center justify-center gap-2 text-xs uppercase tracking-widest border border-red-500/20">
                         <Trash2 size={16} /> Delete
                      </button>
                   </div>
                </div>
                <div className="bg-slate-800/20 p-8 rounded-[2.5rem] border border-slate-800/50">
                   <h4 className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-4">Location</h4>
                   <p className="text-[10px] text-slate-600 break-all font-mono mb-4">{viewingModel.path}</p>
                   <button onClick={() => handleOpenFolder(viewingModel.path)} className="text-blue-500 font-bold text-[10px] uppercase hover:underline flex items-center gap-2">
                      <FolderOpen size={14} /> Reveal in Explorer
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
          <h2 className="text-4xl font-black text-white mb-2 flex items-center">
            My Models
            <HelpTooltip text="Aqui estão todos os seus modelos detectados. O app identifica automaticamente de onde eles vêm e quais ações são compatíveis." />
          </h2>
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
        {sectionOrder.map(source => {
          const items = groupedModels[source] || [];
          if (items.length === 0 && source === 'Standalone' && search) return null;
          const isExpanded = expandedSections[source] !== false;
          return (
            <div 
              key={source} 
              className="bg-slate-900/50 border border-slate-800 rounded-[3rem] overflow-hidden backdrop-blur-xl group transition-all duration-500"
              draggable
              onDragStart={(e) => handleDragStart(e, source)}
              onDragEnd={handleDragEnd}
              onDragOver={handleDragOver}
              onDrop={(e) => handleDrop(e, source)}
            >
              <div className="flex items-center justify-between p-8 cursor-grab active:cursor-grabbing">
                 <div className="flex items-center gap-5">
                    <input 
                       type="checkbox" 
                       className="w-5 h-5 rounded border-slate-700 bg-slate-900/50 text-blue-500 focus:ring-blue-500/20 cursor-pointer"
                       checked={items.length > 0 && items.every(m => selectedModels.has(m.path))}
                       onChange={(e) => toggleSectionSelection(items, e.target.checked)}
                       onClick={e => e.stopPropagation()}
                    />
                    <div className={`w-14 h-14 rounded-3xl flex items-center justify-center text-white shadow-2xl transition-transform duration-500 ${isExpanded ? 'scale-110' : 'scale-90'} ${
                      source === 'Ollama' ? 'bg-blue-600 shadow-blue-600/20' : source === 'ComfyUI' ? 'bg-purple-600 shadow-purple-600/20' : 'bg-slate-800 shadow-black/50'
                    }`} onClick={() => toggleSection(source)}>
                      <Box size={28} />
                    </div>
                    <div className="text-left cursor-pointer" onClick={() => toggleSection(source)}>
                       <h3 className="text-xl font-black text-white uppercase tracking-wider">{source}</h3>
                       <p className="text-[10px] text-slate-500 font-bold uppercase tracking-widest">{items.length} Local Intelligence Files</p>
                    </div>
                 </div>
                 
                 <div className="flex items-center gap-4">
                    <div className="text-slate-500 cursor-pointer p-2 hover:bg-slate-800 rounded-full transition-colors" onClick={() => toggleSection(source)}>
                       {isExpanded ? <ChevronUp size={24} /> : <ChevronDown size={24} />}
                    </div>
                 </div>
              </div>

              {isExpanded && (
                <div className="border-t border-slate-800/50 animate-in fade-in slide-in-from-top-2 duration-500">
                  <div className="max-h-[500px] overflow-y-auto custom-scrollbar">
                    <table className="w-full text-left text-xs">
                      <thead className="bg-slate-950/50 text-slate-600 font-black uppercase tracking-[0.2em] sticky top-0 z-10 backdrop-blur-md">
                        <tr>
                          <th className="p-8 w-16"></th>
                          <th className="p-8">Model & Intelligence</th>
                          <th className="p-8 text-center">Status</th>
                          <th className="p-8 text-right">Actions</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-800/30">
                        {items.map(m => {
                          const lOptions = getLaunchOptions(m);
                          return (
                            <tr key={m.path} className="hover:bg-slate-800/20 transition-all group/row relative">
                              <td className="p-8 w-16">
                                <input 
                                   type="checkbox" 
                                   className="w-5 h-5 rounded border-slate-700 bg-slate-900 text-blue-500 focus:ring-blue-500/20 cursor-pointer"
                                   checked={selectedModels.has(m.path)}
                                   onChange={() => toggleModelSelection(m.path)}
                                />
                              </td>
                              <td className="p-8">
                                 <div className="flex flex-col relative">
                                    <span 
                                      onClick={() => setViewingModel(m)} 
                                      className="text-white font-black text-base cursor-pointer hover:text-blue-500 transition-colors mb-1 flex items-center gap-2 group/name"
                                    >
                                       {m.name}
                                       <div className="invisible group-hover/name:visible absolute left-0 -top-12 z-[10000] bg-slate-900 border border-slate-800 p-4 rounded-2xl shadow-2xl w-72 pointer-events-none text-xs text-slate-400 font-medium leading-relaxed backdrop-blur-xl animate-in fade-in zoom-in duration-200">
                                          {m.description || "IA Model file optimized for local orchestration. Source: " + source}
                                       </div>
                                    </span>
                                    <span 
                                      className="text-[10px] text-slate-600 font-mono truncate max-w-sm hover:text-blue-400 hover:underline cursor-pointer"
                                      onClick={(e) => { e.stopPropagation(); handleOpenFolder(m.path); }}
                                    >
                                      {m.path}
                                    </span>
                                 </div>
                              </td>
                              <td className="p-8 text-center">
                                 {m.isSymlink ? <span className="text-[9px] font-black text-emerald-400 bg-emerald-400/10 px-4 py-2 rounded-full border border-emerald-400/10 uppercase tracking-widest">CENTRALIZED</span> 
                                 : <span className="text-[9px] font-black text-slate-600 bg-slate-800 px-4 py-2 rounded-full border border-slate-700 uppercase tracking-widest">STANDALONE</span>}
                              </td>
                              <td className="p-8 text-right">
                                <div className="flex justify-end gap-2">
                                  {lOptions.map(opt => (
                                     <button key={opt.type} onClick={() => handleLaunch(m, opt.type)} className="p-3 bg-blue-500/10 text-blue-500 hover:bg-blue-600 hover:text-white rounded-xl transition-all shadow-lg active:scale-90" title={opt.label}>
                                        <opt.icon size={16} />
                                     </button>
                                  ))}
                                  <button onClick={(e) => { e.stopPropagation(); handleOpenFolder(m.path); }} className="p-3 bg-slate-800 text-slate-500 hover:text-white rounded-xl transition-all active:scale-90" title="Open Folder">
                                     <FolderOpen size={16} />
                                  </button>
                                  <button onClick={(e) => { e.stopPropagation(); handleRename(m); }} className="p-3 bg-slate-800 text-slate-500 hover:text-white rounded-xl transition-all active:scale-90" title="Edit/Rename">
                                     <Edit3 size={16} />
                                  </button>
                                  <button onClick={(e) => { e.stopPropagation(); handleDelete(m); }} className="p-3 bg-red-500/10 text-red-500 hover:bg-red-500 hover:text-white rounded-xl transition-all active:scale-90" title={m.isSymlink ? "Remover Centralização" : "Delete Permanent"}>
                                     <Trash2 size={16} />
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
              )}
            </div>
          );
        })}
      </div>
    <LaunchModal 
      isOpen={launchModalData.isOpen} 
      modelName={launchModalData.model?.name || ''} 
      onClose={() => setLaunchModalData({ isOpen: false, model: null })}
      onLaunch={(params) => launchModalData.model && handleLaunch(launchModalData.model, 'llama.cpp', params)}
    />

      {/* Batch Action Bar */}
      {selectedModels.size > 0 && (
        <div className="fixed bottom-10 left-1/2 -translate-x-1/2 bg-slate-900 border border-slate-700 p-4 rounded-full shadow-2xl flex items-center gap-6 z-[9999] animate-in slide-in-from-bottom-10 backdrop-blur-xl">
          <span className="text-white font-black text-sm px-4">
            {selectedModels.size} selecionados
          </span>
          <div className="flex items-center gap-2 border-l border-slate-700 pl-6">
             <button onClick={handleBatchCentralize} className="flex items-center gap-2 bg-blue-600 hover:bg-blue-500 text-white font-bold py-2 px-6 rounded-full transition-all text-xs uppercase tracking-widest shadow-lg shadow-blue-600/20">
               <Zap size={14} /> Centralizar
             </button>
             <button onClick={handleBatchDelete} className="flex items-center gap-2 bg-red-500/10 hover:bg-red-500 text-red-500 hover:text-white font-bold py-2 px-6 rounded-full transition-all text-xs uppercase tracking-widest border border-red-500/20">
               <Trash2 size={14} /> Excluir
             </button>
          </div>
        </div>
      )}
    </div>
  );
}
