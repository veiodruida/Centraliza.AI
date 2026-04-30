import { useState, useEffect } from 'react';
import { Folder, Trash2, Save, RefreshCw, HardDrive, Box, FolderOpen, Search, Languages, Palette } from 'lucide-react';
import HelpTooltip from '../components/HelpTooltip';
import { useToast } from '../components/Toast';
import { useApp, type Theme } from '../context/AppContext';
import { LANGUAGES, type Lang } from '../i18n';

export default function Settings() {
  const { t, lang, setLang, theme, setTheme } = useApp();
  const [config, setConfig] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [newPath, setNewPath] = useState('');
  const [saving, setSaving] = useState(false);
  const { showToast } = useToast();

  const fetchConfig = () => {
    setLoading(true);
    fetch('/api/config')
      .then(res => res.json())
      .then(data => {
        setConfig(data);
        setLoading(false);
      });
  };

  const handleAutoDetect = async (quiet = false) => {
    try {
      const res = await fetch('/api/auto-detect', { method: 'POST' });
      const data = await res.json();
      if (data.config) setConfig(data.config);
      if (!quiet) {
        showToast(t('settings_saved'), 'success');
      }
    } catch (e) {
      if (!quiet) showToast(t('error'), 'error');
    }
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await fetch('/api/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(config)
      });
      showToast(t('settings_saved'), 'success');
    } catch (e) {
      showToast(t('error'), 'error');
    } finally {
      setSaving(false);
    }
  };

  const pickFolder = async (field: string) => {
    let currentVal = '';
    if (field === 'centralDir') currentVal = config.centralDir;
    else if (field === 'comfyDir') currentVal = config.comfyDir;
    else if (field === 'scan') currentVal = newPath;

    try {
      const res = await fetch(`/api/pick-folder?initialPath=${encodeURIComponent(currentVal)}`);
      const data = await res.json();
      if (data.path) {
        if (field === 'centralDir') setConfig({ ...config, centralDir: data.path });
        else if (field === 'comfyDir') setConfig({ ...config, comfyDir: data.path });
        else if (field === 'scan') setNewPath(data.path);
      }
    } catch (e) { alert(t('error')); }
  };

  const addPath = () => {
    if (!newPath) return;
    if (config.scanDirectories.includes(newPath)) return;
    setConfig({ ...config, scanDirectories: [...config.scanDirectories, newPath] });
    setNewPath('');
  };

  const removePath = (path: string) => {
    setConfig({ ...config, scanDirectories: config.scanDirectories.filter((p: string) => p !== path) });
  };

  useEffect(() => { 
    fetchConfig(); 
    handleAutoDetect(true);
  }, []);

  if (loading) return <div className="p-12 md:p-20 text-center animate-pulse text-[var(--text-secondary)] font-black uppercase tracking-widest text-xs md:text-sm">{t('loading')}</div>;

  return (
    <div className="p-6 md:p-12 max-w-6xl mx-auto animate-in fade-in duration-1000 pb-32 md:pb-40">
      <header className="mb-10 md:mb-14 flex justify-between items-end flex-wrap gap-6">
        <div className="space-y-2">
          <h2 className="text-3xl md:text-5xl font-black text-[var(--text-primary)] tracking-tighter leading-none uppercase">{t('nav_settings')}</h2>
          <p className="text-[var(--text-secondary)] text-base md:text-xl font-medium opacity-80">{t('settings_subtitle')}</p>
        </div>
        <button 
          onClick={() => handleAutoDetect()}
          className="w-full sm:w-auto bg-[var(--bg-surface)] hover:bg-[var(--bg-input)] text-[var(--text-primary)] font-black text-[10px] md:text-xs uppercase tracking-widest px-8 md:px-10 py-4 md:py-5 rounded-xl md:rounded-[2rem] border border-[var(--border)] transition-all flex items-center justify-center gap-3 md:gap-4 shadow-premium active:scale-95"
        >
          <Search size={20} className="text-blue-500" /> {t('settings_autoDetect')}
        </button>
      </header>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 md:gap-10 mb-8 md:mb-12">
        {/* Language Selection */}
        <div className="bg-[var(--bg-surface)] border border-[var(--border)] rounded-[2rem] md:rounded-[3.5rem] p-8 md:p-12 shadow-premium relative overflow-hidden group">
           <div className="absolute top-0 right-0 p-8 md:p-10 text-indigo-500/5 group-hover:scale-110 transition-all">
              <Languages size={140} />
           </div>
           <div className="flex items-center gap-4 md:gap-5 mb-6 md:mb-8 relative z-10">
              <div className="w-12 h-12 md:w-14 md:h-14 bg-indigo-600 rounded-xl md:rounded-2xl flex items-center justify-center text-white shadow-xl shadow-indigo-600/30">
                 <Languages size={28} />
              </div>
              <h3 className="text-lg md:text-xl font-black text-[var(--text-primary)] uppercase tracking-tighter flex items-center gap-2">
                {t('settings_language')}
                <HelpTooltip text={t('settings_languageHelp')} />
              </h3>
           </div>
           <div className="relative z-10">
              <select 
                value={lang} 
                onChange={(e) => setLang(e.target.value as Lang)}
                className="w-full bg-[var(--bg-input)] border border-[var(--border)] rounded-xl md:rounded-2xl px-6 md:px-8 py-4 md:py-5 text-sm md:text-base focus:outline-none focus:ring-4 focus:ring-indigo-600/10 text-[var(--text-primary)] font-bold cursor-pointer appearance-none shadow-inner"
              >
                {LANGUAGES.map(l => (
                  <option key={l.code} value={l.code}>{l.flag} {l.label}</option>
                ))}
              </select>
           </div>
        </div>

        {/* Theme Selection */}
        <div className="bg-[var(--bg-surface)] border border-[var(--border)] rounded-[2rem] md:rounded-[3.5rem] p-8 md:p-12 shadow-premium relative overflow-hidden group">
           <div className="absolute top-0 right-0 p-8 md:p-10 text-pink-500/5 group-hover:scale-110 transition-all">
              <Palette size={140} />
           </div>
           <div className="flex items-center gap-4 md:gap-5 mb-6 md:mb-8 relative z-10">
              <div className="w-12 h-12 md:w-14 md:h-14 bg-pink-600 rounded-xl md:rounded-2xl flex items-center justify-center text-white shadow-xl shadow-pink-600/30">
                 <Palette size={28} />
              </div>
              <h3 className="text-lg md:text-xl font-black text-[var(--text-primary)] uppercase tracking-tighter flex items-center gap-2">
                {t('settings_theme')}
                <HelpTooltip text={t('settings_themeHelp')} />
              </h3>
           </div>
           <div className="grid grid-cols-3 gap-3 md:gap-4 relative z-10">
              {(['dark', 'light', 'contrast'] as Theme[]).map(tName => (
                <button 
                  key={tName}
                  onClick={() => setTheme(tName)}
                  className={`py-3 md:py-4 rounded-xl md:rounded-2xl text-[9px] md:text-[10px] font-black uppercase tracking-widest transition-all border shadow-premium active:scale-95 ${
                    theme === tName ? 'bg-white text-black border-white' : 'bg-[var(--bg-input)] text-[var(--text-secondary)] border-[var(--border)] hover:border-[var(--text-secondary)]'
                  }`}
                >
                  {t(`settings_theme_${tName}` as any)}
                </button>
              ))}
           </div>
        </div>
      </div>

      <div className="space-y-6 md:space-y-10">
        {/* Central Directory */}
        <div className="bg-[var(--bg-surface)] border border-[var(--border)] rounded-[2rem] md:rounded-[4rem] p-8 md:p-12 shadow-premium relative overflow-hidden group">
           <div className="flex items-center gap-5 md:gap-6 mb-6 md:mb-8 relative z-10">
              <div className="w-12 h-12 md:w-16 md:h-16 bg-blue-600 rounded-xl md:rounded-[1.5rem] flex items-center justify-center text-white shadow-xl shadow-blue-600/30">
                 <HardDrive size={32} />
              </div>
              <div>
                 <h3 className="text-xl md:text-2xl font-black text-[var(--text-primary)] uppercase tracking-tighter flex items-center gap-3">
                   {t('settings_centralDir')}
                   <HelpTooltip text={t('settings_centralDirHelp')} />
                 </h3>
                 <span className="text-[9px] md:text-[10px] font-black text-blue-500 uppercase tracking-widest">Optimized Storage Core</span>
              </div>
           </div>
           
           <div className="flex gap-3 md:gap-4 relative z-10">
              <input 
                type="text" 
                value={config.centralDir || ''}
                onChange={(e) => setConfig({ ...config, centralDir: e.target.value })}
                className="flex-1 bg-[var(--bg-input)] border border-[var(--border)] rounded-xl md:rounded-2xl px-6 md:px-8 py-4 md:py-5 text-sm md:text-base focus:outline-none focus:ring-4 focus:ring-blue-600/10 text-[var(--text-primary)] font-mono font-bold shadow-inner"
              />
              <button onClick={() => pickFolder('centralDir')} className="bg-[var(--bg-input)] border border-[var(--border)] hover:bg-[var(--border)] text-[var(--text-primary)] px-4 md:px-8 rounded-xl md:rounded-2xl transition-all shadow-premium active:scale-95" title={t('search')}>
                 <FolderOpen size={24} />
              </button>
           </div>
        </div>

        {/* ComfyUI Directory */}
        <div className="bg-[var(--bg-surface)] border border-[var(--border)] rounded-[2rem] md:rounded-[4rem] p-8 md:p-12 shadow-premium relative overflow-hidden group">
           <div className="flex items-center gap-5 md:gap-6 mb-6 md:mb-8 relative z-10">
              <div className="w-12 h-12 md:w-16 md:h-16 bg-emerald-600 rounded-xl md:rounded-[1.5rem] flex items-center justify-center text-white shadow-xl shadow-emerald-600/30">
                 <Box size={32} />
              </div>
              <div>
                 <h3 className="text-xl md:text-2xl font-black text-[var(--text-primary)] uppercase tracking-tighter flex items-center gap-3">
                   {t('settings_comfyDir')}
                   <HelpTooltip text={t('settings_comfyDirHelp')} />
                 </h3>
                 <span className="text-[9px] md:text-[10px] font-black text-emerald-500 uppercase tracking-widest">Generative Art Bridge</span>
              </div>
           </div>
           <div className="flex gap-3 md:gap-4 relative z-10">
              <input 
                type="text" 
                value={config.comfyDir || ''}
                onChange={(e) => setConfig({ ...config, comfyDir: e.target.value })}
                className="flex-1 bg-[var(--bg-input)] border border-[var(--border)] rounded-xl md:rounded-2xl px-6 md:px-8 py-4 md:py-5 text-sm md:text-base focus:outline-none focus:ring-4 focus:ring-emerald-600/10 text-[var(--text-primary)] font-mono font-bold shadow-inner"
              />
              <button onClick={() => pickFolder('comfyDir')} className="bg-[var(--bg-input)] border border-[var(--border)] hover:bg-[var(--border)] text-[var(--text-primary)] px-4 md:px-8 rounded-xl md:rounded-2xl transition-all shadow-premium active:scale-95" title={t('search')}>
                 <FolderOpen size={24} />
              </button>
           </div>
        </div>

        {/* Scan Directories */}
        <div className="bg-[var(--bg-surface)] border border-[var(--border)] rounded-[2rem] md:rounded-[4rem] p-8 md:p-12 shadow-premium relative overflow-hidden group">
           <div className="flex items-center gap-5 md:gap-6 mb-8 md:mb-10 relative z-10">
              <div className="w-12 h-12 md:w-16 md:h-16 bg-purple-600 rounded-xl md:rounded-[1.5rem] flex items-center justify-center text-white shadow-xl shadow-purple-600/30">
                 <Folder size={32} />
              </div>
              <div>
                 <h3 className="text-xl md:text-2xl font-black text-[var(--text-primary)] uppercase tracking-tighter flex items-center gap-3">
                   {t('settings_scanDirs')}
                   <HelpTooltip text={t('settings_scanDirsHelp')} />
                 </h3>
                 <span className="text-[9px] md:text-[10px] font-black text-purple-500 uppercase tracking-widest">Silicon Discovery Paths</span>
              </div>
           </div>
           
           <div className="space-y-3 md:space-y-4 mb-8 md:mb-12 max-h-60 md:max-h-80 overflow-y-auto pr-2 md:pr-4 custom-scrollbar relative z-10 no-scrollbar">
              {config && config.scanDirectories.length === 0 ? (
                 <div className="text-center py-8 md:py-10 border-2 border-dashed border-[var(--border)] rounded-xl md:rounded-[2rem] text-[var(--text-muted)] font-bold italic text-sm">
                    No scan directories configured.
                 </div>
              ) : (
                config && config.scanDirectories.map((path: string) => (
                  <div key={path} className="flex items-center justify-between bg-[var(--bg-input)]/50 border border-[var(--border)]/50 rounded-xl md:rounded-[2rem] p-4 md:p-6 group hover:border-[var(--text-secondary)] hover:bg-[var(--bg-input)] transition-all shadow-sm">
                     <span className="text-[10px] md:text-sm font-mono text-[var(--text-secondary)] truncate font-bold">{path}</span>
                     <button onClick={() => removePath(path)} className="text-[var(--text-muted)] hover:text-red-500 transition-all p-2 md:p-3 hover:bg-red-500/10 rounded-lg md:rounded-xl active:scale-90">
                        <Trash2 size={22} />
                     </button>
                  </div>
                ))
              )}
           </div>

           <div className="flex flex-col sm:flex-row gap-3 md:gap-4 relative z-10">
              <div className="relative flex-1">
                 <input 
                  type="text" 
                  value={newPath}
                  onChange={(e) => setNewPath(e.target.value)}
                  placeholder={t('search') + "..."}
                  className="w-full bg-[var(--bg-input)] border border-[var(--border)] rounded-xl md:rounded-2xl py-4 md:py-5 pl-6 md:pl-8 pr-12 md:pr-16 text-sm md:text-base focus:outline-none focus:ring-4 focus:ring-purple-600/10 text-[var(--text-primary)] font-mono font-bold shadow-inner"
                 />
                 <button onClick={() => pickFolder('scan')} className="absolute right-3 top-1/2 -translate-y-1/2 text-[var(--text-muted)] hover:text-[var(--text-primary)] p-2 active:scale-90">
                    <FolderOpen size={22} />
                 </button>
              </div>
              <button onClick={addPath} className="bg-purple-600 hover:bg-purple-500 text-white px-8 md:px-10 py-4 md:py-0 rounded-xl md:rounded-2xl transition-all font-black text-[10px] md:text-xs uppercase tracking-widest md:tracking-[0.2em] shadow-xl shadow-purple-600/30 active:scale-95">
                 {t('settings_addPath')}
              </button>
           </div>
        </div>

        <div className="fixed bottom-6 md:bottom-12 right-6 md:right-12 z-50">
           <button 
             onClick={handleSave}
             disabled={saving}
             className="bg-[var(--text-primary)] text-[var(--bg-base)] hover:bg-blue-600 hover:text-white font-black text-[10px] md:text-sm uppercase tracking-widest md:tracking-[0.3em] px-10 md:px-20 py-5 md:py-7 rounded-xl md:rounded-[2.5rem] transition-all shadow-premium flex items-center gap-3 md:gap-5 active:scale-95 disabled:opacity-50"
           >
              {saving ? <RefreshCw size={24} className="animate-spin" /> : <Save size={24} />}
              {t('settings_save')}
           </button>
        </div>
      </div>
    </div>
  );
}
