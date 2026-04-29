import { useState, useEffect } from 'react';
import { Folder, Trash2, Save, RefreshCw, HardDrive, Box, FolderOpen, Search } from 'lucide-react';
import HelpTooltip from '../components/HelpTooltip';
import { useToast } from '../components/Toast';

export default function Settings() {
  const [config, setConfig] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [newPath, setNewPath] = useState('');
  const [saving, setSaving] = useState(false);
  const { showToast } = useToast();

  const fetchConfig = () => {
    setLoading(true);
    fetch('/api/config')
      .then(res => res.json())
      .then(data => {
        setConfig(data);
        setLoading(false);
      });
  };

    const handleAutoDetect = async (quiet = false) => {
    try {
      const res = await fetch('/api/auto-detect', { method: 'POST' });
      const data = await res.json();
      setConfig(data.config);
      if (quiet) {
        showToast('Auto-detect realizado silenciosamente.', 'success');
      } else {
        showToast('Auto-detect completo! Verifique as pastas.', 'success');
      }
    } catch (e) {
      if (!quiet) showToast('Falha na detecção automática.', 'error');
    }
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await fetch('/api/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(config)
      });
      showToast('Configurações salvas!', 'success');
    } catch (e) {
      showToast('Erro ao salvar.', 'error');
    } finally {
      setSaving(false);
    }
  };

  const pickFolder = async (field: string) => {
    let currentVal = '';
    if (field === 'centralDir') currentVal = config.centralDir;
    else if (field === 'comfyDir') currentVal = config.comfyDir;
    else if (field === 'scan') currentVal = newPath;

    try {
      const res = await fetch(`/api/pick-folder?initialPath=${encodeURIComponent(currentVal)}`);
      const data = await res.json();
      if (data.path) {
        if (field === 'centralDir') setConfig({ ...config, centralDir: data.path });
        else if (field === 'comfyDir') setConfig({ ...config, comfyDir: data.path });
        else if (field === 'scan') setNewPath(data.path);
      }
    } catch (e) { alert('Erro ao abrir seletor de pastas.'); }
  };

  const addPath = () => {
    if (!newPath) return;
    if (config.scanDirectories.includes(newPath)) return;
    setConfig({ ...config, scanDirectories: [...config.scanDirectories, newPath] });
    setNewPath('');
  };

  const removePath = (path: string) => {
    setConfig({ ...config, scanDirectories: config.scanDirectories.filter((p: string) => p !== path) });
  };

  useEffect(() => { 
    fetchConfig(); 
    handleAutoDetect(true);
  }, []);

  if (loading) return <div className="p-20 text-center animate-pulse text-slate-500 font-black">SYNCING CONFIG...</div>;

  return (
    <div className="p-12 max-w-5xl mx-auto animate-in fade-in duration-700 pb-32">
      <header className="mb-12 flex justify-between items-end">
        <div>
          <h2 className="text-4xl font-black text-white mb-2">Settings & Core</h2>
          <p className="text-slate-500">Infrastructure configuration and link engine paths.</p>
        </div>
        <button 
          onClick={() => handleAutoDetect()}
          className="bg-slate-900 hover:bg-slate-800 text-white font-black text-[10px] uppercase tracking-widest px-8 py-4 rounded-2xl border border-slate-800 transition-all flex items-center gap-3 shadow-xl active:scale-95"
        >
          <Search size={16} className="text-blue-500" /> Auto-Detect Apps
        </button>
      </header>

      <div className="space-y-8">
        {/* Central Directory */}
        <div className="bg-slate-900 border border-slate-800 rounded-[2.5rem] p-10 shadow-2xl relative overflow-hidden group">
           <div className="flex items-center gap-4 mb-6">
              <div className="w-12 h-12 bg-blue-600 rounded-2xl flex items-center justify-center text-white shadow-xl shadow-blue-600/20">
                 <HardDrive size={24} />
              </div>
              <h3 className="text-lg font-black text-white uppercase tracking-widest flex items-center">
                Central Repository
                <HelpTooltip text="Esta é a pasta onde todos os 'atalhos' inteligentes serão criados. Centralize aqui para economizar espaço em disco sem duplicar arquivos." />
              </h3>
           </div>
           
           <p className="text-xs text-slate-500 mb-8 leading-relaxed max-w-xl">
              Master storage for all links. This folder will grow with model shortcuts, but the disk space usage remains near zero.
           </p>
           
           <div className="flex gap-3">
              <input 
                type="text" 
                value={config.centralDir || ''}
                onChange={(e) => setConfig({ ...config, centralDir: e.target.value })}
                className="flex-1 bg-slate-950 border border-slate-800 rounded-2xl px-6 py-4 text-sm focus:outline-none focus:ring-2 focus:ring-blue-600 text-slate-300 font-mono"
              />
              <button onClick={() => pickFolder('centralDir')} className="bg-slate-800 hover:bg-slate-700 text-white px-5 rounded-2xl transition-all" title="Browse">
                 <FolderOpen size={20} />
              </button>
           </div>
        </div>

        {/* ComfyUI Directory */}
        <div className="bg-slate-900 border border-slate-800 rounded-[2.5rem] p-10 shadow-2xl">
           <div className="flex items-center gap-4 mb-6">
              <div className="w-12 h-12 bg-emerald-600 rounded-2xl flex items-center justify-center text-white shadow-xl shadow-emerald-600/20">
                 <Box size={24} />
              </div>
              <h3 className="text-lg font-black text-white uppercase tracking-widest flex items-center">
                ComfyUI Installation
                <HelpTooltip text="Aponte para a pasta raiz do seu ComfyUI. Isso permite que o Centraliza.ai encontre os scripts de inicialização da GPU automaticamente." />
              </h3>
           </div>
           <p className="text-xs text-slate-500 mb-8 max-w-xl">Root folder of your ComfyUI (used to find run_nvidia_gpu.bat).</p>
           <div className="flex gap-3">
              <input 
                type="text" 
                value={config.comfyDir || ''}
                onChange={(e) => setConfig({ ...config, comfyDir: e.target.value })}
                className="flex-1 bg-slate-950 border border-slate-800 rounded-2xl px-6 py-4 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-600 text-slate-300 font-mono"
              />
              <button onClick={() => pickFolder('comfyDir')} className="bg-slate-800 hover:bg-slate-700 text-white px-5 rounded-2xl transition-all" title="Browse">
                 <FolderOpen size={20} />
              </button>
           </div>
        </div>

        {/* Scan Directories */}
        <div className="bg-slate-900 border border-slate-800 rounded-[2.5rem] p-10 shadow-2xl">
           <div className="flex items-center gap-4 mb-8">
              <div className="w-12 h-12 bg-purple-600 rounded-2xl flex items-center justify-center text-white shadow-xl shadow-purple-600/20">
                 <Folder size={24} />
              </div>
              <h3 className="text-lg font-black text-white uppercase tracking-widest flex items-center">
                Intelligence Sources
                <HelpTooltip text="Adicione as pastas onde você já possui modelos baixados (ex: pasta de modelos do Ollama ou LM Studio). O app usará essas fontes para criar os links." />
              </h3>
           </div>
           
           <div className="space-y-3 mb-10">
              {config.scanDirectories.map((path: string) => (
                <div key={path} className="flex items-center justify-between bg-slate-950/50 border border-slate-800/50 rounded-2xl p-5 group hover:border-slate-700 transition-colors">
                   <span className="text-[11px] font-mono text-slate-500 truncate">{path}</span>
                   <button onClick={() => removePath(path)} className="text-slate-700 hover:text-red-500 transition-colors p-2">
                      <Trash2 size={18} />
                   </button>
                </div>
              ))}
           </div>

           <div className="flex gap-3">
              <div className="relative flex-1">
                 <input 
                  type="text" 
                  value={newPath}
                  onChange={(e) => setNewPath(e.target.value)}
                  placeholder="Paste or browse new directory path..."
                  className="w-full bg-slate-950 border border-slate-800 rounded-2xl py-4 pl-6 pr-12 text-sm focus:outline-none focus:ring-2 focus:ring-purple-600 text-slate-300 font-mono"
                 />
                 <button onClick={() => pickFolder('scan')} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-white p-2">
                    <FolderOpen size={18} />
                 </button>
              </div>
              <button onClick={addPath} className="bg-purple-600 hover:bg-purple-500 text-white px-8 rounded-2xl transition-all font-black text-xs uppercase tracking-widest shadow-xl shadow-purple-600/20">
                 Add Path
              </button>
           </div>
        </div>

        <div className="fixed bottom-10 right-10 z-50">
           <button 
             onClick={handleSave}
             disabled={saving}
             className="bg-white text-black hover:bg-blue-600 hover:text-white font-black text-xs uppercase tracking-[0.2em] px-16 py-5 rounded-[2rem] transition-all shadow-2xl shadow-white/20 flex items-center gap-4 active:scale-95 disabled:opacity-50"
           >
              {saving ? <RefreshCw size={20} className="animate-spin" /> : <Save size={20} />}
              Save All Changes
           </button>
        </div>
      </div>
    </div>
  );
}
