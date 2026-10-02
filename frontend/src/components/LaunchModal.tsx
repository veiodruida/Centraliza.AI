import { useState } from 'react';
import { X, Play, Cpu } from 'lucide-react';
import ConfigImpact from './ConfigImpact';

interface LaunchModalProps {
  isOpen: boolean;
  onClose: () => void;
  onLaunch: (params: any) => void;
  modelName: string;
  modelPath?: string | null;
}

export default function LaunchModal({ isOpen, onClose, onLaunch, modelName, modelPath }: LaunchModalProps) {
  const [params, setParams] = useState({
    threads: 4,
    n_gpu_layers: 0,
    ctx_size: 2048,
    prompt: "You are a helpful AI assistant."
  });

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[10000] flex items-center justify-center p-6 bg-black/60 backdrop-blur-sm animate-in fade-in duration-300">
      <div className="bg-slate-900 border border-slate-800 w-full max-w-md rounded-[3rem] p-10 shadow-2xl relative overflow-hidden">
        <div className="absolute top-0 right-0 p-8">
           <button onClick={onClose} className="text-slate-500 hover:text-white transition-colors">
              <X size={24} />
           </button>
        </div>
        
        <header className="mb-10">
           <h3 className="text-slate-500 text-xs font-black uppercase tracking-widest mb-2 flex items-center gap-2">
              <Cpu size={14} className="text-blue-500" /> Advanced Execution
           </h3>
           <h2 className="text-2xl font-black text-white tracking-tighter truncate">{modelName}</h2>
        </header>

        <div className="space-y-8">
           <div>
              <label className="text-xs font-black text-slate-500 uppercase tracking-widest mb-4 block">CPU Threads</label>
              <input 
                type="range" min="1" max="32" 
                value={params.threads} 
                onChange={(e) => setParams({...params, threads: parseInt(e.target.value)})}
                className="w-full accent-blue-600 bg-slate-800 rounded-lg h-2 appearance-none cursor-pointer"
              />
              <div className="flex justify-between mt-3 text-xs font-black text-white uppercase">
                 <span>1 Thread</span>
                 <span className="text-blue-500 bg-blue-500/10 px-3 py-1 rounded-full">{params.threads} Threads</span>
                 <span>32 Threads</span>
              </div>
           </div>

           <div>
              <label className="text-xs font-black text-slate-500 uppercase tracking-widest mb-4 block">GPU Layers (n_gpu_layers)</label>
              <input 
                type="number" 
                value={params.n_gpu_layers} 
                onChange={(e) => setParams({...params, n_gpu_layers: parseInt(e.target.value)})}
                className="w-full bg-slate-950 border border-slate-800 rounded-2xl p-4 text-white font-black text-sm focus:outline-none focus:ring-2 focus:ring-blue-600"
              />
              <p className="text-xs text-slate-600 mt-2 font-bold uppercase tracking-widest">Set to 0 for CPU-only. Increase if you have available VRAM.</p>
           </div>

           <div>
              <label className="text-xs font-black text-slate-500 uppercase tracking-widest mb-4 block">Context Size</label>
              <div className="flex justify-between items-center mb-2">
                 <input 
                   type="number" min="1024" max="1048576" step="1024"
                   value={params.ctx_size} 
                   onChange={(e) => setParams({...params, ctx_size: Math.max(1024, parseInt(e.target.value) || 2048)})}
                   className="w-full bg-slate-950 border border-slate-800 rounded-2xl p-4 text-white font-black text-sm focus:outline-none focus:ring-2 focus:ring-blue-600"
                 />
              </div>
              <div className="flex justify-between text-[10px] text-slate-600 font-black uppercase tracking-widest mt-2">
                 <span>1 024</span>
                 <span className="text-blue-500 bg-blue-500/10 px-3 py-1 rounded-full">{params.ctx_size.toLocaleString('pt-PT')} tokens</span>
                 <span>262 144</span>
              </div>
           </div>

           <ConfigImpact
              ctxSize={params.ctx_size}
              gpuLayers={params.n_gpu_layers}
              modelPath={modelPath}
              kvBytesPerElement={2}
              onApplyRecommendation={(rec) => setParams(p => ({ ...p, ctx_size: rec.ctx, n_gpu_layers: rec.gpuLayers }))}
              className="p-4 rounded-3xl bg-slate-950/60 border border-slate-800"
           />

           <div>
              <label className="text-xs font-black text-slate-500 uppercase tracking-widest mb-4 block">System Prompt</label>
              <textarea 
                value={params.prompt} 
                onChange={(e) => setParams({...params, prompt: e.target.value})}
                rows={3}
                className="w-full bg-slate-950 border border-slate-800 rounded-2xl p-4 text-white font-medium text-xs focus:outline-none focus:ring-2 focus:ring-blue-600 resize-none"
                placeholder="Ex: You are a helpful assistant..."
              />
           </div>
        </div>

        <button 
          onClick={() => onLaunch(params)}
          className="w-full mt-10 bg-white text-black hover:bg-blue-600 hover:text-white font-black py-5 rounded-[2rem] transition-all flex items-center justify-center gap-3 shadow-xl shadow-white/5 active:scale-95 text-xs uppercase tracking-widest"
        >
           <Play size={18} /> Initialize Llama.cpp
        </button>
      </div>
    </div>
  );
}

