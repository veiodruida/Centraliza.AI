import { useState, useEffect } from 'react';
import { io } from 'socket.io-client';
import { CheckCircle, Loader2, X, ChevronDown } from 'lucide-react';

export default function DownloadTracker() {
  const [downloads, setDownloads] = useState<Record<string, number>>({});

  useEffect(() => {
    const socket = io();

    socket.on('download-progress', (data) => {
      console.log('Download Progress:', data);
      setDownloads(prev => ({ ...prev, [data.model]: data.progress }));
    });

    socket.on('download-complete', (data) => {
      console.log('Download Complete:', data);
      setDownloads(prev => ({ ...prev, [data.model]: 100 }));
      
      // Auto-dismiss after 10 seconds
      setTimeout(() => {
        setDownloads(prev => {
          const next = { ...prev };
          delete next[data.model];
          return next;
        });
      }, 10000);
    });

    return () => {
      socket.off('download-progress');
      socket.off('download-complete');
      socket.disconnect();
    };
  }, []);

  const entries = Object.entries(downloads);
  if (entries.length === 0) return null;

  const handleCancel = async (modelName: string) => {
    try {
      await fetch('/api/download/cancel', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ modelName })
      });
      // Force remove from UI immediately on cancel click
      setDownloads(prev => {
        const next = { ...prev };
        delete next[modelName];
        return next;
      });
    } catch (e) {}
  };

  const dismiss = (modelName: string) => {
    setDownloads(prev => {
      const next = { ...prev };
      delete next[modelName];
      return next;
    });
  };

  return (
    <div className="fixed bottom-10 right-10 z-[5000] w-80 space-y-4 animate-in slide-in-from-right duration-500">
      {entries.map(([model, progress]) => (
        <div key={model} className="bg-slate-900 border border-slate-700 p-6 rounded-[2rem] shadow-2xl backdrop-blur-xl relative overflow-hidden group">
          {/* Subtle gradient background */}
          <div className="absolute inset-0 bg-gradient-to-br from-blue-500/5 to-transparent pointer-events-none" />
          
          <div className="flex items-center gap-4 mb-4 relative z-10">
            <div className="p-3 bg-blue-500/10 rounded-2xl text-blue-500 shadow-inner">
              {progress >= 100 ? <CheckCircle size={20} className="text-emerald-500" /> : <Loader2 size={20} className="animate-spin" />}
            </div>
            <div className="flex-1 min-w-0">
               <p className="text-[10px] font-black text-slate-500 uppercase tracking-[0.2em] mb-1">
                 {progress >= 100 ? 'Concluído' : 'Baixando'}
               </p>
               <h4 className="text-sm font-black text-white truncate pr-2">{model}</h4>
            </div>
            
            <div className="flex gap-1">
                {progress < 100 && (
                    <button 
                    onClick={() => handleCancel(model)}
                    className="w-8 h-8 flex items-center justify-center bg-slate-800 hover:bg-red-500 text-slate-400 hover:text-white rounded-xl transition-all duration-300 active:scale-90 shadow-lg"
                    title="Cancelar"
                    >
                    <X size={14} strokeWidth={3} />
                    </button>
                )}
                <button 
                  onClick={() => dismiss(model)}
                  className="w-8 h-8 flex items-center justify-center bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white rounded-xl transition-all duration-300 active:scale-90 shadow-lg"
                  title="Fechar"
                >
                  <ChevronDown size={14} strokeWidth={3} />
                </button>
            </div>
          </div>
          
          <div className="relative w-full bg-slate-800 h-2 rounded-full overflow-hidden mb-2 shadow-inner">
            <div 
              className={`h-full transition-all duration-500 rounded-full ${progress >= 100 ? 'bg-emerald-500' : 'bg-blue-500 shadow-[0_0_10px_rgba(59,130,246,0.5)]'} ${progress === -1 ? 'w-1/2 animate-pulse absolute left-0 right-0 mx-auto' : ''}`}
              style={{ width: progress === -1 ? '50%' : `${Math.min(100, Math.max(0, progress))}%` }}
            />
          </div>
          
          <div className="flex justify-between items-center relative z-10">
            <span className={`text-[11px] font-black uppercase tracking-widest ${progress >= 100 ? 'text-emerald-500' : 'text-blue-500'}`}>
              {progress === -1 ? 'Iniciando...' : progress >= 100 ? 'Sucesso!' : `${progress}%`}
            </span>
            <span className="text-[10px] text-slate-500 font-bold uppercase tracking-tighter">
              {progress >= 100 ? 'Pode fechar esta janela' : 'Aguarde a conclusão'}
            </span>
          </div>
        </div>
      ))}
    </div>
  );
}
