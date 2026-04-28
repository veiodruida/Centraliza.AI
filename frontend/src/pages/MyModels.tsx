import { useState, useEffect } from 'react';
import { Search, RefreshCw, Trash2, Link, FileText, CheckCircle, AlertCircle, HardDrive, ExternalLink } from 'lucide-react';

interface Model {
  name: string;
  path: string;
  size: number;
  isSymlink: boolean;
  targetPath?: string;
  finalModelName: string;
  source: string;
  externalLink?: string;
}

export default function MyModels() {
  const [models, setModels] = useState<Model[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [selectedPaths, setSelectedPaths] = useState<Set<string>>(new Set());

  const fetchModels = async () => {
    setLoading(true);
    setError('');
    try {
      const res = await fetch('/api/models');
      const data = await res.json();
      setModels(data);
    } catch (err) {
      setError('Failed to load models. Make sure the backend server is running.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchModels();
  }, []);

  const toggleSelect = (path: string) => {
    const next = new Set(selectedPaths);
    if (next.has(path)) next.delete(path);
    else next.add(path);
    setSelectedPaths(next);
  };

  const handleCentralize = async (model: Model) => {
    try {
      const res = await fetch('/api/centralize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          modelPath: model.path, 
          modelName: model.name, 
          finalModelName: model.finalModelName 
        })
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      fetchModels();
    } catch (err: any) {
      alert(err.message);
    }
  };

  const handleDelete = async () => {
    if (selectedPaths.size === 0) return;
    if (!confirm(`Permanently delete ${selectedPaths.size} models? This cannot be undone.`)) return;

    for (const path of selectedPaths) {
      const model = models.find(m => m.path === path);
      if (!model) continue;
      try {
        await fetch('/api/models', {
          method: 'DELETE',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ 
            modelPath: model.path, 
            modelName: model.name, 
            finalModelName: model.finalModelName 
          })
        });
      } catch (err) {
        console.error(err);
      }
    }
    setSelectedPaths(new Set());
    fetchModels();
  };

  const formatSize = (bytes: number) => {
    return (bytes / (1024 ** 3)).toFixed(2) + ' GB';
  };

  return (
    <div className="p-8 max-w-6xl mx-auto">
      <div className="flex justify-between items-end mb-8">
        <div>
          <h2 className="text-3xl font-bold text-white mb-2">My Local Models</h2>
          <p className="text-slate-400">Manage and centralize models found across your applications.</p>
        </div>
        <div className="flex gap-3">
          <button 
            onClick={fetchModels}
            disabled={loading}
            className="flex items-center gap-2 bg-slate-800 hover:bg-slate-700 text-white px-4 py-2 rounded-lg transition-colors"
          >
            <RefreshCw size={18} className={loading ? 'animate-spin' : ''} />
            Scan Now
          </button>
          <button 
            onClick={handleDelete}
            disabled={selectedPaths.size === 0}
            className="flex items-center gap-2 bg-red-500/10 hover:bg-red-500 text-red-500 hover:text-white px-4 py-2 rounded-lg transition-all disabled:opacity-50 disabled:cursor-not-allowed border border-red-500/20"
          >
            <Trash2 size={18} />
            Delete Selected ({selectedPaths.size})
          </button>
        </div>
      </div>

      {error && (
        <div className="bg-red-500/10 border border-red-500/20 text-red-400 p-4 rounded-xl mb-6 flex items-center gap-3">
          <AlertCircle size={20} />
          {error}
        </div>
      )}

      <div className="bg-slate-800/50 rounded-2xl border border-slate-700 overflow-hidden backdrop-blur-xl">
        <table className="w-full text-left">
          <thead className="bg-slate-800/80 border-b border-slate-700">
            <tr>
              <th className="p-4 w-12 text-center">
                <input 
                  type="checkbox" 
                  className="rounded border-slate-600 bg-slate-700 text-blue-500" 
                  onChange={(e) => {
                    if (e.target.checked) setSelectedPaths(new Set(models.map(m => m.path)));
                    else setSelectedPaths(new Set());
                  }}
                />
              </th>
              <th className="p-4 text-slate-400 font-semibold text-sm uppercase tracking-wider">Model Name</th>
              <th className="p-4 text-slate-400 font-semibold text-sm uppercase tracking-wider text-center">Source</th>
              <th className="p-4 text-slate-400 font-semibold text-sm uppercase tracking-wider text-center">Status</th>
              <th className="p-4 text-slate-400 font-semibold text-sm uppercase tracking-wider">Size</th>
              <th className="p-4 text-slate-400 font-semibold text-sm uppercase tracking-wider">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-700/50">
            {models.map((model) => (
              <tr key={model.path} className="hover:bg-slate-700/30 transition-colors group">
                <td className="p-4 text-center">
                  <input 
                    type="checkbox" 
                    checked={selectedPaths.has(model.path)}
                    onChange={() => toggleSelect(model.path)}
                    className="rounded border-slate-600 bg-slate-700 text-blue-500 cursor-pointer"
                  />
                </td>
                <td className="p-4">
                  <div className="flex flex-col">
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-slate-100">{model.name}</span>
                      {model.externalLink && (
                        <a href={model.externalLink} target="_blank" className="text-blue-400 hover:text-blue-300 transition-colors">
                          <ExternalLink size={14} />
                        </a>
                      )}
                    </div>
                    <span className="text-xs text-slate-500 font-mono truncate max-w-xs" title={model.path}>
                      {model.path}
                    </span>
                  </div>
                </td>
                <td className="p-4 text-center">
                  <span className={`px-2 py-1 rounded-md text-[10px] font-bold uppercase tracking-tighter ${
                    model.source === 'Ollama' ? 'bg-blue-500/10 text-blue-400' :
                    model.source === 'ComfyUI' ? 'bg-purple-500/10 text-purple-400' :
                    'bg-slate-600/20 text-slate-400'
                  }`}>
                    {model.source}
                  </span>
                </td>
                <td className="p-4 text-center">
                  {model.isSymlink ? (
                    <div className="flex items-center justify-center gap-1.5 text-emerald-400 text-xs font-bold bg-emerald-400/10 py-1 px-2 rounded-full">
                      <CheckCircle size={12} />
                      CENTRALIZED
                    </div>
                  ) : (
                    <div className="flex items-center justify-center gap-1.5 text-slate-500 text-xs font-bold bg-slate-500/10 py-1 px-2 rounded-full">
                      <AlertCircle size={12} />
                      LOCAL
                    </div>
                  )}
                </td>
                <td className="p-4 text-slate-300 text-sm font-medium">{formatSize(model.size)}</td>
                <td className="p-4">
                  {!model.isSymlink ? (
                    <button 
                      onClick={() => handleCentralize(model)}
                      className="flex items-center gap-2 bg-blue-500 hover:bg-blue-600 text-white text-xs font-bold px-3 py-1.5 rounded-lg transition-all shadow-lg shadow-blue-500/20"
                    >
                      <Link size={14} />
                      Centralize
                    </button>
                  ) : (
                    <button disabled className="text-slate-600 text-xs font-medium cursor-not-allowed">
                      Managed
                    </button>
                  )}
                </td>
              </tr>
            ))}
            {models.length === 0 && !loading && (
              <tr>
                <td colSpan={6} className="p-12 text-center text-slate-500">
                  <HardDrive size={48} className="mx-auto mb-4 opacity-10" />
                  No models found. Try clicking "Scan Now".
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
