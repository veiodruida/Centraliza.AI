import { useEffect, useState } from 'react';
import type { GGUFMeta } from './configAdvisor';

// Cache partilhado entre páginas (o servidor também faz cache de 1 dia).
const metaCache: Record<string, GGUFMeta> = {};

/**
 * Carrega os metadados GGUF de um modelo local (via /api/gguf/meta).
 * Devolve { meta, loading }; `meta` fica null quando não há modelPath.
 */
export function useGGUFMeta(modelPath?: string | null): { meta: GGUFMeta | null; loading: boolean } {
  const [meta, setMeta] = useState<GGUFMeta | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!modelPath) {
      setMeta(null);
      setLoading(false);
      return;
    }
    if (metaCache[modelPath]) {
      setMeta(metaCache[modelPath]);
      setLoading(false);
      return;
    }
    let alive = true;
    setLoading(true);
    fetch(`/api/gguf/meta?path=${encodeURIComponent(modelPath)}`)
      .then(r => r.json())
      .then(d => {
        if (!alive) return;
        const parsed: GGUFMeta = (d && typeof d === 'object' && 'ok' in d)
          ? d
          : { ok: false, error: 'Resposta inválida' };
        metaCache[modelPath] = parsed;
        setMeta(parsed);
        setLoading(false);
      })
      .catch(() => {
        if (alive) {
          setMeta({ ok: false, error: 'Falha de rede' });
          setLoading(false);
        }
      });
    return () => { alive = false; };
  }, [modelPath]);

  return { meta, loading };
}
