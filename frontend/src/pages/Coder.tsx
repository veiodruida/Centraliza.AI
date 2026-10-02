import React, { useState, useEffect, useRef } from 'react';
import { useApp } from '../context/AppContext';
import { Tooltip } from 'react-tooltip';
import 'react-tooltip/dist/react-tooltip.css';
import { Terminal, GitBranch, Code2, Play, Square, Loader2, CheckCircle2, Box, Settings2, Zap, Server, AlertTriangle, Activity, X, Save, Cpu, FileCog, Plus, FolderSearch } from 'lucide-react';
import ConfigImpact from '../components/ConfigImpact';
import { useGGUFMeta } from '../utils/useGGUFMeta';
import { MAX_CTX_LIMIT } from '../utils/configAdvisor';

interface LlamaParam { id: number; arg: string; value: string; enabled: boolean; }

// ---- Catálogo de parâmetros do llama-server (seletor + tooltips) ----
type ParamType = 'int' | 'float' | 'string' | 'enum' | 'path' | 'flag';

interface ParamInfo {
    label: string;    // nome exibido no seletor (ex.: "-t / --threads")
    group: string;    // categoria (chave de grupo)
    type: ParamType;  // tipo de valor aceite
    examples?: string; // exemplos de valor (tooltip / placeholder)
    default?: string; // valor padrão (pré-preenchido ao selecionar)
    values?: string;  // valores permitidos (para tipo enum)
    // a descrição (prosa) fica no i18n: chave derivada da flag, ex.: "coder_pm_ngl_desc"
}

const PARAM_GROUPS: { key: string; labelKey: string; params: string[] }[] = [
    { key: 'perf', labelKey: 'coder_param_grp_perf', params: ['-t', '-tb', '-ngl', '-c', '-b', '-ub', '-n', '--mlock', '--no-mmap', '--numa', '-sm', '-ts', '-mg', '--flash-attn', '-ctk', '-ctv'] },
    { key: 'server', labelKey: 'coder_param_grp_server', params: ['--host', '--port', '--alias', '--api-key', '--ssl-key-file', '--ssl-cert-file', '--path', '-to', '--threads-http', '-np', '-cb', '--metrics', '--slots', '--no-webui', '--no-display-prompt', '--jinja'] },
    { key: 'sampling', labelKey: 'coder_param_grp_sampling', params: ['-s', '--temp', '--top-k', '--top-p', '--min-p', '--typical-p', '--repeat-penalty', '--repeat-last-n', '--presence-penalty', '--frequency-penalty', '--mirostat', '--mirostat-tau', '--mirostat-eta', '--penalize-nl', '--ignore-eos', '--samplers'] },
    { key: 'context', labelKey: 'coder_param_grp_context', params: ['--reasoning', '--reasoning-budget', '--rope-scaling', '--rope-freq-base', '--rope-freq-scale', '--yarn-orig-ctx', '--yarn-factor', '--no-context-shift'] },
    { key: 'model', labelKey: 'coder_param_grp_model', params: ['-m', '--chat-template', '--grammar', '-j', '-l', '--lora-scaled', '--mmproj'] },
    { key: 'logs', labelKey: 'coder_param_grp_logs', params: ['--log-disable', '--log-format', '--log-file', '--verbose', '--no-warmup', '--simple-io'] },
];

