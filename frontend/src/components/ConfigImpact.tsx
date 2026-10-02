import { useEffect, useMemo, useRef, useState } from 'react';
import { Gauge, Zap, MemoryStick, AlertTriangle, Wand2, Loader2, Info } from 'lucide-react';
import {
  estimateImpact,
  formatGB,
  formatTokens,
  SPEED_CLASS_META,
  type SysInfo,
  type SpeedClass,
} from '../utils/configAdvisor';
import { useGGUFMeta } from '../utils/useGGUFMeta';

interface ConfigImpactProps {
  ctxSize: number;
  gpuLayers: number;
  modelPath?: string | null;
  /** Bytes por elemento K/V da cache (f16=2 · q8_0=1 · q4_0≈0.5). */
  kvBytesPerElement?: number;
  onApplyRecommendation?: (rec: { ctx: number; gpuLayers: number }) => void;
  className?: string;
}

/** Destaca (flash) o valor sempre que ele muda — feedback claro de atualização ao vivo. */
function FlashValue({ value, className = '', children }: { value: string; className?: string; children?: React.ReactNode }) {
  const [flash, setFlash] = useState(false);
  const prev = useRef(value);
  useEffect(() => {
    if (prev.current !== value) {
      prev.current = value;
      setFlash(true);
      const t = setTimeout(() => setFlash(false), 500);
      return () => clearTimeout(t);
    }
  }, [value]);
  return (
    <span className={`inline-block transition-all duration-300 ${flash ? 'text-white drop-shadow-[0_0_10px_rgba(168,85,247,0.9)]' : ''} ${className}`}>
      {children}
    </span>
  );
}

const SPEED_BADGE: Record<SpeedClass, string> = {
  fast: 'bg-emerald-500/10 text-emerald-300 border-emerald-500/30',
  good: 'bg-blue-500/10 text-blue-300 border-blue-500/30',
  slow: 'bg-amber-500/10 text-amber-300 border-amber-500/30',
  'very-slow': 'bg-red-500/10 text-red-300 border-red-500/30',
  unknown: 'bg-[var(--bg-input)] text-[var(--text-muted)] border-[var(--border)]',
};

const SPEED_NUMBER: Record<SpeedClass, string> = {
  fast: 'text-emerald-400',
  good: 'text-blue-400',
  slow: 'text-amber-400',
  'very-slow': 'text-red-400',
  unknown: 'text-[var(--text-primary)]',
};

// Formata tokens/seg com precisão útil: 1 casa decimal abaixo de 10 t/s.
function fmtTps(tps: number): string {
  if (tps < 10) return tps.toFixed(1);
  if (tps < 100) return tps.toFixed(0);
  return String(Math.round(tps));
}

