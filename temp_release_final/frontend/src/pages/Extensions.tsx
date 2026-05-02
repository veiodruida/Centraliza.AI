import { Puzzle, ShieldAlert, Cpu, MessageSquare, HardDrive, Code, Sparkles } from 'lucide-react';
import { motion } from 'framer-motion';
import { useApp } from '../context/AppContext';

const PAGE_VARIANTS = {
  initial: { opacity: 0, scale: 0.98 },
  animate: { opacity: 1, scale: 1, transition: { duration: 0.6, ease: [0.22, 1, 0.36, 1] as [number, number, number, number] } },
  exit: { opacity: 0, scale: 1.02, transition: { duration: 0.3 } }
};

const CONTAINER_VARIANTS = {
  initial: { opacity: 0 },
  animate: { opacity: 1, transition: { staggerChildren: 0.1 } }
};

const ITEM_VARIANTS = {
  initial: { opacity: 0, y: 20 },
  animate: { opacity: 1, y: 0 }
};

export default function Extensions() {
  const { t } = useApp();
  const extensionPoints = [
    { icon: MessageSquare, name: 'Inference Engines', desc: 'Connect Llama.cpp, Text-Generation-WebUI or vLLM to the chat facet.', color: 'blue' },
    { icon: HardDrive, name: 'Storage Adapters', desc: 'Add support for S3, Azure Blobs or IPFS model storage.', color: 'emerald' },
    { icon: Cpu, name: 'Hardware Analyzers', desc: 'Custom scripts to benchmark TFLOPS and Latency.', color: 'purple' },
  ];

  return (
    <motion.div 
      variants={PAGE_VARIANTS}
      initial="initial"
      animate="animate"
      exit="exit"
      className="p-6 md:p-12 lg:p-16 max-w-[80rem] mx-auto pb-32"
    >
      <header className="mb-16 md:mb-24 text-center">
        <motion.div 
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          className="inline-flex items-center gap-3 px-6 py-2 rounded-full bg-blue-500/10 border border-blue-500/20 text-blue-500 text-xs font-black uppercase tracking-widest mb-8"
        >
          <Puzzle size={14} /> Modular Architecture
        </motion.div>
        <h2 className="text-4xl md:text-7xl font-black text-[var(--text-primary)] mb-6 tracking-tighter uppercase leading-none">
          {t('nav_extensions')}
        </h2>
        <p className="text-[var(--text-secondary)] font-medium text-lg md:text-2xl max-w-2xl mx-auto leading-relaxed opacity-80">
          Expand Centraliza.ai capabilities with community or custom plugins.
        </p>
      </header>

      <motion.div 
        variants={CONTAINER_VARIANTS}
        className="grid grid-cols-1 md:grid-cols-3 gap-8 md:gap-10 mb-20 md:mb-32"
      >
        {extensionPoints.map(ext => (
          <motion.div 
            key={ext.name}
            variants={ITEM_VARIANTS}
            className="card-premium group relative overflow-hidden text-center p-12 hover:border-blue-500/50"
          >
             <div className="absolute top-0 right-0 p-12 opacity-5 group-hover:opacity-10 transition-all group-hover:scale-110 -rotate-12">
                <Puzzle size={160} />
             </div>
             <div className={`w-20 h-20 bg-${ext.color}-500/10 rounded-[2rem] flex items-center justify-center text-${ext.color}-500 mx-auto mb-10 shadow-premium border border-${ext.color}-500/20 group-hover:bg-${ext.color}-600 group-hover:text-white transition-all`}>
                <ext.icon size={32} />
             </div>
             <h3 className="text-2xl font-black text-[var(--text-primary)] mb-4 tracking-tight uppercase leading-none">{ext.name}</h3>
             <p className="text-sm text-[var(--text-secondary)] leading-relaxed font-medium opacity-70">{ext.desc}</p>
          </motion.div>
        ))}
      </motion.div>

      <motion.div 
        initial={{ opacity: 0, y: 40 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.4 }}
        className="card-premium bg-gradient-to-br from-blue-700 via-indigo-900 to-black p-12 md:p-24 text-center relative overflow-hidden group shadow-2xl"
      >
         <div className="absolute top-0 right-0 w-full h-full bg-[radial-gradient(circle_at_top_right,rgba(255,255,255,0.1),transparent)]" />
         <div className="absolute -bottom-24 -left-24 w-96 h-96 bg-blue-500/20 rounded-full blur-[120px] animate-pulse" />
         
         <div className="relative z-10">
            <div className="w-24 h-24 bg-white/10 rounded-[2.5rem] flex items-center justify-center mx-auto mb-10 text-white shadow-premium border border-white/20 backdrop-blur-3xl group-hover:scale-110 transition-transform duration-700">
               <Code size={40} />
            </div>
            <h3 className="text-3xl md:text-5xl font-black text-white mb-8 tracking-tighter uppercase leading-none italic">
               Plugin SDK Development
            </h3>
            <p className="text-blue-100/70 text-lg md:text-2xl max-w-3xl mx-auto mb-12 leading-relaxed font-medium">
               We are building a powerful **JSON-based Plugin API** so users can create their own adapters. This will allow the community to add any new AI backend in seconds.
            </p>
            
            <div className="inline-flex items-center gap-4 bg-white/10 border border-white/20 rounded-full py-4 px-10 shadow-2xl backdrop-blur-3xl">
               <ShieldAlert size={20} className="text-yellow-400" />
               <span className="text-[11px] font-black text-white uppercase tracking-widest">SDK Documentation Coming Soon</span>
            </div>
         </div>
      </motion.div>
      
      <motion.div 
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.8 }}
        className="mt-24 text-center"
      >
         <div className="flex items-center justify-center gap-6 mb-4">
            <div className="h-px w-20 bg-gradient-to-r from-transparent to-[var(--border)]" />
            <Sparkles size={16} className="text-blue-500 opacity-50" />
            <div className="h-px w-20 bg-gradient-to-l from-transparent to-[var(--border)]" />
         </div>
         <p className="text-[var(--text-muted)] text-[11px] font-black uppercase tracking-[0.6em] opacity-40">
            Modular Intelligence Framework • v2.0
         </p>
      </motion.div>
    </motion.div>
  );
}



