import { useState, useEffect, useRef } from 'react';
import { Send, User, Bot, Trash2, Zap, AlertCircle, Loader2, Globe, Server, Terminal, Sparkles, MessageCircle, Settings2, SlidersHorizontal, Paperclip, X, RefreshCw, Power, ExternalLink, ScrollText, ChevronDown } from 'lucide-react';
import { io } from 'socket.io-client';
import { motion, AnimatePresence } from 'framer-motion';
import { useApp } from '../context/AppContext';
// @ts-ignore
import ReactMarkdown from 'react-markdown';
// @ts-ignore
import remarkGfm from 'remark-gfm';
// @ts-ignore
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
// @ts-ignore
import { vscDarkPlus } from 'react-syntax-highlighter/dist/esm/styles/prism';
import SlashCommands from '../components/SlashCommands';
import RagUploader from '../components/RagUploader';
import ConfigImpact from '../components/ConfigImpact';
import { useGGUFMeta } from '../utils/useGGUFMeta';
import { MAX_CTX_LIMIT } from '../utils/configAdvisor';

interface Message {
  role: 'user' | 'assistant' | 'system';
  content: any;
  text_content?: string;
  image_url?: string;
  reasoning_content?: string;
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
  const [abortController, setAbortController] = useState<AbortController | null>(null);
  const [error, setError] = useState('');
  const [engine, setEngine] = useState<string>('llamacpp');
  // Motores efetivamente detetados na máquina (RF-020/RF-021).
  const [engines, setEngines] = useState<any[]>([]);
  const [enginesLoading, setEnginesLoading] = useState(false);
  const [engineBusy, setEngineBusy] = useState(false);
  // Logs do servidor em tempo real (RF-023/RF-024).
  const [showLogs, setShowLogs] = useState(false);
  const [logs, setLogs] = useState<{ level: string; msg: string; time: string }[]>([]);
  const logsEndRef = useRef<HTMLDivElement>(null);

  // Advanced Settings State
  const [showSettings, setShowSettings] = useState(false);
  const [systemPrompt, setSystemPrompt] = useState('');
  const [temperature, setTemperature] = useState(0.7);
  const [topP, setTopP] = useState(0.9);
  const [topK, setTopK] = useState(40);
  const [ctxSize, setCtxSize] = useState(32768);
  const [gpuLayers, setGpuLayers] = useState(99);

  const [image, setImage] = useState<string | ArrayBuffer | null>(null);

  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Limites reais do modelo GGUF selecionado (para os sliders fazerem sentido)
  const { meta: gmeta } = useGGUFMeta(engine === 'llamacpp' ? selectedModel?.path : null);
  const maxCtxSlider = gmeta?.ok && gmeta.nCtxMax ? Math.min(MAX_CTX_LIMIT, gmeta.nCtxMax) : MAX_CTX_LIMIT;
  const maxGpuLayers = gmeta?.ok && gmeta.nLayers ? Math.min(99, gmeta.nLayers) : 99;
  const ctxSliderStep = maxCtxSlider <= 16384 ? 1024 : 4096;

  // Quando os metadados do modelo chegam, ajusta valores iniciais que
  // ultrapassem os limites reais do modelo (ex.: 99 camadas num modelo de 64).
  useEffect(() => {
    if (!gmeta?.ok) return;
    if (gmeta.nCtxMax && ctxSize > Math.min(MAX_CTX_LIMIT, gmeta.nCtxMax)) setCtxSize(Math.min(MAX_CTX_LIMIT, gmeta.nCtxMax));
    if (gmeta.nLayers && gpuLayers > Math.min(99, gmeta.nLayers)) setGpuLayers(Math.min(99, gmeta.nLayers));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gmeta]);

  useEffect(() => {
    setMessages([{ role: 'assistant', content: t('chat_welcome') || 'Hello! Select a model and inference engine to start testing.', text_content: t('chat_welcome') || 'Hello! Select a model and inference engine to start testing.' }]);
  }, [t]);

  useEffect(() => {
    fetch('/api/models')
      .then(res => res.json())
      .then(data => setModels(data))
      .catch(() => setError('Failed to load models.'));
  }, []);

  /** Deteção automática dos motores instalados (RF-020). */
  const loadEngines = async () => {
    setEnginesLoading(true);
    try {
      const res = await fetch('/api/engines');
      const data = await res.json();
      const list = Array.isArray(data.engines) ? data.engines.filter((e: any) => e.installed) : [];
      setEngines(list);
      // Mantém o motor selecionado se ainda existir; senão escolhe um a correr.
      setEngine(prev => {
        if (list.some((e: any) => e.id === prev)) return prev;
        const running = list.find((e: any) => e.running) || list[0];
        return running ? running.id : prev;
      });
    } catch (e) {
      setEngines([]);
    } finally {
      setEnginesLoading(false);
    }
  };

  useEffect(() => { loadEngines(); }, []);

  // Preferência persistida "mostrar sempre os logs" (RF-023).
  useEffect(() => {
    fetch('/api/config')
      .then(r => r.json())
      .then(cfg => setShowLogs(!!cfg.showServerLogs))
      .catch(() => {});
  }, []);

