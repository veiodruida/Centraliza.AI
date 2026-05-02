import { createContext, useContext, useState, useEffect, type ReactNode } from 'react';
import { type Lang, type Translations, t as tFn } from '../i18n';

export type Theme = 'dark' | 'light' | 'contrast';

interface AppContextValue {
  lang: Lang;
  setLang: (l: Lang) => void;
  theme: Theme;
  setTheme: (t: Theme) => void;
  t: (key: keyof Translations, vars?: Record<string, string | number>) => string;
}

const AppContext = createContext<AppContextValue>({
  lang: 'pt-BR', setLang: () => {}, theme: 'dark', setTheme: () => {},
  t: (k) => String(k),
});

export function AppProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>(() => (localStorage.getItem('lang') as Lang) || 'pt-BR');
  const [theme, setThemeState] = useState<Theme>(() => (localStorage.getItem('theme') as Theme) || 'dark');

  const setLang = (l: Lang) => { setLangState(l); localStorage.setItem('lang', l); };
  const setTheme = (th: Theme) => { setThemeState(th); localStorage.setItem('theme', th); };

  useEffect(() => {
    const root = document.documentElement;
    root.setAttribute('data-theme', theme);
    // RTL support
    const isRtl = lang === 'ar';
    root.setAttribute('dir', isRtl ? 'rtl' : 'ltr');
  }, [theme, lang]);

  const t = (key: keyof Translations, vars?: Record<string, string | number>) => tFn(lang, key, vars);

  return <AppContext.Provider value={{ lang, setLang, theme, setTheme, t }}>{children}</AppContext.Provider>;
}

export const useApp = () => useContext(AppContext);