const PARAM_INFO: Record<string, ParamInfo> = {
    // ⚡ Desempenho & CPU/GPU
    '-t': { label: '-t / --threads', group: 'perf', type: 'int', examples: '4, 8, 16, $physicalCores', default: '$physicalCores' },
    '-tb': { label: '-tb / --threads-batch', group: 'perf', type: 'int', examples: '8, 16', default: '$physicalCores' },
    '-ngl': { label: '-ngl / --n-gpu-layers', group: 'perf', type: 'int', examples: '0, 24, 99', default: '99' },
    '-c': { label: '-c / --ctx-size', group: 'perf', type: 'int', examples: '8192, 32768, 131072', default: '32768' },
    '-b': { label: '-b / --batch-size', group: 'perf', type: 'int', examples: '512, 2048, 4096', default: '2048' },
    '-ub': { label: '-ub / --ubatch-size', group: 'perf', type: 'int', examples: '512, 1024, 2048', default: '512' },
    '-n': { label: '-n / --predict', group: 'perf', type: 'int', examples: '512, 2048, -1', default: '-1' },
    '--mlock': { label: '--mlock', group: 'perf', type: 'flag' },
    '--no-mmap': { label: '--no-mmap', group: 'perf', type: 'flag' },
    '--numa': { label: '--numa', group: 'perf', type: 'flag' },
    '-sm': { label: '-sm / --split-mode', group: 'perf', type: 'enum', values: 'layer, row, none', default: 'layer' },
    '-ts': { label: '-ts / --tensor-split', group: 'perf', type: 'string', examples: '0.5,0.5 · 0.7,0.3' },
    '-mg': { label: '-mg / --main-gpu', group: 'perf', type: 'int', examples: '0, 1', default: '0' },
    '--flash-attn': { label: '--flash-attn', group: 'perf', type: 'enum', values: 'auto, on, off, full', default: 'auto' },
    '-ctk': { label: '-ctk / --cache-type-k', group: 'perf', type: 'enum', values: 'f16, q8_0, q4_0, q4_1, q5_0, q5_1, q6_k, q8_k', default: 'f16' },
    '-ctv': { label: '-ctv / --cache-type-v', group: 'perf', type: 'enum', values: 'f16, q8_0, q4_0, q4_1, q5_0, q5_1, q6_k, q8_k', default: 'f16' },
    // 🌐 Servidor & Rede
    '--host': { label: '--host', group: 'server', type: 'string', examples: '0.0.0.0 (todos) · 127.0.0.1 (só local)', default: '127.0.0.1' },
    '--port': { label: '--port', group: 'server', type: 'int', examples: '8080, 8000', default: '8080' },
    '--alias': { label: '--alias', group: 'server', type: 'string', examples: 'qwen, llama-3' },
    '--api-key': { label: '--api-key', group: 'server', type: 'string', examples: 'minha-chave-secreta' },
    '--ssl-key-file': { label: '--ssl-key-file', group: 'server', type: 'path', examples: 'C:/certs/privkey.pem' },
    '--ssl-cert-file': { label: '--ssl-cert-file', group: 'server', type: 'path', examples: 'C:/certs/cert.pem' },
    '--path': { label: '--path', group: 'server', type: 'path', examples: 'C:/AI_Models', default: 'models/' },
    '-to': { label: '-to / --timeout', group: 'server', type: 'int', examples: '30, 60, 600', default: '600' },
    '--threads-http': { label: '--threads-http', group: 'server', type: 'int', examples: '8, 16', default: '$physicalCores' },
    '-np': { label: '-np / --parallel', group: 'server', type: 'int', examples: '1, 4, 8', default: '1' },
    '-cb': { label: '-cb / --cont-batching', group: 'server', type: 'enum', values: 'auto, on, off', default: 'auto' },
    '--metrics': { label: '--metrics', group: 'server', type: 'flag' },
    '--slots': { label: '--slots', group: 'server', type: 'flag' },
    '--no-webui': { label: '--no-webui', group: 'server', type: 'flag' },
    '--no-display-prompt': { label: '--no-display-prompt', group: 'server', type: 'flag' },
    '--jinja': { label: '--jinja', group: 'server', type: 'flag' },
    // 🎲 Amostragem & Criatividade
    '-s': { label: '-s / --seed', group: 'sampling', type: 'int', examples: '42, 12345, -1', default: '-1' },
    '--temp': { label: '--temp / --temperature', group: 'sampling', type: 'float', examples: '0.2, 0.7, 1.2', default: '0.8' },
    '--top-k': { label: '--top-k', group: 'sampling', type: 'int', examples: '40, 100, 0 (desligado)', default: '40' },
    '--top-p': { label: '--top-p', group: 'sampling', type: 'float', examples: '0.90, 0.95, 1.0', default: '0.95' },
    '--min-p': { label: '--min-p', group: 'sampling', type: 'float', examples: '0.05, 0.10', default: '0.05' },
    '--typical-p': { label: '--typical-p', group: 'sampling', type: 'float', examples: '0.95, 1.0', default: '1.0' },
    '--repeat-penalty': { label: '--repeat-penalty', group: 'sampling', type: 'float', examples: '1.1, 1.3', default: '1.0' },
    '--repeat-last-n': { label: '--repeat-last-n', group: 'sampling', type: 'int', examples: '64, 256, 0 (todos)', default: '64' },
    '--presence-penalty': { label: '--presence-penalty', group: 'sampling', type: 'float', examples: '0.1, 0.5', default: '0.0' },
    '--frequency-penalty': { label: '--frequency-penalty', group: 'sampling', type: 'float', examples: '0.1, 0.5', default: '0.0' },
    '--mirostat': { label: '--mirostat', group: 'sampling', type: 'enum', values: '0, 1, 2', default: '0' },
    '--mirostat-tau': { label: '--mirostat-tau', group: 'sampling', type: 'float', examples: '5.0', default: '5.0' },
    '--mirostat-eta': { label: '--mirostat-eta', group: 'sampling', type: 'float', examples: '0.1', default: '0.1' },
    '--penalize-nl': { label: '--penalize-nl', group: 'sampling', type: 'flag' },
    '--ignore-eos': { label: '--ignore-eos', group: 'sampling', type: 'flag' },
    '--samplers': { label: '--samplers', group: 'sampling', type: 'string', examples: 'top_k;top_p;min_p;temp', default: 'top_k;top_p;min_p;temp' },
    // 🧠 Contexto & Raciocínio
    '--reasoning': { label: '--reasoning', group: 'context', type: 'enum', values: 'none, on, off, budget, deep', default: 'off' },
    '--reasoning-budget': { label: '--reasoning-budget', group: 'context', type: 'int', examples: '1024, 2048', default: '2048' },
    '--rope-scaling': { label: '--rope-scaling', group: 'context', type: 'enum', values: 'none, linear, yarn', default: 'none' },
    '--rope-freq-base': { label: '--rope-freq-base', group: 'context', type: 'float', examples: '10000, 500000', default: '10000' },
    '--rope-freq-scale': { label: '--rope-freq-scale', group: 'context', type: 'float', examples: '0.25, 0.5, 1.0', default: '1.0' },
    '--yarn-orig-ctx': { label: '--yarn-orig-ctx', group: 'context', type: 'int', examples: '4096, 8192', default: '4096' },
    '--yarn-factor': { label: '--yarn-factor', group: 'context', type: 'float', examples: '2.0, 4.0, 8.0', default: '1.0' },
    '--no-context-shift': { label: '--no-context-shift', group: 'context', type: 'flag' },
    // 📦 Modelo & Formato
    '-m': { label: '-m / --model', group: 'model', type: 'path', examples: 'C:/AI_Models/modelo.gguf' },
    '--chat-template': { label: '--chat-template', group: 'model', type: 'string', examples: 'chatml, llama-2, deepseek-r1', default: 'auto' },
    '--grammar': { label: '--grammar', group: 'model', type: 'string', examples: 'json.gbnf, list.gbnf' },
    '-j': { label: '-j / --json-schema', group: 'model', type: 'path', examples: 'C:/schemas/output.json' },
    '-l': { label: '-l / --lora', group: 'model', type: 'path', examples: 'C:/loras/adapter.gguf' },
    '--lora-scaled': { label: '--lora-scaled', group: 'model', type: 'path', examples: 'C:/loras/adapter.gguf@0.5' },
    '--mmproj': { label: '--mmproj', group: 'model', type: 'path', examples: 'C:/models/mmproj.gguf' },
    // 📋 Logs & Diagnóstico
    '--log-disable': { label: '--log-disable', group: 'logs', type: 'flag' },
    '--log-format': { label: '--log-format', group: 'logs', type: 'enum', values: 'text, json', default: 'text' },
    '--log-file': { label: '--log-file', group: 'logs', type: 'path', examples: 'C:/logs/llama.log' },
    '--verbose': { label: '--verbose', group: 'logs', type: 'flag' },
    '--no-warmup': { label: '--no-warmup', group: 'logs', type: 'flag' },
    '--simple-io': { label: '--simple-io', group: 'logs', type: 'flag' },
};