  // Logs do servidor: histórico + streaming Socket.io (RF-024).
  useEffect(() => {
    fetch('/api/logs/recent?limit=150')
      .then(r => r.json())
      .then(d => setLogs(Array.isArray(d.logs) ? d.logs : []))
      .catch(() => {});
    const socket = io();
    const onLog = (entry: any) => {
      if (!entry || !entry.msg) return;
      setLogs(prev => [...prev.slice(-399), entry]);
    };
    socket.on('server-log', onLog);
    return () => { socket.off('server-log', onLog); socket.disconnect(); };
  }, []);

  useEffect(() => {
    if (showLogs) logsEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [logs, showLogs]);

  const toggleLogs = async () => {
    const next = !showLogs;
    setShowLogs(next);
    try {
      await fetch('/api/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ showServerLogs: next })
      });
    } catch (e) { /* preferência local mesmo sem servidor */ }
  };

  const activeEngine = engines.find(e => e.id === engine) || null;
  const engineReady = !!activeEngine?.running;

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleStop = () => {
      if (abortController) {
          abortController.abort();
          setAbortController(null);
          setLoading(false);
          setMessages(prev => [...prev, { role: 'system', content: '[A requisição foi cancelada pelo utilizador.]', text_content: '[A requisição foi cancelada pelo utilizador.]' }]);
      }
  };

