import React, { createContext, useContext, useState, useCallback } from 'react';
import { X, CheckCircle, AlertCircle, Info } from 'lucide-react';

type ToastType = 'success' | 'error' | 'info';

interface Toast {
  id: number;
  message: string;
  type: ToastType;
}

interface ToastContextType {
  showToast: (message: string, type?: ToastType) => void;
}

const ToastContext = createContext<ToastContextType | undefined>(undefined);

export const useToast = () => {
  const context = useContext(ToastContext);
  if (!context) throw new Error('useToast must be used within ToastProvider');
  return context;
};

export const ToastProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const showToast = useCallback((message: string, type: ToastType = 'info') => {
    const id = Date.now();
    setToasts(prev => [...prev, { id, message, type }]);
    setTimeout(() => {
      setToasts(prev => prev.filter(t => t.id !== id));
    }, 4000);
  }, []);

  const removeToast = (id: number) => {
    setToasts(prev => prev.filter(t => t.id !== id));
  };

  return (
    <ToastContext.Provider value={{ showToast }}>
      {children}
      <div className="fixed bottom-10 left-1/2 -translate-x-1/2 z-[9999] flex flex-col gap-3 w-full max-w-md px-6">
        {toasts.map(toast => (
          <div 
            key={toast.id} 
            className={`
              flex items-center gap-4 p-5 rounded-[2rem] border backdrop-blur-2xl shadow-2xl animate-in slide-in-from-bottom-5 duration-300
              ${toast.type === 'success' ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400' : 
                toast.type === 'error' ? 'bg-red-500/10 border-red-500/20 text-red-400' : 
                'bg-slate-900/90 border-white/10 text-slate-300'}
            `}
          >
            {toast.type === 'success' && <CheckCircle size={20} />}
            {toast.type === 'error' && <AlertCircle size={20} />}
            {toast.type === 'info' && <Info size={20} />}
            
            <span className="flex-1 text-xs font-black uppercase tracking-widest">{toast.message}</span>
            
            <button onClick={() => removeToast(toast.id)} className="text-white/20 hover:text-white transition-colors">
              <X size={18} />
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
};
