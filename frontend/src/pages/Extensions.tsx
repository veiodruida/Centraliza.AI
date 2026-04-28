import { Puzzle, ShieldAlert, Cpu, MessageSquare, HardDrive } from 'lucide-react';

export default function Extensions() {
  const extensionPoints = [
    { icon: MessageSquare, name: 'Inference Engines', desc: 'Connect Llama.cpp, Text-Generation-WebUI or vLLM to the chat facet.' },
    { icon: HardDrive, name: 'Storage Adapters', desc: 'Add support for S3, Azure Blobs or IPFS model storage.' },
    { icon: Cpu, name: 'Hardware Analyzers', desc: 'Custom scripts to benchmark TFLOPS and Latency.' },
  ];

  return (
    <div className="p-12 max-w-5xl mx-auto animate-in fade-in duration-700">
      <header className="mb-12">
        <h2 className="text-4xl font-black text-white mb-2">Extensions</h2>
        <p className="text-slate-500">Expand CentralizaIA capabilities with community or custom plugins.</p>
      </header>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-8 mb-16">
        {extensionPoints.map(ext => (
          <div key={ext.name} className="bg-slate-900 border border-slate-800 p-8 rounded-[3rem] hover:border-blue-500/50 transition-all group relative overflow-hidden">
             <div className="absolute top-0 right-0 p-6 opacity-5 group-hover:opacity-10 transition-opacity">
                <Puzzle size={80} />
             </div>
             <div className="w-12 h-12 bg-slate-800 rounded-2xl flex items-center justify-center text-blue-500 mb-6 group-hover:bg-blue-600 group-hover:text-white transition-all">
                <ext.icon size={24} />
             </div>
             <h3 className="text-lg font-black text-white mb-3">{ext.name}</h3>
             <p className="text-xs text-slate-500 leading-relaxed font-medium">{ext.desc}</p>
          </div>
        ))}
      </div>

      <div className="bg-gradient-to-br from-slate-900 to-black border border-slate-800 rounded-[4rem] p-16 text-center relative overflow-hidden">
         <div className="absolute -top-24 -left-24 w-64 h-64 bg-blue-600/10 rounded-full blur-[100px]" />
         <Puzzle size={48} className="mx-auto mb-6 text-blue-500 opacity-50" />
         <h3 className="text-3xl font-black text-white mb-4 italic">Development in Progress</h3>
         <p className="text-slate-500 max-w-xl mx-auto mb-10 leading-relaxed">
            We are building a **Plugin API** (JavaScript/Python) so users can create their own adapters. This will allow the community to add any new AI backend in seconds.
         </p>
         
         <div className="bg-slate-800/50 border border-slate-700 rounded-3xl p-6 flex items-center justify-center gap-4 max-w-md mx-auto">
            <ShieldAlert size={20} className="text-yellow-500" />
            <span className="text-xs font-black text-slate-300 uppercase tracking-widest">SDK Documentation Coming Soon</span>
         </div>
      </div>
      
      <div className="mt-12 text-center">
         <p className="text-slate-700 text-[10px] font-black uppercase tracking-[0.4em]">
            Modular Framework • CentralizaIA SDK
         </p>
      </div>
    </div>
  );
}
