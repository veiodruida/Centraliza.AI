import { useState, useEffect } from 'react';
import { Folder, Trash2, Save, RefreshCw, HardDrive, Box, FolderOpen, Search, Languages, Palette } from 'lucide-react';
import { motion } from 'framer-motion';

const PAGE_VARIANTS = {
  initial: { opacity: 0, y: 10 },
  animate: { opacity: 1, y: 0, transition: { duration: 0.6, ease: [0.22, 1, 0.36, 1] as [number, number, number, number] } },
  exit: { opacity: 0, y: -10, transition: { duration: 0.3 } }
};
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
    <motion.div 
      variants={PAGE_VARIANTS}
      initial="initial"
      animate="animate"
      exit="exit"
      className="p-6 md:p-12 lg:p-16 max-w-[80rem] mx-auto pb-32 md:pb-40"
    >
      <header className="mb-16 flex justify-between items-end flex-wrap gap-10">
        <div className="space-y-4">
          <h2 className="text-4xl md:text-6xl font-black text-[var(--text-primary)] tracking-tighter leading-none uppercase flex items-center gap-6">
            {t('nav_settings')}
            <div className="w-16 h-1 w-px bg-blue-500/20 rotate-12" />
          </h2>
          <p className="text-[var(--text-secondary)] text-lg md:text-2xl font-medium opacity-80">{t('settings_subtitle')}</p>
        </div>
        <button 
          onClick={() => handleAutoDetect()}
          className="btn-premium px-10 py-5 bg-[var(--bg-input)] hover:bg-[var(--border)]"
        >
          <Search size={20} className="text-blue-500" /> {t('settings_autoDetect')}
        </button>
      </header>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-10 mb-16">
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="card-premium relative group overflow-hidden"
        >
           <div className="absolute top-0 right-0 p-12 text-indigo-500/5 group-hover:scale-110 transition-all">
              <Languages size={240} />
           </div>
           <div className="flex items-center gap-6 mb-10 relative z-10">
              <div className="w-14 h-14 bg-indigo-600 rounded-2xl flex items-center justify-center text-white shadow-xl shadow-indigo-600/30">
                 <Languages size={28} />
              </div>
              <div>
                 <h3 className="text-2xl font-black text-[var(--text-primary)] uppercase tracking-tighter flex items-center gap-3 leading-none">
                   {t('settings_language')}
                   <HelpTooltip text={t('settings_languageHelp')} />
                 </h3>
                 <span className="text-xs font-black text-indigo-500 uppercase tracking-widest mt-1 block">Interface Localization</span>
              </div>
           </div>
           <div className="relative z-10">
              <select 
                value={lang} 
                onChange={(e) => setLang(e.target.value as Lang)}
                className="w-full bg-[var(--bg-input)]/40 border border-[var(--border)] rounded-2xl px-8 py-5 text-lg focus:outline-none focus:ring-4 focus:ring-indigo-600/10 text-[var(--text-primary)] font-bold cursor-pointer appearance-none shadow-inner uppercase tracking-tighter"
              >
                {LANGUAGES.map(l => (
                  <option key={l.code} value={l.code}>{l.flag} {l.label}</option>
                ))}
              </select>
           </div>
        </motion.div>

        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="card-premium relative group overflow-hidden"
        >
           <div className="absolute top-0 right-0 p-12 text-pink-500/5 group-hover:scale-110 transition-all">
              <Palette size={240} />
           </div>
           <div className="flex items-center gap-6 mb-10 relative z-10">
              <div className="w-14 h-14 bg-pink-600 rounded-2xl flex items-center justify-center text-white shadow-xl shadow-pink-600/30">
                 <Palette size={28} />
              </div>
              <div>
                 <h3 className="text-2xl font-black text-[var(--text-primary)] uppercase tracking-tighter flex items-center gap-3 leading-none">
                   {t('settings_theme')}
                   <HelpTooltip text={t('settings_themeHelp')} />
                 </h3>
                 <span className="text-xs font-black text-pink-500 uppercase tracking-widest mt-1 block">Visual Atmosphere</span>
              </div>
           </div>
           <div className="grid grid-cols-3 gap-4 relative z-10">
              {(['dark', 'light', 'contrast'] as Theme[]).map(tName => (
                <button 
                  key={tName}
                  onClick={() => setTheme(tName)}
                  className={`py-4 rounded-2xl text-xs font-black uppercase tracking-widest transition-all border shadow-premium active:scale-95 ${
                    theme === tName ? 'bg-white text-black border-white' : 'bg-[var(--bg-input)]/40 text-[var(--text-secondary)] border-[var(--border)] hover:border-[var(--text-secondary)]'
                  }`}
                >
                  {t(`settings_theme_${tName}` as any)}
                </button>
              ))}
           </div>
        </motion.div>
      </div>

      <div className="space-y-10">
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="card-premium relative group overflow-hidden"
        >
           <div className="flex items-center gap-8 mb-10 relative z-10">
              <div className="w-16 h-16 bg-blue-600/10 rounded-[1.5rem] flex items-center justify-center text-blue-500 shadow-premium border border-blue-500/20">
                 <HardDrive size={32} />
              </div>
              <div>
                 <h3 className="text-3xl font-black text-[var(--text-primary)] uppercase tracking-tighter flex items-center gap-3 leading-none">
                   {t('settings_centralDir')}
                   <HelpTooltip text={t('settings_centralDirHelp')} />
                 </h3>
                 <span className="text-[11px] font-black text-blue-500 uppercase tracking-widest mt-1 block">Optimized Storage Core</span>
              </div>
           </div>
           
           <div className="flex gap-4 relative z-10">
              <input 
                type="text" 
                value={config.centralDir || ''}
                onChange={(e) => setConfig({ ...config, centralDir: e.target.value })}
                className="flex-1 bg-[var(--bg-input)]/40 border border-[var(--border)] rounded-[1.5rem] px-8 py-5 text-lg focus:outline-none focus:ring-4 focus:ring-blue-600/10 text-[var(--text-primary)] font-mono font-bold shadow-inner"
              />
              <button onClick={() => pickFolder('centralDir')} className="bg-[var(--bg-input)] border border-[var(--border)] hover:bg-blue-600 hover:text-white hover:border-blue-600 text-[var(--text-primary)] px-8 rounded-[1.5rem] transition-all shadow-premium active:scale-95" title={t('search')}>
                 <FolderOpen size={24} />
              </button>
           </div>
        </motion.div>

        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
          className="card-premium relative group overflow-hidden"
        >
           <div className="flex items-center gap-8 mb-10 relative z-10">
              <div className="w-16 h-16 bg-emerald-600/10 rounded-[1.5rem] flex items-center justify-center text-emerald-500 shadow-premium border border-emerald-500/20">
                 <Box size={32} />
              </div>
              <div>
                 <h3 className="text-3xl font-black text-[var(--text-primary)] uppercase tracking-tighter flex items-center gap-3 leading-none">
                   {t('settings_comfyDir')}
                   <HelpTooltip text={t('settings_comfyDirHelp')} />
                 </h3>
                 <span className="text-[11px] font-black text-emerald-500 uppercase tracking-widest mt-1 block">Generative Art Bridge</span>
              </div>
           </div>
           <div className="flex gap-4 relative z-10">
              <input 
                type="text" 
                value={config.comfyDir || ''}
                onChange={(e) => setConfig({ ...config, comfyDir: e.target.value })}
                className="flex-1 bg-[var(--bg-input)]/40 border border-[var(--border)] rounded-[1.5rem] px-8 py-5 text-lg focus:outline-none focus:ring-4 focus:ring-emerald-600/10 text-[var(--text-primary)] font-mono font-bold shadow-inner"
              />
              <button onClick={() => pickFolder('comfyDir')} className="bg-[var(--bg-input)] border border-[var(--border)] hover:bg-emerald-600 hover:text-white hover:border-emerald-600 text-[var(--text-primary)] px-8 rounded-[1.5rem] transition-all shadow-premium active:scale-95" title={t('search')}>
                 <FolderOpen size={24} />
              </button>
           </div>
        </motion.div>

        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.4 }}
          className="card-premium relative group overflow-hidden"
        >
           <div className="flex items-center gap-8 mb-12 relative z-10">
              <div className="w-16 h-16 bg-purple-600/10 rounded-[1.5rem] flex items-center justify-center text-purple-500 shadow-premium border border-purple-500/20">
                 <Folder size={32} />
              </div>
              <div>
                 <h3 className="text-3xl font-black text-[var(--text-primary)] uppercase tracking-tighter flex items-center gap-3 leading-none">
                   {t('settings_scanDirs')}
                   <HelpTooltip text={t('settings_scanDirsHelp')} />
                 </h3>
                 <span className="text-[11px] font-black text-purple-500 uppercase tracking-widest mt-1 block">Silicon Discovery Paths</span>
              </div>
           </div>
           
           <div className="space-y-4 mb-12 max-h-[400px] overflow-y-auto pr-4 custom-scrollbar relative z-10 no-scrollbar">
              {config && config.scanDirectories.length === 0 ? (
                 <div className="text-center py-16 border-2 border-dashed border-[var(--border)] rounded-[2rem] text-[var(--text-muted)] font-black uppercase tracking-widest text-xs opacity-50">
                    No scan directories configured.
                 </div>
              ) : (
                config && config.scanDirectories.map((path: string) => (
                  <div key={path} className="flex items-center justify-between bg-[var(--bg-input)]/30 border border-[var(--border)]/50 rounded-[2rem] p-8 group hover:border-[var(--text-secondary)] hover:bg-[var(--bg-input)]/50 transition-all shadow-sm">
                     <span className="text-lg font-mono text-[var(--text-primary)] font-bold">{path}</span>
                     <button onClick={() => removePath(path)} className="text-[var(--text-muted)] hover:text-red-500 transition-all p-4 hover:bg-red-500/10 rounded-2xl active:scale-90 shrink-0">
                        <Trash2 size={24} />
                     </button>
                  </div>
                ))
              )}
           </div>

           <div className="flex flex-col sm:flex-row gap-4 relative z-10 bg-[var(--bg-input)]/20 p-2 rounded-[2.5rem] border border-[var(--border)]/50">
              <div className="relative flex-1">
                 <input 
                  type="text" 
                  value={newPath}
                  onChange={(e) => setNewPath(e.target.value)}
                  placeholder={t('search') + "..."}
                  className="w-full bg-transparent border-none rounded-[2rem] py-5 pl-8 pr-16 text-lg focus:outline-none text-[var(--text-primary)] font-mono font-bold"
                 />
                 <button onClick={() => pickFolder('scan')} className="absolute right-4 top-1/2 -translate-y-1/2 text-[var(--text-muted)] hover:text-[var(--text-primary)] p-2 active:scale-90">
                    <FolderOpen size={24} />
                 </button>
              </div>
              <button onClick={addPath} className="btn-premium bg-purple-600 hover:bg-purple-500 text-white px-10 py-5 rounded-[2rem] shrink-0">
                 {t('settings_addPath')}
              </button>
           </div>
        </motion.div>

        <div className="fixed bottom-12 right-12 z-50">
           <button 
             onClick={handleSave}
             disabled={saving}
             className="bg-[var(--text-primary)] text-[var(--bg-base)] hover:bg-blue-600 hover:text-white font-black text-sm uppercase tracking-widest px-20 py-8 rounded-[3rem] transition-all shadow-premium flex items-center gap-6 active:scale-95 disabled:opacity-50"
           >
              {saving ? <RefreshCw size={28} className="animate-spin" /> : <Save size={28} />}
              {t('settings_save')}
           </button>
        </div>
      </div>
    </motion.div>
  );
}



