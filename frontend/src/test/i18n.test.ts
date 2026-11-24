import { describe, it, expect } from 'vitest';
import { translations, t, LANGUAGES, type Lang } from '../i18n';
import { v050Translations } from '../i18n/v050';

const LANGS: Lang[] = ['pt-BR', 'pt-PT', 'en', 'es', 'fr', 'de', 'it', 'zh', 'ar', 'ko', 'ja'];

describe('i18n v0.5.0', () => {
  it('cobre as 11 línguas suportadas', () => {
    expect(LANGUAGES.map(l => l.code).sort()).toEqual([...LANGS].sort());
  });

  it('en e pt-BR têm exatamente o mesmo conjunto de chaves', () => {
    expect(Object.keys(translations['pt-BR']).sort()).toEqual(Object.keys(translations.en).sort());
  });

  it('as 8 línguas herdadas têm traduções próprias para as chaves novas', () => {
    for (const lang of ['es', 'fr', 'de', 'it', 'zh', 'ar', 'ko', 'ja'] as Lang[]) {
      const dict = v050Translations[lang];
      expect(dict, `sem dicionário para ${lang}`).toBeTruthy();
      const entries = Object.entries(dict || {});
      expect(entries.length, `${lang} tem poucas chaves`).toBeGreaterThan(90);
      for (const [key, value] of entries) {
        expect(typeof value, `${lang}.${key}`).toBe('string');
        expect(String(value).length, `${lang}.${key} vazio`).toBeGreaterThan(0);
      }
    }
  });

  it('todas as línguas resolvem as chaves novas (sem devolver a chave)', () => {
    const keys = [
      'hub_abliterated', 'hub_uncensored', 'central_totalSpace', 'central_byLocation',
      'test_engines', 'test_openWebUi', 'test_stopEngine', 'coder_agent', 'coder_updateTitle',
      'coder_editorsHint', 'ext_title', 'ext_smokeTest', 'ext_engineRequired', 'ext_notConfigured'
    ] as const;
    for (const lang of LANGS) {
      for (const key of keys) {
        const value = t(lang, key as any);
        expect(value, `${lang}.${key} não resolvido`).not.toBe(key);
        expect(String(value).trim().length).toBeGreaterThan(0);
      }
    }
  });

  it('preserva os placeholders em todas as línguas', () => {
    for (const lang of LANGS) {
      expect(t(lang, 'hub_resultsCount' as any, { count: 7 })).toContain('7');
      expect(t(lang, 'hub_noResults' as any, { query: 'abc' })).toContain('abc');
      expect(t(lang, 'central_filteredBy' as any, { path: 'C:\\AI' })).toContain('C:\\AI');
      expect(t(lang, 'ext_smokeLatency' as any, { ms: 42 })).toContain('42');
      expect(t(lang, 'central_modelsInLocation' as any, { count: 3 })).toContain('3');
    }
  });
});
