import { useState, useEffect } from 'react';
import { Cpu, Zap, Gauge, AlertCircle, CheckCircle, Brain, Activity, Server } from 'lucide-react';
import { motion } from 'framer-motion';
import { useApp } from '../context/AppContext';
import HelpTooltip from '../components/HelpTooltip';

const PAGE_VARIANTS = {
  initial: { opacity: 0, y: 10 },
  animate: { opacity: 1, y: 0, transition: { duration: 0.6, ease: [0.22, 1, 0.36, 1] as [number, number, number, number] } },
  exit: { opacity: 0, y: -10, transition: { duration: 0.3 } }
};

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

  if (loading) return <div className="p-12 md:p-20 text-center animate-pulse text-[var(--text-secondary)] font-black uppercase tracking-wider text-xs">{t('loading')}</div>;

  const formatGB = (bytes: number) => {
    return (bytes / (1024 ** 3)).toFixed(1);
  };

  const vramGB = sysInfo ? sysInfo.vram / (1024 ** 3) : 0;
  const totalRamGB = sysInfo ? sysInfo.totalRam / (1024 ** 3) : 0;

  return (
    <motion.div 
      variants={PAGE_VARIANTS}
      initial="initial"
      animate="animate"
      exit="exit"
      className="p-4 sm:p-6 md:p-12 lg:p-16 max-w-[100rem] mx-auto pb-20"
    >
      <header className="mb-10 md:mb-16 space-y-4">
        <div className="flex items-start sm:items-center gap-4 sm:gap-6 flex-wrap">
           <div className="w-12 h-12 sm:w-16 sm:h-16 bg-blue-600/10 rounded-[1rem] sm:rounded-[1.5rem] flex items-center justify-center text-blue-500 shadow-premium shrink-0">
              <Server className="w-6 h-6 sm:w-8 sm:h-8" />
           </div>
           <div className="min-w-0 flex-1">
              <h2 className="text-2xl sm:text-3xl md:text-5xl lg:text-6xl font-black text-[var(--text-primary)] tracking-tighter leading-none uppercase break-words">{t('nav_hardware')}</h2>
              <p className="text-[var(--text-secondary)] text-sm sm:text-lg md:text-2xl font-medium opacity-80 max-w-xl leading-relaxed mt-2">{t('hardware_subtitle')}</p>
           </div>
        </div>
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 md:gap-10 mb-10 md:mb-16">
        <motion.div 
          initial={{ opacity: 0, x: -20 }}
          animate={{ opacity: 1, x: 0 }}
          className="card-premium relative group overflow-hidden flex flex-col"
        >
          <div className="absolute top-0 right-0 p-8 sm:p-16 text-blue-500/5 group-hover:text-blue-500/10 group-hover:scale-125 transition-all duration-1000 rotate-12">
             <Zap size={240} className="sm:w-[320px] sm:h-[320px]" />
          </div>
          
          <header className="flex flex-col sm:flex-row items-start sm:items-center justify-between mb-8 md:mb-12 relative z-10 gap-4 sm:gap-8">
             <div className="flex items-center gap-4 md:gap-8 min-w-0">
                <div className="w-12 h-12 md:w-20 md:h-20 bg-blue-600 rounded-[1.2rem] md:rounded-[2rem] flex items-center justify-center text-white shadow-premium shadow-blue-600/30 group-hover:rotate-12 transition-transform duration-500 shrink-0">
                   <Zap className="w-6 h-6 md:w-8 md:h-8 fill-current" />
                </div>
                <div className="min-w-0">
                   <h3 className="text-xl md:text-4xl font-black text-[var(--text-primary)] uppercase tracking-tighter leading-tight mb-1 md:mb-2 break-words">{t('hardware_gpu')}</h3>
                   <div className="flex items-center gap-2">
                      <span className="w-1.5 h-1.5 md:w-2 md:h-2 rounded-full bg-blue-500 animate-pulse shrink-0" />
                      <span className="text-[10px] md:text-sm font-black text-blue-500 uppercase tracking-wider truncate">Accelerated Engine</span>
                   </div>
                </div>
             </div>
             <div className="self-end sm:self-auto shrink-0">
                 <HelpTooltip text={t('hub_gpu')} />
             </div>
          </header>
          
          <div className="space-y-4 md:space-y-8 relative z-10 flex-1 flex flex-col">
             <div className="bg-[var(--bg-input)]/40 p-4 sm:p-6 md:p-10 rounded-[1.5rem] sm:rounded-[2.5rem] md:rounded-[3rem] border border-[var(--border)] shadow-inner">
                <label className="text-[10px] md:text-sm font-black text-[var(--text-muted)] uppercase tracking-wider block mb-2 md:mb-3">Unit Identification</label>
                <div className="text-base sm:text-lg md:text-2xl lg:text-3xl font-black text-[var(--text-primary)] tracking-tighter leading-tight uppercase break-words">{sysInfo.gpuName}</div>
             </div>
             <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 md:gap-8 flex-1">
                <div className="bg-[var(--bg-input)]/40 p-4 sm:p-6 md:p-10 rounded-[1.5rem] sm:rounded-[2.5rem] md:rounded-[3rem] border border-[var(--border)] shadow-inner group/card overflow-hidden">
                   <label className="text-[10px] md:text-sm font-black text-[var(--text-muted)] uppercase tracking-wider block mb-2 md:mb-3">VRAM Capacity</label>
                   <div className="flex items-baseline gap-1 md:gap-2">
                      <div className="text-3xl sm:text-4xl md:text-7xl font-black text-blue-500 tracking-tighter leading-none group-hover/card:scale-110 transition-transform origin-left truncate">{formatGB(sysInfo.vram)}</div>
                      <span className="text-sm md:text-xl font-black text-[var(--text-secondary)] uppercase shrink-0">GB</span>
                   </div>
                </div>
                <div className="bg-emerald-500/5 p-4 sm:p-6 md:p-10 rounded-[1.5rem] sm:rounded-[2.5rem] md:rounded-[3rem] border border-emerald-500/10 shadow-inner flex flex-row sm:flex-col justify-center items-center gap-3 sm:gap-0">
                   <div className="w-10 h-10 md:w-16 md:h-16 bg-emerald-500/10 rounded-xl md:rounded-2xl flex items-center justify-center text-emerald-500 sm:mb-4 border border-emerald-500/20 shrink-0">
                      <CheckCircle className="w-5 h-5 md:w-6 md:h-6" />
                   </div>
                   <span className="text-[10px] md:text-sm font-black text-emerald-500 uppercase tracking-wider text-center">CUDA READY</span>
                </div>
             </div>
          </div>
        </motion.div>

        <motion.div 
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          className="card-premium relative group overflow-hidden flex flex-col"
        >
          <div className="absolute top-0 right-0 p-8 sm:p-16 text-purple-500/5 group-hover:text-purple-500/10 group-hover:scale-125 transition-all duration-1000 -rotate-12">
             <Cpu size={240} className="sm:w-[320px] sm:h-[320px]" />
          </div>
          
          <header className="flex flex-col sm:flex-row items-start sm:items-center justify-between mb-8 md:mb-12 relative z-10 gap-4 sm:gap-8">
             <div className="flex items-center gap-4 md:gap-8 min-w-0">
                <div className="w-12 h-12 md:w-20 md:h-20 bg-purple-600 rounded-[1.2rem] md:rounded-[2rem] flex items-center justify-center text-white shadow-premium shadow-purple-600/30 group-hover:-rotate-12 transition-transform duration-500 shrink-0">
                   <Cpu className="w-6 h-6 md:w-8 md:h-8" />
                </div>
                <div className="min-w-0">
                   <h3 className="text-xl md:text-4xl font-black text-[var(--text-primary)] uppercase tracking-tighter leading-none mb-1 md:mb-2 break-words">{t('hardware_cpu')}</h3>
                   <div className="flex items-center gap-2">
                      <span className="w-1.5 h-1.5 md:w-2 md:h-2 rounded-full bg-purple-500 animate-pulse shrink-0" />
                      <span className="text-[10px] md:text-sm font-black text-purple-500 uppercase tracking-wider truncate">Logic Controller</span>
                   </div>
                </div>
             </div>
             <div className="self-end sm:self-auto shrink-0">
                 <HelpTooltip text={t('hardware_cpu')} />
             </div>
          </header>
          
          <div className="space-y-4 md:space-y-8 relative z-10 flex-1 flex flex-col">
             <div className="bg-[var(--bg-input)]/40 p-4 sm:p-6 md:p-10 rounded-[1.5rem] sm:rounded-[2.5rem] md:rounded-[3rem] border border-[var(--border)] shadow-inner">
                <label className="text-[10px] md:text-sm font-black text-[var(--text-muted)] uppercase tracking-wider block mb-2 md:mb-3">Unit Identification</label>
                <div className="text-base sm:text-lg md:text-2xl lg:text-3xl font-black text-[var(--text-primary)] tracking-tighter leading-tight uppercase break-words">{sysInfo.cpuModel}</div>
             </div>
             <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 md:gap-8 flex-1">
                <div className="bg-[var(--bg-input)]/40 p-4 sm:p-6 md:p-10 rounded-[1.5rem] sm:rounded-[2.5rem] md:rounded-[3rem] border border-[var(--border)] shadow-inner group/card overflow-hidden">
                   <label className="text-[10px] md:text-sm font-black text-[var(--text-muted)] uppercase tracking-wider block mb-2 md:mb-3">Total RAM</label>
                   <div className="flex items-baseline gap-1 md:gap-2">
                      <div className="text-3xl sm:text-4xl md:text-7xl font-black text-purple-500 tracking-tighter leading-none group-hover/card:scale-110 transition-transform origin-left truncate">{formatGB(sysInfo.totalRam)}</div>
                      <span className="text-sm md:text-xl font-black text-[var(--text-secondary)] uppercase shrink-0">GB</span>
                   </div>
                </div>
                <div className="bg-[var(--bg-input)]/40 p-4 sm:p-6 md:p-10 rounded-[1.5rem] sm:rounded-[2.5rem] md:rounded-[3rem] border border-[var(--border)] shadow-inner group/card overflow-hidden">
                   <label className="text-[10px] md:text-sm font-black text-[var(--text-muted)] uppercase tracking-wider block mb-2 md:mb-3">Available</label>
                   <div className="flex items-baseline gap-1 md:gap-2">
                      <div className="text-3xl sm:text-4xl md:text-7xl font-black text-[var(--text-primary)] tracking-tighter leading-none group-hover/card:scale-110 transition-transform origin-left truncate">{formatGB(sysInfo.freeRam)}</div>
                      <span className="text-sm md:text-xl font-black text-[var(--text-secondary)] uppercase shrink-0">GB</span>
                   </div>
                </div>
             </div>
          </div>
        </motion.div>
      </div>

      <div className="card-premium bg-[var(--bg-surface)]/40 p-6 sm:p-12 md:p-24 shadow-premium backdrop-blur-3xl relative overflow-hidden group">
         <div className="absolute top-0 right-0 w-[20rem] h-[20rem] md:w-[40rem] md:h-[40rem] bg-blue-600/5 blur-[80px] md:blur-[120px] rounded-full group-hover:scale-125 transition-all duration-1000" />
         
         <header className="flex flex-col sm:flex-row items-start sm:items-center gap-4 sm:gap-8 mb-8 md:mb-16 relative z-10">
            <div className="w-12 h-12 md:w-20 md:h-20 bg-blue-600/10 rounded-[1.2rem] md:rounded-[2rem] flex items-center justify-center text-blue-500 shadow-premium border border-blue-500/20 shrink-0">
               <Activity className="w-6 h-6 md:w-10 md:h-10" />
            </div>
            <div className="min-w-0">
               <h3 className="text-xl md:text-4xl lg:text-5xl font-black text-[var(--text-primary)] uppercase tracking-tighter leading-none mb-1 md:mb-2 break-words">{t('hardware_insights')}</h3>
               <span className="text-[10px] md:text-[11px] font-black text-[var(--text-muted)] uppercase tracking-[0.2em] md:tracking-[0.5em] block truncate">Engine Intelligence Analysis</span>
            </div>
         </header>
         
         <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 md:gap-16 relative z-10">
            <div className="space-y-4 md:space-y-8 group/insight">
               <div className="flex items-center gap-2 md:gap-4 text-emerald-500 font-black text-[10px] md:text-[11px] uppercase tracking-wider bg-emerald-500/10 w-fit px-4 md:px-6 py-2 md:py-3 rounded-full border border-emerald-500/20 group-hover/insight:scale-105 transition-transform">
                  <Gauge className="w-4 h-4 md:w-5 md:h-5 fill-current shrink-0" /> Optimal Range
               </div>
               <p className="text-sm md:text-xl text-[var(--text-secondary)] leading-relaxed font-medium opacity-90 break-words">
                  {vramGB >= 8 
                    ? "Your GPU is perfect for models up to **8B parameters** (Llama 3, Mistral). Expect ultra-fast responses."
                    : "Ideal for models up to **3B parameters**. For larger models, system RAM will be used, which is slower."}
               </p>
            </div>
            <div className="space-y-4 md:space-y-8 lg:border-x border-[var(--border)]/50 lg:px-16 group/insight">
               <div className="flex items-center gap-2 md:gap-4 text-amber-500 font-black text-[10px] md:text-[11px] uppercase tracking-wider bg-amber-500/10 w-fit px-4 md:px-6 py-2 md:py-3 rounded-full border border-amber-500/20 group-hover/insight:scale-105 transition-transform">
                  <AlertCircle className="w-4 h-4 md:w-5 md:h-5 fill-current shrink-0" /> Extended Range
               </div>
               <p className="text-sm md:text-xl text-[var(--text-secondary)] leading-relaxed font-medium opacity-90 break-words">
                  {totalRamGB >= 32
                    ? "With 32GB+ RAM, you can run models up to **70B** using quantization. It will be usable for complex tasks but slower."
                    : "For models between **14B and 30B**, expect moderate speeds as the system balances memory between GPU and CPU."}
               </p>
            </div>
            <div className="space-y-4 md:space-y-8 group/insight">
               <div className="flex items-center gap-2 md:gap-4 text-blue-500 font-black text-[10px] md:text-[11px] uppercase tracking-wider bg-blue-500/10 w-fit px-4 md:px-6 py-2 md:py-3 rounded-full border border-blue-500/20 group-hover/insight:scale-105 transition-transform">
                  <Brain className="w-4 h-4 md:w-5 md:h-5 fill-current shrink-0" /> Smart Scaling
               </div>
               <p className="text-sm md:text-xl text-[var(--text-secondary)] leading-relaxed font-medium opacity-90 break-words">
                  Always prefer **Q4_K_M** or **Q5_K_M** quantizations. They offer the best intelligence-to-weight ratio for your hardware.
               </p>
            </div>
         </div>
      </div>
    </motion.div>
  );
}