const TYPE_LABEL_KEY: Record<ParamType, string> = {
    int: 'coder_param_type_int',
    float: 'coder_param_type_float',
    string: 'coder_param_type_string',
    enum: 'coder_param_type_enum',
    path: 'coder_param_type_path',
    flag: 'coder_param_type_flag',
};

const TYPE_SHORT: Record<ParamType, string> = {
    int: 'int', float: 'float', string: 'text', enum: 'enum', path: 'path', flag: 'flag',
};

export default function Coder() {
    const { t } = useApp();
    const [models, setModels] = useState<any[]>([]);
    const [activeModel, setActiveModel] = useState('');
    const [engineStatus, setEngineStatus] = useState({ running: false, model: null });
    const [loadingEngine, setLoadingEngine] = useState(false);
    const [coderStatus, setCoderStatus] = useState({ installed: false, version: 'unknown' });
    const [isSyncing, setIsSyncing] = useState(false);
    const [showSettings, setShowSettings] = useState(false);
    const [ctxSize, setCtxSize] = useState(32768);
    const [gpuLayers, setGpuLayers] = useState(99);
    const [logs, setLogs] = useState<{level: string, msg: string, time: string}[]>([]);
    const [showTerminal, setShowTerminal] = useState(false);
    const logsEndRef = useRef<HTMLDivElement>(null);
    // Configuração do motor (binário + parâmetros editáveis)
    const [llamaBinary, setLlamaBinary] = useState('');
    const [llamaArgList, setLlamaArgList] = useState<LlamaParam[]>([]);
    const [physicalCores, setPhysicalCores] = useState(0);
    const [binaryExists, setBinaryExists] = useState<boolean | null>(null);
    const [savingConfig, setSavingConfig] = useState(false);
    const [configSaved, setConfigSaved] = useState(false);
    const [browsing, setBrowsing] = useState(false);
    const paramIdRef = useRef(0);

    // Rótulo completo do tipo de valor (usado no tooltip)
    const typeLabel = (type: ParamType) => t(TYPE_LABEL_KEY[type] as any);

    // Chave i18n da descrição de um parâmetro (ex.: "-ngl" -> "coder_pm_ngl_desc")
    const paramDescKey = (arg: string) => `coder_pm_${arg.replace(/^-+/, '').replace(/-/g, '_')}_desc`;

    // Constrói o HTML do tooltip rico: descrição + tipo + valores permitidos + exemplos
    const buildParamTip = (arg: string, info?: ParamInfo): string => {
        if (!info) {
            return `<div class="coder-tip-title">${t('coder_param_custom' as any)}</div><div class="coder-tip-row">${t('coder_param_unknown_tip' as any)}</div>`;
        }
        let html = `<div class="coder-tip-title">${info.label}</div>`;
        html += `<div class="coder-tip-row"><b>${t('coder_param_tip_desc' as any)}:</b> ${t(paramDescKey(arg) as any)}</div>`;
        html += `<div class="coder-tip-row"><b>${t('coder_param_tip_type' as any)}:</b> ${typeLabel(info.type)}`;
        if (info.default) html += ` &nbsp;·&nbsp; <b>${t('coder_param_tip_default' as any)}:</b> <code>${info.default}</code>`;
        html += '</div>';
        if (info.values) html += `<div class="coder-tip-row"><b>${t('coder_param_tip_values' as any)}:</b> <code>${info.values}</code></div>`;
        if (info.examples) html += `<div class="coder-tip-row"><b>${t('coder_param_tip_examples' as any)}:</b> <code>${info.examples}</code></div>`;
        return html;
    };
    // DeepSeek Harness como agente sobre o motor local
    const [dshStatus, setDshStatus] = useState({ port: 3090, engineRunning: false, dshRunning: false, url: '' });
    const [dshLoading, setDshLoading] = useState(false);

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

        // 6. Status do DeepSeek Harness (agente local)
        fetch('/api/coder/dsh/status')
            .then(r => r.json())
            .then(setDshStatus)
            .catch(() => {});

        // 5. Configuração do motor (binário + args) — pré-carrega para edição
        fetch('/api/inference/config')
            .then(r => r.json())
            .then(cfg => {
                setLlamaBinary(cfg.binary || '');
                setPhysicalCores(cfg.physicalCores || 0);
                setBinaryExists(cfg.binaryExists);
                const list = (Array.isArray(cfg.argList) ? cfg.argList : []).map((x: any) => ({
                    id: paramIdRef.current++,
                    arg: String(x.arg || ''),
                    value: String(x.value || ''),
                    enabled: !!x.enabled
                }));
                setLlamaArgList(list);
            })
            .catch(() => {});
    }, []);

    useEffect(() => {
        const es = new EventSource('/api/logs/stream');
        es.onmessage = (event) => {
            try {
                const log = JSON.parse(event.data);
                setLogs(prev => {
                    const newLogs = [...prev, log];
                    return newLogs.length > 200 ? newLogs.slice(newLogs.length - 200) : newLogs;
                });
            } catch (e) {}
        };
        return () => es.close();
    }, []);

    useEffect(() => {
        if (showTerminal) {
            logsEndRef.current?.scrollIntoView({ behavior: 'smooth' });
        }
    }, [logs, showTerminal]);

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
                body: JSON.stringify({
                    modelPath: activeModel,
                    ctx: ctxSize,
                    ngl: gpuLayers,
                    binary: llamaBinary,
                    argList: serializeArgList()
                })
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

    // Lista estruturada de parâmetros → payload JSON (sem os ids locais)
    const serializeArgList = () => llamaArgList.map(({ arg, value, enabled }) => ({ arg, value, enabled }));

    const addParam = () => setLlamaArgList(l => [...l, { id: paramIdRef.current++, arg: '', value: '', enabled: true }]);
    const updateParam = (id: number, patch: Partial<LlamaParam>) => setLlamaArgList(l => l.map(p => p.id === id ? { ...p, ...patch } : p));
    const removeParam = (id: number) => setLlamaArgList(l => l.filter(p => p.id !== id));

    // Seleção de um parâmetro do catálogo: pré-preenche o valor padrão
    // (flags e parâmetros personalizados ficam sem valor).
    const handleParamSelect = (id: number, value: string) => {
        if (value === '__custom__') {
            updateParam(id, { arg: '' });
            return;
        }
        const info = PARAM_INFO[value];
        updateParam(id, {
            arg: value,
            value: info && info.type !== 'flag' && info.default ? info.default : ''
        });
    };

    // Abre o seletor nativo de pasta e preenche o binário com o llama-server da pasta escolhida
    const handleBrowseBinary = async () => {
        setBrowsing(true);
        try {
            const controller = new AbortController();
            const timer = setTimeout(() => controller.abort(), 120000);
            try {
                const res = await fetch('/api/inference/pick-binary', { signal: controller.signal });
                const data = await res.json();
                if (data && data.path) {
                    setLlamaBinary(data.path);
                    setBinaryExists(!!data.exists);
                } else if (data && data.error) {
                    const errObj = data.error;
                    const errMsg = typeof errObj === 'string' ? errObj
                        : (errObj && typeof errObj.message === 'string') ? errObj.message
                        : JSON.stringify(errObj);
                    alert('Erro ao abrir o seletor de pastas: ' + errMsg);
                }
            } finally {
                clearTimeout(timer);
            }
        } catch (err: any) {
            const msg = err && err.name === 'AbortError'
                ? 'o seletor de pastas não respondeu. Verifique se o servidor está a correr na sua sessão do Windows (não como serviço).'
                : String(err);
            alert('Erro ao procurar o binário: ' + msg);
        } finally {
            setBrowsing(false);
        }
    };

    const handleSaveEngineConfig = async () => {
        setSavingConfig(true);
        try {
            const res = await fetch('/api/inference/config', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ binary: llamaBinary, argList: serializeArgList() })
            });
            const data = await res.json();
            if (data.success) {
                setConfigSaved(true);
                setTimeout(() => setConfigSaved(false), 2500);
                // Atualiza o indicador de existência do binário
                fetch('/api/inference/config')
                    .then(r => r.json())
                    .then(cfg => { setBinaryExists(cfg.binaryExists); setPhysicalCores(cfg.physicalCores || 0); })
                    .catch(() => {});
            } else {
                alert(data.error || 'Erro ao salvar a configuração do motor.');
            }
        } catch (err) {
            alert('Erro ao salvar a configuração do motor: ' + err);
        } finally {
            setSavingConfig(false);
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

    const refreshDshStatus = () => {
        fetch('/api/coder/dsh/status')
            .then(r => r.json())
            .then(setDshStatus)
            .catch(() => {});
    };

    const handleDshOpen = async () => {
        setDshLoading(true);
        try {
            const res = await fetch('/api/coder/dsh/launch', { method: 'POST' });
            const data = await res.json();
            if (data.success && data.url) {
                setDshStatus({ port: data.port, engineRunning: true, dshRunning: true, url: data.url });
                window.open(data.url, '_blank');
            } else {
                alert(data.error || 'Erro ao abrir o DeepSeek Harness.');
            }
        } catch (err) {
            alert('Erro ao abrir o DeepSeek Harness: ' + err);
        } finally {
            setDshLoading(false);
        }
    };

    const handleDshStop = async () => {
        setDshLoading(true);
        try {
            const res = await fetch('/api/coder/dsh/stop', { method: 'POST' });
            const data = await res.json();
            if (data.success) {
                setDshStatus(prev => ({ ...prev, dshRunning: false }));
            }
        } catch (err) {
            alert('Erro ao parar o DeepSeek Harness: ' + err);
        } finally {
            setDshLoading(false);
            setTimeout(refreshDshStatus, 1500);
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

    // Limites reais do modelo GGUF selecionado (para os sliders fazerem sentido)
    const { meta: gmeta } = useGGUFMeta(needsEngine ? activeModel : null);
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

    const recentAlerts = logs.filter(l => l.level === 'WARN' || l.level === 'ERROR').slice(-2);

    return (
        <div className="p-6 md:p-12 max-w-[100rem] mx-auto space-y-8 animate-fade-in">
            <header className="mb-8">
                <h1 className="text-2xl sm:text-3xl md:text-5xl font-black text-[var(--text-primary)] tracking-tighter uppercase flex items-center gap-3 sm:gap-4 break-words">
                    <Terminal className="text-blue-500" size={40} />
                    {t('coder_title' as any)}
                </h1>
                <p className="text-[var(--text-secondary)] text-lg mt-2">{t('coder_subtitle' as any)}</p>
            </header>

            {recentAlerts.length > 0 && !showTerminal && (
                <div className="space-y-3 mb-8">
                    {recentAlerts.map((alert, i) => (
                        <div key={i} className={`flex items-start gap-3 p-4 rounded-2xl border backdrop-blur-md animate-fade-in ${alert.level === 'ERROR' ? 'bg-red-500/10 border-red-500/20 text-red-400' : 'bg-yellow-500/10 border-yellow-500/20 text-yellow-400'}`}>
                            <AlertTriangle size={20} className="shrink-0 mt-0.5" />
                            <div>
                                <div className="text-[10px] font-black uppercase tracking-widest opacity-70 mb-1">{alert.level} • {new Date(alert.time).toLocaleTimeString()}</div>
                                <div className="text-sm font-medium">{alert.msg}</div>
                            </div>
                        </div>
                    ))}
                </div>
            )}

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
                            className="w-full p-3 md:p-4 text-sm md:text-base bg-[var(--bg-input)] border border-[var(--border)] rounded-2xl focus:ring-2 focus:ring-blue-500 text-[var(--text-primary)] transition-all outline-none"
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
                            {/* Binário do llama.cpp */}
                            <div>
                                <label className="text-xs font-black text-purple-400 uppercase tracking-widest flex items-center gap-2"><FileCog size={14} /> {t('coder_engine_binary' as any)}</label>
                                <div className="flex flex-wrap gap-2">
                                    <input
                                        type="text"
                                        value={llamaBinary}
                                        onChange={e => setLlamaBinary(e.target.value)}
                                        placeholder="C:\...\llama-server.exe  (ou &quot;llama-server&quot; p/ PATH)"
                                        className="mt-2 flex-1 min-w-[12rem] p-3 text-xs font-mono bg-[var(--bg-base)] border border-[var(--border)] rounded-xl focus:ring-2 focus:ring-purple-500 text-[var(--text-primary)] outline-none"
                                    />
                                    <button
                                        onClick={handleBrowseBinary}
                                        disabled={browsing}
                                        title={t('coder_engine_binary_browse' as any)}
                                        className="mt-2 px-3 py-3 shrink-0 bg-purple-600/20 hover:bg-purple-600/30 text-purple-400 rounded-xl border border-purple-500/30 font-bold uppercase tracking-widest text-[10px] transition-colors disabled:opacity-50 flex items-center gap-1.5"
                                    >
                                        {browsing ? <Loader2 className="animate-spin" size={14} /> : <FolderSearch size={14} />}
                                        {t('coder_engine_binary_browse' as any)}
                                    </button>
                                </div>
                                {binaryExists === false && (
                                    <p className="mt-1 text-[10px] font-bold text-red-400 flex items-center gap-1"><AlertTriangle size={12} /> {t('coder_binary_not_found' as any)}: {llamaBinary}</p>
                                )}
                                {binaryExists === true && (
                                    <p className="mt-1 text-[10px] font-bold text-emerald-400 flex items-center gap-1"><CheckCircle2 size={12} /> {t('coder_binary_found' as any)}</p>
                                )}
                            </div>

                            {/* Parâmetros adicionais (seletor + valores + tooltips) */}
                            <div>
                                <label className="text-xs font-black text-purple-400 uppercase tracking-widest flex items-center gap-2"><Cpu size={14} /> {t('coder_engine_args' as any)}</label>
                                <div className="mt-2 space-y-2">
                                    {llamaArgList.length === 0 && (
                                        <p className="text-[10px] text-[var(--text-muted)] font-medium">{t('coder_engine_args_empty' as any)}</p>
                                    )}
                                    {llamaArgList.map(p => {
                                        const info = PARAM_INFO[p.arg];
                                        const isCustom = !info;
                                        return (
                                            <div key={p.id} className="flex flex-wrap items-center gap-2">
                                                <input
                                                    type="checkbox"
                                                    checked={p.enabled}
                                                    onChange={e => updateParam(p.id, { enabled: e.target.checked })}
                                                    title={p.enabled ? t('coder_engine_param_enabled' as any) : t('coder_engine_param_disabled' as any)}
                                                    className="accent-purple-500 w-4 h-4 shrink-0 cursor-pointer"
                                                />
                                                <select
                                                    value={isCustom ? '__custom__' : p.arg}
                                                    onChange={e => handleParamSelect(p.id, e.target.value)}
                                                    disabled={!p.enabled}
                                                    title={info ? info.label : t('coder_param_custom' as any)}
                                                    className="w-44 lg:w-56 shrink-0 p-2.5 text-[11px] font-mono bg-[var(--bg-base)] border border-[var(--border)] rounded-lg focus:ring-2 focus:ring-purple-500 text-[var(--text-primary)] outline-none disabled:opacity-40 cursor-pointer"
                                                >
                                                    <option value="__custom__">{t('coder_param_custom' as any)}</option>
                                                    {PARAM_GROUPS.map(g => (
                                                        <optgroup key={g.key} label={t(g.labelKey as any)}>
                                                            {g.params.map(key => (
                                                                <option key={key} value={key}>{PARAM_INFO[key].label}</option>
                                                            ))}
                                                        </optgroup>
                                                    ))}
                                                </select>
                                                {isCustom && (
                                                    <input
                                                        type="text"
                                                        value={p.arg}
                                                        onChange={e => updateParam(p.id, { arg: e.target.value })}
                                                        placeholder={t('coder_param_flag_ph' as any)}
                                                        spellCheck={false}
                                                        disabled={!p.enabled}
                                                        className="w-36 shrink-0 p-2.5 text-[11px] font-mono bg-[var(--bg-base)] border border-[var(--border)] rounded-lg focus:ring-2 focus:ring-purple-500 text-[var(--text-primary)] outline-none disabled:opacity-40"
                                                    />
                                                )}
                                                {info && info.type === 'flag' ? (
                                                    <span className="flex-1 min-w-[11rem] p-2.5 text-[10px] font-black uppercase tracking-widest text-[var(--text-muted)] bg-[var(--bg-base)]/50 border border-dashed border-[var(--border)] rounded-lg">
                                                        {t('coder_param_no_value' as any)}
                                                    </span>
                                                ) : info && info.type === 'enum' && info.values ? (
                                                    <select
                                                        value={p.value}
                                                        onChange={e => updateParam(p.id, { value: e.target.value })}
                                                        disabled={!p.enabled}
                                                        className="flex-1 min-w-[11rem] p-2.5 text-[11px] font-mono bg-[var(--bg-base)] border border-[var(--border)] rounded-lg focus:ring-2 focus:ring-purple-500 text-[var(--text-primary)] outline-none disabled:opacity-40 cursor-pointer"
                                                    >
                                                        <option value="">— {t('coder_engine_args_value' as any)} —</option>
                                                        {info.values.split(',').map(v => (
                                                            <option key={v.trim()} value={v.trim()}>{v.trim()}</option>
                                                        ))}
                                                    </select>
                                                ) : (
                                                    <input
                                                        type="text"
                                                        value={p.value}
                                                        onChange={e => updateParam(p.id, { value: e.target.value })}
                                                        placeholder={info && info.examples ? `ex.: ${info.examples}` : t('coder_engine_args_value' as any)}
                                                        spellCheck={false}
                                                        disabled={!p.enabled}
                                                        className="flex-1 min-w-[11rem] p-2.5 text-[11px] font-mono bg-[var(--bg-base)] border border-[var(--border)] rounded-lg focus:ring-2 focus:ring-purple-500 text-[var(--text-primary)] outline-none disabled:opacity-40"
                                                    />
                                                )}
                                                {info && info.type !== 'flag' && (
                                                    <span
                                                        className="shrink-0 px-1.5 py-0.5 text-[9px] font-black uppercase tracking-widest rounded-md bg-purple-500/10 text-purple-400 border border-purple-500/20"
                                                        title={typeLabel(info.type)}
                                                    >{TYPE_SHORT[info.type]}</span>
                                                )}
                                                <span
                                                    className="shrink-0 ml-1 text-purple-400 hover:text-purple-300 cursor-help text-[11px] font-bold"
                                                    data-tooltip-id={`coder-param-${p.id}`}
                                                    data-tooltip-content={p.arg}
                                                >❓</span>
                                                <Tooltip
                                                    id={`coder-param-${p.id}`}
                                                    place="right"
                                                    positionStrategy="fixed"
                                                    className="coder-param-tooltip"
                                                    render={({ content }) => (
                                                        <div dangerouslySetInnerHTML={{ __html: buildParamTip(typeof content === 'string' ? content : '', typeof content === 'string' ? PARAM_INFO[content] : undefined) }} />
                                                    )}
                                                />
                                                <button
                                                    onClick={() => removeParam(p.id)}
                                                    title={t('coder_engine_param_remove' as any)}
                                                    className="p-2 rounded-lg text-[var(--text-muted)] hover:text-red-400 hover:bg-red-500/10 transition-colors shrink-0"
                                                >
                                                    <X size={14} />
                                                </button>
                                            </div>
                                        );
                                    })}
                                </div>
                                <button
                                    onClick={addParam}
                                    className="mt-2 px-3 py-2 bg-purple-600/10 hover:bg-purple-600/20 text-purple-400 rounded-lg border border-purple-500/20 font-bold uppercase tracking-widest text-[10px] transition-colors flex items-center gap-1.5"
                                >
                                    <Plus size={12} /> {t('coder_engine_param_add' as any)}
                                </button>
                                <p className="mt-2 text-[10px] text-[var(--text-muted)] font-medium">
                                    {t('coder_engine_args_hint' as any, { cores: physicalCores || '?' })}
                                </p>
                            </div>

                            {/* Guardar configuração */}
                            <button
                                onClick={handleSaveEngineConfig}
                                disabled={savingConfig}
                                className="w-full py-3 bg-purple-600/20 hover:bg-purple-600/30 text-purple-400 rounded-xl font-bold uppercase tracking-widest text-[11px] border border-purple-500/30 transition-all disabled:opacity-50 flex items-center justify-center gap-2"
                            >
                                {savingConfig ? <Loader2 className="animate-spin" size={16} /> : <Save size={16} />}
                                {savingConfig ? t('loading' as any) : t('coder_save_engine_config' as any)}
                            </button>
                            {configSaved && (
                                <p className="text-center text-[11px] font-bold text-emerald-400 flex items-center justify-center gap-1"><CheckCircle2 size={14} /> {t('coder_engine_config_saved' as any)}</p>
                            )}

                            <div className="border-t border-[var(--border)] pt-5 space-y-6">
                                <div>
                                    <div className="flex justify-between items-center mb-4">
                                        <label className="text-xs font-black text-purple-400 uppercase tracking-widest flex items-center gap-2"><Zap size={14} /> Context Size</label>
                                        <span className="text-xs font-mono font-bold text-purple-400 bg-purple-500/10 px-2 py-1 rounded border border-purple-500/20">{ctxSize}</span>
                                    </div>
                                    <input type="range" min="1024" max={maxCtxSlider} step={ctxSliderStep} value={ctxSize} onChange={e => setCtxSize(parseInt(e.target.value))} className="w-full accent-purple-500" />
                                    <p className="text-[11px] text-[var(--text-secondary)] mt-2 font-medium">Memória de contexto (Max: {maxCtxSlider.toLocaleString('pt-PT')}). Valores altos aumentam o raciocínio do agente, mas consomem muita RAM/VRAM.</p>
                                </div>
                                <div>
                                    <div className="flex justify-between items-center mb-4">
                                        <label className="text-xs font-black text-purple-400 uppercase tracking-widest flex items-center gap-2"><Server size={14} /> GPU Layers</label>
                                        <span className="text-xs font-mono font-bold text-purple-400 bg-purple-500/10 px-2 py-1 rounded border border-purple-500/20">{gpuLayers}</span>
                                    </div>
                                    <input type="range" min="0" max={maxGpuLayers} step="1" value={gpuLayers} onChange={e => setGpuLayers(parseInt(e.target.value))} className="w-full accent-purple-500" />
                                    <p className="text-[11px] text-[var(--text-secondary)] mt-2 font-medium">Aceleração via Placa de Vídeo. {maxGpuLayers === 99 ? '99 = Full GPU.' : `Máx. do modelo: ${maxGpuLayers}.`}</p>
                                </div>
                                <ConfigImpact
                                    ctxSize={ctxSize}
                                    gpuLayers={gpuLayers}
                                    modelPath={activeModel}
                                    kvBytesPerElement={0.5}
                                    onApplyRecommendation={(rec) => { setCtxSize(rec.ctx); setGpuLayers(rec.gpuLayers); }}
                                />
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

                    {/* DeepSeek Harness (Agente) */}
                    <div className="bg-[var(--bg-surface)] rounded-[2rem] border border-[var(--border)] p-8 shadow-xl flex flex-col relative group">
                        <div className="flex items-center justify-between mb-4">
                            <div className="flex items-center gap-3">
                                <Terminal size={28} className="text-purple-500 group-hover:-translate-y-1 transition-transform" />
                                <h2 className="text-2xl font-black text-[var(--text-primary)] uppercase tracking-tighter">DeepSeek Harness (Agente)</h2>
                            </div>
                            <div className="flex gap-2">
                                <span className="px-3 py-1.5 bg-purple-500/10 text-purple-500 text-[10px] font-black uppercase tracking-widest rounded-full border border-purple-500/20 flex items-center gap-2">
                                    <CheckCircle2 size={14} />
                                    Modelo Local ({llamaArgList.find(p => p.arg === '--alias')?.value || 'qwen'})
                                </span>
                                {dshStatus.dshRunning ? (
                                    <span className="px-3 py-1.5 bg-emerald-500/10 text-emerald-500 text-[10px] font-black uppercase tracking-widest rounded-full flex items-center gap-2 border border-emerald-500/20">
                                        <CheckCircle2 size={14} />
                                        Em execução ({dshStatus.url})
                                    </span>
                                ) : (
                                    <span className="px-3 py-1.5 bg-[var(--bg-input)] text-[var(--text-muted)] text-[10px] font-black uppercase tracking-widest rounded-full border border-[var(--border)]">
                                        Parado
                                    </span>
                                )}
                            </div>
                        </div>

                        <p className="text-[var(--text-secondary)] leading-relaxed mb-8">
                            <span className="text-purple-500 font-bold">Agente</span> do DeepSeek Harness usando o seu modelo local do Centraliza Coder.
                            Use o motor llama.cpp que gerencia (descrito acima). Clique abaixo para abrir o Harness (web) em modo headless, apontado para o motor.
                        </p>

                        <div className="flex gap-4">
                            <button 
                                onClick={handleDshOpen} 
                                disabled={dshLoading || !dshStatus.engineRunning}
                                className="flex-1 py-4 bg-purple-500/10 hover:bg-purple-500/20 text-purple-500 rounded-2xl font-bold uppercase tracking-widest transition-all shadow-xl disabled:opacity-50 flex items-center justify-center gap-3"
                            >
                                {dshLoading ? <Loader2 className="animate-spin" size={20} /> : <Terminal size={20} />}
                                {dshLoading ? 'Iniciando...' : 'Abrir DeepSeek Harness'}
                            </button>
                            <button
                                onClick={handleDshStop}
                                disabled={dshLoading || !dshStatus.dshRunning}
                                className="flex-1 py-4 bg-[var(--bg-input)] hover:bg-red-500/10 text-red-500 rounded-2xl font-bold uppercase tracking-widest transition-all shadow-sm disabled:opacity-50 flex items-center justify-center gap-3 border border-[var(--border)]"
                            >
                                <Square size={20} /> Parar
                            </button>
                        </div>
                        {!dshStatus.engineRunning && (
                            <div className="mt-4 p-3 bg-yellow-500/10 border border-yellow-500/20 rounded-xl text-yellow-500 text-xs font-medium">
                                O motor local (llama.cpp) não está a correr. Inicie o motor na seção Motor acima primeiro.
                            </div>
                        )}
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

            {/* Terminal / Logs de Eventos */}
            <div className="mt-12 pt-8 border-t border-[var(--border)]">
                <button onClick={() => setShowTerminal(!showTerminal)} className={`flex items-center gap-3 px-6 py-3 rounded-2xl font-bold text-xs uppercase tracking-widest transition-all ${showTerminal ? 'bg-blue-600 text-white shadow-xl shadow-blue-500/20' : 'bg-[var(--bg-surface)] border border-[var(--border)] text-[var(--text-secondary)] hover:text-blue-500 hover:border-blue-500/30'}`}>
                    <Activity size={18} /> {showTerminal ? 'Ocultar Terminal de Logs' : 'Ver Terminal de Logs ao Vivo'}
                </button>

                {showTerminal && (
                    <div className="mt-6 bg-[#0A0A0A] border border-gray-800 rounded-3xl shadow-2xl overflow-hidden flex flex-col h-96 animate-fade-in relative z-20">
                        <div className="flex items-center justify-between px-6 py-3 bg-[#111] border-b border-gray-800">
                            <div className="flex items-center gap-3 text-gray-400 text-[10px] font-black uppercase tracking-widest">
                                <Terminal size={14} /> Server Logs Stream
                            </div>
                            <button onClick={() => setShowTerminal(false)} className="text-gray-500 hover:text-white transition-colors"><X size={16} /></button>
                        </div>
                        <div className="flex-1 overflow-y-auto p-4 md:p-6 font-mono text-[11px] md:text-xs leading-relaxed custom-scrollbar break-all">
                            {logs.map((log, i) => (
                                <div key={i} className={`mb-2 ${log.level === 'ERROR' ? 'text-red-400' : log.level === 'WARN' ? 'text-yellow-400' : 'text-gray-400'}`}>
                                    <span className="opacity-40 mr-3">[{new Date(log.time).toLocaleTimeString()}]</span>
                                    <span className="font-black mr-3">[{log.level}]</span>
                                    {log.msg}
                                </div>
                            ))}
                            <div ref={logsEndRef} />
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}