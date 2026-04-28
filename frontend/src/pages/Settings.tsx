import { useState, useEffect } from 'react';
import { Settings as SettingsIcon, Folder, Plus, Trash2, Save, RefreshCw, HardDrive, Shield, Box } from 'lucide-react';

export default function Settings() {
  const [config, setConfig] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [newPath, setNewPath] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetch('/api/config')
      .then(res => res.json())
      .then(data => {
        setConfig(data);
        setLoading(false);
      });
  }, []);

  const handleSave = async () => {
    setSaving(true);
    try {
      await fetch('/api/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(config)
      });
      alert('Configurações salvas com sucesso!');
    } catch (e) {
      alert('Erro ao salvar.');
    } finally {
      setSaving(false);
    }
  };

  const addPath = () => {
    if (!newPath) return;
    setConfig({ ...config, scanDirectories: [...config.scanDirectories, newPath] });
    setNewPath('');
  };

  const removePath = (path: string) => {
    setConfig({ ...config, scanDirectories: config.scanDirectories.filter((p: string) => p !== path) });
  };

  if (loading) return <div className="p-20 text-center animate-pulse text-slate-500 font-black">LOADING CORE CONFIG...</div>;

  const handleAutoDetect = async () => {
    try {
      const res = await fetch('/api/auto-detect', { method: 'POST' });
      const data = await res.json();
      setConfig(data.config);
      alert(`Detected and added ${data.added} new paths!`);
    } catch (e) {
      alert('Detection failed.');
    }
  };

  return (
    <div className="p-12 max-w-4xl mx-auto animate-in fade-in duration-700">
      <header className="mb-12 flex justify-between items-end">
        <div>
          <h2 className="text-4xl font-black text-white mb-2">Settings & Core</h2>
          <p className="text-slate-500">Manage your central storage and scan directories for the link engine.</p>
        </div>
        <button 
          onClick={handleAutoDetect}
          className="bg-slate-800 hover:bg-slate-700 text-white font-black text-xs uppercase tracking-widest px-8 py-3 rounded-2xl border border-slate-700 transition-all flex items-center gap-2"
        >
          <RefreshCw size={16} /> Auto-Detect
        </button>
      </header>

      <div className="space-y-8">
        {/* Central Directory */}
        <div className="bg-slate-900 border border-slate-800 rounded-[2.5rem] p-8 shadow-xl">
           <div className="flex items-center gap-4 mb-6">
              <div className="w-10 h-10 bg-blue-600 rounded-xl flex items-center justify-center text-white">
                 <HardDrive size={20} />
              </div>
              <h3 className="text-lg font-black text-white uppercase tracking-widest">Central Repository</h3>
           </div>
           
           <p className="text-xs text-slate-500 mb-6 leading-relaxed">
              This is where all Hardlinks/Symlinks will be created. Programs like LM Studio should point here to see all your centralized models.
           </p>
           
           <div className="flex gap-4">
              <input 
                type="text" 
                value={config.centralDir || ''}
                onChange={(e) => setConfig({ ...config, centralDir: e.target.value })}
                className="flex-1 bg-slate-950 border border-slate-800 rounded-2xl px-6 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-600 text-slate-300"
              />
           </div>
        </div>

        {/* ComfyUI Directory */}
        <div className="bg-slate-900 border border-slate-800 rounded-[2.5rem] p-8 shadow-xl">
           <div className="flex items-center gap-4 mb-6">
              <div className="w-10 h-10 bg-emerald-600 rounded-xl flex items-center justify-center text-white">
                 <Box size={20} />
              </div>
              <h3 className="text-lg font-black text-white uppercase tracking-widest">ComfyUI Home</h3>
           </div>
           <p className="text-xs text-slate-500 mb-6">Path to your ComfyUI portable or main installation (used for Launching).</p>
           <div className="flex gap-4">
              <input 
                type="text" 
                value={config.comfyDir || ''}
                onChange={(e) => setConfig({ ...config, comfyDir: e.target.value })}
                className="flex-1 bg-slate-950 border border-slate-800 rounded-2xl px-6 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-600 text-slate-300"
              />
           </div>
        </div>

        {/* Scan Directories */}
        <div className="bg-slate-900 border border-slate-800 rounded-[2.5rem] p-8 shadow-xl">
           <div className="flex items-center gap-4 mb-6">
              <div className="w-10 h-10 bg-purple-600 rounded-xl flex items-center justify-center text-white">
                 <Folder size={20} />
              </div>
              <h3 className="text-lg font-black text-white uppercase tracking-widest">Scan Locations</h3>
           </div>
           
           <div className="space-y-3 mb-8">
              {config.scanDirectories.map((path: string) => (
                <div key={path} className="flex items-center justify-between bg-slate-950/50 border border-slate-800/50 rounded-xl p-4 group">
                   <span className="text-xs font-mono text-slate-400 truncate">{path}</span>
                   <button onClick={() => removePath(path)} className="text-slate-600 hover:text-red-500 transition-colors">
                      <Trash2 size={16} />
                   </button>
                </div>
              ))}
           </div>

           <div className="flex gap-4">
              <input 
                type="text" 
                value={newPath}
                onChange={(e) => setNewPath(e.target.value)}
                placeholder="Add new directory path..."
                className="flex-1 bg-slate-950 border border-slate-800 rounded-2xl px-6 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-600 text-slate-300"
              />
              <button onClick={addPath} className="bg-slate-800 hover:bg-slate-700 text-white p-3 rounded-2xl transition-all">
                 <Plus size={20} />
              </button>
           </div>
        </div>

        <div className="flex justify-end pt-4">
           <button 
             onClick={handleSave}
             disabled={saving}
             className="bg-blue-600 hover:bg-blue-500 text-white font-black text-xs uppercase tracking-widest px-12 py-4 rounded-[1.5rem] transition-all shadow-2xl shadow-blue-600/30 flex items-center gap-3 active:scale-95 disabled:opacity-50"
           >
              {saving ? <RefreshCw size={18} className="animate-spin" /> : <Save size={18} />}
              Save Configuration
           </button>
        </div>
      </div>
    </div>
  );
}
