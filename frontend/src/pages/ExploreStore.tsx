import { useState, useEffect } from 'react';
import { Search, Download, Star, Filter, ArrowRight, Zap, Info, CheckCircle } from 'lucide-react';

export default function ExploreStore() {
  const [sysInfo, setSysInfo] = useState<any>(null);

  useEffect(() => {
    fetch('/api/system-info').then(res => res.json()).then(setSysInfo);
  }, []);

  const featuredModels = [
    { name: 'DeepSeek-R1-14B', type: 'Chat/Reasoning', size: '9.1 GB', rating: 4.9, tags: ['Coding', 'Thinking'], color: 'from-blue-500 to-indigo-600', description: 'O novo padrão ouro para raciocínio lógico e programação.' },
    { name: 'Llama-3-8B', type: 'General Chat', size: '4.7 GB', rating: 4.8, tags: ['Fast', 'Versatile'], color: 'from-purple-500 to-pink-600', description: 'Equilíbrio perfeito entre velocidade e inteligência geral.' },
    { name: 'Stable Diffusion XL', type: 'Image Generation', size: '6.5 GB', rating: 4.7, tags: ['Art', 'Design'], color: 'from-orange-400 to-red-600', description: 'Gere imagens fotorrealistas de alta resolução localmente.' },
  ];

  return (
    <div className="p-8 max-w-7xl mx-auto">
      <header className="mb-10">
        <h2 className="text-4xl font-black text-white mb-4">Model Store</h2>
        <div className="flex gap-4 items-center">
          <div className="relative flex-1">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500" size={20} />
            <input 
              type="text" 
              placeholder="Search for models, categories or capabilities..." 
              className="w-full bg-slate-800 border border-slate-700 rounded-2xl py-3 pl-12 pr-4 text-white focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all"
            />
          </div>
          <button className="bg-slate-800 p-3 rounded-2xl border border-slate-700 text-slate-400 hover:text-white transition-all">
            <Filter size={20} />
          </button>
        </div>
      </header>

      <section className="mb-12">
        <div className="flex justify-between items-end mb-6">
          <h3 className="text-xl font-bold text-slate-200">Featured Models</h3>
          <button className="text-blue-400 text-sm font-semibold flex items-center gap-1 hover:underline">
            View All <ArrowRight size={14} />
          </button>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {featuredModels.map((model) => (
            <div key={model.name} className="bg-slate-800 border border-slate-700 rounded-3xl overflow-hidden group hover:border-slate-500 transition-all">
              <div className={`h-32 bg-gradient-to-br ${model.color} p-6 relative`}>
                <div className="absolute top-4 right-4 bg-black/20 backdrop-blur-md px-3 py-1 rounded-full flex items-center gap-1 text-xs font-bold">
                  <Star size={12} className="text-yellow-400 fill-yellow-400" />
                  {model.rating}
                </div>
                <div className="text-white">
                  <span className="text-[10px] uppercase font-black tracking-widest opacity-80">{model.type}</span>
                  <h4 className="text-xl font-bold mt-1">{model.name}</h4>
                </div>
              </div>
              <div className="p-6">
                <p className="text-slate-400 text-sm mb-4 line-clamp-2">{model.description}</p>
                <div className="flex gap-2 mb-6 flex-wrap">
                  {model.tags.map(tag => (
                    <span key={tag} className="text-[10px] font-bold bg-slate-700 text-slate-300 px-2 py-0.5 rounded-md uppercase">{tag}</span>
                  ))}
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-slate-500 text-xs font-bold uppercase">{model.size}</span>
                  <button className="bg-blue-500 hover:bg-blue-600 text-white font-bold py-2 px-6 rounded-xl transition-all shadow-lg shadow-blue-500/20 flex items-center gap-2">
                    <Download size={18} />
                    Install
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      </section>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        <section className="bg-gradient-to-br from-slate-800 to-slate-900 border border-slate-700 rounded-3xl p-8">
          <div className="flex items-center gap-3 mb-6">
            <Zap className="text-yellow-400" size={24} />
            <h3 className="text-xl font-bold">Smart Hardware Recommendation</h3>
          </div>
          <p className="text-slate-400 mb-6">We analyzed your system. Here is what runs best on your <strong>{sysInfo?.vram > 0 ? 'GPU' : 'CPU'}</strong>.</p>
          
          <div className="space-y-4">
            <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-2xl p-4 flex items-center justify-between">
              <div>
                <h4 className="font-bold text-emerald-400 text-sm">Perfect Fit</h4>
                <p className="text-xs text-slate-500">Models up to 8GB parameters</p>
              </div>
              <CheckCircle className="text-emerald-500" size={24} />
            </div>
            <div className="bg-blue-500/10 border border-blue-500/20 rounded-2xl p-4 flex items-center justify-between">
              <div>
                <h4 className="font-bold text-blue-400 text-sm">High Performance</h4>
                <p className="text-xs text-slate-500">Fast inference on quantized GGUF</p>
              </div>
              <Info className="text-blue-500" size={24} />
            </div>
          </div>
        </section>

        <section className="bg-slate-800/30 border border-slate-700 border-dashed rounded-3xl p-8 flex flex-col items-center justify-center text-center">
          <div className="w-16 h-16 bg-slate-700 rounded-2xl flex items-center justify-center mb-4 text-slate-400">
             <Star size={32} />
          </div>
          <h3 className="text-lg font-bold mb-2">Request a Model</h3>
          <p className="text-slate-500 text-sm max-w-xs">Can't find what you need? Let us know and we'll add it to the curated store.</p>
          <button className="mt-6 text-sm font-bold text-white bg-slate-700 px-6 py-2 rounded-xl hover:bg-slate-600 transition-colors">Submit Request</button>
        </section>
      </div>
    </div>
  );
}
