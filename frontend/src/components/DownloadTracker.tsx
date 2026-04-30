import { useState, useEffect, useRef } from 'react';
import { io } from 'socket.io-client';
import { CheckCircle, Loader2, X, ChevronDown, Pause, Play, AlertTriangle } from 'lucide-react';

interface DownloadItem {
  progress: number;
  status: 'downloading' | 'paused' | 'completed' | 'cancelled';
  isFadingOut?: boolean;
}

export default function DownloadTracker() {
  const [downloads, setDownloads] = useState<Record<string, DownloadItem>>({});
  // Track fadeout timers so we can clear them if state changes (e.g. pause → resume)
  const fadeTimers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});

  const scheduleFadeout = (modelName: string, delayMs: number) => {
    // Clear any existing timer
    if (fadeTimers.current[modelName]) clearTimeout(fadeTimers.current[modelName]);

    fadeTimers.current[modelName] = setTimeout(() => {
      setDownloads(prev => ({
        ...prev,
        [modelName]: { ...prev[modelName], isFadingOut: true }
      }));
      // Remove from state after CSS transition completes
      setTimeout(() => {
        setDownloads(prev => {
          const next = { ...prev };
          delete next[modelName];
          return next;
        });
        delete fadeTimers.current[modelName];
      }, 1000); // matches transition-all duration-1000
    }, delayMs);
  };

  useEffect(() => {
    const socket = io(window.location.origin);

    socket.on('download-progress', (data) => {
      console.log('[Socket] Progress:', data);
      setDownloads(prev => {
        const current = prev[data.model];
        // Don't update progress if we're already in a terminal or paused state
        if (current?.status === 'cancelled' || current?.status === 'completed' || current?.status === 'paused') return prev;
        return {
          ...prev,
          [data.model]: { 
            progress: data.progress, 
            status: 'downloading',
            isFadingOut: false
          }
        };
      });
    });

    socket.on('download-complete', (data) => {
      console.log('[Socket] Complete:', data);

      if (data.paused) {
        // Clear any scheduled fadeout — paused must stay visible
        if (fadeTimers.current[data.model]) {
          clearTimeout(fadeTimers.current[data.model]);
          delete fadeTimers.current[data.model];
        }
        setDownloads(prev => ({
          ...prev,
          [data.model]: { ...prev[data.model], status: 'paused', isFadingOut: false }
        }));

      } else if (data.cancelled) {
        // Show "Cancelled" then fade out
        if (fadeTimers.current[data.model]) clearTimeout(fadeTimers.current[data.model]);
        setDownloads(prev => ({
          ...prev,
          [data.model]: { ...prev[data.model], status: 'cancelled', isFadingOut: false }
        }));
        scheduleFadeout(data.model, 2500);

      } else if (data.success) {
        // Show "Completed" for 4s then fade out
        setDownloads(prev => ({
          ...prev,
          [data.model]: { ...prev[data.model], status: 'completed', progress: 100, isFadingOut: false }
        }));
        scheduleFadeout(data.model, 4000);

      } else {
        // Generic failure (e.g. process crashed unexpectedly) — remove card after short delay
        setDownloads(prev => {
          if (!prev[data.model]) return prev;
          return { ...prev, [data.model]: { ...prev[data.model], status: 'cancelled', isFadingOut: false } };
        });
        scheduleFadeout(data.model, 2000);
      }
    });

    socket.on('connect', () => console.log('[Socket] Connected to server'));
    socket.on('connect_error', (err) => console.error('[Socket] Connection error:', err));

    return () => {
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
      // The socket 'download-complete' with cancelled:true will update the UI
    } catch (e) {}
  };

  const handlePause = async (modelName: string) => {
    try {
      await fetch('/api/download/pause', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ modelName })
      });
      // The socket 'download-complete' with paused:true will update the UI
    } catch (e) {}
  };

  const handleResume = async (modelName: string) => {
    try {
      await fetch('/api/download', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ modelName })
      });
      // Optimistic UI update — socket will confirm
      setDownloads(prev => ({
        ...prev,
        [modelName]: { ...prev[modelName], status: 'downloading', isFadingOut: false }
      }));
    } catch (e) {}
  };

  const dismiss = (modelName: string) => {
    if (fadeTimers.current[modelName]) clearTimeout(fadeTimers.current[modelName]);
    setDownloads(prev => {
      const next = { ...prev };
      delete next[modelName];
      return next;
    });
  };

  return (
    <div className="fixed bottom-10 right-10 z-[5000] w-80 space-y-4">
      {entries.map(([model, item]) => (
        <div 
          key={model} 
          className={`bg-slate-900 border border-slate-700 p-6 rounded-[2rem] shadow-2xl backdrop-blur-xl relative overflow-hidden transition-all duration-1000 ${
            item.isFadingOut 
              ? 'opacity-0 scale-95 translate-x-10 pointer-events-none' 
              : 'opacity-100 scale-100 translate-x-0'
          }`}
        >
          {/* Subtle gradient background */}
          <div className={`absolute inset-0 pointer-events-none transition-all duration-700 ${
            item.status === 'completed' ? 'bg-gradient-to-br from-emerald-500/5 to-transparent' :
            item.status === 'cancelled' ? 'bg-gradient-to-br from-red-500/5 to-transparent' :
            item.status === 'paused' ? 'bg-gradient-to-br from-amber-500/5 to-transparent' :
            'bg-gradient-to-br from-blue-500/5 to-transparent'
          }`} />
          
          <div className="flex items-center gap-4 mb-4 relative z-10">
            <div className={`p-3 rounded-2xl shadow-inner transition-all duration-500 ${
              item.status === 'completed' ? 'bg-emerald-500/10' :
              item.status === 'cancelled' ? 'bg-red-500/10' :
              item.status === 'paused' ? 'bg-amber-500/10' :
              'bg-blue-500/10'
            }`}>
              {item.status === 'completed' 
                ? <CheckCircle size={20} className="text-emerald-500" /> 
                : item.status === 'cancelled' 
                  ? <AlertTriangle size={20} className="text-red-500" />
                  : item.status === 'paused'
                    ? <Pause size={20} className="text-amber-400" />
                    : <Loader2 size={20} className="animate-spin text-blue-400" />
              }
            </div>
            <div className="flex-1 min-w-0">
               <p className={`text-[10px] font-black uppercase tracking-[0.2em] mb-1 transition-colors duration-500 ${
                 item.status === 'completed' ? 'text-emerald-500' : 
                 item.status === 'cancelled' ? 'text-red-500' : 
                 item.status === 'paused' ? 'text-amber-400' :
                 'text-blue-400'
               }`}>
                 {item.status === 'completed' ? '✓ Concluído' : 
                  item.status === 'paused' ? '⏸ Pausado' : 
                  item.status === 'cancelled' ? '✕ Cancelado' : 
                  '↓ Baixando'}
               </p>
               <h4 className="text-sm font-black text-white truncate pr-2">{model}</h4>
            </div>
            
            <div className="flex gap-1">
                {item.status === 'downloading' && (
                    <button 
                      onClick={() => handlePause(model)}
                      className="w-10 h-10 flex items-center justify-center bg-slate-800 hover:bg-amber-600 text-slate-400 hover:text-white rounded-xl transition-all duration-300 active:scale-90 shadow-lg"
                      title="PAUSAR (Manter arquivos parciais)"
                    >
                      <Pause size={16} strokeWidth={3} />
                    </button>
                )}
                {item.status === 'paused' && (
                    <button 
                      onClick={() => handleResume(model)}
                      className="w-10 h-10 flex items-center justify-center bg-blue-600 hover:bg-blue-500 text-white rounded-xl transition-all duration-300 active:scale-90 shadow-lg animate-pulse"
                      title="RETOMAR Download"
                    >
                      <Play size={16} strokeWidth={3} fill="currentColor" />
                    </button>
                )}
                {(item.status === 'downloading' || item.status === 'paused') && (
                    <button 
                    onClick={() => handleCancel(model)}
                    className="w-10 h-10 flex items-center justify-center bg-slate-800 hover:bg-red-500 text-slate-400 hover:text-white rounded-xl transition-all duration-300 active:scale-90 shadow-lg"
                    title="CANCELAR (Excluir arquivos parciais)"
                    >
                    <X size={16} strokeWidth={3} />
                    </button>
                )}
                {/* Dismiss button: only visible in terminal states */}
                {(item.status === 'completed' || item.status === 'cancelled') && (
                  <button 
                    onClick={() => dismiss(model)}
                    className="w-8 h-8 flex items-center justify-center bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white rounded-xl transition-all duration-300 active:scale-90 shadow-lg"
                    title="Fechar"
                  >
                    <ChevronDown size={14} strokeWidth={3} />
                  </button>
                )}
            </div>
          </div>
          
          {/* Progress bar */}
          <div className="relative w-full bg-slate-950 h-3 rounded-full overflow-hidden mb-3 border border-slate-800 shadow-inner">
            {item.progress === -1 ? (
              // Indeterminate shimmer animation
              <div className="absolute inset-0 bg-gradient-to-r from-transparent via-blue-500/60 to-transparent animate-[shimmer_1.5s_infinite]" 
                   style={{ backgroundSize: '200% 100%', animation: 'shimmer 1.5s infinite linear' }} />
            ) : (
              <div 
                className={`h-full transition-all duration-700 ease-out rounded-full ${
                  item.status === 'completed' ? 'bg-emerald-500 shadow-[0_0_15px_rgba(16,185,129,0.5)]' : 
                  item.status === 'cancelled' ? 'bg-red-500/70' :
                  item.status === 'paused' ? 'bg-amber-500/70' : 
                  'bg-blue-500 shadow-[0_0_15px_rgba(59,130,246,0.5)]'
                }`}
                style={{ width: `${Math.min(100, Math.max(0, item.progress))}%` }}
              />
            )}
          </div>
          
          <div className="flex justify-between items-center relative z-10">
            <span className={`text-[11px] font-black uppercase tracking-widest transition-colors duration-500 ${
              item.status === 'completed' ? 'text-emerald-400' : 
              item.status === 'cancelled' ? 'text-red-400' :
              item.status === 'paused' ? 'text-amber-400' : 
              'text-blue-400'
            }`}>
              {item.progress === -1 
                ? 'Iniciando...' 
                : item.status === 'completed' 
                  ? 'DOWNLOAD CONCLUÍDO' 
                  : item.status === 'cancelled' 
                    ? 'CANCELADO'
                    : item.status === 'paused'
                      ? `PAUSADO — ${item.progress}%`
                      : `BAIXANDO: ${item.progress}%`
              }
            </span>
          </div>

          {/* Version tag */}
          <div className="absolute top-2 right-6 text-[8px] text-slate-700 font-mono">v0.4.0</div>
        </div>
      ))}

      {/* Shimmer keyframe injected inline for the indeterminate bar */}
      <style>{`
        @keyframes shimmer {
          0%   { background-position: -200% center; }
          100% { background-position:  200% center; }
        }
      `}</style>
    </div>
  );
}
