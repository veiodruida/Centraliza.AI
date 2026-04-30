import { useState, useEffect, useRef } from 'react';
import { Send, User, Bot, Trash2, Zap, AlertCircle, Loader2, Globe, Server, Terminal, Sparkles, MessageCircle, MoreHorizontal } from 'lucide-react';
import { useApp } from '../context/AppContext';

interface Message {
  role: 'user' | 'assistant';
  content: string;
}

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
          endpoint: customEndpoint
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
    <div className="flex h-full bg-[var(--bg-base)] overflow-hidden animate-in fade-in duration-1000">
      {/* Sidebar */}
      <div className="w-96 border-r border-[var(--border)] flex flex-col p-12 bg-[var(--bg-surface)]/30 backdrop-blur-3xl shrink-0">
        <h3 className="text-[var(--text-primary)] font-black text-xs uppercase tracking-[0.4em] mb-10 flex items-center gap-4">
          <div className="w-10 h-10 bg-blue-600/10 rounded-xl flex items-center justify-center text-blue-500 shadow-3xl">
             <Server size={20} />
          </div>
          {t('nav_test')} ENGINE
        </h3>

        <div className="flex bg-[var(--bg-input)] p-1.5 rounded-[1.5rem] border border-[var(--border)] mb-10 shadow-inner">
           {(['ollama', 'llama.cpp'] as const).map(e => (
             <button 
              key={e}
              onClick={() => setEngine(e)}
              className={`flex-1 py-4 rounded-xl text-[11px] font-black uppercase tracking-widest transition-all active:scale-95 ${
                engine === e ? 'bg-blue-600 text-white shadow-2xl shadow-blue-600/30' : 'text-[var(--text-muted)] hover:text-[var(--text-primary)]'
              }`}
             >
               {e}
             </button>
           ))}
        </div>

        {engine === 'llama.cpp' && (
           <div className="bg-yellow-500/10 border border-yellow-500/20 p-6 rounded-[2rem] mb-10 shadow-lg shadow-yellow-500/5 animate-in slide-in-from-top-4">
              <p className="text-[11px] text-yellow-600 font-black uppercase tracking-widest leading-relaxed flex items-center gap-3">
                 <AlertCircle size={16} /> Attention
              </p>
              <p className="text-[11px] text-yellow-700/70 font-medium mt-2 leading-relaxed">
                 {t('models_ensureLlamaLaunched') || 'Ensure Llama.cpp is launched on port 8080 in My Models tab.'}
              </p>
           </div>
        )}
        
        <h3 className="text-[var(--text-primary)] font-black text-[11px] uppercase tracking-[0.4em] mb-8 flex items-center gap-4">
           <div className="w-10 h-10 bg-purple-600/10 rounded-xl flex items-center justify-center text-purple-500 shadow-3xl">
              <Zap size={20} />
           </div>
           {t('hub_details_title')}
        </h3>
        
        <div className="space-y-4 flex-1 overflow-y-auto pr-4 mb-10 custom-scrollbar">
          {models.filter(m => engine === 'ollama' ? m.source === 'Ollama' : true).map(model => (
            <button
              key={model.path}
              onClick={() => setSelectedModel(model)}
              className={`w-full text-left p-6 rounded-[2.5rem] border transition-all active:scale-95 relative overflow-hidden group ${
                selectedModel?.path === model.path 
                  ? 'bg-blue-600 border-blue-500 text-white shadow-premium' 
                  : 'bg-[var(--bg-input)]/30 border-[var(--border)] text-[var(--text-secondary)] hover:border-blue-500/30 hover:bg-[var(--bg-input)] hover:shadow-xl'
              }`}
            >
              {selectedModel?.path === model.path && <div className="absolute inset-0 bg-gradient-to-r from-white/10 to-transparent pointer-events-none" />}
              <div className="font-black text-sm truncate mb-2 group-hover:translate-x-1 transition-transform tracking-tighter uppercase leading-none">{model.name}</div>
              <div className="flex items-center justify-between">
                 <div className={`text-[9px] uppercase font-black tracking-[0.2em] opacity-60`}>{model.source}</div>
                 {selectedModel?.path === model.path && <Sparkles size={12} className="animate-pulse" />}
              </div>
            </button>
          ))}
        </div>

        <div className="pt-10 border-t border-[var(--border)]">
           <label className="text-[10px] font-black text-[var(--text-muted)] uppercase tracking-[0.4em] block mb-4 ml-2">Endpoint URL</label>
           <div className="flex items-center gap-4 bg-[var(--bg-input)]/50 border border-[var(--border)] rounded-[1.5rem] px-6 py-4 shadow-inner group focus-within:ring-2 focus-within:ring-blue-500/20 transition-all">
              <Globe size={18} className="text-[var(--text-muted)] group-focus-within:text-blue-500 transition-colors" />
              <input 
                type="text" 
                value={customEndpoint}
                onChange={(e) => setCustomEndpoint(e.target.value)}
                className="bg-transparent text-[11px] text-[var(--text-primary)] focus:outline-none w-full font-mono font-black tracking-tight"
              />
           </div>
        </div>
      </div>

      {/* Chat Area */}
      <div className="flex-1 flex flex-col relative bg-[var(--bg-base)]">
        {!selectedModel && (
           <div className="absolute inset-0 flex flex-col items-center justify-center text-center p-20 bg-[var(--bg-base)]/95 backdrop-blur-3xl z-20 animate-in fade-in zoom-in-95 duration-700">
              <div className="w-32 h-32 bg-[var(--bg-input)] rounded-[3.5rem] border border-[var(--border)] flex items-center justify-center mb-12 shadow-premium text-[var(--text-muted)] relative overflow-hidden group">
                 <div className="absolute inset-0 bg-gradient-to-br from-blue-500/10 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
                 <Terminal size={64} className="group-hover:scale-110 transition-transform duration-500" />
              </div>
              <h2 className="text-6xl font-black text-[var(--text-primary)] mb-6 uppercase tracking-tighter leading-none">{t('dash_ready')}</h2>
              <p className="text-[var(--text-secondary)] max-w-md text-xl font-medium leading-relaxed opacity-80">{t('chat_selectToBegin') || 'Select a model and engine to start a local conversation.'}</p>
              <div className="mt-12 flex gap-4">
                 <div className="w-3 h-3 rounded-full bg-blue-500 animate-bounce" />
                 <div className="w-3 h-3 rounded-full bg-blue-500 animate-bounce [animation-delay:0.2s]" />
                 <div className="w-3 h-3 rounded-full bg-blue-500 animate-bounce [animation-delay:0.4s]" />
              </div>
           </div>
        )}

        <header className="h-28 border-b border-[var(--border)] flex items-center justify-between px-16 bg-[var(--bg-surface)]/50 backdrop-blur-3xl shrink-0 z-10 shadow-premium">
           <div className="flex items-center gap-8">
              <div className="w-16 h-16 bg-gradient-to-br from-blue-600 to-indigo-700 rounded-[1.5rem] flex items-center justify-center text-white shadow-premium animate-in slide-in-from-left-4">
                 <Bot size={32} />
              </div>
              <div className="animate-in slide-in-from-left-6">
                 <div className="text-3xl font-black text-[var(--text-primary)] truncate max-w-2xl tracking-tighter leading-none mb-2 uppercase">{selectedModel?.name || 'IDLE ENGINE'}</div>
                 <div className="flex items-center gap-3">
                    <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse shadow-[0_0_10px_rgba(16,185,129,0.5)]"></span>
                    <span className="text-[11px] text-emerald-500 font-black uppercase tracking-[0.3em]">{engine} engine active</span>
                 </div>
              </div>
           </div>
           
           <div className="flex gap-4">
              <button 
                onClick={() => setMessages([{ role: 'assistant', content: t('chat_welcome') }])} 
                className="w-14 h-14 flex items-center justify-center text-[var(--text-muted)] hover:text-red-500 hover:bg-red-500/10 rounded-2xl transition-all border border-[var(--border)] active:scale-90 shadow-lg group"
                title="Clear History"
              >
                 <Trash2 size={24} className="group-hover:rotate-12 transition-transform" />
              </button>
              <button className="w-14 h-14 flex items-center justify-center text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-input)] rounded-2xl transition-all border border-[var(--border)] active:scale-90 shadow-lg">
                 <MoreHorizontal size={24} />
              </button>
           </div>
        </header>

        <div className="flex-1 overflow-y-auto p-16 space-y-12 scroll-smooth custom-scrollbar bg-[radial-gradient(circle_at_top_right,var(--bg-input),transparent)]">
          {messages.map((msg, i) => (
            <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'} animate-in fade-in slide-in-from-bottom-6 duration-700`}>
              <div className={`flex gap-8 max-w-5xl ${msg.role === 'user' ? 'flex-row-reverse' : ''}`}>
                <div className={`w-14 h-14 rounded-[1.5rem] shrink-0 flex items-center justify-center shadow-premium transition-all duration-500 hover:scale-110 hover:rotate-3 ${
                  msg.role === 'user' ? 'bg-[var(--bg-surface)] text-blue-500 border border-[var(--border)]' : 'bg-gradient-to-br from-blue-600 to-indigo-600 text-white'
                }`}>
                  {msg.role === 'user' ? <User size={28} /> : <Bot size={28} />}
                </div>
                <div className={`p-10 rounded-[3.5rem] text-lg leading-relaxed shadow-premium font-medium relative ${
                  msg.role === 'user' 
                    ? 'bg-blue-600 text-white rounded-tr-none border border-white/10' 
                    : 'bg-[var(--bg-surface)] border border-[var(--border)] text-[var(--text-primary)] rounded-tl-none backdrop-blur-3xl'
                }`}>
                  <div className="absolute top-4 right-6 opacity-20 pointer-events-none">
                     {msg.role === 'user' ? <MessageCircle size={32} /> : <Sparkles size={32} />}
                  </div>
                  {msg.content}
                </div>
              </div>
            </div>
          ))}
          {loading && (
             <div className="flex justify-start">
                <div className="flex gap-8 items-center animate-in fade-in slide-in-from-left-4 duration-500">
                   <div className="w-14 h-14 rounded-[1.5rem] bg-blue-600/10 flex items-center justify-center text-blue-500 border border-blue-500/20 shadow-3xl">
                      <Loader2 size={28} className="animate-spin" />
                   </div>
                   <div className="flex gap-2">
                      <div className="w-3 h-3 rounded-full bg-blue-500/40 animate-bounce" />
                      <div className="w-3 h-3 rounded-full bg-blue-500/40 animate-bounce [animation-delay:0.2s]" />
                      <div className="w-3 h-3 rounded-full bg-blue-500/40 animate-bounce [animation-delay:0.4s]" />
                   </div>
                   <span className="text-base font-black text-blue-500 uppercase tracking-[0.3em] opacity-60">Engine Processing</span>
                </div>
             </div>
          )}
          {error && (
             <div className="flex justify-center">
                <div className="bg-red-500/10 border border-red-500/20 text-red-500 px-10 py-6 rounded-[2.5rem] flex items-center gap-5 text-sm font-black uppercase tracking-[0.2em] shadow-premium backdrop-blur-3xl animate-in shake-in">
                   <div className="w-12 h-12 bg-red-500 rounded-2xl flex items-center justify-center text-white shadow-lg"><AlertCircle size={28} /></div>
                   <div>
                      <div className="mb-1">SYSTEM ERROR</div>
                      <div className="opacity-70 font-medium text-xs">{error}</div>
                   </div>
                </div>
             </div>
          )}
          <div ref={messagesEndRef} />
        </div>

        <div className="p-12 border-t border-[var(--border)] bg-[var(--bg-surface)]/80 backdrop-blur-3xl shadow-[0_-20px_100px_rgba(0,0,0,0.1)]">
          <div className="relative group max-w-6xl mx-auto flex gap-6">
            <div className="relative flex-1">
               <input 
                 type="text" 
                 value={input}
                 disabled={loading}
                 onChange={(e) => setInput(e.target.value)}
                 onKeyDown={(e) => e.key === 'Enter' && handleSend()}
                 placeholder={selectedModel ? `Message ${selectedModel.name.split('/').pop()}...` : t('chat_selectToBegin')}
                 className="w-full bg-[var(--bg-input)]/50 border border-[var(--border)] rounded-[3rem] py-8 pl-12 pr-12 text-[var(--text-primary)] focus:outline-none focus:ring-4 focus:ring-blue-600/10 transition-all text-xl shadow-premium font-medium placeholder:text-[var(--text-muted)] placeholder:font-black placeholder:uppercase placeholder:tracking-[0.2em] placeholder:text-xs"
               />
               <div className="absolute right-8 top-1/2 -translate-y-1/2 flex gap-4 text-[var(--text-muted)]">
                  <button className="hover:text-blue-500 transition-colors"><Globe size={24} /></button>
                  <button className="hover:text-blue-500 transition-colors"><MoreHorizontal size={24} /></button>
               </div>
            </div>
            <button 
              onClick={handleSend}
              disabled={loading || !input.trim()}
              className="w-24 h-24 bg-blue-600 text-white rounded-[2.5rem] flex items-center justify-center hover:bg-blue-500 transition-all shadow-premium active:scale-90 disabled:opacity-50 disabled:grayscale"
            >
              {loading ? <Loader2 size={32} className="animate-spin" /> : <Send size={32} />}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