function MemoryBar({ label, usedGB, availGB, tone }: { label: string; usedGB: number; availGB: number; tone: 'purple' | 'blue' }) {
  const pct = availGB > 0 ? Math.min(100, Math.max(0, (usedGB / availGB) * 100)) : 0;
  const danger = pct > 95;
  const warn = pct > 80 && !danger;
  const barColor = danger
    ? 'bg-red-500'
    : warn
      ? 'bg-amber-500'
      : tone === 'purple'
        ? 'bg-purple-500'
        : 'bg-blue-500';
  return (
    <div className="min-w-0">
      <div className="flex items-center justify-between gap-3 mb-1.5">
        <span className="text-[11px] font-black uppercase tracking-widest text-[var(--text-secondary)]">{label}</span>
        <span className={`text-[11px] font-mono font-bold ${danger ? 'text-red-400' : warn ? 'text-amber-400' : 'text-[var(--text-primary)]'}`}>
          <FlashValue value={formatGB(usedGB * 1024 ** 3)}>{formatGB(usedGB * 1024 ** 3)}</FlashValue> / {formatGB(availGB * 1024 ** 3)} GB
        </span>
      </div>
      <div className="h-2 rounded-full bg-[var(--bg-base)] border border-[var(--border)] overflow-hidden">
        <div className={`h-full rounded-full ${barColor} transition-all duration-300`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

export default function ConfigImpact({ ctxSize, gpuLayers, modelPath, kvBytesPerElement = 0.5, onApplyRecommendation, className = '' }: ConfigImpactProps) {
  const [sys, setSys] = useState<SysInfo | null>(null);
  const [sysLoading, setSysLoading] = useState(true);
  const { meta, loading: metaLoading } = useGGUFMeta(modelPath);

  // Hardware do cliente (uma vez por sessão, cache de 5s no servidor).
  useEffect(() => {
    let alive = true;
    fetch('/api/system-info')
      .then(r => r.json())
      .then(d => { if (alive) { setSys(d); setSysLoading(false); } })
      .catch(() => { if (alive) setSysLoading(false); });
    return () => { alive = false; };
  }, []);

  const est = useMemo(
    () => estimateImpact({ sys, meta, ctxSize, gpuLayers, kvBytesPerElement }),
    [sys, meta, ctxSize, gpuLayers, kvBytesPerElement]
  );

  if (sysLoading) {
    return (
      <div className={`flex items-center gap-3 text-xs text-[var(--text-secondary)] font-bold uppercase tracking-widest ${className}`}>
        <Loader2 size={15} className="animate-spin text-purple-400" /> A analisar o hardware...
      </div>
    );
  }

  if (!sys) {
    return (
      <div className={`flex items-center gap-3 text-xs text-amber-300 font-bold uppercase tracking-widest ${className}`}>
        <AlertTriangle size={15} /> Não foi possível detetar o hardware.
      </div>
    );
  }

  const speed = SPEED_CLASS_META[est.speedClass];
  const showMemory = est.hasMeta || est.modelSizeGB > 0;
  const ctxNice = formatTokens(ctxSize);

  return (
    <div className={`space-y-4 ${className}`}>
      {/* Cabeçalho: hardware do cliente */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2 text-xs font-black uppercase tracking-widest text-purple-300">
          <Gauge size={15} /> Impacto no Hardware
        </div>
        <div className="flex items-center gap-2 text-[11px] md:text-xs font-black uppercase tracking-widest text-[var(--text-secondary)]">
          <span className="px-2.5 py-1 rounded-full bg-[var(--bg-surface)] border border-[var(--border)] truncate max-w-[16rem]" title={sys.gpuName}>
            {sys.gpuName || 'GPU desconhecida'}
          </span>
          <span className="px-2.5 py-1 rounded-full bg-[var(--bg-surface)] border border-[var(--border)]">{formatGB(sys.vram)} GB VRAM</span>
          <span className="px-2.5 py-1 rounded-full bg-[var(--bg-surface)] border border-[var(--border)]">{formatGB(sys.freeRam)} GB RAM livre</span>
        </div>
      </div>

      {/* Recomendação para este hardware */}
      {est.rec && (
        <div className="flex items-center justify-between gap-3 flex-wrap p-4 rounded-2xl bg-emerald-500/10 border border-emerald-500/30">
          <div className="flex items-center gap-3 min-w-0">
            <Wand2 size={16} className="text-emerald-300 shrink-0" />
            <div className="min-w-0">
              <div className="text-[11px] font-black uppercase tracking-widest text-emerald-300 mb-1">Recomendado para este hardware</div>
              <div className="text-sm font-bold text-[var(--text-primary)]">
                Contexto <span className="text-emerald-300 font-mono">{formatTokens(est.rec.ctx)}</span>
                <span className="text-[var(--text-secondary)]"> · </span>
                {est.rec.gpuLayers} camadas GPU
                <span className="text-[var(--text-secondary)]"> / {est.nLayers}</span>
              </div>
            </div>
          </div>
          {onApplyRecommendation && (
            <button
              onClick={() => onApplyRecommendation(est.rec!)}
              className="shrink-0 px-4 py-2 rounded-xl bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-200 border border-emerald-500/40 text-[11px] font-black uppercase tracking-widest transition-colors active:scale-95"
            >
              Aplicar
            </button>
          )}
        </div>
      )}

      {/* Métricas: velocidade estimada + uso do contexto */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div className="p-4 rounded-2xl bg-[var(--bg-input)]/60 border border-[var(--border)] shadow-inner">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[11px] font-black uppercase tracking-widest text-[var(--text-secondary)] flex items-center gap-1.5">
              <Zap size={13} className="text-purple-300" /> Velocidade estimada
            </span>
            <span className={`px-2 py-0.5 rounded-full border text-[10px] font-black uppercase tracking-widest ${SPEED_BADGE[est.speedClass]}`}>
              {speed.label}
            </span>
          </div>
          {est.tps !== null ? (
            <div className="flex items-baseline gap-2">
              <FlashValue value={fmtTps(est.tps)} className={`text-4xl font-black tracking-tighter ${SPEED_NUMBER[est.speedClass]}`}>
                {fmtTps(est.tps)}
              </FlashValue>
              <span className="text-sm font-black uppercase text-[var(--text-secondary)]">t/s</span>
            </div>
          ) : (
            <div className="text-sm font-bold text-[var(--text-secondary)]">
              {est.hasMeta ? 'A calcular...' : '—'}
            </div>
          )}
          <p className="text-[11px] text-[var(--text-secondary)] mt-2 font-medium leading-relaxed">
            Estimativa de geração (decode). {est.hasMeta ? `Modelo ${formatGB(est.modelSizeGB * 1024 ** 3)} GB ${est.quantLabel || ''}`.trim() : 'Precisa de metadados do modelo para precisão.'}
          </p>
        </div>

        <div className="p-4 rounded-2xl bg-[var(--bg-input)]/60 border border-[var(--border)] shadow-inner">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[11px] font-black uppercase tracking-widest text-[var(--text-secondary)] flex items-center gap-1.5">
              <MemoryStick size={13} className="text-purple-300" /> Contexto de conversa
            </span>
            <span className={`px-2 py-0.5 rounded-full border text-[10px] font-black uppercase tracking-widest ${
              est.ctxExceedsModel
                ? 'bg-red-500/10 text-red-300 border-red-500/30'
                : ctxSize > 65536
                  ? 'bg-amber-500/10 text-amber-300 border-amber-500/30'
                  : 'bg-purple-500/10 text-purple-300 border-purple-500/30'
            }`}>
              {est.ctxExceedsModel ? 'Acima do máximo' : est.ctxClass.label}
            </span>
          </div>
          <div className={`text-3xl font-black tracking-tighter ${est.ctxExceedsModel ? 'text-red-400' : 'text-[var(--text-primary)]'}`}>
            <FlashValue value={ctxNice}>{ctxNice}</FlashValue>{' '}
            <span className="text-sm font-black uppercase text-[var(--text-secondary)]">tokens</span>
          </div>
          <p className="text-[11px] text-[var(--text-secondary)] mt-2 font-medium leading-relaxed">
            {est.ctxExceedsModel
              ? `Máximo suportado pelo modelo: ${formatTokens(meta?.nCtxMax || 0)} tokens.`
              : est.ctxClass.hint}
          </p>
          {est.kvCacheGB > 0 && (
            <p className="text-[11px] text-[var(--text-secondary)] mt-1.5 font-semibold font-mono">
              Cache KV ≈ <FlashValue value={est.kvCacheGB.toFixed(2)}>{est.kvCacheGB.toFixed(2)}</FlashValue> GB · {est.kvBytesPerTokenKB.toFixed(0)} KB/token
            </p>
          )}
        </div>
      </div>

      {/* Memória */}
      {showMemory && (
        <div className="space-y-3 p-4 rounded-2xl bg-[var(--bg-input)]/60 border border-[var(--border)] shadow-inner">
          {sys.vram > 0 && <MemoryBar label="VRAM (GPU)" usedGB={est.vramUsedGB} availGB={est.vramAvailGB} tone="purple" />}
          <MemoryBar label="RAM (CPU)" usedGB={est.ramUsedGB} availGB={est.ramAvailGB} tone="blue" />
          {est.hasMeta && (
            <p className="text-[10px] text-[var(--text-secondary)] font-mono font-semibold pt-1">
              {est.gpuLayersCapped}/{est.nLayers} camadas na GPU · {est.quantLabel ? `Quantização ${est.quantLabel} · ` : ''}pesos ≈ {formatGB(est.modelSizeGB * 1024 ** 3)} GB
            </p>
          )}
        </div>
      )}

      {/* Avisos */}
      {est.issues.length > 0 && (
        <div className="space-y-2">
          {est.issues.map((issue, i) => (
            <div
              key={i}
              className={`flex items-start gap-2.5 p-3 rounded-xl border text-xs font-semibold leading-relaxed ${
                issue.level === 'danger'
                  ? 'bg-red-500/15 border-red-500/30 text-red-200'
                  : 'bg-amber-500/15 border-amber-500/30 text-amber-200'
              }`}
            >
              <AlertTriangle size={16} className="shrink-0 mt-0.5" />
              <span>{issue.text}</span>
            </div>
          ))}
        </div>
      )}

      {metaLoading && (
        <div className="flex items-center gap-2 text-[11px] text-purple-300 font-bold uppercase tracking-widest">
          <Loader2 size={13} className="animate-spin" /> A ler metadados do modelo...
        </div>
      )}

      <p className="flex items-start gap-1.5 text-[10px] text-[var(--text-secondary)] font-medium leading-relaxed">
        <Info size={12} className="shrink-0 mt-0.5" />
        Estimativa baseada na arquitetura do modelo (GGUF) e na banda de memória do teu hardware. Os valores reais variam com a implementação e o estado do sistema.
      </p>
    </div>
  );
}
