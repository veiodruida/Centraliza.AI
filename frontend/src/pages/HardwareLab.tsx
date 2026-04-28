import { useState, useEffect } from 'react';
import { Cpu, Zap, ShieldCheck, Gauge, AlertCircle, Info, Monitor } from 'lucide-react';

export default function HardwareLab() {
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

  if (loading) return <div className="p-20 text-center animate-pulse text-slate-500 font-black">ANALYZING SILICON...</div>;

  const formatGB = (bytes: number) => {
    // If bytes is already small (under 1000), it might be already in GB from a different detection
    // But here we expect bytes.
    return (bytes / (1024 ** 3)).toFixed(1);
  };

  return (
    <div className="p-12 max-w-6xl mx-auto animate-in fade-in duration-700">
      <header className="mb-12">
        <h2 className="text-4xl font-black text-white mb-2">Hardware Lab</h2>
        <p className="text-slate-500">Deep analysis of your local hardware for optimal AI performance.</p>
      </header>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-8 mb-12">
        <div className="bg-slate-900 border border-slate-800 rounded-[3.5rem] p-10 relative overflow-hidden group shadow-2xl">
          <div className="absolute top-0 right-0 p-10 text-blue-500/10 group-hover:text-blue-500/20 transition-colors">
             <Zap size={140} />
          </div>
          <div className="flex items-center gap-4 mb-8">
             <div className="w-12 h-12 bg-blue-600 rounded-2xl flex items-center justify-center text-white shadow-xl shadow-blue-600/20">
                <Zap size={24} />
             </div>
             <h3 className="text-xl font-black text-white uppercase tracking-widest">Graphics Engine</h3>
          </div>
          
          <div className="space-y-6 relative z-10">
             <div>
                <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest block mb-1">GPU Name</label>
                <div className="text-2xl font-black text-white truncate">{sysInfo.gpuName}</div>
             </div>
             <div className="grid grid-cols-2 gap-6">
                <div>
                   <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest block mb-1">VRAM Capacity</label>
                   <div className="text-4xl font-black text-blue-400">{formatGB(sysInfo.vram)} <span className="text-sm">GB</span></div>
                </div>
                <div>
                   <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest block mb-1">Compute Status</label>
                   <div className="flex items-center gap-2 text-emerald-400 font-black text-xs">
                      <ShieldCheck size={18} /> CUDA READY
                   </div>
                </div>
             </div>
          </div>
        </div>

        <div className="bg-slate-900 border border-slate-800 rounded-[3.5rem] p-10 relative overflow-hidden group shadow-2xl">
          <div className="absolute top-0 right-0 p-10 text-purple-500/10 group-hover:text-purple-500/20 transition-colors">
             <Cpu size={140} />
          </div>
          <div className="flex items-center gap-4 mb-8">
             <div className="w-12 h-12 bg-purple-600 rounded-2xl flex items-center justify-center text-white shadow-xl shadow-purple-600/20">
                <Cpu size={24} />
             </div>
             <h3 className="text-xl font-black text-white uppercase tracking-widest">Core Processor</h3>
          </div>
          
          <div className="space-y-6 relative z-10">
             <div>
                <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest block mb-1">Architecture</label>
                <div className="text-lg font-bold text-white line-clamp-1">{sysInfo.cpuModel}</div>
             </div>
             <div className="grid grid-cols-2 gap-6">
                <div>
                   <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest block mb-1">Total System RAM</label>
                   <div className="text-4xl font-black text-purple-400">{formatGB(sysInfo.totalRam)} <span className="text-sm">GB</span></div>
                </div>
                <div>
                   <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest block mb-1">Available RAM</label>
                   <div className="text-4xl font-black text-slate-100">{formatGB(sysInfo.freeRam)} <span className="text-sm">GB</span></div>
                </div>
             </div>
          </div>
        </div>
      </div>

      <div className="bg-slate-900/50 border border-slate-800 rounded-[4rem] p-12 shadow-inner">
         <div className="flex items-center gap-4 mb-10">
            <Monitor size={24} className="text-blue-500" />
            <h3 className="text-xl font-black text-white uppercase tracking-widest">Performance Insights</h3>
         </div>
         
         <div className="grid grid-cols-1 md:grid-cols-3 gap-12">
            <div className="space-y-4">
               <div className="flex items-center gap-2 text-emerald-400 font-black text-[10px] uppercase tracking-widest">
                  <Gauge size={16} /> Optimal Range
               </div>
               <p className="text-xs text-slate-500 leading-relaxed font-medium">
                  Modelos até <strong>8B</strong> (como Llama 3 ou Mistral) devem rodar com altíssima velocidade inteiramente na sua GPU.
               </p>
            </div>
            <div className="space-y-4 border-x border-slate-800 px-8">
               <div className="flex items-center gap-2 text-yellow-400 font-black text-[10px] uppercase tracking-widest">
                  <AlertCircle size={16} /> Extended Range
               </div>
               <p className="text-xs text-slate-500 leading-relaxed font-medium">
                  Para modelos de <strong>14B a 30B</strong>, o sistema utilizará GGUF Offloading para dividir o peso entre VRAM e RAM.
               </p>
            </div>
            <div className="space-y-4">
               <div className="flex items-center gap-2 text-blue-400 font-black text-[10px] uppercase tracking-widest">
                  <Info size={16} /> Smart Scaling
               </div>
               <p className="text-xs text-slate-500 leading-relaxed font-medium">
                  Utilize **Quantizações Q4_K_M** para o melhor equilíbrio entre inteligência e velocidade no seu hardware.
               </p>
            </div>
         </div>
      </div>
      
      <div className="mt-12 text-center">
         <p className="text-slate-700 text-[10px] font-black uppercase tracking-[0.6em]">
            CentralizaIA Silicon Analytics
         </p>
      </div>
    </div>
  );
}
