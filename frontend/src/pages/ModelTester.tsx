import { useState, useEffect, useRef } from 'react';
import { Send, MessageSquare, User, Bot, Trash2, Settings, Zap, AlertCircle, Loader2, Globe, Server, Terminal } from 'lucide-react';

interface Message {
  role: 'user' | 'assistant';
  content: string;
}

export default function ModelTester() {
  const [messages, setMessages] = useState<Message[]>([
    { role: 'assistant', content: 'Olá! Selecione um modelo e o servidor de inferência (Ollama ou Llama.cpp) para testar.' }
  ]);
  const [input, setInput] = useState('');
  const [selectedModel, setSelectedModel] = useState<any>(null);
  const [models, setModels] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [engine, setEngine] = useState<'ollama' | 'llama.cpp' | 'custom'>('ollama');
  const [customEndpoint, setCustomEndpoint] = useState('http://localhost:11434/api/generate');
  const messagesEndRef = useRef<HTMLDivElement>(null);

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

      // Support both Ollama and Llama.cpp response formats
      const assistantResponse = data.response || data.content || JSON.stringify(data);

      setMessages(prev => [...prev, { 
        role: 'assistant', 
        content: assistantResponse 
      }]);
    } catch (err: any) {
      setError(err.message || 'AI Server error.');
      setMessages(prev => [...prev, { role: 'assistant', content: 'Erro ao conectar. Verifique se o servidor selecionado está rodando.' }]);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex h-full bg-slate-950 overflow-hidden">
      {/* Sidebar */}
      <div className="w-80 border-r border-slate-900 flex flex-col p-8 bg-slate-900/20 backdrop-blur-3xl shrink-0">
        <h3 className="text-white font-black text-xs uppercase tracking-[0.2em] mb-8 flex items-center gap-3">
          <Server size={18} className="text-blue-500" /> AI Engine
        </h3>

        <div className="flex bg-slate-900 p-1 rounded-2xl border border-slate-800 mb-8">
           {(['ollama', 'llama.cpp'] as const).map(e => (
             <button 
              key={e}
              onClick={() => setEngine(e)}
              className={`flex-1 py-2 rounded-xl text-[9px] font-black uppercase transition-all ${
                engine === e ? 'bg-blue-600 text-white shadow-lg' : 'text-slate-500 hover:text-slate-300'
              }`}
             >
               {e}
             </button>
           ))}
        </div>

        {engine === 'llama.cpp' && (
           <div className="bg-yellow-500/10 border border-yellow-500/20 p-4 rounded-2xl mb-8">
              <p className="text-[10px] text-yellow-500 font-bold leading-relaxed">
                 Certifique-se de ter lançado o Llama.cpp na porta 8080 através da aba "My Models".
              </p>
           </div>
        )}
        
        <h3 className="text-white font-black text-[10px] uppercase tracking-widest mb-4 flex items-center gap-2">
           <Zap size={14} className="text-blue-500" /> Target Model
        </h3>
        
        <div className="space-y-2 flex-1 overflow-y-auto pr-2 mb-8">
          {models.filter(m => engine === 'ollama' ? m.source === 'Ollama' : true).map(model => (
            <button
              key={model.path}
              onClick={() => setSelectedModel(model)}
              className={`w-full text-left p-4 rounded-2xl border transition-all ${
                selectedModel?.path === model.path 
                  ? 'bg-blue-600 border-blue-500 text-white shadow-lg' 
                  : 'bg-slate-900/50 border-slate-800 text-slate-500 hover:border-slate-700 hover:text-slate-300'
              }`}
            >
              <div className="font-bold text-xs truncate">{model.name}</div>
              <div className="text-[8px] opacity-60 uppercase font-black mt-1">{model.source}</div>
            </button>
          ))}
        </div>

        <div className="pt-8 border-t border-slate-900">
           <label className="text-[10px] font-black text-slate-600 uppercase tracking-widest block mb-2">Endpoint URL</label>
           <div className="flex items-center gap-2 bg-slate-950 border border-slate-800 rounded-xl px-3 py-2">
              <Globe size={14} className="text-slate-600" />
              <input 
                type="text" 
                value={customEndpoint}
                onChange={(e) => setCustomEndpoint(e.target.value)}
                className="bg-transparent text-[10px] text-slate-400 focus:outline-none w-full font-mono"
              />
           </div>
        </div>
      </div>

      {/* Chat Area */}
      <div className="flex-1 flex flex-col relative bg-slate-950">
        {!selectedModel && (
           <div className="absolute inset-0 flex flex-col items-center justify-center text-center p-12 bg-slate-950/90 backdrop-blur-md z-20">
              <Terminal size={48} className="text-slate-800 mb-6" />
              <h2 className="text-2xl font-black text-white mb-2 uppercase tracking-tight">System Ready</h2>
              <p className="text-slate-500 max-w-xs text-sm">Select a model from your library and an engine to begin.</p>
           </div>
        )}

        <header className="h-20 border-b border-slate-900 flex items-center justify-between px-10 bg-slate-950/50 backdrop-blur-xl shrink-0">
           <div className="flex items-center gap-4">
              <div className="w-10 h-10 bg-blue-600 rounded-xl flex items-center justify-center text-white shadow-xl shadow-blue-600/20">
                 <Bot size={20} />
              </div>
              <div>
                 <div className="text-sm font-black text-white truncate max-w-xs">{selectedModel?.name || 'IDLE'}</div>
                 <div className="flex items-center gap-2">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
                    <span className="text-[9px] text-emerald-400 font-black uppercase tracking-widest">{engine} mode</span>
                 </div>
              </div>
           </div>
           
           <div className="flex gap-2">
              <button onClick={() => setMessages([{ role: 'assistant', content: 'Chat reset.' }])} className="w-9 h-9 flex items-center justify-center text-slate-500 hover:text-white hover:bg-slate-900 rounded-lg transition-all border border-slate-900">
                 <Trash2 size={16} />
              </button>
           </div>
        </header>

        <div className="flex-1 overflow-y-auto p-10 space-y-8 scroll-smooth">
          {messages.map((msg, i) => (
            <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'} animate-in fade-in slide-in-from-bottom-2`}>
              <div className={`flex gap-4 max-w-3xl ${msg.role === 'user' ? 'flex-row-reverse' : ''}`}>
                <div className={`w-10 h-10 rounded-xl shrink-0 flex items-center justify-center shadow-lg ${
                  msg.role === 'user' ? 'bg-slate-900 text-slate-600' : 'bg-blue-600 text-white'
                }`}>
                  {msg.role === 'user' ? <User size={20} /> : <Bot size={20} />}
                </div>
                <div className={`p-5 rounded-[1.5rem] text-sm leading-relaxed shadow-xl ${
                  msg.role === 'user' ? 'bg-blue-600 text-white rounded-tr-none' : 'bg-slate-900 border border-slate-800 text-slate-200 rounded-tl-none'
                }`}>
                  {msg.content}
                </div>
              </div>
            </div>
          ))}
          {loading && (
             <div className="flex justify-start animate-pulse">
                <div className="flex gap-4">
                   <div className="w-10 h-10 rounded-xl bg-blue-600/20 flex items-center justify-center text-blue-400 border border-blue-500/20">
                      <Loader2 size={20} className="animate-spin" />
                   </div>
                   <div className="p-5 rounded-[1.5rem] bg-slate-900 border border-slate-800 text-slate-500 text-xs rounded-tl-none italic">
                      AI is generating response...
                   </div>
                </div>
             </div>
          )}
          {error && (
             <div className="flex justify-center">
                <div className="bg-red-500/10 border border-red-500/20 text-red-400 px-6 py-3 rounded-xl flex items-center gap-3 text-xs font-bold">
                   <AlertCircle size={16} /> {error}
                </div>
             </div>
          )}
          <div ref={messagesEndRef} />
        </div>

        <div className="p-8 border-t border-slate-900 bg-slate-950/80 backdrop-blur-md">
          <div className="relative group max-w-4xl mx-auto shadow-2xl">
            <input 
              type="text" 
              value={input}
              disabled={loading}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSend()}
              placeholder={selectedModel ? `Message model via ${engine}...` : 'Select a model and engine first'}
              className="w-full bg-slate-900 border border-slate-800 rounded-2xl py-4 pl-6 pr-16 text-white focus:outline-none focus:ring-2 focus:ring-blue-600 transition-all text-sm shadow-inner"
            />
            <button 
              onClick={handleSend}
              disabled={loading || !input.trim()}
              className="absolute right-3 top-1/2 -translate-y-1/2 w-10 h-10 bg-blue-600 text-white rounded-xl flex items-center justify-center hover:bg-blue-500 transition-all shadow-xl shadow-blue-600/30 disabled:opacity-50"
            >
              {loading ? <Loader2 size={20} className="animate-spin" /> : <Send size={20} />}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
