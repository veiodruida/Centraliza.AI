import React, { useState, useEffect } from 'react';
import { useApp } from '../context/AppContext';
import { Terminal, GitBranch, Code2, Play, Square, Loader2, CheckCircle2, Box, Settings2, Zap, Server } from 'lucide-react';

export default function Coder() {
    const { t } = useApp();
    const [models, setModels] = useState<any[]>([]);
    const [activeModel, setActiveModel] = useState('');
    const [engineStatus, setEngineStatus] = useState({ running: false, model: null });
    const [loadingEngine, setLoadingEngine] = useState(false);
    const [coderStatus, setCoderStatus] = useState({ installed: false, version: 'unknown' });
    const [isSyncing, setIsSyncing] = useState(false);
    const [showSettings, setShowSettings] = useState(false);
    const [ctxSize, setCtxSize] = useState(8192);
    const [gpuLayers, setGpuLayers] = useState(99);

    useEffect(() => {
        // 1. Traz SÓ a lista limpa filtrada no backend
        fetch('/api/models?filter=coder')
            .then(r => r.json())
            .then(data => setModels(data));

        // 2. Estado do motor (llama.cpp)
        fetch('/api/inference/status')
            .then(r => r.json())
            .then(data => setEngineStatus(data));
            
        // 3. Modelo ativo atual
        fetch('/api/active-model')
            .then(r => r.json())
            .then(data => { if (data.activeModel) setActiveModel(data.activeModel); });

        // 4. Status do Agente Coder
        fetch('/api/coder/status')
            .then(r => r.json())
            .then(setCoderStatus);
    }, []);

    const handleModelChange = async (e: React.ChangeEvent<HTMLSelectElement>) => {
        const selected = e.target.value;
        setActiveModel(selected);
        await fetch('/api/active-model', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ model: selected })
        });
    };

    const handleStartEngine = async () => {
        setLoadingEngine(true);
        try {
            const res = await fetch('/api/inference/start', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                // Para agentes de código, precisamos de muito contexto e aceleração na GPU
                body: JSON.stringify({ modelPath: activeModel, ctx: ctxSize, ngl: gpuLayers })
            });
            const data = await res.json();
            if (data.success) {
                setEngineStatus({ running: true, model: activeModel as any });
            } else {
                alert(data.error);
            }
        } finally {
            setLoadingEngine(false);
        }
    };

    const handleStopEngine = async () => {
        setLoadingEngine(true);
        try {
            await fetch('/api/inference/stop', { method: 'POST' });
            setEngineStatus({ running: false, model: null });
        } finally {
            setLoadingEngine(false);
        }
    };

    const handleSync = async () => {
        setIsSyncing(true);
        try {
            await fetch('/api/coder/sync', { method: 'POST' });
            const res = await fetch('/api/coder/status');
            const data = await res.json();
            setCoderStatus(data);
        } catch (err) {
            alert('Erro na sincronização: ' + err);
        } finally {
            setIsSyncing(false);
        }
    };

    const handleSetupContinue = async () => {
        const res = await fetch('/api/coder/setup-continue', { method: 'POST' });
        const data = await res.json();
        if (data.success && data.installUri) {
            window.location.href = data.installUri;
        }
    };

    const handleSetupRoo = async () => {
        const res = await fetch('/api/coder/setup-roo');
        const data = await res.json();
        if (data.success && data.installUri) {
            window.location.href = data.installUri;
            alert(`Configure no Roo Code:\nURL: ${data.instructions.baseUrl}\nAPI Key: ${data.instructions.apiKey}\nModel ID: ${data.instructions.modelId}`);
        }
    };

    const needsEngine = activeModel.toLowerCase().endsWith('.gguf') || activeModel.includes('\\') || activeModel.includes('/');
    const isEngineRunningForActiveModel = engineStatus.running && engineStatus.model === activeModel;

    return (
        <div className="p-6 md:p-12 max-w-[100rem] mx-auto space-y-8 animate-fade-in">
            <header className="mb-8">
                <h1 className="text-3xl md:text-5xl font-black text-[var(--text-primary)] tracking-tighter uppercase flex items-center gap-4">
                    <Terminal className="text-blue-500" size={40} />
                    {t('coder_title' as any)}
                </h1>
                <p className="text-[var(--text-secondary)] text-lg mt-2">{t('coder_subtitle' as any)}</p>
            </header>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                {/* Cérebro (IA Local) */}
                <div className="bg-[var(--bg-surface)] rounded-[2rem] border border-[var(--border)] p-8 shadow-xl relative overflow-hidden flex flex-col group">
                    <div className="flex items-center justify-between mb-4">
                        <div className="flex items-center gap-3">
                            <Box size={28} className="text-purple-500 group-hover:rotate-12 transition-transform" />
                            <h2 className="text-2xl font-black text-[var(--text-primary)] uppercase tracking-tighter">Cérebro (IA Local)</h2>
                        </div>
                        {needsEngine && (
                            <button onClick={() => setShowSettings(!showSettings)} className={`p-2.5 rounded-xl transition-colors border active:scale-95 ${showSettings ? 'bg-blue-600 text-white border-blue-500' : 'bg-[var(--bg-input)] text-[var(--text-muted)] hover:text-[var(--text-primary)] border-[var(--border)]'}`} title="Configurações do Motor">
                                <Settings2 size={18} />
                            </button>
                        )}
                    </div>
                    <p className="text-[var(--text-secondary)] mb-6 leading-relaxed">
                        Selecione o modelo de raciocínio que o agente e os editores irão utilizar através do Gateway.
                    </p>

                    <div className="space-y-4 flex-1">
                        <label className="block text-[11px] font-black text-[var(--text-muted)] uppercase tracking-widest">
                            Inteligência Ativa
                        </label>
                        <select 
                            value={activeModel} 
                            onChange={handleModelChange}
                            className="w-full p-4 bg-[var(--bg-input)] border border-[var(--border)] rounded-2xl focus:ring-2 focus:ring-blue-500 text-[var(--text-primary)] transition-all outline-none"
                        >
                            <option value="">Selecione o modelo...</option>
                            {models.map(m => (
                                <option key={m.path} value={m.ollamaTag || m.path}>
                                    {m.name} {m.hasVision ? '(👁️ Vision)' : ''}
                                </option>
                            ))}
                        </select>
                    </div>

                    {needsEngine && showSettings && (
                        <div className="mt-6 p-6 bg-[var(--bg-input)]/50 border border-[var(--border)] rounded-2xl space-y-6">
                            <div>
                                <div className="flex justify-between items-center mb-4">
                                    <label className="text-xs font-black text-purple-400 uppercase tracking-widest flex items-center gap-2"><Zap size={14} /> Context Size</label>
                                    <span className="text-xs font-mono font-bold text-purple-400 bg-purple-500/10 px-2 py-1 rounded border border-purple-500/20">{ctxSize}</span>
                                </div>
                                <input type="range" min="1024" max="32768" step="1024" value={ctxSize} onChange={e => setCtxSize(parseInt(e.target.value))} className="w-full accent-purple-500" />
                                <p className="text-[10px] text-[var(--text-muted)] mt-2 font-medium">Tamanho da memória de contexto. Agentes de código precisam de valores altos (recomendado 8192+).</p>
                            </div>
                            <div>
                                <div className="flex justify-between items-center mb-4">
                                    <label className="text-xs font-black text-purple-400 uppercase tracking-widest flex items-center gap-2"><Server size={14} /> GPU Layers</label>
                                    <span className="text-xs font-mono font-bold text-purple-400 bg-purple-500/10 px-2 py-1 rounded border border-purple-500/20">{gpuLayers}</span>
                                </div>
                                <input type="range" min="0" max="99" step="1" value={gpuLayers} onChange={e => setGpuLayers(parseInt(e.target.value))} className="w-full accent-purple-500" />
                                <p className="text-[10px] text-[var(--text-muted)] mt-2 font-medium">Aceleração via Placa de Vídeo. 99 = Full GPU.</p>
                            </div>
                        </div>
                    )}

                    <div className="mt-8 pt-8 border-t border-[var(--border)]">
                        {!activeModel ? (
                            <div className="text-center text-[var(--text-muted)] text-sm font-medium">Selecione um modelo acima para gerir o motor.</div>
                        ) : needsEngine ? (
                            isEngineRunningForActiveModel ? (
                                <div className="flex items-center justify-between gap-4">
                                    <div className="flex items-center gap-3 px-6 py-4 bg-emerald-500/10 text-emerald-500 rounded-2xl border border-emerald-500/20 font-bold uppercase tracking-wider text-sm w-full">
                                        <span className="relative flex h-3 w-3">
                                            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                                            <span className="relative inline-flex rounded-full h-3 w-3 bg-emerald-500"></span>
                                        </span>
                                        {t('coder_engine_running' as any)}
                                    </div>
                                    <button onClick={handleStopEngine} disabled={loadingEngine} className="p-4 bg-red-500/10 text-red-500 hover:bg-red-500/20 border border-red-500/20 rounded-2xl transition-colors disabled:opacity-50" title={t('coder_stop_engine' as any)}>
                                        <Square size={20} className="fill-current" />
                                    </button>
                                </div>
                            ) : (
                                <button onClick={handleStartEngine} disabled={loadingEngine || !activeModel} className="w-full py-4 bg-blue-600 hover:bg-blue-500 text-white rounded-2xl font-bold uppercase tracking-widest transition-all shadow-xl shadow-blue-600/20 disabled:opacity-50 flex items-center justify-center gap-3">
                                    {loadingEngine ? <Loader2 className="animate-spin" size={20} /> : <Play size={20} className="fill-current" />}
                                    {loadingEngine ? t('loading' as any) : t('coder_start_engine' as any)}
                                </button>
                            )
                        ) : (
                            <div className="flex items-center justify-center gap-3 px-6 py-4 bg-[var(--bg-input)] text-[var(--text-muted)] rounded-2xl border border-[var(--border)] font-bold uppercase tracking-wider text-xs w-full text-center">
                                <CheckCircle2 size={16} />
                                Gerido Automaticamente (Ollama)
                            </div>
                        )}
                    </div>
                </div>

                {/* Integração e Agente */}
                <div className="space-y-8">
                    {/* Agente CLI */}
                    <div className="bg-[var(--bg-surface)] rounded-[2rem] border border-[var(--border)] p-8 shadow-xl flex flex-col relative group">
                        <div className="flex items-center justify-between mb-4">
                            <div className="flex items-center gap-3">
                                <Terminal size={28} className="text-blue-500 group-hover:-translate-y-1 transition-transform" />
                                <h2 className="text-2xl font-black text-[var(--text-primary)] uppercase tracking-tighter">Agente CLI</h2>
                            </div>
                            <div>
                                {coderStatus.installed ? (
                                    <span className="px-4 py-1.5 bg-emerald-500/10 text-emerald-500 text-[10px] font-black uppercase tracking-widest rounded-full flex items-center gap-2 border border-emerald-500/20">
                                        <CheckCircle2 size={14} />
                                        {t('coder_status_installed' as any, { version: coderStatus.version })}
                                    </span>
                                ) : (
                                    <span className="px-4 py-1.5 bg-[var(--bg-input)] text-[var(--text-muted)] text-[10px] font-black uppercase tracking-widest rounded-full border border-[var(--border)]">
                                        {t('coder_status_missing' as any)}
                                    </span>
                                )}
                            </div>
                        </div>
                        
                        <p className="text-[var(--text-secondary)] leading-relaxed mb-8">
                            {t('coder_help_text' as any)}
                        </p>

                        <button 
                            onClick={handleSync} 
                            disabled={isSyncing}
                            className="w-full py-4 bg-[var(--text-primary)] hover:bg-[var(--text-secondary)] text-[var(--bg-base)] rounded-2xl font-bold uppercase tracking-widest transition-all shadow-xl disabled:opacity-50 flex items-center justify-center gap-3 mt-auto"
                        >
                            {isSyncing ? <Loader2 className="animate-spin" size={20} /> : <GitBranch size={20} />}
                            {isSyncing ? 'Sincronizando...' : t('coder_sync_btn' as any)}
                        </button>
                    </div>

                    {/* Extensões */}
                    <div className="bg-[var(--bg-surface)] rounded-[2rem] border border-[var(--border)] p-8 shadow-xl group">
                        <div className="flex items-center gap-3 mb-4">
                            <Code2 size={28} className="text-indigo-500 group-hover:scale-110 transition-transform" />
                            <h2 className="text-2xl font-black text-[var(--text-primary)] uppercase tracking-tighter">Editores</h2>
                        </div>
                        <p className="text-[var(--text-secondary)] mb-6 leading-relaxed">
                            Configure automaticamente as extensões suportadas no VS Code para usar o Gateway do Centraliza.
                        </p>
                        
                        <div className="flex gap-4">
                            <button onClick={handleSetupContinue} className="flex-1 py-4 bg-indigo-500/10 hover:bg-indigo-500/20 text-indigo-500 rounded-2xl font-bold uppercase tracking-widest transition-colors border border-indigo-500/20 text-[11px] flex items-center justify-center gap-2">
                                Continue.dev
                            </button>
                            <button onClick={handleSetupRoo} className="flex-1 py-4 bg-purple-500/10 hover:bg-purple-500/20 text-purple-500 rounded-2xl font-bold uppercase tracking-widest transition-colors border border-purple-500/20 text-[11px] flex items-center justify-center gap-2">
                                Roo Code
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}