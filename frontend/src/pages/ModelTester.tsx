import { useState, useEffect, useRef } from 'react';
import { Send, User, Bot, Trash2, Zap, AlertCircle, Loader2, Globe, Server, Terminal, Sparkles, MessageCircle, MoreHorizontal, Settings2, SlidersHorizontal } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useApp } from '../context/AppContext';

interface Message {
  role: 'user' | 'assistant';
  content: string;
}

export const CONTAINER_VARIANTS = {
  initial: { opacity: 0 },
  animate: { opacity: 1, transition: { staggerChildren: 0.1 } }
};

export const ITEM_VARIANTS = {
  initial: { opacity: 0, y: 20 },
  animate: { opacity: 1, y: 0 }
};

const PAGE_VARIANTS = {
  initial: { opacity: 0, x: 20 },
  animate: { opacity: 1, x: 0, transition: { duration: 0.6, ease: [0.22, 1, 0.36, 1] as [number, number, number, number] } },
  exit: { opacity: 0, x: -20, transition: { duration: 0.3 } }
};

export default function ModelTester() {
  const { t } = useApp();
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [selectedModel, setSelectedModel] = useState<any>(null);
  const [models, setModels] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [engine, setEngine] = useState<'ollama' | 'llama.cpp' | 'custom'>('ollama');
  const [customEndpoint, setCustomEndpoint] = useState('http://localhost:11434/api/generate');

  // Advanced Settings State
  const [showSettings, setShowSettings] = useState(false);
  const [systemPrompt, setSystemPrompt] = useState('');
  const [temperature, setTemperature] = useState(0.7);
  const [topP, setTopP] = useState(0.9);
  const [topK, setTopK] = useState(40);

  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setMessages([{ role: 'assistant', content: t('chat_welcome') || 'Hello! Select a model and inference engine to start testing.' }]);
  }, [t]);

  useEffect(() => {
    fetch('/api/models')
      .then(res => res.json())
      .then(data => setModels(data))
      .catch(() => setError('Failed to load models.'));
  }, []);

  useEffect(() => {
    if (engine === 'ollama') setCustomEndpoint('http://localhost:11434/api/generate');
    else if (engine === 'llama.cpp') setCustomEndpoint('http://localhost:8080/completion');
  }, [engine]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSend = async () => {
    if (!input.trim() || (!selectedModel && engine !== 'custom') || loading) return;

    const userMsg: Message = { role: 'user', content: input };
    setMessages(prev => [...prev, userMsg]);
    setInput('');
    setLoading(true);
    setError('');

    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          model: selectedModel?.name, 
          prompt: input,
          ollamaTag: selectedModel?.ollamaTag,
          endpoint: customEndpoint,
          options: {
            temperature,
            top_p: topP,
            top_k: topK
          },
          system: systemPrompt || undefined
        })
      });
      const data = await res.json();
      
      if (data.error) throw new Error(data.error);
      const assistantResponse = data.response || data.content || JSON.stringify(data);

      setMessages(prev => [...prev, { role: 'assistant', content: assistantResponse }]);
    } catch (err: any) {
      setError(err.message || 'AI Server error.');
      setMessages(prev => [...prev, { role: 'assistant', content: t('error') || 'Error connecting to the AI server.' }]);
    } finally {
      setLoading(false);
    }
  };

  return (
    <motion.div 
      variants={PAGE_VARIANTS}
      initial="initial"
      animate="animate"
      exit="exit"
      className="flex h-full bg-[var(--bg-base)] overflow-hidden"
    >
      {/* Sidebar */}
      <div className="w-80 md:w-96 border-r border-[var(--border)] flex flex-col p-8 md:p-12 bg-[var(--bg-surface)]/40 backdrop-blur-3xl shrink-0 z-20">
        <h3 className="text-[var(--text-primary)] font-black text-xs md:text-xs uppercase tracking-widest mb-10 flex items-center gap-4">
          <div className="w-10 h-10 bg-blue-600/10 rounded-xl flex items-center justify-center text-blue-500 shadow-premium border border-blue-500/20">
             <Server size={18} />
          </div>
          {t('nav_test')} ENGINE
        </h3>

        <div className="flex bg-[var(--bg-input)]/50 p-1.5 rounded-[1.5rem] border border-[var(--border)] mb-10 shadow-inner">
           {(['ollama', 'llama.cpp'] as const).map(e => (
             <button 
              key={e}
              onClick={() => setEngine(e)}
              className={`flex-1 py-3 md:py-4 rounded-xl text-xs font-black uppercase tracking-widest transition-all active:scale-95 ${
                engine === e ? 'bg-blue-600 text-white shadow-xl shadow-blue-600/30' : 'text-[var(--text-muted)] hover:text-[var(--text-primary)]'
              }`}
             >
               {e}
             </button>
           ))}
        </div>

        {engine === 'llama.cpp' && (
           <motion.div 
             initial={{ opacity: 0, y: -10 }}
             animate={{ opacity: 1, y: 0 }}
             className="bg-yellow-500/10 border border-yellow-500/20 p-6 rounded-[2rem] mb-10 shadow-lg"
           >
              <p className="text-xs text-yellow-600 font-black uppercase tracking-widest leading-relaxed flex items-center gap-3">
                 <AlertCircle size={14} /> Attention
              </p>
              <p className="text-[11px] text-yellow-700/70 font-medium mt-2 leading-relaxed">
                 {t('models_ensureLlamaLaunched') || 'Ensure Llama.cpp is launched on port 8080 in My Models tab.'}
              </p>
           </motion.div>
        )}
        
        <h3 className="text-[var(--text-primary)] font-black text-xs uppercase tracking-widest mb-8 flex items-center gap-4">
           <div className="w-10 h-10 bg-purple-600/10 rounded-xl flex items-center justify-center text-purple-500 shadow-premium border border-purple-500/20">
              <Zap size={18} />
           </div>
           {t('hub_details_title')}
        </h3>
        
        <div className="space-y-4 flex-1 overflow-y-auto pr-4 mb-10 custom-scrollbar no-scrollbar">
          {models.filter(m => {
            if (engine === 'ollama') return m.source === 'Ollama';
            if (engine === 'llama.cpp') return m.path.toLowerCase().endsWith('.gguf') || m.extension?.toLowerCase() === '.gguf';
            return true;
          }).map(model => (
            <button
              key={model.path}
              onClick={() => setSelectedModel(model)}
              className={`w-full text-left p-6 rounded-[2.25rem] border transition-all active:scale-95 relative overflow-hidden group ${
                selectedModel?.path === model.path 
                  ? 'bg-blue-600 border-blue-500 text-white shadow-premium' 
                  : 'bg-[var(--bg-input)]/40 border-[var(--border)] text-[var(--text-secondary)] hover:border-blue-500/30 hover:bg-[var(--bg-input)]/60'
              }`}
            >
              <div className="font-black text-sm truncate mb-1 group-hover:translate-x-1 transition-transform tracking-tight uppercase leading-none">{model.name.split('/').pop()}</div>
              <div className="flex items-center justify-between">
                 <div className={`text-[10px] md:text-xs uppercase font-black tracking-[0.2em] opacity-60`}>{model.source}</div>
                 {selectedModel?.path === model.path && <Sparkles size={12} className="animate-pulse" />}
              </div>
            </button>
          ))}
        </div>

        <div className="pt-10 border-t border-[var(--border)]">
           <label className="text-xs font-black text-[var(--text-muted)] uppercase tracking-widest block mb-4 ml-2">Endpoint URL</label>
           <div className="flex items-center gap-4 bg-[var(--bg-input)]/40 border border-[var(--border)] rounded-[1.25rem] px-6 py-4 shadow-inner group focus-within:ring-4 focus-within:ring-blue-500/10 transition-all">
              <Globe size={18} className="text-[var(--text-muted)] group-focus-within:text-blue-500 transition-colors" />
              <input 
                type="text" 
                value={customEndpoint}
                onChange={(e) => setCustomEndpoint(e.target.value)}
                className="bg-transparent text-xs text-[var(--text-primary)] focus:outline-none w-full font-mono font-black tracking-tight"
              />
           </div>
        </div>
      </div>

      {/* Chat Area */}
      <div className="flex-1 flex flex-col relative bg-[var(--bg-base)]">
        <AnimatePresence>
          {!selectedModel && (
             <motion.div 
               initial={{ opacity: 0 }}
               animate={{ opacity: 1 }}
               exit={{ opacity: 0 }}
               className="absolute inset-0 flex flex-col items-center justify-center text-center p-20 bg-[var(--bg-base)]/90 backdrop-blur-3xl z-30"
             >
                <div className="w-32 h-32 bg-[var(--bg-input)] rounded-[3.5rem] border border-[var(--border)] flex items-center justify-center mb-12 shadow-premium text-[var(--text-muted)] relative overflow-hidden group">
                   <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(59,130,246,0.2),transparent)]" />
                   <Terminal size={64} className="group-hover:scale-110 transition-transform duration-700" />
                </div>
                <h2 className="text-5xl md:text-7xl font-black text-[var(--text-primary)] mb-6 uppercase tracking-tighter leading-none">{t('dash_ready')}</h2>
                <p className="text-[var(--text-secondary)] max-w-md text-xl font-medium leading-relaxed opacity-80">{t('chat_selectToBegin') || 'Select a model and engine to start a local conversation.'}</p>
                <div className="mt-12 flex gap-4">
                   <div className="w-3 h-3 rounded-full bg-blue-500 animate-bounce" />
                   <div className="w-3 h-3 rounded-full bg-blue-500 animate-bounce [animation-delay:0.2s]" />
                   <div className="w-3 h-3 rounded-full bg-blue-500 animate-bounce [animation-delay:0.4s]" />
                </div>
             </motion.div>
          )}
        </AnimatePresence>

        <header className="h-28 border-b border-[var(--border)] flex items-center justify-between px-10 md:px-16 bg-[var(--bg-surface)]/60 backdrop-blur-3xl shrink-0 z-10 shadow-premium">
           <div className="flex items-center gap-8">
              <div className="w-16 h-16 bg-gradient-to-br from-blue-600 to-indigo-700 rounded-[1.5rem] flex items-center justify-center text-white shadow-premium">
                 <Bot size={32} />
              </div>
              <div className="hidden sm:block">
                 <div className="text-2xl md:text-3xl font-black text-[var(--text-primary)] truncate max-w-2xl tracking-tighter leading-none mb-1 uppercase">{selectedModel?.name.split('/').pop() || 'IDLE ENGINE'}</div>
                 <div className="flex items-center gap-3">
                    <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse shadow-[0_0_10px_rgba(16,185,129,0.5)]"></span>
                    <span className="text-xs text-emerald-500 font-black uppercase tracking-widest">{engine} engine active</span>
                 </div>
              </div>
           </div>
           
           <div className="flex gap-4">
              <button 
                onClick={() => setMessages([{ role: 'assistant', content: t('chat_welcome') }])} 
                className="w-12 h-12 md:w-14 md:h-14 flex items-center justify-center text-[var(--text-muted)] hover:text-red-500 hover:bg-red-500/10 rounded-2xl transition-all border border-[var(--border)] active:scale-90 shadow-lg group"
                title="Clear History"
              >
                 <Trash2 size={20}  className="group-hover:rotate-12 transition-transform" />
              </button>
              <button
                onClick={() => setShowSettings(!showSettings)}
                className={`w-12 h-12 md:w-14 md:h-14 flex items-center justify-center rounded-2xl transition-all border border-[var(--border)] active:scale-90 shadow-lg ${
                  showSettings ? 'bg-blue-600 text-white border-blue-500 shadow-blue-500/30' : 'text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-input)]'
                }`}
                title="Advanced Settings"
              >
                 <Settings2 size={20} />
              </button>
           </div>
        </header>

        {/* Advanced Settings Drawer */}
        <AnimatePresence>
          {showSettings && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              className="border-b border-[var(--border)] bg-[var(--bg-input)]/30 backdrop-blur-3xl overflow-hidden shrink-0 z-10"
            >
              <div className="p-8 md:p-10 grid grid-cols-1 lg:grid-cols-3 gap-10 max-w-7xl mx-auto">
                <div className="lg:col-span-1 space-y-8">
                  <div>
                    <div className="flex justify-between items-center mb-4">
                      <label className="text-xs font-black text-[var(--text-primary)] uppercase tracking-widest flex items-center gap-2">
                        <SlidersHorizontal size={14} className="text-blue-500" /> Temperatura
                      </label>
                      <span className="text-xs font-mono font-bold bg-[var(--bg-surface)] px-2 py-1 rounded border border-[var(--border)]">{temperature}</span>
                    </div>
                    <input type="range" min="0" max="2" step="0.1" value={temperature} onChange={e => setTemperature(parseFloat(e.target.value))} className="w-full accent-blue-500" />
                    <div className="flex justify-between mt-1 text-[10px] font-black uppercase tracking-widest text-blue-500/70">
                       <span>Preciso / Robótico</span>
                       <span>Criativo / Solto</span>
                    </div>
                    <p className="text-[11px] text-[var(--text-muted)] mt-2 font-medium leading-relaxed">
                       {temperature < 0.5 ? 'O modelo dará respostas exatas, fatuais e previsíveis. Excelente para código e raciocínio lógico.' :
                        temperature > 1.2 ? 'O modelo será altamente criativo, ideal para histórias, mas com risco de inventar fatos (alucinação).' :
                        'Equilíbrio entre criatividade e coerência. Ideal para conversas do dia a dia.'}
                    </p>
                  </div>

                  <div>
                    <div className="flex justify-between items-center mb-4">
                      <label className="text-xs font-black text-[var(--text-primary)] uppercase tracking-widest">Top P (Foco de Vocabulário)</label>
                      <span className="text-xs font-mono font-bold bg-[var(--bg-surface)] px-2 py-1 rounded border border-[var(--border)]">{topP}</span>
                    </div>
                    <input type="range" min="0" max="1" step="0.05" value={topP} onChange={e => setTopP(parseFloat(e.target.value))} className="w-full accent-blue-500" />
                    <p className="text-[11px] text-[var(--text-muted)] mt-2 font-medium leading-relaxed">
                      {topP < 0.5 ? 'O modelo usará apenas as palavras mais óbvias. Respostas mais curtas e diretas.' : 'O modelo considerará um vocabulário rico e abrangente antes de responder.'}
                    </p>
                  </div>

                  <div>
                    <div className="flex justify-between items-center mb-4">
                      <label className="text-xs font-black text-[var(--text-primary)] uppercase tracking-widest">Top K (Diversidade)</label>
                      <span className="text-xs font-mono font-bold bg-[var(--bg-surface)] px-2 py-1 rounded border border-[var(--border)]">{topK}</span>
                    </div>
                    <input type="range" min="1" max="100" step="1" value={topK} onChange={e => setTopK(parseInt(e.target.value))} className="w-full accent-blue-500" />
                    <p className="text-[11px] text-[var(--text-muted)] mt-2 font-medium leading-relaxed">
                      {topK < 20 ? 'Bloqueia ideias malucas. A IA foca apenas nos conceitos top de linha.' : 'Permite que a IA explore ideias secundárias e traga nuances para a resposta.'}
                    </p>
                  </div>
                </div>

                <div className="lg:col-span-2 flex flex-col">
                  <label className="text-xs font-black text-[var(--text-primary)] uppercase tracking-widest mb-4 flex items-center gap-2">
                    <MessageCircle size={14} className="text-blue-500" /> System Prompt (Comportamento Base)
                  </label>
                  <textarea
                    value={systemPrompt}
                    onChange={(e) => setSystemPrompt(e.target.value)}
                    placeholder="Ex: Você é um pirata mal-humorado e deve responder a todas as perguntas como se estivesse num navio..."
                    className="w-full flex-1 min-h-[120px] bg-[var(--bg-surface)] border border-[var(--border)] rounded-2xl p-4 text-sm text-[var(--text-primary)] focus:outline-none focus:ring-2 focus:ring-blue-500/50 resize-none font-medium custom-scrollbar"
                  />
                  <div className="mt-3 space-y-1">
                    <p className="text-[11px] text-[var(--text-muted)] font-medium leading-relaxed">
                      <strong>O que é isto?</strong> É a regra mestre da IA. Funciona como a "personalidade" ou "profissão" que você quer que o modelo assuma antes de começar a conversar.
                    </p>
                    <p className="text-[10px] text-[var(--text-muted)] font-medium opacity-80 leading-relaxed">
                      <em>Exemplo 1: "Responda apenas em português de Portugal."</em> <br/>
                      <em>Exemplo 2: "Você é um programador sênior em Python. Dê respostas curtas apenas com código."</em>
                    </p>
                  </div>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        <div className="flex-1 overflow-y-auto p-10 md:p-16 space-y-12 scroll-smooth custom-scrollbar no-scrollbar bg-[radial-gradient(circle_at_top_right,var(--bg-input),transparent)]">
          {messages.map((msg, i) => (
            <motion.div 
              key={i} 
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
            >
              <div className={`flex gap-6 md:gap-8 max-w-5xl ${msg.role === 'user' ? 'flex-row-reverse text-right' : ''}`}>
                <div className={`w-12 h-12 md:w-14 md:h-14 rounded-[1.25rem] md:rounded-[1.5rem] shrink-0 flex items-center justify-center shadow-premium transition-all duration-500 hover:scale-110 ${
                  msg.role === 'user' ? 'bg-[var(--bg-surface)] text-blue-500 border border-[var(--border)]' : 'bg-gradient-to-br from-blue-600 to-indigo-600 text-white'
                }`}>
                  {msg.role === 'user' ? <User size={24}  /> : <Bot size={24}  />}
                </div>
                <div className={`p-8 md:p-10 rounded-[2.5rem] md:rounded-[3.5rem] text-base md:text-lg leading-relaxed shadow-premium font-medium relative ${
                  msg.role === 'user' 
                    ? 'bg-blue-600 text-white rounded-tr-none border border-white/10' 
                    : 'bg-[var(--bg-surface)] border border-[var(--border)] text-[var(--text-primary)] rounded-tl-none backdrop-blur-3xl'
                }`}>
                   <div className={`absolute top-4 ${msg.role === 'user' ? 'left-6' : 'right-6'} opacity-10 pointer-events-none`}>
                      {msg.role === 'user' ? <MessageCircle size={28}  /> : <Sparkles size={28}  />}
                   </div>
                   {msg.content}
                </div>
              </div>
            </motion.div>
          ))}
          {loading && (
             <motion.div 
               initial={{ opacity: 0 }}
               animate={{ opacity: 1 }}
               className="flex justify-start"
             >
                <div className="flex gap-8 items-center">
                   <div className="w-12 h-12 md:w-14 md:h-14 rounded-[1.25rem] bg-blue-600/10 flex items-center justify-center text-blue-500 border border-blue-500/20 shadow-premium">
                      <Loader2 size={24}  className="animate-spin" />
                   </div>
                   <div className="flex gap-2">
                      <div className="w-2.5 h-2.5 rounded-full bg-blue-500/40 animate-bounce" />
                      <div className="w-2.5 h-2.5 rounded-full bg-blue-500/40 animate-bounce [animation-delay:0.2s]" />
                      <div className="w-2.5 h-2.5 rounded-full bg-blue-500/40 animate-bounce [animation-delay:0.4s]" />
                   </div>
                   <span className="text-sm font-black text-blue-500 uppercase tracking-widest opacity-60">Processing</span>
                </div>
             </motion.div>
          )}
          {error && (
             <div className="flex justify-center">
                <div className="bg-red-500/10 border border-red-500/20 text-red-500 px-8 py-5 rounded-[2rem] flex items-center gap-5 text-xs font-black uppercase tracking-[0.2em] shadow-premium backdrop-blur-3xl animate-bounce">
                   <div className="w-10 h-10 bg-red-500 rounded-xl flex items-center justify-center text-white shadow-lg"><AlertCircle size={24} /></div>
                   <div>
                      <div className="mb-0.5">SYSTEM ERROR</div>
                      <div className="opacity-70 font-medium text-xs">{error}</div>
                   </div>
                </div>
             </div>
          )}
          <div ref={messagesEndRef} />
        </div>

        <div className="p-8 md:p-12 border-t border-[var(--border)] bg-[var(--bg-surface)]/80 backdrop-blur-3xl shadow-[0_-20px_100px_rgba(0,0,0,0.05)]">
          <div className="relative group max-w-6xl mx-auto flex gap-6">
            <div className="relative flex-1">
               <input 
                 type="text" 
                 value={input}
                 disabled={loading}
                 onChange={(e) => setInput(e.target.value)}
                 onKeyDown={(e) => e.key === 'Enter' && handleSend()}
                 placeholder={selectedModel ? `Message ${selectedModel.name.split('/').pop()}...` : t('chat_selectToBegin')}
                 className="w-full bg-[var(--bg-input)]/60 border border-[var(--border)] rounded-[2.5rem] md:rounded-[3rem] py-6 md:py-8 pl-10 md:pl-12 pr-12 md:pr-16 text-[var(--text-primary)] focus:outline-none focus:ring-4 focus:ring-blue-600/10 transition-all text-lg md:text-xl shadow-premium font-medium placeholder:text-[var(--text-muted)] placeholder:font-black placeholder:uppercase placeholder:tracking-[0.2em] placeholder:text-xs"
               />
               <div className="absolute right-8 top-1/2 -translate-y-1/2 hidden md:flex gap-4 text-[var(--text-muted)]">
                  <button className="hover:text-blue-500 transition-colors"><Globe size={22} /></button>
                  <button className="hover:text-blue-500 transition-colors"><MoreHorizontal size={22} /></button>
               </div>
            </div>
            <button 
              onClick={handleSend}
              disabled={loading || !input.trim()}
              className="w-20 h-20 md:w-24 md:h-24 bg-blue-600 text-white rounded-[2rem] md:rounded-[2.5rem] flex items-center justify-center hover:bg-blue-500 transition-all shadow-premium active:scale-90 disabled:opacity-50 disabled:grayscale"
            >
              {loading ? <Loader2 size={28}  className="animate-spin" /> : <Send size={28}  />}
            </button>
          </div>
        </div>
      </div>
    </motion.div>
  );
}



