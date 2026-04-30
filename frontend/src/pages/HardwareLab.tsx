import { useState, useEffect } from 'react';
import { Cpu, Zap, Gauge, AlertCircle, CheckCircle, Brain, Activity, Server } from 'lucide-react';
import { useApp } from '../context/AppContext';
import HelpTooltip from '../components/HelpTooltip';

export default function HardwareLab() {
  const { t } = useApp();
  const [sysInfo, setSysInfo] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/system-info')
      .then(res => res.json())
      .then(data => {
        setSysInfo(data);
        setLoading(false);
      });
  }, []);

  if (loading) return <div className="p-6 sm:p-12 md:p-20 text-center animate-pulse text-[var(--text-secondary)] font-black uppercase tracking-[0.1em] sm:tracking-widest leading-none text-[9px] sm:text-[10px] md:text-xs">{t('loading')}</div>;

  const formatGB = (bytes: number) => {
    return (bytes / (1024 ** 3)).toFixed(1);
  };

  const vramGB = sysInfo ? sysInfo.vram / (1024 ** 3) : 0;
  const totalRamGB = sysInfo ? sysInfo.totalRam / (1024 ** 3) : 0;

  return (
    <div className="p-3 sm:p-6 md:p-10 lg:p-12 max-w-[90rem] mx-auto animate-in fade-in duration-1000 pb-20">
      <header className="mb-8 sm:mb-12 md:mb-16 lg:mb-20 space-y-3 sm:space-y-4">
        <div className="flex items-center gap-2 sm:gap-3 md:gap-4 lg:gap-6 flex-wrap">
           <div className="w-10 h-10 sm:w-12 sm:h-12 md:w-16 md:h-16 bg-blue-600/10 rounded-lg sm:rounded-xl md:rounded-[1.5rem] flex items-center justify-center text-blue-500 shadow-premium flex-shrink-0">
              <Server size={24} className="sm:size-28 md:size-32" />
           </div>
           <div className="min-w-0">
              <h2 className="text-2xl sm:text-3xl md:text-5xl lg:text-6xl font-black text-[var(--text-primary)] tracking-tighter leading-tight sm:leading-[1.1] uppercase break-words">{t('nav_hardware')}</h2>
              <p className="text-[var(--text-secondary)] font-medium text-xs sm:text-sm md:text-lg lg:text-2xl opacity-80 break-words">{t('hardware_subtitle')}</p>
           </div>
        </div>
      </header>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 sm:gap-6 md:gap-8 lg:gap-12 mb-8 sm:mb-10 md:mb-16">
        <div className="bg-[var(--bg-surface)] border border-[var(--border)] rounded-lg sm:rounded-2xl md:rounded-[2.5rem] lg:rounded-[5rem] p-4 sm:p-8 md:p-12 lg:p-16 relative overflow-hidden group shadow-premium hover:border-blue-500/30 transition-all duration-700 active:scale-[0.99]">
          <div className="absolute top-0 right-0 p-4 sm:p-8 md:p-12 lg:p-16 text-blue-500/5 group-hover:text-blue-500/10 group-hover:scale-125 transition-all duration-1000 rotate-12">
             <Zap size={180} className="sm:scale-150" />
          </div>
          <div className="flex items-center justify-between mb-6 sm:mb-8 md:mb-10 lg:mb-16 relative z-10 gap-2 sm:gap-4 flex-wrap">
             <div className="flex items-center gap-2 sm:gap-3 md:gap-4 lg:gap-8 min-w-0 flex-1">
                <div className="w-10 h-10 sm:w-14 sm:h-14 md:w-20 md:h-20 bg-blue-600 rounded-lg sm:rounded-xl md:rounded-[2rem] flex items-center justify-center text-white shadow-premium shadow-blue-600/40 group-hover:rotate-12 transition-transform duration-500 flex-shrink-0">
                   <Zap size={28} className="sm:scale-125 md:scale-150 fill-current" />
                </div>
                <div className="min-w-0">
                   <h3 className="text-lg sm:text-2xl md:text-3xl lg:text-4xl font-black text-[var(--text-primary)] uppercase tracking-tighter leading-tight mb-0.5 sm:mb-1 md:mb-2 break-words">{t('hardware_gpu')}</h3>
                   <div className="flex items-center gap-2 flex-wrap">
                      <span className="w-1 h-1 sm:w-1.5 sm:h-1.5 rounded-full bg-blue-500 animate-pulse flex-shrink-0" />
                      <span className="text-[8px] sm:text-[9px] md:text-[10px] font-black text-blue-500 uppercase tracking-[0.1em] sm:tracking-widest whitespace-nowrap">Accelerated Engine</span>
                   </div>
                </div>
             </div>
             <div className="flex-shrink-0"><HelpTooltip text={t('hub_gpu')} /></div>
          </div>
          
          <div className="space-y-6 md:space-y-10 relative z-10">
             <div className="bg-[var(--bg-input)]/50 p-6 md:p-10 rounded-2xl md:rounded-[3rem] border border-[var(--border)] shadow-inner">
                <label className="text-[9px] md:text-[11px] font-black text-[var(--text-muted)] uppercase tracking-[0.3em] md:tracking-[0.4em] block mb-2 md:mb-4">{t('hardware_gpu')}</label>
                <div className="text-xl md:text-3xl font-black text-[var(--text-primary)] tracking-tighter leading-tight uppercase">{sysInfo.gpuName}</div>
             </div>
             <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 md:gap-10">
                <div className="bg-[var(--bg-input)]/50 p-8 md:p-10 rounded-2xl md:rounded-[3rem] border border-[var(--border)] shadow-inner group/card">
                   <label className="text-[9px] md:text-[11px] font-black text-[var(--text-muted)] uppercase tracking-[0.3em] md:tracking-[0.4em] block mb-2 md:mb-4">VRAM</label>
                   <div className="flex items-baseline gap-2">
                     <div className="text-5xl md:text-7xl font-black text-blue-500 tracking-tighter leading-none group-hover/card:scale-110 transition-transform">{formatGB(sysInfo.vram)}</div>
                     <span className="text-lg md:text-2xl font-black text-[var(--text-secondary)] uppercase">GB</span>
                   </div>
                </div>
                <div className="bg-[var(--bg-input)]/50 p-8 md:p-10 rounded-2xl md:rounded-[3rem] border border-[var(--border)] shadow-inner flex flex-col justify-center">
                   <label className="text-[9px] md:text-[11px] font-black text-[var(--text-muted)] uppercase tracking-[0.3em] md:tracking-[0.4em] block mb-4 md:mb-6">ENGINE</label>
                   <div className="flex items-center gap-3 text-emerald-500 font-black text-[10px] md:text-sm uppercase tracking-widest bg-emerald-500/10 px-4 md:px-6 py-2 md:py-3 rounded-xl md:rounded-2xl border border-emerald-500/20 shadow-lg shadow-emerald-500/5">
                      <CheckCircle size={24} className="fill-current" /> CUDA READY
                   </div>
                </div>
             </div>
          </div>
        </div>

        <div className="bg-[var(--bg-surface)] border border-[var(--border)] rounded-[2.5rem] md:rounded-[5rem] p-8 md:p-16 relative overflow-hidden group shadow-premium hover:border-purple-500/30 transition-all duration-700 active:scale-[0.99]">
          <div className="absolute top-0 right-0 p-8 md:p-16 text-purple-500/5 group-hover:text-purple-500/10 group-hover:scale-125 transition-all duration-1000 -rotate-12">
             <Cpu size={280} />
          </div>
          <div className="flex items-center justify-between mb-10 md:mb-16 relative z-10">
             <div className="flex items-center gap-4 md:gap-8">
                <div className="w-14 h-14 md:w-20 md:h-20 bg-purple-600 rounded-xl md:rounded-[2rem] flex items-center justify-center text-white shadow-premium shadow-purple-600/30 group-hover:-rotate-12 transition-transform duration-500">
                   <Cpu size={40} />
                </div>
                <div>
                   <h3 className="text-2xl md:text-4xl font-black text-[var(--text-primary)] uppercase tracking-tighter leading-none mb-1 md:mb-2">{t('hardware_cpu')}</h3>
                   <div className="flex items-center gap-2">
                      <span className="w-1.5 h-1.5 rounded-full bg-purple-500 animate-pulse" />
                      <span className="text-[10px] font-black text-purple-500 uppercase tracking-widest">Logic Controller</span>
                   </div>
                </div>
             </div>
             <HelpTooltip text={t('hardware_cpu')} />
          </div>
          
          <div className="space-y-6 md:space-y-10 relative z-10">
             <div className="bg-[var(--bg-input)]/50 p-6 md:p-10 rounded-2xl md:rounded-[3rem] border border-[var(--border)] shadow-inner">
                <label className="text-[9px] md:text-[11px] font-black text-[var(--text-muted)] uppercase tracking-[0.3em] md:tracking-[0.4em] block mb-2 md:mb-4">{t('hardware_cpu')}</label>
                <div className="text-lg md:text-2xl font-black text-[var(--text-primary)] tracking-tighter leading-tight line-clamp-1 uppercase">{sysInfo.cpuModel}</div>
             </div>
             <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 md:gap-10">
                <div className="bg-[var(--bg-input)]/50 p-8 md:p-10 rounded-2xl md:rounded-[3rem] border border-[var(--border)] shadow-inner group/card">
                   <label className="text-[9px] md:text-[11px] font-black text-[var(--text-muted)] uppercase tracking-[0.3em] md:tracking-[0.4em] block mb-2 md:mb-4">SYSTEM RAM</label>
                   <div className="flex items-baseline gap-2">
                     <div className="text-5xl md:text-7xl font-black text-purple-500 tracking-tighter leading-none group-hover/card:scale-110 transition-transform">{formatGB(sysInfo.totalRam)}</div>
                     <span className="text-lg md:text-2xl font-black text-[var(--text-secondary)] uppercase">GB</span>
                   </div>
                </div>
                <div className="bg-[var(--bg-input)]/50 p-8 md:p-10 rounded-2xl md:rounded-[3rem] border border-[var(--border)] shadow-inner group/card">
                   <label className="text-[9px] md:text-[11px] font-black text-[var(--text-muted)] uppercase tracking-[0.3em] md:tracking-[0.4em] block mb-2 md:mb-4">AVAILABLE</label>
                   <div className="flex items-baseline gap-2">
                     <div className="text-5xl md:text-7xl font-black text-[var(--text-primary)] tracking-tighter leading-none group-hover/card:scale-110 transition-transform">{formatGB(sysInfo.freeRam)}</div>
                     <span className="text-lg md:text-2xl font-black text-[var(--text-secondary)] uppercase">GB</span>
                   </div>
                </div>
             </div>
          </div>
        </div>
      </div>

      <div className="bg-[var(--bg-surface)] border border-[var(--border)] rounded-[2.5rem] md:rounded-[6rem] p-10 md:p-20 shadow-premium backdrop-blur-3xl relative overflow-hidden group">
         <div className="absolute top-0 right-0 w-[20rem] md:w-[40rem] h-[20rem] md:h-[40rem] bg-blue-600/5 blur-[80px] md:blur-[120px] rounded-full group-hover:scale-125 transition-all duration-1000" />
         <div className="flex items-center gap-6 md:gap-8 mb-10 md:mb-16 relative z-10">
            <div className="w-16 h-16 md:w-20 md:h-20 bg-blue-600/10 rounded-2xl md:rounded-[2rem] flex items-center justify-center text-blue-500 shadow-premium">
               <Activity size={40} />
            </div>
            <div>
               <h3 className="text-2xl md:text-4xl font-black text-[var(--text-primary)] uppercase tracking-tighter leading-none mb-1 md:mb-2">{t('hardware_insights')}</h3>
               <span className="text-[9px] md:text-xs font-black text-[var(--text-muted)] uppercase tracking-[0.3em] md:tracking-[0.4em]">Engine Intelligence Analysis</span>
            </div>
         </div>
         
         <div className="grid grid-cols-1 lg:grid-cols-3 gap-10 md:gap-20 relative z-10">
            <div className="space-y-4 md:space-y-8 group/insight">
               <div className="flex items-center gap-3 md:gap-4 text-emerald-500 font-black text-[10px] md:text-xs uppercase tracking-widest bg-emerald-500/10 w-fit px-4 md:px-6 py-2 md:py-2.5 rounded-full border border-emerald-500/20 group-hover/insight:scale-105 transition-transform">
                  <Gauge size={24} className="fill-current" /> Optimal Range
               </div>
               <p className="text-base md:text-xl text-[var(--text-secondary)] leading-relaxed font-medium opacity-90">
                  {vramGB >= 8 
                    ? "Your GPU is perfect for models up to **8B parameters** (Llama 3, Mistral). Expect ultra-fast responses."
                    : "Ideal for models up to **3B parameters**. For larger models, system RAM will be used, which is slower."}
               </p>
            </div>
            <div className="space-y-4 md:space-y-8 lg:border-x border-[var(--border)]/50 lg:px-16 group/insight">
               <div className="flex items-center gap-3 md:gap-4 text-yellow-500 font-black text-[10px] md:text-xs uppercase tracking-widest bg-yellow-500/10 w-fit px-4 md:px-6 py-2 md:py-2.5 rounded-full border border-yellow-500/20 group-hover/insight:scale-105 transition-transform">
                  <AlertCircle size={24} className="fill-current" /> Extended Range
               </div>
               <p className="text-base md:text-xl text-[var(--text-secondary)] leading-relaxed font-medium opacity-90">
                  {totalRamGB >= 32
                    ? "With 32GB+ RAM, you can run models up to **70B** using quantization. It will be usable for complex tasks but slower."
                    : "For models between **14B and 30B**, expect moderate speeds as the system balances memory between GPU and CPU."}
               </p>
            </div>
            <div className="space-y-4 md:space-y-8 group/insight">
               <div className="flex items-center gap-3 md:gap-4 text-blue-500 font-black text-[10px] md:text-xs uppercase tracking-widest bg-blue-500/10 w-fit px-4 md:px-6 py-2 md:py-2.5 rounded-full border border-blue-500/20 group-hover/insight:scale-105 transition-transform">
                  <Brain size={24} className="fill-current" /> Smart Scaling
               </div>
               <p className="text-base md:text-xl text-[var(--text-secondary)] leading-relaxed font-medium opacity-90">
                  Always prefer **Q4_K_M** or **Q5_K_M** quantizations. They offer the best intelligence-to-weight ratio for your hardware.
               </p>
            </div>
         </div>
      </div>
    </div>
  );
}