  const handleImageChange = (event: React.ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0];
      if (file) {
          const reader = new FileReader();
          reader.onloadend = () => setImage(reader.result);
          reader.readAsDataURL(file);
      }
  };

  /** Arranca o motor selecionado (pede o modelo quando é o llama.cpp). */
  const startEngine = async (thenSend = false) => {
    if (!activeEngine) return;
    setEngineBusy(true);
    try {
      const body: any = { id: engine };
      if (engine === 'llamacpp') {
        if (!selectedModel?.path) {
          alert(t('test_selectModelFirst') || 'Selecione um modelo GGUF na lista antes de iniciar o motor.');
          return;
        }
        body.modelPath = selectedModel.path;
        body.ctx = ctxSize;
        body.ngl = gpuLayers;
      }
      const res = await fetch('/api/engines/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      });
      const data = await res.json();
      if (!data.success) {
        alert(data.error || 'Não foi possível iniciar o motor.');
        return;
      }
      await loadEngines();
      if (thenSend) {
        // RF-026: depois de iniciar, envia a mensagem automaticamente.
        setTimeout(() => { handleSend(true); }, 400);
      }
    } catch (err) {
      alert('Erro ao iniciar o motor: ' + err);
    } finally {
      setEngineBusy(false);
    }
  };

  /** Para o motor selecionado; `unloadOnly` só descarrega os modelos (RF-025). */
  const stopEngine = async (unloadOnly = false) => {
    if (!activeEngine) return;
    setEngineBusy(true);
    try {
      const res = await fetch('/api/engines/stop', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: engine, unloadOnly })
      });
      const data = await res.json();
      if (data.error) alert(data.error);
      await loadEngines();
    } catch (err) {
      alert('Erro ao parar o motor: ' + err);
    } finally {
      setEngineBusy(false);
    }
  };

  /** Abre a UI web do motor; se estiver parado, arranca primeiro (RF-022). */
  const handleOpenEngineUI = async () => {
    if (!activeEngine) return;
    const url = activeEngine.uiUrl || activeEngine.openWebUiUrl || activeEngine.details?.serverUrl || null;
    if (!activeEngine.running) {
      if (!confirm(t('test_startToOpenUi') || 'O motor está parado. Iniciar agora e abrir a UI web?')) return;
      await startEngine(false);
      setTimeout(() => {
        const target = url || activeEngine.uiUrl || activeEngine.details?.serverUrl;
        if (target) window.open(target, '_blank');
        else alert(t('test_noWebUi') || 'Este motor não expõe uma UI web.');
      }, 1200);
      return;
    }
    if (url) window.open(url, '_blank');
    else alert(t('test_noWebUi') || 'Este motor não expõe uma UI web.');
  };

  const handleSend = async (force = false) => {
    if ((!input.trim() && !image) || !selectedModel || loading) return;

    const userMsgText = input.trim();

    const userMsg: Message = { 
        role: 'user', 
        content: image ? [
            { type: 'text', text: userMsgText },
            { type: 'image_url', image_url: { url: image } }
        ] : userMsgText,
        text_content: userMsgText,
        image_url: image as string
    };
    const currentMessages = [...messages, userMsg];
    setMessages(currentMessages);
    setInput('');
    setImage(null);
    setLoading(true);
    setError('');

    const controller = new AbortController();
    setAbortController(controller);

    try {
      const isAnalyze = userMsgText.startsWith('/analyze ');
      if (isAnalyze) {
          const question = userMsgText.replace('/analyze ', '');
          setMessages(prev => [...prev, { role: 'system', content: `Iniciando análise profunda (Map-Reduce) do documento. Isso dividirá o arquivo em pedaços pequenos para economizar memória VRAM. Pode demorar alguns instantes...`, text_content: `Iniciando análise profunda (Map-Reduce)...` }]);
          
          const modelId = engine === 'llamacpp' ? selectedModel.path : (selectedModel?.ollamaTag || selectedModel?.name);
          
          const res = await fetch('/api/documents/analyze', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              signal: controller.signal,
              body: JSON.stringify({
                  userQuestion: question,
                  modelId: modelId,
                  engineType: engine === 'llamacpp' ? 'llama.cpp' : engine,
                  ctxSize: ctxSize
              })
          });
          
          const data = await res.json();
          if (!res.ok || data.error) throw new Error(data.error || 'Erro ao analisar documento.');
          
          setMessages(prev => [...prev, {
              role: 'assistant',
              content: `*(Análise Completa de ${data.chunksProcessed} partes)*\n\n${data.answer}`,
              text_content: `*(Análise Completa de ${data.chunksProcessed} partes)*\n\n${data.answer}`
          }]);
          
          setLoading(false);
          setAbortController(null);
          return;
      }

      // RF-026: o envio só acontece com o motor detetado a correr (exceto no
      // reenvio automático logo após o arranque do motor, que passa force=true).
      if (!engineReady && !force) {
          const msg = t('test_engineOfflineHint') || 'O motor selecionado não está a correr. Inicie o motor para enviar mensagens.';
          setError(t('test_engineOffline') || 'Motor parado');
          setMessages(prev => [...prev, { role: 'system', content: msg, text_content: msg }]);
          setLoading(false);
          setAbortController(null);
          return;
      }

      // Prepare OpenAI format payload com Auto-Compaction (Sliding Window)
      // Estima a contagem de tokens (1 token ≈ 4 caracteres em média)
      const estimateTokens = (text: string) => Math.ceil((text || '').length / 4);
      
      // Reserva 20% do contexto para a resposta da IA (margem de segurança)
      const MAX_TOKENS_FOR_HISTORY = Math.floor(ctxSize * 0.8);
      let currentTokenCount = systemPrompt ? estimateTokens(systemPrompt) : 0;
      
      const prunedMessages = [];
      const filterSystem = currentMessages.filter(m => m.role !== 'system');
      
      // Adiciona as mensagens de trás para frente (da mais recente para a mais antiga)
      for (let i = filterSystem.length - 1; i >= 0; i--) {
          const msg = filterSystem[i];
          const contentStr = typeof msg.content === 'string' ? msg.content : JSON.stringify(msg.content);
          const msgTokens = estimateTokens(contentStr);
          
          if (currentTokenCount + msgTokens > MAX_TOKENS_FOR_HISTORY) {
              console.warn('Contexto cheio! Mensagens antigas foram ocultadas desta requisição para evitar erro 400.');
              break;
          }
          
          currentTokenCount += msgTokens;
          prunedMessages.unshift({ role: msg.role, content: msg.content });
      }
      
      const chatHistory = prunedMessages;

      if (systemPrompt) {
          chatHistory.unshift({ role: 'system', content: systemPrompt });
      }

      const modelId = engine === 'llamacpp' ? selectedModel.path : (selectedModel?.ollamaTag || selectedModel?.name);

      const startTime = Date.now();
      const res = await fetch('/v1/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: controller.signal,
        body: JSON.stringify({ 
          model: modelId,
          messages: chatHistory,
          temperature,
          top_p: topP,
          top_k: topK,
          num_ctx: ctxSize,
          stream: false // Using static fetch for simplicity in this phase
        })
      });
      
      const rawText = await res.text();
      let data;
      try {
          data = JSON.parse(rawText);
      } catch(err) {
          throw new Error(`Resposta inválida do servidor (Status ${res.status}): ${rawText.substring(0, 200)}`);
      }
      
      if (data.error) throw new Error(data.error);
      if (!res.ok && data.error) throw new Error(data.error);

      // Fallback to JSON stringify ONLY if it really seems like an invalid response structure
      const choice = data.choices?.[0];
      let messageContent = choice?.message?.content !== undefined ? choice.message.content : '';
      let reasoningContent = choice?.message?.reasoning_content || '';

      // If the main content is empty but reasoning exists, assume the model put the answer in the wrong field.
      // We move the reasoning to the main content and clear the reasoning field to avoid duplication in the UI.
      if (!messageContent.trim() && reasoningContent.trim()) {
          messageContent = reasoningContent;
          reasoningContent = '';
      }

      const assistantResponse = messageContent ? messageContent : JSON.stringify(data);

      const endTime = Date.now();

      let tps = 'N/A';
      const durationSecs = (endTime - startTime) / 1000;
      if (data.usage?.completion_tokens) {
          tps = (data.usage.completion_tokens / durationSecs).toFixed(1);
      }

      setMessages(prev => [...prev, {
          role: 'assistant',
          content: assistantResponse,
          text_content: assistantResponse,
          reasoning_content: reasoningContent,
          metrics: { tps, time: durationSecs.toFixed(1) }
      }]);
    } catch (err: any) {
      if (err.name === 'AbortError') {
          console.log('Fetch aborted');
      } else {
          setError(err.message || 'AI Server error.');
          setMessages(prev => [...prev, { role: 'system', content: 'SYSTEM ERROR: ' + (err.message || 'Error connecting to AI server.'), text_content: 'SYSTEM ERROR: ' + (err.message || 'Error connecting to AI server.') }]);
      }
    } finally {
      setLoading(false);
      setAbortController(null);
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
      <div className="w-full lg:w-[18rem] xl:w-[22rem] lg:border-r border-b lg:border-b-0 border-[var(--border)] flex flex-col p-4 md:p-6 bg-[var(--bg-surface)]/40 backdrop-blur-3xl shrink-0 z-20 overflow-y-auto max-h-[40vh] lg:max-h-full custom-scrollbar min-w-0">
        <h3 className="text-[var(--text-primary)] font-black text-[10px] md:text-xs uppercase tracking-widest mb-6 flex items-center gap-3">
          <div className="w-8 h-8 bg-blue-600/10 rounded-xl flex items-center justify-center text-blue-500 shadow-premium border border-blue-500/20">
             <Server size={14} />
          </div>
          {t('nav_test')} ENGINE
        </h3>

        {/* Motores detetados automaticamente (RF-020/RF-021) */}
        <div className="flex items-center justify-between mb-3 gap-2">
          <span className="text-[10px] font-black uppercase tracking-widest text-[var(--text-muted)]">{t('test_engines' as any)}</span>
          <button
            onClick={loadEngines}
            disabled={enginesLoading}
            className="p-1.5 rounded-lg text-[var(--text-muted)] hover:text-blue-500 hover:bg-blue-500/10 transition-colors disabled:opacity-50"
            title={t('test_refreshDetection' as any)}
          >
            <RefreshCw size={14} className={enginesLoading ? 'animate-spin' : ''} />
          </button>
        </div>

        {engines.length === 0 ? (
          <div className="mb-6 p-4 rounded-2xl bg-yellow-500/10 border border-yellow-500/20 text-yellow-500 text-[11px] font-bold leading-relaxed">
            {enginesLoading ? t('loading' as any) : (t('test_noEngines' as any) || 'Nenhum motor detetado. Instale o Ollama, llama.cpp, LM Studio ou ComfyUI.')}
          </div>
        ) : (
          <div className="flex flex-col gap-2 mb-6">
            {engines.map((e: any) => (
              <button
                key={e.id}
                onClick={() => setEngine(e.id)}
                className={`w-full flex items-center gap-3 px-4 py-3 rounded-2xl border text-[11px] font-black uppercase tracking-widest transition-all active:scale-95 min-w-0 ${
                  engine === e.id
                    ? 'bg-blue-600 text-white border-blue-500 shadow-xl shadow-blue-600/30'
                    : 'bg-[var(--bg-input)]/50 text-[var(--text-secondary)] border-[var(--border)] hover:text-[var(--text-primary)]'
                }`}
              >
                <span className={`w-2.5 h-2.5 rounded-full shrink-0 ${e.running ? 'bg-emerald-500 animate-pulse' : 'bg-[var(--text-muted)]/40'}`} />
                <span className="truncate">{e.label}</span>
                <span className="ml-auto text-[9px] opacity-80 shrink-0">{e.running ? t('coder_running' as any) : t('coder_stopped' as any)}</span>
              </button>
            ))}
          </div>
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
            if (engine === 'llamacpp') {
               const isGGUF = m.path.toLowerCase().endsWith('.gguf') || m.extension?.toLowerCase() === '.gguf';
               const isOllama = m.source === 'Ollama';
               const isComfy = m.source === 'ComfyUI';
               return isGGUF && !isOllama && !isComfy;
            }
            if (engine === 'lmstudio') return m.source !== 'ComfyUI' && m.source !== 'Ollama';
            if (engine === 'comfyui') return m.source === 'ComfyUI';
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
              <div className="font-black text-sm mb-1 group-hover:translate-x-1 transition-transform tracking-tight uppercase leading-tight break-words line-clamp-2">{model.name.split('/').pop()}</div>
              <div className="flex items-center justify-between">
                 <div className={`text-[10px] md:text-xs uppercase font-black tracking-[0.2em] opacity-60`}>{model.source}</div>
                 {selectedModel?.path === model.path && <Sparkles size={12} className="animate-pulse" />}
              </div>
            </button>
          ))}
        </div>

        {activeEngine && (
          <div className="pt-8 border-t border-[var(--border)] space-y-2">
            <div className="flex items-center justify-between gap-2 mb-3">
              <span className="text-[10px] font-black uppercase tracking-widest text-[var(--text-muted)]">{t('test_engineActions' as any)}</span>
              <span className={`flex items-center gap-1.5 text-[9px] font-black uppercase tracking-widest ${activeEngine.running ? 'text-emerald-500' : 'text-[var(--text-muted)]'}`}>
                <span className={`w-2 h-2 rounded-full ${activeEngine.running ? 'bg-emerald-500' : 'bg-[var(--text-muted)]/40'}`} />
                {activeEngine.running ? t('coder_running' as any) : t('coder_stopped' as any)}
              </span>
            </div>

            <div className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-[var(--bg-input)]/40 border border-[var(--border)] text-[10px] font-mono text-[var(--text-muted)] break-all">
              <Globe size={12} className="shrink-0" />
              <span className="truncate" title={activeEngine.uiUrl || activeEngine.details?.serverUrl || ''}>
                {activeEngine.uiUrl || activeEngine.details?.serverUrl || `127.0.0.1:${activeEngine.port}`}
              </span>
            </div>

            <button
              onClick={handleOpenEngineUI}
              disabled={engineBusy}
              className="w-full flex items-center justify-center gap-2 px-3 py-2.5 rounded-xl bg-blue-600/10 hover:bg-blue-600/20 text-blue-400 border border-blue-500/20 text-[10px] font-black uppercase tracking-widest transition-colors disabled:opacity-50"
            >
              <ExternalLink size={13} /> {t('test_openWebUi' as any)}
            </button>

            {activeEngine.running ? (
              <div className="grid grid-cols-2 gap-2">
                <button
                  onClick={() => stopEngine(false)}
                  disabled={engineBusy}
                  className="flex items-center justify-center gap-2 px-3 py-2.5 rounded-xl bg-red-500/10 hover:bg-red-500/20 text-red-400 border border-red-500/20 text-[10px] font-black uppercase tracking-widest transition-colors disabled:opacity-50"
                >
                  <Power size={13} /> {t('test_stopEngine' as any)}
                </button>
                <button
                  onClick={() => stopEngine(true)}
                  disabled={engineBusy}
                  className="flex items-center justify-center gap-2 px-3 py-2.5 rounded-xl bg-[var(--bg-input)] hover:bg-orange-500/10 text-orange-400 border border-[var(--border)] text-[10px] font-black uppercase tracking-widest transition-colors disabled:opacity-50"
                  title={t('test_unloadHint' as any)}
                >
                  <Power size={13} /> {t('test_unload' as any)}
                </button>
              </div>
            ) : (
              <button
                onClick={() => startEngine(false)}
                disabled={engineBusy}
                className="w-full flex items-center justify-center gap-2 px-3 py-2.5 rounded-xl bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-500 border border-emerald-500/20 text-[10px] font-black uppercase tracking-widest transition-colors disabled:opacity-50"
              >
                {engineBusy ? <Loader2 size={13} className="animate-spin" /> : <Power size={13} />}
                {t('test_startEngine' as any)}
              </button>
            )}

            <button
              onClick={toggleLogs}
              className={`w-full flex items-center justify-center gap-2 px-3 py-2.5 rounded-xl border text-[10px] font-black uppercase tracking-widest transition-colors ${
                showLogs ? 'bg-purple-600/20 text-purple-300 border-purple-500/30' : 'bg-[var(--bg-input)] text-[var(--text-muted)] border-[var(--border)] hover:text-[var(--text-primary)]'
              }`}
            >
              <ScrollText size={13} /> {showLogs ? t('test_hideLogs' as any) : t('test_showLogs' as any)}
              <ChevronDown size={12} className={`transition-transform ${showLogs ? 'rotate-180' : ''}`} />
            </button>
          </div>
        )}
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
              <h2 className="text-3xl sm:text-5xl md:text-7xl font-black text-[var(--text-primary)] mb-6 uppercase tracking-tighter leading-none">{t('dash_ready')}</h2>
                <p className="text-[var(--text-secondary)] max-w-md text-xl font-medium leading-relaxed opacity-80">{t('chat_selectToBegin') || 'Select a model and engine to start a local conversation.'}</p>
                <div className="mt-12 flex gap-4">
                   <div className="w-3 h-3 rounded-full bg-blue-500 animate-bounce" />
                   <div className="w-3 h-3 rounded-full bg-blue-500 animate-bounce [animation-delay:0.2s]" />
                   <div className="w-3 h-3 rounded-full bg-blue-500 animate-bounce [animation-delay:0.4s]" />
                </div>
             </motion.div>
          )}
        </AnimatePresence>

        <header className="h-20 md:h-28 border-b border-[var(--border)] flex items-center justify-between px-4 sm:px-6 md:px-10 xl:px-16 bg-[var(--bg-surface)]/60 backdrop-blur-3xl shrink-0 z-10 shadow-premium gap-4">
           <div className="flex items-center gap-4 md:gap-8 min-w-0 flex-1">
              <div className="w-14 h-14 sm:w-16 sm:h-16 bg-gradient-to-br from-blue-600 to-indigo-700 rounded-[1.5rem] flex items-center justify-center text-white shadow-premium shrink-0">
                 <Bot size={28} className="sm:w-8 sm:h-8" />
              </div>
              <div className="hidden sm:block min-w-0">
                <div className="text-lg sm:text-xl md:text-2xl font-black text-[var(--text-primary)] truncate max-w-[10rem] sm:max-w-[12rem] md:max-w-[16rem] lg:max-w-2xl tracking-tighter leading-none mb-1 uppercase" title={selectedModel?.name.split('/').pop() || 'IDLE ENGINE'}>{selectedModel?.name.split('/').pop() || 'IDLE ENGINE'}</div>
                 <div className="flex items-center gap-3">
                    <span className={`w-2.5 h-2.5 rounded-full shrink-0 ${engineReady ? 'bg-emerald-500 animate-pulse shadow-[0_0_10px_rgba(16,185,129,0.5)]' : 'bg-[var(--text-muted)]/40'}`}></span>
                    <span className={`text-xs font-black uppercase tracking-widest truncate ${engineReady ? 'text-emerald-500' : 'text-[var(--text-muted)]'}`} title={activeEngine?.label || engine}>
                      {activeEngine?.label || engine} · {engineReady ? t('coder_running' as any) : t('coder_stopped' as any)}
                    </span>
                 </div>
              </div>
           </div>
           
           <div className="flex gap-4 shrink-0">
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
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-8 mb-8 p-6 bg-purple-500/5 border border-purple-500/20 rounded-[2rem]">
                    <div>
                      <div className="flex justify-between items-center mb-4">
                        <label className="text-xs font-black text-purple-400 uppercase tracking-widest flex items-center gap-2"><Zap size={14} /> Context Size</label>
                        <span className="text-xs font-mono font-bold text-purple-400 bg-purple-500/10 px-2 py-1 rounded border border-purple-500/20">{ctxSize}</span>
                      </div>
                    <input type="range" min="1024" max={maxCtxSlider} step={ctxSliderStep} value={ctxSize} onChange={e => setCtxSize(parseInt(e.target.value))} className="w-full accent-purple-500" />
                    <p className="text-[11px] text-[var(--text-secondary)] mt-2 font-medium">Memória da conversa (Max: {maxCtxSlider.toLocaleString('pt-PT')}). Valores altos gastam muita RAM/VRAM.</p>
                    </div>
                    <div>
                      <div className="flex justify-between items-center mb-4">
                        <label className="text-xs font-black text-purple-400 uppercase tracking-widest flex items-center gap-2"><Server size={14} /> GPU Layers</label>
                        <span className="text-xs font-mono font-bold text-purple-400 bg-purple-500/10 px-2 py-1 rounded border border-purple-500/20">{gpuLayers}</span>
                      </div>
                      <input type="range" min="0" max={maxGpuLayers} step="1" value={gpuLayers} onChange={e => setGpuLayers(parseInt(e.target.value))} className="w-full accent-purple-500" />
                      <p className="text-[11px] text-[var(--text-secondary)] mt-2 font-medium">Camadas descarregadas na Placa de Vídeo. {maxGpuLayers === 99 ? '99 = Full GPU.' : `Máx. do modelo: ${maxGpuLayers}.`}</p>
                    </div>
                  </div>

                  {engine === 'llamacpp' && (
                    <ConfigImpact
                      ctxSize={ctxSize}
                      gpuLayers={gpuLayers}
                      modelPath={selectedModel?.path}
                      kvBytesPerElement={0.5}
                      onApplyRecommendation={(rec) => { setCtxSize(rec.ctx); setGpuLayers(rec.gpuLayers); }}
                    />
                  )}

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

        {/* Painel de logs do servidor em tempo real (RF-024) */}
        <AnimatePresence>
          {showLogs && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: '14rem', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              className="shrink-0 border-b border-[var(--border)] bg-[#0A0A0A] overflow-hidden"
            >
              <div className="flex items-center justify-between px-4 py-2 border-b border-gray-800 gap-2">
                <span className="flex items-center gap-2 text-gray-400 text-[9px] md:text-[10px] font-black uppercase tracking-widest">
                  <ScrollText size={12} /> {t('test_logs' as any)}
                </span>
                <div className="flex items-center gap-3">
                  <button onClick={() => setLogs([])} className="text-[9px] font-black uppercase tracking-widest text-gray-500 hover:text-white transition-colors">
                    {t('test_clearLogs' as any)}
                  </button>
                  <button onClick={toggleLogs} className="text-gray-500 hover:text-white transition-colors" title={t('close' as any)}>
                    <X size={14} />
                  </button>
                </div>
              </div>
              <div className="h-[calc(14rem-2.6rem)] overflow-y-auto p-3 font-mono text-[10px] md:text-[11px] leading-relaxed custom-scrollbar">
                {logs.length === 0 && <div className="text-gray-600">{t('test_noLogs' as any)}</div>}
                {logs.map((log, i) => (
                  <div key={i} className={`mb-1 break-all ${log.level === 'ERROR' ? 'text-red-400' : log.level === 'WARN' ? 'text-yellow-400' : 'text-gray-400'}`}>
                    <span className="opacity-40 mr-2">[{new Date(log.time).toLocaleTimeString()}]</span>
                    <span className="font-black mr-2">[{log.level}]</span>{log.msg}
                  </div>
                ))}
                <div ref={logsEndRef} />
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        <div className="flex-1 overflow-y-auto p-4 md:p-8 space-y-8 scroll-smooth custom-scrollbar no-scrollbar bg-[radial-gradient(circle_at_top_right,var(--bg-input),transparent)]">
          {messages.map((msg, i) => {
            if (msg.role === 'system') {
              return (
                 <motion.div key={i} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="flex justify-center my-4">
                    <div className="bg-purple-500/10 border border-purple-500/20 text-purple-400 px-6 py-3 rounded-full text-xs font-black uppercase tracking-widest flex items-center gap-3 backdrop-blur-md">
                       <Zap size={14} className="fill-purple-500/50" />
                       {msg.text_content || msg.content}
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
              <div className={`flex gap-3 md:gap-4 max-w-[90%] md:max-w-4xl ${msg.role === 'user' ? 'flex-row-reverse text-right' : ''}`}>
                <div className={`w-8 h-8 md:w-10 md:h-10 rounded-xl md:rounded-[1.25rem] shrink-0 flex items-center justify-center shadow-premium transition-all duration-500 hover:scale-110 ${
                  msg.role === 'user' ? 'bg-[var(--bg-surface)] text-blue-500 border border-[var(--border)]' : 'bg-gradient-to-br from-blue-600 to-indigo-600 text-white'
                }`}>
                  {msg.role === 'user' ? <User size={18}  /> : <Bot size={18}  />}
                </div>
                <div className="flex flex-col gap-2 min-w-0">
                  <div className={`p-4 md:p-6 rounded-2xl md:rounded-[2rem] text-sm md:text-base leading-relaxed shadow-premium font-medium relative whitespace-pre-wrap break-words ${
                    msg.role === 'user'
                      ? 'bg-blue-600 text-white rounded-tr-none border border-white/10'
                      : 'bg-[var(--bg-surface)] border border-[var(--border)] text-[var(--text-primary)] rounded-tl-none backdrop-blur-3xl'
                  }`}>
                     <div className={`absolute top-2 ${msg.role === 'user' ? 'left-3' : 'right-3'} opacity-10 pointer-events-none`}>
                        {msg.role === 'user' ? <MessageCircle size={16}  /> : <Sparkles size={16}  />}
                     </div>
                     {msg.reasoning_content && (
                       <details className="mb-2">
                         <summary className="text-[10px] md:text-[11px] text-[var(--text-muted)] cursor-pointer hover:text-[var(--text-primary)] select-none">
                           Processo de Raciocínio
                         </summary>
                         <div className="mt-2 p-2 bg-[var(--bg-input)] rounded-lg text-[11px] md:text-[12px] text-[var(--text-muted)] italic border border-[var(--border)] whitespace-pre-wrap font-mono">
                           {msg.reasoning_content}
                         </div>
                       </details>
                     )}
                     {msg.image_url && (
                       <img src={msg.image_url} alt="Attached" className="rounded-xl mb-3 max-w-xs border border-[var(--border)] shadow-sm" />
                     )}
                     {msg.role === 'user' ? (
                       <span className="block mt-1 whitespace-pre-wrap">{msg.text_content || msg.content}</span>
                     ) : (
                       <div className="leading-relaxed mt-1">
                         <ReactMarkdown
                           remarkPlugins={[remarkGfm]}
                           components={{
                             h1: ({node, ...props}: any) => <h1 className="text-2xl font-bold mt-6 mb-4 text-[var(--text-primary)]" {...props} />,
                             h2: ({node, ...props}: any) => <h2 className="text-xl font-bold mt-5 mb-3 text-[var(--text-primary)]" {...props} />,
                             h3: ({node, ...props}: any) => <h3 className="text-lg font-bold mt-4 mb-2 text-[var(--text-primary)]" {...props} />,
                             ul: ({node, ...props}: any) => <ul className="list-disc list-inside my-4 space-y-2 ml-4" {...props} />,
                             ol: ({node, ...props}: any) => <ol className="list-decimal list-inside my-4 space-y-2 ml-4" {...props} />,
                             p: ({node, ...props}: any) => <p className="mb-4 last:mb-0" {...props} />,
                             a: ({node, ...props}: any) => <a className="text-blue-500 hover:underline" {...props} />,
                             strong: ({node, ...props}: any) => <strong className="font-bold text-[var(--text-primary)]" {...props} />,
                             code({node, className, children, ...props}: any) {
                               const match = /language-(\w+)/.exec(className || '');
                               const isBlock = match || String(children).includes('\n');
                               return isBlock ? (
                                 <SyntaxHighlighter {...props} children={String(children).replace(/\n$/, '')} style={vscDarkPlus as any} language={match ? match[1] : 'text'} PreTag="div" className="rounded-xl overflow-hidden my-4 border border-[var(--border)] text-sm shadow-xl" />
                               ) : (
                                 <code {...props} className={`${className || ''} bg-[var(--bg-input)] text-blue-400 px-1.5 py-0.5 rounded-md font-mono text-sm border border-[var(--border)]`}>{children}</code>
                               );
                             }
                           }}
                         >
                           {msg.text_content || msg.content}
                         </ReactMarkdown>
                       </div>
                     )}
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

        <div className="p-4 md:p-6 border-t border-[var(--border)] bg-[var(--bg-surface)]/80 backdrop-blur-3xl shadow-[0_-20px_100px_rgba(0,0,0,0.05)] shrink-0 flex flex-col items-center">
          <div className="w-full max-w-5xl flex justify-start"><RagUploader /></div>
          {image && (
              <div className="w-full max-w-5xl mb-2 flex justify-start">
                  <div className="relative w-20 h-20 bg-[var(--bg-surface)] rounded-xl border border-[var(--border)] p-1 shadow-sm">
                      <img src={String(image)} alt="Preview" className="w-full h-full object-cover rounded-lg" />
                      <button onClick={() => setImage(null)} className="absolute -top-2 -right-2 bg-red-500 text-white rounded-full p-1 shadow-lg hover:bg-red-600 transition-all">
                          <X size={12} />
                      </button>
                  </div>
              </div>
          )}

          {selectedModel && !engineReady && (
            <div className="w-full max-w-5xl mb-3 flex flex-wrap items-center justify-between gap-3 p-3 rounded-2xl bg-yellow-500/10 border border-yellow-500/20">
              <span className="flex items-center gap-2 text-yellow-500 text-[11px] font-bold leading-snug">
                <AlertCircle size={14} className="shrink-0" />
                {t('test_engineOfflineHint' as any)}
              </span>
              <button
                onClick={() => startEngine(true)}
                disabled={engineBusy}
                className="px-4 py-2 rounded-xl bg-yellow-500/20 hover:bg-yellow-500/30 text-yellow-500 text-[10px] font-black uppercase tracking-widest transition-colors disabled:opacity-50 shrink-0"
              >
                {engineBusy ? t('loading' as any) : t('test_startEngine' as any)}
              </button>
            </div>
          )}

          <div className="relative group max-w-5xl w-full mx-auto flex gap-3 md:gap-4 items-center">
            <div className="relative flex-1 min-w-0 flex items-center bg-[var(--bg-input)]/60 border border-[var(--border)] rounded-full focus-within:ring-2 focus-within:ring-blue-600/50 transition-all shadow-premium">
               <SlashCommands 
                 input={input} 
                 onSelect={(cmd) => {
                if (cmd === '/clear') { setMessages([{ role: 'assistant', content: t('chat_welcome') || 'Hello!', text_content: t('chat_welcome') || 'Hello!' }]); setInput(''); }
                else if (cmd === '/gsd') { setSystemPrompt("Você é um programador de elite. Forneça apenas código, sem explicações. Pense passo a passo mas mostre apenas a solução final."); setShowSettings(true); setInput(''); }
                else if (cmd === '/compact') { setMessages(prev => prev.slice(-4)); setInput(''); }
                else if (cmd === '/attach') { document.querySelector<HTMLInputElement>('input[accept=".pdf,.txt,.docx"]')?.click(); setInput(''); }
                    else if (cmd === '/info') {
                        const infoMsg = `🧠 **Modelo Ativo:** ${selectedModel?.name || 'Nenhum'}\n⚙️ **Motor:** ${engine}\n⚡ **Contexto Atual:** ${ctxSize} tokens`;
                        setMessages(prev => [...prev, { role: 'system', content: infoMsg, text_content: infoMsg }]);
                    setInput('');
                    }
                    else if (cmd === '/ajuda') {
                    const helpMsg = `**Comandos Disponíveis:**\n- **/gsd**: Modo programador de elite\n- **/clear**: Limpa o chat\n- **/compact**: Limpa mensagens antigas para poupar VRAM\n- **/attach**: Anexar documentos (RAG)\n- **/analyze**: Analisar arquivo grande com Map-Reduce\n- **/info**: Status do modelo e motor\n- **/context**: Ajustar tamanho de contexto (Tokens)`;
                        setMessages(prev => [...prev, { role: 'system', content: helpMsg, text_content: helpMsg }]);
                    setInput('');
                }
                else if (cmd === '/analyze') {
                    setInput('/analyze ');
                    }
                    else if (cmd === '/context') {
                        setShowSettings(true);
                    setInput('');
                    }
                 }} 
               />
               <label className="p-3 md:p-4 transition-colors shrink-0 cursor-pointer text-[var(--text-muted)] hover:text-blue-500" title="Anexar Imagem para Modelos de Visão">
                 <Paperclip size={20} />
                 <input type="file" accept="image/*" className="hidden" onChange={handleImageChange} />
               </label>
               <input 
                 type="text" 
                 value={input}
                 disabled={loading}
                 onChange={(e) => setInput(e.target.value)}
                 onKeyDown={(e) => e.key === 'Enter' && handleSend()}
                 placeholder={selectedModel ? `Message ${selectedModel.name.split('/').pop()}...` : t('chat_selectToBegin')}
                 className="w-full bg-transparent py-3 md:py-4 pl-2 pr-12 text-[var(--text-primary)] focus:outline-none text-sm md:text-base font-medium placeholder:text-[var(--text-muted)] placeholder:font-black placeholder:uppercase placeholder:tracking-widest placeholder:text-[10px] md:placeholder:text-xs truncate"
               />
            </div>
            {loading ? (
                <button
                  onClick={handleStop}
                  className="w-12 h-12 md:w-14 md:h-14 bg-red-600/90 text-white rounded-full shrink-0 flex items-center justify-center hover:bg-red-500 transition-all shadow-premium active:scale-90"
                >
                  <div className="w-4 h-4 bg-white rounded-sm" />
                </button>
            ) : (
                <button
                  onClick={() => handleSend()}
                  disabled={!input.trim() && !image}
                  className="w-12 h-12 md:w-14 md:h-14 bg-blue-600 text-white rounded-full shrink-0 flex items-center justify-center hover:bg-blue-500 transition-all shadow-premium active:scale-90 disabled:opacity-50 disabled:grayscale"
                >
                  <Send size={20} className="ml-1" />
                </button>
            )}
          </div>
        </div>
      </div>
    </motion.div>
  );
}
