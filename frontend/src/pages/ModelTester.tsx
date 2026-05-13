import { useState, useEffect, useRef } from 'react';
import { Send, User, Bot, Trash2, Zap, AlertCircle, Loader2, Globe, Server, Terminal, Sparkles, MessageCircle, MoreHorizontal, Settings2, SlidersHorizontal } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useApp } from '../context/AppContext';

interface Message {
  role: 'user' | 'assistant' | 'system';
  content: string;
  metrics?: { tps: string, time: string };
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
  const [ctxSize, setCtxSize] = useState(4096);
  const [gpuLayers, setGpuLayers] = useState(99);

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
    const currentMessages = [...messages, userMsg];
    setMessages(currentMessages);
    setInput('');
    setLoading(true);
    setError('');

    try {
      // Auto-start Llama.cpp engine if needed
      if (engine === 'llama.cpp') {
          const statusRes = await fetch('/api/inference/status');
          const statusData = await statusRes.json();
          if (!statusData.running || statusData.model !== selectedModel.path) {
              setMessages(prev => [...prev, { role: 'system', content: `Iniciando motor nativo para o modelo ${selectedModel.name.split('/').pop()}... Aguarde.` }]);
              const startRes = await fetch('/api/inference/start', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ modelPath: selectedModel.path, ctx: ctxSize, ngl: gpuLayers })
              });
              const startData = await startRes.json();
              if (!startData.success) throw new Error(startData.error || 'Falha ao iniciar motor nativo.');
          }
      }

      // Prepare OpenAI format payload
      const chatHistory = currentMessages
          .filter(m => m.role !== 'system') // Filter out UI system messages like "Engine started"
          .map(m => ({ role: m.role, content: m.content }));

      if (systemPrompt) {
          chatHistory.unshift({ role: 'system', content: systemPrompt });
      }

      const modelId = engine === 'llama.cpp' ? selectedModel.path : (selectedModel?.ollamaTag || selectedModel?.name);

      const startTime = Date.now();
      const res = await fetch('/v1/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          model: modelId,
          messages: chatHistory,
          temperature,
          top_p: topP,
          top_k: topK,
          stream: false // Using static fetch for simplicity in this phase
        })
      });
      const data = await res.json();
      
      if (data.error) throw new Error(data.error);
      if (!res.ok && data.error) throw new Error(data.error);

      const assistantResponse = data.choices?.[0]?.message?.content || JSON.stringify(data);
      const endTime = Date.now();

      let tps = 'N/A';
      const durationSecs = (endTime - startTime) / 1000;
      if (data.usage?.completion_tokens) {
          tps = (data.usage.completion_tokens / durationSecs).toFixed(1);
      }

      setMessages(prev => [...prev, {
          role: 'assistant',
          content: assistantResponse,
          metrics: { tps, time: durationSecs.toFixed(1) }
      }]);
    } catch (err: any) {
      setError(err.message || 'AI Server error.');
      setMessages(prev => [...prev, { role: 'system', content: 'SYSTEM ERROR: ' + (err.message || 'Error connecting to AI server.') }]);
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
      className="flex flex-col lg:flex-row absolute inset-0 bg-[var(--bg-base)] overflow-hidden"
    >
      {/* Sidebar */}
      <div className="w-full lg:w-[26rem] xl:w-[30rem] lg:border-r border-b lg:border-b-0 border-[var(--border)] flex flex-col p-6 md:p-10 bg-[var(--bg-surface)]/40 backdrop-blur-3xl shrink-0 z-20 overflow-y-auto max-h-[40vh] lg:max-h-full">
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
             className="bg-purple-500/10 border border-purple-500/20 p-6 rounded-[2rem] mb-10 shadow-lg relative overflow-hidden"
           >
              <div className="absolute top-0 right-0 w-32 h-32 bg-purple-500/10 blur-[30px] rounded-full" />
              <p className="text-xs text-purple-400 font-black uppercase tracking-widest leading-relaxed flex items-center gap-3 mb-4">
                 <Zap size={14} className="fill-purple-500/50" /> Native Engine
              </p>
              <p className="text-[11px] text-purple-300/70 font-medium leading-relaxed mb-6">
                 O Centraliza.ai gerenciará o servidor Llama.cpp de forma nativa para você usando o GGUF selecionado abaixo.
              </p>

              <p className="text-[9px] text-purple-300/50 font-medium leading-relaxed mb-6 font-mono uppercase tracking-widest">
                Context: {ctxSize} | GPU Layers: {gpuLayers}
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
            if (engine === 'llama.cpp') {
               const isGGUF = m.path.toLowerCase().endsWith('.gguf') || m.extension?.toLowerCase() === '.gguf';
               const isOllama = m.source === 'Ollama';
               const isComfy = m.source === 'ComfyUI';
               return isGGUF && !isOllama && !isComfy;
            }
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
      <div className="flex-1 flex flex-col relative bg-[var(--bg-base)] min-w-0 min-h-0">
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
              className="border-b border-[var(--border)] bg-[var(--bg-input)]/30 backdrop-blur-3xl overflow-hidden shrink-0 z-10 w-full"
            >
              <div className="p-6 md:p-10 grid grid-cols-1 xl:grid-cols-3 gap-8 md:gap-12 w-full mx-auto max-w-[100rem]">
                <div className="xl:col-span-1 space-y-8">
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

                <div className="xl:col-span-2 flex flex-col min-w-0">
                  <div className="grid grid-cols-2 gap-8 mb-8 p-6 bg-purple-500/5 border border-purple-500/20 rounded-[2rem]">
                    <div>
                      <div className="flex justify-between items-center mb-4">
                        <label className="text-xs font-black text-purple-400 uppercase tracking-widest flex items-center gap-2"><Zap size={14} /> Context Size</label>
                        <span className="text-xs font-mono font-bold text-purple-400 bg-purple-500/10 px-2 py-1 rounded border border-purple-500/20">{ctxSize}</span>
                      </div>
                      <input type="range" min="1024" max="32768" step="1024" value={ctxSize} onChange={e => setCtxSize(parseInt(e.target.value))} className="w-full accent-purple-500" />
                      <p className="text-[10px] text-[var(--text-muted)] mt-2 font-medium">Memória da conversa. Valores altos gastam mais RAM.</p>
                    </div>
                    <div>
                      <div className="flex justify-between items-center mb-4">
                        <label className="text-xs font-black text-purple-400 uppercase tracking-widest flex items-center gap-2"><Server size={14} /> GPU Layers</label>
                        <span className="text-xs font-mono font-bold text-purple-400 bg-purple-500/10 px-2 py-1 rounded border border-purple-500/20">{gpuLayers}</span>
                      </div>
                      <input type="range" min="0" max="99" step="1" value={gpuLayers} onChange={e => setGpuLayers(parseInt(e.target.value))} className="w-full accent-purple-500" />
                      <p className="text-[10px] text-[var(--text-muted)] mt-2 font-medium">Camadas descarregadas na Placa de Vídeo. 99 = Full GPU.</p>
                    </div>
                  </div>

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
          {messages.map((msg, i) => {
            if (msg.role === 'system') {
              return (
                 <motion.div key={i} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="flex justify-center my-4">
                    <div className="bg-purple-500/10 border border-purple-500/20 text-purple-400 px-6 py-3 rounded-full text-xs font-black uppercase tracking-widest flex items-center gap-3 backdrop-blur-md">
                       <Zap size={14} className="fill-purple-500/50" />
                       {msg.content}
                    </div>
                 </motion.div>
              );
            }

            return (
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
                <div className="flex flex-col gap-2 max-w-[80vw] lg:max-w-none">
                  <div className={`p-8 md:p-10 rounded-[2.5rem] md:rounded-[3.5rem] text-base md:text-lg leading-relaxed shadow-premium font-medium relative whitespace-pre-wrap break-words ${
                    msg.role === 'user'
                      ? 'bg-blue-600 text-white rounded-tr-none border border-white/10'
                      : 'bg-[var(--bg-surface)] border border-[var(--border)] text-[var(--text-primary)] rounded-tl-none backdrop-blur-3xl'
                  }`}>
                     <div className={`absolute top-4 ${msg.role === 'user' ? 'left-6' : 'right-6'} opacity-10 pointer-events-none`}>
                        {msg.role === 'user' ? <MessageCircle size={28}  /> : <Sparkles size={28}  />}
                     </div>
                     {msg.content}
                  </div>
                  {msg.metrics && (
                     <div className={`flex items-center gap-4 text-[10px] uppercase tracking-widest font-black text-[var(--text-muted)] ${msg.role === 'user' ? 'justify-end' : 'justify-start pl-4'}`}>
                        <span className="flex items-center gap-1"><Zap size={10} className="text-blue-500" /> {msg.metrics.tps} t/s</span>
                        <span className="flex items-center gap-1 opacity-60">Tempo: {msg.metrics.time}s</span>
                     </div>
                  )}
                </div>
              </div>
            </motion.div>
          )})}
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

        <div className="p-4 md:p-8 lg:p-10 border-t border-[var(--border)] bg-[var(--bg-surface)]/80 backdrop-blur-3xl shadow-[0_-20px_100px_rgba(0,0,0,0.05)] shrink-0">
          <div className="relative group max-w-6xl mx-auto flex gap-3 md:gap-6">
            <div className="relative flex-1 min-w-0">
               <input 
                 type="text" 
                 value={input}
                 disabled={loading}
                 onChange={(e) => setInput(e.target.value)}
                 onKeyDown={(e) => e.key === 'Enter' && handleSend()}
                 placeholder={selectedModel ? `Message ${selectedModel.name.split('/').pop()}...` : t('chat_selectToBegin')}
                 className="w-full bg-[var(--bg-input)]/60 border border-[var(--border)] rounded-[2rem] md:rounded-[3rem] py-4 md:py-6 lg:py-8 pl-6 md:pl-12 pr-12 md:pr-16 text-[var(--text-primary)] focus:outline-none focus:ring-4 focus:ring-blue-600/10 transition-all text-sm md:text-lg lg:text-xl shadow-premium font-medium placeholder:text-[var(--text-muted)] placeholder:font-black placeholder:uppercase placeholder:tracking-[0.1em] md:placeholder:tracking-[0.2em] placeholder:text-[10px] md:placeholder:text-xs truncate"
               />
               <div className="absolute right-6 top-1/2 -translate-y-1/2 hidden md:flex gap-4 text-[var(--text-muted)]">
                  <button className="hover:text-blue-500 transition-colors"><Globe size={22} /></button>
                  <button className="hover:text-blue-500 transition-colors"><MoreHorizontal size={22} /></button>
               </div>
            </div>
            <button 
              onClick={handleSend}
              disabled={loading || !input.trim()}
              className="w-14 h-14 md:w-20 md:h-20 lg:w-24 lg:h-24 bg-blue-600 text-white rounded-[1.5rem] md:rounded-[2rem] lg:rounded-[2.5rem] shrink-0 flex items-center justify-center hover:bg-blue-500 transition-all shadow-premium active:scale-90 disabled:opacity-50 disabled:grayscale"
            >
              {loading ? <Loader2 size={24} className="animate-spin md:w-7 md:h-7 lg:w-8 lg:h-8" /> : <Send size={24} className="md:w-7 md:h-7 lg:w-8 lg:h-8" />}
            </button>
          </div>
        </div>
      </div>
    </motion.div>
  );
}



