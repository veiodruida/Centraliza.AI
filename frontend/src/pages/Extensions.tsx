import { useState, useEffect } from 'react';
import {
  CheckCircle2, XCircle, Loader2, Code2, Puzzle, RefreshCw, Play, AlertTriangle,
  ExternalLink, ShieldCheck, Cpu, Box, Server, Terminal
} from 'lucide-react';
import { useApp } from '../context/AppContext';
import { useToast } from '../components/Toast';

interface Blocker { code: string; message: string; action?: string }
interface ExtStatus {
  ready: boolean;
  engineRunning: boolean;
  modelLoaded: boolean;
  gatewayReady?: boolean;
  gatewayOk: boolean;
  activeModel?: string | null;
  engineLabel?: string | null;
  baseUrl: string;
  apiKey: string;
  modelId: string;
  blockers: Blocker[];
  engines?: any[];
  integrations?: { continue?: any; roo?: any };
}

function StatusChip({ ok, label, value }: { ok: boolean; label: string; value?: string | null }) {
  return (
    <div className={`flex items-center gap-3 px-4 py-3 rounded-2xl border min-w-0 ${ok ? 'bg-emerald-500/10 border-emerald-500/20' : 'bg-red-500/10 border-red-500/20'}`}>
      {ok ? <CheckCircle2 size={16} className="text-emerald-500 shrink-0" /> : <XCircle size={16} className="text-red-400 shrink-0" />}
      <div className="min-w-0">
        <div className="text-[9px] md:text-[10px] font-black uppercase tracking-widest text-[var(--text-muted)]">{label}</div>
        <div className={`text-xs md:text-sm font-black uppercase tracking-wider truncate ${ok ? 'text-emerald-500' : 'text-red-400'}`} title={value || undefined}>
          {value || (ok ? 'OK' : '—')}
        </div>
      </div>
    </div>
  );
}

