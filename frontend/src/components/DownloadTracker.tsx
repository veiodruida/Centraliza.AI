import { useState, useEffect } from 'react';
import { io } from 'socket.io-client';
import { CheckCircle, Loader2 } from 'lucide-react';

const socket = io();

export default function DownloadTracker() {
  const [downloads, setDownloads] = useState<Record<string, number>>({});

  useEffect(() => {
    socket.on('download-progress', (data) => {
      setDownloads(prev => ({ ...prev, [data.model]: data.progress }));
    });

    socket.on('download-complete', (data) => {
      setTimeout(() => {
        setDownloads(prev => {
          const next = { ...prev };
          delete next[data.model];
          return next;
        });
      }, 3000);
    });

    return () => {
      socket.off('download-progress');
      socket.off('download-complete');
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
      // Removing will be handled by the websocket `download-complete` event with cancelled: true
    } catch (e) {
      console.error('Failed to cancel download:', e);
    }
  };

  return (
    <div className="fixed bottom-10 right-10 z-[5000] w-80 space-y-4 animate-in slide-in-from-right duration-500">
      {entries.map(([model, progress]) => (
        <div key={model} className="bg-slate-900 border border-slate-800 p-6 rounded-[2rem] shadow-2xl backdrop-blur-xl relative group">
          <div className="flex items-center gap-4 mb-4">
            <div className="p-3 bg-blue-500/10 rounded-xl text-blue-500">
              {progress < 100 ? <Loader2 size={18} className="animate-spin" /> : <CheckCircle size={18} />}
            </div>
            <div className="flex-1 min-w-0">
               <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-1">Downloading</p>
               <h4 className="text-sm font-black text-white truncate pr-4">{model}</h4>
            </div>
            <span className="text-xs font-black text-blue-500">{progress}%</span>
          </div>
          <div className="w-full bg-slate-800 h-1.5 rounded-full overflow-hidden">
            <div 
              className="h-full bg-blue-500 transition-all duration-500" 
              style={{ width: `${progress}%` }}
            />
          </div>
          {progress < 100 && (
            <button 
              onClick={() => handleCancel(model)}
              className="absolute -top-3 -right-3 bg-red-500 text-white w-8 h-8 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity shadow-lg shadow-red-500/20 active:scale-90 cursor-pointer"
              title="Cancel Download"
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>
            </button>
          )}
        </div>
      ))}
    </div>
  );
}
