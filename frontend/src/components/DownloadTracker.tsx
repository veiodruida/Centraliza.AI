import { useState, useEffect, useRef } from 'react';
import { io } from 'socket.io-client';
import { CheckCircle, X, ChevronDown, Pause, Play, AlertTriangle, Download, Sparkles, Activity } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
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
    <div className="fixed bottom-12 right-12 z-[5000] w-96 space-y-6">
      <AnimatePresence mode="popLayout">
        {entries.map(([model, item]) => (
          <motion.div 
            key={model} 
            layout
            initial={{ opacity: 0, x: 50, scale: 0.9 }}
            animate={{ opacity: 1, x: 0, scale: 1 }}
            exit={{ opacity: 0, x: 50, scale: 0.9 }}
            className="card-premium p-8 relative overflow-hidden group border-blue-500/20"
          >
            <div className={`absolute inset-0 pointer-events-none transition-all duration-1000 opacity-[0.03] group-hover:opacity-[0.07] ${
              item.status === 'completed' ? 'bg-emerald-500' :
              item.status === 'cancelled' ? 'bg-red-500' :
              item.status === 'paused' ? 'bg-amber-500' :
              'bg-blue-500'
            }`} />
            
            <div className="flex items-center gap-6 mb-6 relative z-10">
              <div className={`w-14 h-14 rounded-2xl flex items-center justify-center shadow-premium transition-all duration-500 ${
                item.status === 'completed' ? 'bg-emerald-500/10 text-emerald-500 border border-emerald-500/20' :
                item.status === 'cancelled' ? 'bg-red-500/10 text-red-500 border border-red-500/20' :
                item.status === 'paused' ? 'bg-amber-500/10 text-amber-500 border border-amber-500/20' :
                'bg-blue-600 text-white shadow-blue-600/30'
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
                 <p className={`text-xs font-black uppercase tracking-widest mb-2 transition-colors duration-500 ${
                   item.status === 'completed' ? 'text-emerald-500' : 
                   item.status === 'cancelled' ? 'text-red-500' : 
                   item.status === 'paused' ? 'text-amber-500' :
                   'text-blue-500'
                 }`}>
                   {item.status === 'completed' ? t('hub_installed') : 
                    item.status === 'paused' ? t('pause') : 
                    item.status === 'cancelled' ? t('cancel') : 
                    t('hub_installing')}
                 </p>
                 <h4 className="text-lg font-black text-[var(--text-primary)] truncate pr-4 tracking-tighter leading-none">{model.split('/').pop()}</h4>
              </div>
              
              <div className="flex gap-2">
                  {item.status === 'downloading' && (
                      <button 
                        onClick={() => handlePause(model)}
                        className="w-12 h-12 flex items-center justify-center bg-[var(--bg-input)]/50 hover:bg-amber-500 hover:text-white text-[var(--text-secondary)] rounded-2xl transition-all active:scale-90 shadow-lg border border-[var(--border)]"
                      >
                        <Pause size={18} strokeWidth={3} />
                      </button>
                  )}
                  {item.status === 'paused' && (
                      <button 
                        onClick={() => handleResume(model)}
                        className="w-12 h-12 flex items-center justify-center bg-blue-600 hover:bg-blue-500 text-white rounded-2xl transition-all active:scale-90 shadow-lg animate-pulse"
                      >
                        <Play size={18} strokeWidth={3} fill="currentColor" />
                      </button>
                  )}
                  {(item.status === 'downloading' || item.status === 'paused') && (
                      <button 
                        onClick={() => handleCancel(model)}
                        className="w-12 h-12 flex items-center justify-center bg-[var(--bg-input)]/50 hover:bg-red-500 hover:text-white text-[var(--text-secondary)] rounded-2xl transition-all active:scale-90 shadow-lg border border-[var(--border)]"
                      >
                        <X size={18} strokeWidth={3} />
                      </button>
                  )}
                  {(item.status === 'completed' || item.status === 'cancelled') && (
                    <button 
                      onClick={() => dismiss(model)}
                      className="w-10 h-10 flex items-center justify-center bg-[var(--bg-input)] hover:bg-[var(--border)] text-[var(--text-muted)] hover:text-[var(--text-primary)] rounded-xl transition-all active:scale-90 border border-[var(--border)]"
                    >
                      <ChevronDown size={18} strokeWidth={3} />
                    </button>
                  )}
              </div>
            </div>
            
            <div className="relative w-full bg-[var(--bg-input)]/50 h-3 rounded-full overflow-hidden mb-4 border border-[var(--border)] shadow-inner">
              {item.progress === -1 ? (
                <div className="absolute inset-0 bg-gradient-to-r from-transparent via-blue-500 to-transparent animate-[shimmer_2s_infinite]" 
                     style={{ backgroundSize: '200% 100%' }} />
              ) : (
                <motion.div 
                  initial={{ width: 0 }}
                  animate={{ width: `${Math.min(100, Math.max(0, item.progress))}%` }}
                  className={`h-full transition-all duration-300 ease-out rounded-full relative ${
                    item.status === 'completed' ? 'bg-emerald-500 shadow-[0_0_20px_rgba(16,185,129,0.5)]' : 
                    item.status === 'cancelled' ? 'bg-red-500/50' :
                    item.status === 'paused' ? 'bg-amber-500/50' : 
                    'bg-gradient-to-r from-blue-600 to-indigo-600 shadow-[0_0_20px_rgba(59,130,246,0.5)]'
                  }`}
                >
                   <div className="absolute inset-0 bg-gradient-to-b from-white/20 to-transparent pointer-events-none" />
                </motion.div>
              )}
            </div>
            
            <div className="flex justify-between items-center relative z-10">
              <span className={`text-[11px] font-black uppercase tracking-widest transition-colors duration-500 ${
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
              <div className="flex items-center gap-3">
                 {item.status === 'downloading' && <Activity size={14} className="text-blue-500 animate-pulse" />}
                 {item.status === 'completed' && <Sparkles size={16} className="text-emerald-500 animate-pulse" />}
              </div>
            </div>

            <div className="absolute top-4 right-8 text-[10px] md:text-xs text-[var(--text-muted)] font-black opacity-20 tracking-widest uppercase">Centraliza Engine</div>
          </motion.div>
        ))}
      </AnimatePresence>

      <style>{`
        @keyframes shimmer {
          0%   { background-position: -200% center; }
          100% { background-position:  200% center; }
        }
      `}</style>
    </div>
  );
}

