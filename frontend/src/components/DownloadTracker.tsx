import { useState, useEffect, useRef } from 'react';
import { io } from 'socket.io-client';
import { CheckCircle, X, ChevronDown, Pause, Play, AlertTriangle, Download, Sparkles } from 'lucide-react';
import { useApp } from '../context/AppContext';

interface DownloadItem {
  progress: number;
  status: 'downloading' | 'paused' | 'completed' | 'cancelled';
  isFadingOut?: boolean;
}

export default function DownloadTracker() {
  const { t } = useApp();
  const [downloads, setDownloads] = useState<Record<string, DownloadItem>>({});
  const fadeTimers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});

  const scheduleFadeout = (modelName: string, delayMs: number) => {
    if (fadeTimers.current[modelName]) clearTimeout(fadeTimers.current[modelName]);

    fadeTimers.current[modelName] = setTimeout(() => {
      setDownloads(prev => ({
        ...prev,
        [modelName]: { ...prev[modelName], isFadingOut: true }
      }));
      setTimeout(() => {
        setDownloads(prev => {
          const next = { ...prev };
          delete next[modelName];
          return next;
        });
        delete fadeTimers.current[modelName];
      }, 1000);
    }, delayMs);
  };

  useEffect(() => {
    const socket = io(window.location.origin);

    socket.on('download-progress', (data) => {
      setDownloads(prev => {
        const current = prev[data.model];
        if (current?.status === 'cancelled' || current?.status === 'completed' || current?.status === 'paused') return prev;
        
        // Jitter protection: only update if progress actually moves or is -1
        if (current && data.progress !== -1 && data.progress <= current.progress) return prev;

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
      if (data.paused) {
        if (fadeTimers.current[data.model]) {
          clearTimeout(fadeTimers.current[data.model]);
          delete fadeTimers.current[data.model];
        }
        setDownloads(prev => ({
          ...prev,
          [data.model]: { ...prev[data.model], status: 'paused', isFadingOut: false }
        }));
      } else if (data.cancelled) {
        if (fadeTimers.current[data.model]) clearTimeout(fadeTimers.current[data.model]);
        setDownloads(prev => ({
          ...prev,
          [data.model]: { ...prev[data.model], status: 'cancelled', isFadingOut: false }
        }));
        scheduleFadeout(data.model, 2000);
      } else if (data.success) {
        setDownloads(prev => ({
          ...prev,
          [data.model]: { ...prev[data.model], status: 'completed', progress: 100, isFadingOut: false }
        }));
        scheduleFadeout(data.model, 4000);
      } else {
        setDownloads(prev => {
          if (!prev[data.model]) return prev;
          return { ...prev, [data.model]: { ...prev[data.model], status: 'cancelled', isFadingOut: false } };
        });
        scheduleFadeout(data.model, 2000);
      }
    });

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
    } catch (e) {}
  };

  const handlePause = async (modelName: string) => {
    try {
      await fetch('/api/download/pause', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ modelName })
      });
    } catch (e) {}
  };

  const handleResume = async (modelName: string) => {
    try {
      await fetch('/api/download', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ modelName })
      });
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
    <div className="fixed bottom-4 sm:bottom-12 right-4 sm:right-12 left-4 sm:left-auto z-[5000] sm:w-96 space-y-4 md:space-y-6">
      {entries.map(([model, item]) => (
        <div 
          key={model} 
          className={`bg-[var(--bg-surface)] border border-[var(--border)] p-5 md:p-8 rounded-2xl md:rounded-[3rem] shadow-premium backdrop-blur-3xl relative overflow-hidden transition-all duration-1000 group ${
            item.isFadingOut 
              ? 'opacity-0 scale-90 translate-x-20 pointer-events-none' 
              : 'opacity-100 scale-100 translate-x-0'
          }`}
        >
          <div className={`absolute inset-0 pointer-events-none transition-all duration-700 opacity-20 ${
            item.status === 'completed' ? 'bg-gradient-to-br from-emerald-500 to-transparent' :
            item.status === 'cancelled' ? 'bg-gradient-to-br from-red-500 to-transparent' :
            item.status === 'paused' ? 'bg-gradient-to-br from-amber-500 to-transparent' :
            'bg-gradient-to-br from-blue-500 to-transparent'
          }`} />
          
          <div className="flex items-center gap-4 md:gap-6 mb-4 md:mb-6 relative z-10">
            <div className={`w-12 h-12 md:w-14 md:h-14 rounded-xl md:rounded-2xl flex items-center justify-center shadow-premium transition-all duration-500 ${
              item.status === 'completed' ? 'bg-emerald-500/10 text-emerald-500' :
              item.status === 'cancelled' ? 'bg-red-500/10 text-red-500' :
              item.status === 'paused' ? 'bg-amber-500/10 text-amber-400' :
              'bg-blue-600 text-white'
            }`}>
              {item.status === 'completed' 
                ? <CheckCircle size={24} className="fill-current" /> 
                : item.status === 'cancelled' 
                  ? <AlertTriangle size={24} />
                  : item.status === 'paused'
                    ? <Pause size={24} fill="currentColor" />
                    : <Download size={24} className="animate-bounce" />
              }
            </div>
            <div className="flex-1 min-w-0">
               <p className={`text-[8px] md:text-[10px] font-black uppercase tracking-[0.3em] md:tracking-[0.4em] mb-1 md:mb-2 transition-colors duration-500 ${
                 item.status === 'completed' ? 'text-emerald-500' : 
                 item.status === 'cancelled' ? 'text-red-500' : 
                 item.status === 'paused' ? 'text-amber-400' :
                 'text-blue-500'
               }`}>
                 {item.status === 'completed' ? t('hub_installed') : 
                  item.status === 'paused' ? t('pause') : 
                  item.status === 'cancelled' ? t('cancel') : 
                  t('hub_installing')}
               </p>
               <h4 className="text-sm md:text-lg font-black text-[var(--text-primary)] truncate pr-4 tracking-tighter leading-none">{model.split('/').pop()}</h4>
            </div>
            
            <div className="flex gap-1.5 md:gap-2">
                {item.status === 'downloading' && (
                    <button 
                      onClick={() => handlePause(model)}
                      className="w-10 h-10 md:w-12 md:h-12 flex items-center justify-center bg-[var(--bg-input)] hover:bg-amber-500 hover:text-white text-[var(--text-secondary)] rounded-lg md:rounded-2xl transition-all active:scale-90 shadow-lg border border-[var(--border)]"
                    >
                      <Pause size={20} strokeWidth={3} />
                    </button>
                )}
                {item.status === 'paused' && (
                    <button 
                      onClick={() => handleResume(model)}
                      className="w-10 h-10 md:w-12 md:h-12 flex items-center justify-center bg-blue-600 hover:bg-blue-500 text-white rounded-lg md:rounded-2xl transition-all active:scale-90 shadow-lg animate-pulse"
                    >
                      <Play size={20} strokeWidth={3} fill="currentColor" />
                    </button>
                )}
                {(item.status === 'downloading' || item.status === 'paused') && (
                    <button 
                      onClick={() => handleCancel(model)}
                      className="w-10 h-10 md:w-12 md:h-12 flex items-center justify-center bg-[var(--bg-input)] hover:bg-red-500 hover:text-white text-[var(--text-secondary)] rounded-lg md:rounded-2xl transition-all active:scale-90 shadow-lg border border-[var(--border)]"
                    >
                      <X size={20} strokeWidth={3} />
                    </button>
                )}
                {(item.status === 'completed' || item.status === 'cancelled') && (
                  <button 
                    onClick={() => dismiss(model)}
                    className="w-9 h-9 md:w-10 md:h-10 flex items-center justify-center bg-[var(--bg-input)] hover:bg-[var(--border)] text-[var(--text-muted)] hover:text-[var(--text-primary)] rounded-lg md:rounded-xl transition-all active:scale-90 border border-[var(--border)]"
                  >
                    <ChevronDown size={18} strokeWidth={3} />
                  </button>
                )}
            </div>
          </div>
          
          <div className="relative w-full bg-[var(--bg-input)] h-3 md:h-4 rounded-full overflow-hidden mb-3 md:mb-4 border border-[var(--border)] shadow-inner">
            {item.progress === -1 ? (
              <div className="absolute inset-0 bg-gradient-to-r from-transparent via-blue-500/60 to-transparent animate-[shimmer_2s_infinite]" 
                   style={{ backgroundSize: '200% 100%' }} />
            ) : (
              <div 
                className={`h-full transition-all duration-700 ease-out rounded-full ${
                  item.status === 'completed' ? 'bg-emerald-500 shadow-[0_0_20px_rgba(16,185,129,0.5)]' : 
                  item.status === 'cancelled' ? 'bg-red-500/50' :
                  item.status === 'paused' ? 'bg-amber-500/50' : 
                  'bg-gradient-to-r from-blue-600 to-indigo-600 shadow-[0_0_20px_rgba(59,130,246,0.5)]'
                }`}
                style={{ width: `${Math.min(100, Math.max(0, item.progress))}%` }}
              >
                 <div className="absolute inset-0 bg-gradient-to-b from-white/20 to-transparent pointer-events-none" />
              </div>
            )}
          </div>
          
          <div className="flex justify-between items-center relative z-10">
            <span className={`text-[9px] md:text-[11px] font-black uppercase tracking-[0.3em] transition-colors duration-500 ${
              item.status === 'completed' ? 'text-emerald-500' : 
              item.status === 'cancelled' ? 'text-red-500' :
              item.status === 'paused' ? 'text-amber-500' : 
              'text-blue-500'
            }`}>
              {item.progress === -1 
                ? t('loading')
                : item.status === 'completed' 
                  ? t('hub_installed').toUpperCase()
                  : item.status === 'cancelled' 
                    ? t('cancel').toUpperCase()
                    : item.status === 'paused'
                      ? `${t('pause').toUpperCase()} — ${item.progress}%`
                      : `${t('hub_installing').toUpperCase()} — ${item.progress}%`
              }
            </span>
            {item.status === 'completed' && <Sparkles size={16} className="text-emerald-500 animate-pulse" />}
          </div>

          <div className="absolute top-4 right-8 text-[7px] md:text-[8px] text-[var(--text-muted)] font-black opacity-30 tracking-widest hidden sm:block">CENTRALIZA CORE</div>
        </div>
      ))}

      <style>{`
        @keyframes shimmer {
          0%   { background-position: -200% center; }
          100% { background-position:  200% center; }
        }
      `}</style>
    </div>
  );
}
