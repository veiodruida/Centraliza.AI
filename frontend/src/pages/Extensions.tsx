import { Puzzle, ShieldAlert, Cpu, MessageSquare, HardDrive } from 'lucide-react';
import { useApp } from '../context/AppContext';

export default function Extensions() {
  const { t } = useApp();
  const extensionPoints = [
    { icon: MessageSquare, name: 'Inference Engines', desc: 'Connect Llama.cpp, Text-Generation-WebUI or vLLM to the chat facet.' },
    { icon: HardDrive, name: 'Storage Adapters', desc: 'Add support for S3, Azure Blobs or IPFS model storage.' },
    { icon: Cpu, name: 'Hardware Analyzers', desc: 'Custom scripts to benchmark TFLOPS and Latency.' },
  ];

  return (
    <div className="p-3 sm:p-6 md:p-12 max-w-6xl mx-auto animate-in fade-in duration-1000">
      <header className="mb-6 sm:mb-8 md:mb-12">
        <h2 className="text-2xl sm:text-3xl md:text-4xl font-black text-[var(--text-primary)] mb-2 tracking-tighter break-words">{t('nav_extensions')}</h2>
        <p className="text-[var(--text-secondary)] font-medium text-xs sm:text-sm md:text-lg break-words">Expand Centraliza.ai capabilities with community or custom plugins.</p>
      </header>

      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4 sm:gap-6 md:gap-8 mb-10 sm:mb-16">
        {extensionPoints.map(ext => (
          <div key={ext.name} className="bg-[var(--bg-surface)] border border-[var(--border)] p-6 sm:p-8 md:p-10 rounded-2xl sm:rounded-[2.5rem] md:rounded-[3.5rem] hover:border-blue-500/50 transition-all group relative overflow-hidden shadow-3xl">
             <div className="absolute top-0 right-0 p-4 sm:p-8 opacity-5 group-hover:opacity-10 transition-all group-hover:scale-110">
                <Puzzle size={60} className="sm:scale-150" />
             </div>
             <div className="w-12 h-12 sm:w-16 sm:h-16 bg-[var(--bg-input)] rounded-xl sm:rounded-3xl flex items-center justify-center text-blue-500 mb-6 sm:mb-8 group-hover:bg-blue-600 group-hover:text-white transition-all shadow-xl">
                <ext.icon size={24} className="sm:size-28" />
             </div>
             <h3 className="text-lg sm:text-xl font-black text-[var(--text-primary)] mb-3 sm:mb-4 tracking-tight break-words">{ext.name}</h3>
             <p className="text-xs sm:text-sm text-[var(--text-secondary)] leading-relaxed font-medium break-words">{ext.desc}</p>
          </div>
        ))}
      </div>

      <div className="bg-gradient-to-br from-[var(--bg-surface)] to-[var(--bg-base)] border border-[var(--border)] rounded-2xl sm:rounded-[3rem] md:rounded-[4rem] p-6 sm:p-10 md:p-20 text-center relative overflow-hidden shadow-3xl">
         <div className="absolute -top-24 -left-24 w-60 h-60 sm:w-80 sm:h-80 bg-blue-600/5 rounded-full blur-[100px]" />
         <div className="w-16 h-16 sm:w-20 sm:h-20 bg-blue-500/10 rounded-full flex items-center justify-center mx-auto mb-6 sm:mb-8 text-blue-500">
            <Puzzle size={32} className="sm:size-40 opacity-80" />
         </div>
         <h3 className="text-2xl sm:text-3xl md:text-4xl font-black text-[var(--text-primary)] mb-4 sm:mb-6 italic tracking-tighter break-words">Development in Progress</h3>
         <p className="text-[var(--text-secondary)] text-sm sm:text-base md:text-lg max-w-2xl mx-auto mb-8 sm:mb-12 leading-relaxed font-medium break-words">
            We are building a **Plugin API** (JavaScript/Python) so users can create their own adapters. This will allow the community to add any new AI backend in seconds.
         </p>
         
         <div className="bg-[var(--bg-input)]/50 border border-[var(--border)] rounded-xl sm:rounded-[2rem] py-3 sm:py-5 px-6 sm:px-10 flex items-center justify-center gap-3 sm:gap-5 max-w-md mx-auto shadow-inner">
            <ShieldAlert size={20} className="sm:size-24 text-yellow-500 flex-shrink-0" />
            <span className="text-[8px] sm:text-[10px] font-black text-[var(--text-primary)] uppercase tracking-[0.1em] sm:tracking-[0.2em] break-words">SDK Documentation Coming Soon</span>
         </div>
      </div>
      
      <div className="mt-16 text-center">
         <p className="text-[var(--text-muted)] text-[10px] font-black uppercase tracking-[0.5em]">
            Modular Framework • Centraliza.ai SDK
         </p>
      </div>
    </div>
  );
}