export default function Extensions() {
  const { t } = useApp();
  const { showToast } = useToast();
  const [status, setStatus] = useState<ExtStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [results, setResults] = useState<Record<string, any>>({});
  const [smoke, setSmoke] = useState<any>(null);

  const refresh = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/extensions/status', { cache: 'no-store' });
      setStatus(await res.json());
    } catch {
      setStatus(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { refresh(); }, []);

  /** "Iniciar motor e modelo" (RF-042): desbloqueia as integrações. */
  const startStack = async () => {
    setBusy('stack');
    try {
      const res = await fetch('/api/extensions/start-stack', { method: 'POST' });
      const data = await res.json();
      if (data.success) {
        showToast(t('ext_ready' as any), 'success');
        if (data.status) setStatus(data.status);
      } else {
        showToast(data.error || t('error' as any), 'error');
      }
    } catch (e: any) {
      showToast(String(e), 'error');
    } finally {
      setBusy(null);
      refresh();
    }
  };

  /** Integração automática (Continue.dev / Roo Code) — RF-040/RF-041. */
  const integrate = async (kind: 'continue' | 'roo') => {
    if (!status?.ready) {
      showToast(t('ext_engineRequired' as any), 'error');
      return;
    }
    setBusy(kind);
    try {
      const res = await fetch(`/api/extensions/${kind}`, { method: 'POST' });
      const data = await res.json();
      setResults(prev => ({ ...prev, [kind]: data }));
      if (data.success) {
        showToast(kind === 'continue' ? t('ext_continueDone' as any) : t('ext_rooDone' as any), 'success');
        if (data.installUri) window.location.href = data.installUri;
      } else {
        showToast(data.error || t('ext_blocked' as any), 'error');
      }
    } catch (e: any) {
      showToast(String(e), 'error');
    } finally {
      setBusy(null);
      refresh();
    }
  };

  /** Teste de fumo no gateway (RF-044). */
  const runSmoke = async () => {
    setBusy('smoke');
    setSmoke(null);
    try {
      const res = await fetch('/api/extensions/smoke-test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({})
      });
      const data = await res.json();
      setSmoke(data);
      showToast(data.success ? t('ext_smokeOk' as any) : (data.error || t('ext_smokeFail' as any)), data.success ? 'success' : 'error');
    } catch (e: any) {
      setSmoke({ success: false, error: String(e) });
      showToast(t('ext_smokeFail' as any), 'error');
    } finally {
      setBusy(null);
    }
  };

  const openVSCode = async () => {
    try {
      const res = await fetch('/api/extensions/open-vscode', { method: 'POST' });
      const data = await res.json();
      if (!data.success) showToast(data.error || 'VS Code não encontrado', 'error');
    } catch (e: any) {
      showToast(String(e), 'error');
    }
  };

  const renderResult = (kind: string) => {
    const r = results[kind];
    if (!r) return null;
    const diagnostics = Array.isArray(r.diagnostics) ? r.diagnostics : [];
    return (
      <div className={`mt-4 p-4 rounded-2xl border text-[11px] leading-relaxed space-y-2 ${r.success ? 'bg-emerald-500/5 border-emerald-500/20' : 'bg-amber-500/5 border-amber-500/20'}`}>
        <div className={`font-black uppercase tracking-widest ${r.success ? 'text-emerald-500' : 'text-amber-400'}`}>
          {r.success ? t('ext_configured' as any) : t('ext_blocked' as any)}
        </div>
        {r.configPath && (
          <div className="font-mono text-[var(--text-secondary)] break-all">
            <span className="font-black uppercase tracking-widest text-[var(--text-muted)] mr-2">{t('ext_configPath' as any)}:</span>{r.configPath}
          </div>
        )}
        {r.db && (
          <div className="font-mono text-[var(--text-secondary)] break-all">
            <span className="font-black uppercase tracking-widest text-[var(--text-muted)] mr-2">Storage:</span>{r.db}
          </div>
        )}
        {r.backup && (
          <div className="font-mono text-[var(--text-muted)] break-all">
            <span className="font-black uppercase tracking-widest mr-2">{t('ext_backup' as any)}:</span>{r.backup}
          </div>
        )}
        {r.error && <div className="text-red-400 font-bold">{r.error}</div>}
        {diagnostics.map((d: any, i: number) => (
          <div key={i} className="flex items-start gap-2 text-[var(--text-secondary)]">
            <AlertTriangle size={12} className="shrink-0 mt-0.5 text-amber-400" />
            <span><b className="uppercase tracking-widest text-[10px] text-[var(--text-muted)]">{d.code}</b> — {d.message}{d.hint ? ` (${d.hint})` : ''}</span>
          </div>
        ))}
        {r.settings && (
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 pt-1">
            {[
              [t('ext_baseUrl' as any), r.settings.apiBase],
              [t('ext_apiKey' as any), r.settings.apiKey],
              [t('ext_modelId' as any), r.settings.model]
            ].map(([label, value]) => (
              <div key={label as string} className="bg-[var(--bg-input)]/50 border border-[var(--border)] rounded-xl px-3 py-2 min-w-0">
                <div className="text-[9px] font-black uppercase tracking-widest text-[var(--text-muted)] mb-0.5">{label}</div>
                <div className="font-mono text-[10px] text-[var(--text-primary)] truncate" title={String(value)}>{String(value)}</div>
              </div>
            ))}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="p-6 md:p-10 space-y-8 text-[var(--text-primary)]">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <h1 className="text-2xl md:text-3xl font-black uppercase tracking-widest break-words flex items-center gap-3">
            <Puzzle className="text-blue-500 shrink-0" size={28} /> {t('ext_title' as any)}
          </h1>
          <p className="text-[var(--text-secondary)] mt-2 max-w-3xl">{t('ext_subtitle' as any)}</p>
        </div>
        <div className="flex gap-2 shrink-0">
          <button
            onClick={refresh}
            disabled={loading}
            className="p-3 rounded-2xl border border-[var(--border)] bg-[var(--bg-surface)] text-[var(--text-secondary)] hover:text-blue-400 transition-colors disabled:opacity-50"
            title={t('ext_status' as any)}
          >
            <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
          </button>
          <button
            onClick={openVSCode}
            className="px-4 py-3 rounded-2xl border border-[var(--border)] bg-[var(--bg-surface)] text-[var(--text-secondary)] hover:text-blue-400 transition-colors flex items-center gap-2 text-[10px] font-black uppercase tracking-widest"
          >
            <ExternalLink size={14} /> {t('ext_openVSCode' as any)}
          </button>
        </div>
      </header>

      {/* Prontidão: motor + modelo + gateway (RF-042) */}
      <section className="bg-[var(--bg-surface)] border border-[var(--border)] rounded-[2rem] p-6 md:p-8 shadow-xl">
        <div className="flex flex-wrap items-center justify-between gap-3 mb-5">
          <h2 className="text-sm md:text-base font-black uppercase tracking-widest flex items-center gap-3 text-[var(--text-secondary)]">
            <ShieldCheck size={18} className="text-blue-500" /> {t('ext_status' as any)}
          </h2>
          <span className={`px-4 py-1.5 rounded-full text-[10px] font-black uppercase tracking-widest border ${status?.ready ? 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20' : 'bg-amber-500/10 text-amber-400 border-amber-500/20'}`}>
            {status?.ready ? t('ext_ready' as any) : t('ext_blocked' as any)}
          </span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <StatusChip ok={!!status?.engineRunning} label={t('ext_engine' as any)} value={status?.engineLabel || status?.engines?.find((e: any) => e.running)?.label} />
          <StatusChip ok={!!status?.modelLoaded} label={t('ext_model' as any)} value={status?.activeModel ? String(status.activeModel).split(/[\\/]/).pop() : null} />
          <StatusChip ok={!!status?.gatewayOk} label={t('ext_gateway' as any)} value={status?.baseUrl?.replace(/^https?:\/\//, '')} />
        </div>

        {status && !status.ready && (
          <div className="mt-5 space-y-3">
            <div className="flex items-start gap-3 p-4 rounded-2xl bg-amber-500/5 border border-amber-500/20">
              <AlertTriangle size={16} className="text-amber-400 shrink-0 mt-0.5" />
              <div className="text-xs md:text-sm text-[var(--text-secondary)] leading-relaxed">
                <div className="font-black uppercase tracking-widest text-[10px] text-amber-400 mb-1">{t('ext_engineRequired' as any)}</div>
                {t('ext_engineRequiredHint' as any)}
                <ul className="mt-2 space-y-1">
                  {status.blockers.map((b, i) => (
                    <li key={i} className="flex items-center gap-2">
                      <span className="w-1.5 h-1.5 rounded-full bg-amber-400 shrink-0" />
                      <span>{b.message}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
            <button
              onClick={startStack}
              disabled={busy === 'stack'}
              className="w-full sm:w-auto px-6 py-3 rounded-2xl bg-blue-600 hover:bg-blue-500 text-white text-[11px] font-black uppercase tracking-widest transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {busy === 'stack' ? <Loader2 size={14} className="animate-spin" /> : <Play size={14} />}
              {t('ext_startStack' as any)}
            </button>
          </div>
        )}

        {status?.ready && (
          <p className="mt-5 text-[11px] font-mono text-[var(--text-muted)] break-all">
            {status.baseUrl} · {status.apiKey} · {status.modelId}
          </p>
        )}
      </section>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Continue.dev */}
        <section className="bg-[var(--bg-surface)] p-6 md:p-8 rounded-[2rem] border border-[var(--border)] shadow-xl hover:border-blue-500/30 transition-all">
          <div className="flex flex-wrap items-center gap-3 mb-3">
            <Code2 size={24} className="text-blue-500 shrink-0" />
            <h2 className="text-lg md:text-xl font-black uppercase tracking-tight">{t('ext_continueTitle' as any)}</h2>
            {status?.integrations?.continue?.configured && (
              <span className="ml-auto px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest bg-emerald-500/10 text-emerald-500 border border-emerald-500/20">{t('ext_configured' as any)}</span>
            )}
          </div>
          <p className="text-[var(--text-secondary)] text-sm mb-6 leading-relaxed min-h-[3.5rem]">{t('ext_continueDesc' as any)}</p>
          <button
            onClick={() => integrate('continue')}
            disabled={!status?.ready || busy === 'continue'}
            className="w-full bg-blue-600 hover:bg-blue-500 text-white font-black uppercase tracking-widest text-[11px] py-3.5 px-4 rounded-2xl transition-all active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-2"
          >
            {busy === 'continue' ? <Loader2 size={14} className="animate-spin" /> : status?.ready ? <CheckCircle2 size={14} /> : <XCircle size={14} />}
            {busy === 'continue' ? t('ext_installing' as any) : t('ext_integrate' as any)}
          </button>
          {renderResult('continue')}
        </section>

        {/* Roo Code */}
        <section className="bg-[var(--bg-surface)] p-6 md:p-8 rounded-[2rem] border border-[var(--border)] shadow-xl hover:border-purple-500/30 transition-all">
          <div className="flex flex-wrap items-center gap-3 mb-3">
            <Puzzle size={24} className="text-purple-500 shrink-0" />
            <h2 className="text-lg md:text-xl font-black uppercase tracking-tight">{t('ext_rooTitle' as any)}</h2>
            {status?.integrations?.roo?.configured && (
              <span className="ml-auto px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest bg-emerald-500/10 text-emerald-500 border border-emerald-500/20">{t('ext_configured' as any)}</span>
            )}
          </div>
          <p className="text-[var(--text-secondary)] text-sm mb-6 leading-relaxed min-h-[3.5rem]">{t('ext_rooDesc' as any)}</p>
          <button
            onClick={() => integrate('roo')}
            disabled={!status?.ready || busy === 'roo'}
            className="w-full bg-purple-600 hover:bg-purple-500 text-white font-black uppercase tracking-widest text-[11px] py-3.5 px-4 rounded-2xl transition-all active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-2"
          >
            {busy === 'roo' ? <Loader2 size={14} className="animate-spin" /> : status?.ready ? <CheckCircle2 size={14} /> : <XCircle size={14} />}
            {busy === 'roo' ? t('ext_installing' as any) : t('ext_integrate' as any)}
          </button>
          {renderResult('roo')}
        </section>
      </div>

      {/* Teste de fumo (RF-044) */}
      <section className="bg-[var(--bg-surface)] border border-[var(--border)] rounded-[2rem] p-6 md:p-8 shadow-xl">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3 min-w-0">
            <Terminal size={22} className="text-emerald-500 shrink-0" />
            <div className="min-w-0">
              <h2 className="text-lg md:text-xl font-black uppercase tracking-tight">{t('ext_smokeTest' as any)}</h2>
              <p className="text-[var(--text-secondary)] text-xs md:text-sm">{t('ext_noCopyPaste' as any)}</p>
            </div>
          </div>
          <button
            onClick={runSmoke}
            disabled={!status?.ready || busy === 'smoke'}
            className="px-6 py-3 rounded-2xl bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-500 border border-emerald-500/20 text-[11px] font-black uppercase tracking-widest transition-colors disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-2 shrink-0"
          >
            {busy === 'smoke' ? <Loader2 size={14} className="animate-spin" /> : <Play size={14} />}
            {busy === 'smoke' ? t('ext_smokeRunning' as any) : t('ext_smokeTest' as any)}
          </button>
        </div>

        {smoke && (
          <div className={`mt-5 p-4 rounded-2xl border ${smoke.success ? 'bg-emerald-500/5 border-emerald-500/20' : 'bg-red-500/5 border-red-500/20'}`}>
            <div className={`text-[10px] font-black uppercase tracking-widest mb-2 ${smoke.success ? 'text-emerald-500' : 'text-red-400'}`}>
              {smoke.success ? t('ext_smokeOk' as any) : t('ext_smokeFail' as any)}
              {typeof smoke.latencyMs === 'number' && (
                <span className="ml-3 text-[var(--text-muted)] normal-case tracking-normal font-mono">{t('ext_smokeLatency' as any, { ms: smoke.latencyMs })}</span>
              )}
            </div>
            <div className="text-sm font-mono text-[var(--text-primary)] whitespace-pre-wrap break-words">
              {smoke.success ? `“${smoke.text}”` : (smoke.error || '—')}
            </div>
          </div>
        )}
      </section>

      {loading && !status && (
        <div className="flex items-center justify-center gap-3 py-10 text-[var(--text-muted)] text-xs font-black uppercase tracking-widest">
          <Loader2 className="animate-spin" size={16} /> {t('loading' as any)}
        </div>
      )}

      {status && (
        <div className="flex flex-wrap gap-4 text-[10px] font-black uppercase tracking-widest text-[var(--text-muted)]">
          <span className="flex items-center gap-2"><Cpu size={12} /> {status.engines?.length || 0} engines</span>
          <span className="flex items-center gap-2"><Box size={12} /> {status.activeModel ? String(status.activeModel).split(/[\\/]/).pop() : '—'}</span>
          <span className="flex items-center gap-2"><Server size={12} /> {status.baseUrl}</span>
        </div>
      )}
    </div>
  );
}
