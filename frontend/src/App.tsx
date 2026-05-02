import { BrowserRouter, Routes, Route, Link, useLocation } from 'react-router-dom';
import { LayoutGrid, HardDrive, Search, Cpu, MessageSquare, Settings as SettingsIcon, Puzzle, Activity, Zap, CheckCircle, Shield, Menu, X, ArrowRight } from 'lucide-react';
import { useEffect, useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import MyModels from './pages/MyModels';
import ExploreStore from './pages/ExploreStore';
import ModelTester from './pages/ModelTester';
import HardwareLab from './pages/HardwareLab';
import Settings from './pages/Settings';
import Extensions from './pages/Extensions';
import Centralization from './pages/Centralization';
import HelpTooltip from './components/HelpTooltip';
import { useApp } from './context/AppContext';
import DiskUsageGraph from './components/DiskUsageGraph';
import { ToastProvider } from './components/Toast';
import DownloadTracker from './components/DownloadTracker';

const PAGE_VARIANTS = {
  initial: { opacity: 0, y: 10 },
  animate: { opacity: 1, y: 0, transition: { duration: 0.6, ease: [0.22, 1, 0.36, 1] as [number, number, number, number] } },
  exit: { opacity: 0, y: -10, transition: { duration: 0.3 } }
};

function Sidebar({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) {
  const { t } = useApp();
  const location = useLocation();
  const menuItems = useMemo(() => [
    { icon: LayoutGrid, label: t('nav_dashboard'), path: '/' },
    { icon: HardDrive, label: t('nav_myModels'), path: '/models' },
    { icon: Shield, label: t('nav_centralization'), path: '/centralize' },
    { icon: Search, label: t('nav_hub'), path: '/explore' },
    { icon: Cpu, label: t('nav_hardware'), path: '/hardware' },
    { icon: MessageSquare, label: t('nav_test'), path: '/test' },
    { icon: Puzzle, label: t('nav_extensions'), path: '/extensions' },
    { icon: SettingsIcon, label: t('nav_settings'), path: '/settings' },
  ], [t]);

  return (
    <>
      <AnimatePresence>
        {isOpen && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/60 backdrop-blur-xl z-[100] lg:hidden" 
            onClick={onClose}
          />
        )}
      </AnimatePresence>
      
      <motion.aside 
        className={`fixed lg:static inset-y-0 left-0 w-72 bg-[var(--bg-surface)] border-r border-[var(--border)] flex flex-col shrink-0 z-[110] shadow-2xl transition-transform lg:translate-x-0 ${isOpen ? 'translate-x-0' : '-translate-x-full'}`}
      >
        <div className="p-8 flex items-center justify-between">
          <div className="flex flex-col">
            <h1 className="text-2xl font-black tracking-tighter bg-gradient-to-br from-blue-400 via-indigo-500 to-purple-600 bg-clip-text text-transparent leading-none">
              Centraliza.ai
            </h1>
            <span className="text-[9px] mt-1 font-black uppercase tracking-[0.3em] text-[var(--text-muted)] flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
              Intelligence Hub
            </span>
          </div>
          <button onClick={onClose} className="lg:hidden p-2.5 bg-[var(--bg-input)] rounded-xl text-[var(--text-muted)] hover:text-red-500 transition-colors border border-[var(--border)]">
            <X size={18} />
          </button>
        </div>
        
        <nav className="flex-1 px-4 space-y-1 overflow-y-auto overflow-x-hidden no-scrollbar py-4">
          {menuItems.map((item) => {
            const Icon = item.icon;
            const isActive = location.pathname === item.path;
            return (
              <Link
                key={item.path}
                to={item.path}
                onClick={() => { if (window.innerWidth < 1024) onClose(); }}
                className={`flex items-center gap-4 px-5 py-4 rounded-2xl transition-all duration-300 group relative overflow-hidden shrink-0 ${
                  isActive
                    ? 'bg-blue-600/10 text-blue-500 border border-blue-500/20'
                    : 'text-[var(--text-secondary)] hover:bg-[var(--bg-input)] hover:text-[var(--text-primary)] border border-transparent'
                }`}
              >
                <Icon size={18} className={`flex-shrink-0 transition-transform duration-500 ${isActive ? 'scale-110' : 'group-hover:rotate-6 group-hover:scale-110 opacity-70'}`} />
                <span className="font-black text-[10px] uppercase tracking-[0.15em] whitespace-nowrap truncate">{item.label}</span>
                {isActive && (
                  <motion.div 
                    layoutId="active-pill"
                    className="absolute left-0 w-1 h-6 bg-blue-500 rounded-r-full"
                  />
                )}
              </Link>
            );
          })}
        </nav>

        <div className="p-6 border-t border-[var(--border)] m-4 rounded-[2rem] bg-[var(--bg-input)]/50 backdrop-blur-xl border border-[var(--border)]/50 shadow-inner">
          <div className="flex items-center gap-2 text-[var(--text-muted)] text-[8px] font-black mb-4 px-1 tracking-[0.2em] uppercase">
            <Activity size={10} className="text-blue-500" />
            <span>Core Performance</span>
          </div>
          <div className="space-y-3">
             <div className="h-1.5 w-full bg-[var(--bg-base)] rounded-full overflow-hidden p-[1px] border border-[var(--border)]/50">
                <motion.div 
                  initial={{ width: 0 }}
                  animate={{ width: "64%" }}
                  className="h-full bg-gradient-to-r from-blue-500 to-indigo-500 rounded-full shadow-[0_0_10px_rgba(59,130,246,0.3)]" 
                />
             </div>
             <div className="flex justify-between text-[8px] text-[var(--text-muted)] uppercase font-black tracking-widest px-1">
                <span>VRAM Usage</span>
                <span className="text-blue-500 font-mono">64.2%</span>
             </div>
          </div>
        </div>
      </motion.aside>
    </>
  );
}

function Dashboard() {
  const { t } = useApp();
  const [stats, setStats] = useState({ models: 0, space: 0, centralized: 0 });

  useEffect(() => {
    fetch('/api/models')
      .then(res => res.json())
      .then(data => {
        const totalSize = data.reduce((acc: number, m: any) => acc + (m.isSymlink ? m.size : 0), 0);
        const centralizedCount = data.filter((m: any) => m.isSymlink).length;
        setStats({ models: data.length, space: totalSize, centralized: centralizedCount });
      });
  }, []);

  return (
    <motion.div 
      variants={PAGE_VARIANTS}
      initial="initial"
      animate="animate"
      exit="exit"
      className="p-6 md:p-12 lg:p-16 max-w-[100rem] mx-auto pb-24"
    >
      <header className="mb-12 md:mb-20 flex justify-between items-end flex-wrap gap-8">
        <div className="space-y-6 max-w-2xl">
           <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-blue-500/10 border border-blue-500/20 text-blue-500 text-[9px] font-black uppercase tracking-[0.2em]">
              <Zap size={12} className="fill-current" /> {t('dash_ready')}
           </div>
           <h2 className="text-4xl md:text-7xl font-black text-[var(--text-primary)] tracking-tighter leading-[0.95] uppercase">
             {t('dash_title').split(' ')[0]} <br/>
             <span className="bg-gradient-to-r from-blue-400 via-indigo-500 to-purple-600 bg-clip-text text-transparent">{t('dash_title').split(' ').slice(1).join(' ')}</span>
           </h2>
           <p className="text-[var(--text-secondary)] text-base md:text-xl font-medium leading-relaxed opacity-80">
             {t('dash_subtitle')}
           </p>
           <div className="flex flex-wrap gap-4 pt-4">
              <Link to="/explore" className="btn-premium bg-[var(--text-primary)] text-[var(--bg-base)] hover:bg-blue-600 hover:text-white flex items-center gap-3">
                 {t('dash_openHub')} <ArrowRight size={14} />
              </Link>
              <div className="flex -space-x-3 overflow-hidden items-center ml-4">
                 {[1,2,3,4].map(i => (
                   <div key={i} className="inline-block h-8 w-8 rounded-full ring-2 ring-[var(--bg-base)] bg-[var(--bg-input)] border border-[var(--border)] flex items-center justify-center">
                     <Cpu size={14} className="text-[var(--text-muted)]" />
                   </div>
                 ))}
                 <span className="ml-4 text-[10px] font-black text-[var(--text-muted)] uppercase tracking-widest">+12 Connected Engines</span>
              </div>
           </div>
        </div>
      </header>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 md:gap-10 mb-16 md:mb-24">
        <div className="card-premium relative group overflow-hidden">
          <div className="absolute top-8 right-8 z-20">
             <HelpTooltip text={t('dash_totalModels')} />
          </div>
          <div className="absolute -bottom-10 -right-10 opacity-[0.05] group-hover:opacity-10 group-hover:scale-110 transition-all duration-700 text-blue-500 -rotate-12">
             <HardDrive size={240} />
          </div>
          <h3 className="text-[var(--text-muted)] font-black text-[9px] uppercase tracking-[0.3em] mb-10">{t('dash_totalModels')}</h3>
          <div className="flex items-baseline gap-2">
            <p className="text-6xl md:text-8xl font-black text-[var(--text-primary)] tracking-tighter leading-none">{stats.models}</p>
            <span className="text-xl font-black text-[var(--text-muted)] uppercase tracking-widest">Active</span>
          </div>
          <div className="mt-12 flex items-center gap-3">
             <div className="h-2 flex-1 bg-[var(--bg-input)] rounded-full overflow-hidden border border-[var(--border)]/50">
                <motion.div 
                  initial={{ width: 0 }}
                  animate={{ width: "75%" }}
                  className="h-full bg-blue-500 shadow-[0_0_15px_rgba(59,130,246,0.5)]" 
                />
             </div>
             <span className="text-[9px] font-black text-blue-500 uppercase tracking-widest">In Sync</span>
          </div>
        </div>

        <div className="card-premium relative group overflow-hidden">
          <div className="absolute top-8 right-8 z-20">
             <HelpTooltip text={t('central_spaceSavedHelp')} />
          </div>
          <div className="absolute -bottom-10 -right-10 opacity-[0.05] group-hover:opacity-10 group-hover:scale-110 transition-all duration-700 text-emerald-500 -rotate-12">
             <Zap size={240} />
          </div>
          <h3 className="text-[var(--text-muted)] font-black text-[9px] uppercase tracking-[0.3em] mb-10">{t('central_spaceSavedHelp')}</h3>
          <div className="flex items-baseline gap-2">
            <p className="text-6xl md:text-8xl font-black text-[var(--text-primary)] tracking-tighter leading-none">{(stats.space / (1024**3)).toFixed(1)}</p>
            <span className="text-xl font-black text-[var(--text-muted)] uppercase tracking-widest">GB</span>
          </div>
          <div className="mt-12 flex items-center gap-3 text-emerald-500 text-[9px] font-black uppercase tracking-widest bg-emerald-500/10 px-5 py-2.5 rounded-full border border-emerald-500/20 w-fit">
             <CheckCircle size={12} className="fill-current" /> {stats.centralized} {t('central_centralized')}
          </div>
        </div>

        <div className="card-premium relative group overflow-hidden">
          <div className="absolute -bottom-10 -right-10 opacity-[0.05] group-hover:opacity-10 group-hover:scale-110 transition-all duration-700 text-purple-500 -rotate-12">
             <Cpu size={240} />
          </div>
          <h3 className="text-[var(--text-muted)] font-black text-[9px] uppercase tracking-[0.3em] mb-10">{t('dash_status')}</h3>
          <p className="text-4xl md:text-6xl font-black text-[var(--text-primary)] uppercase tracking-tighter leading-none mb-4">
            {t('dash_ready')}
          </p>
          <div className="mt-12 flex items-center gap-3 text-purple-500 text-[9px] font-black uppercase tracking-widest bg-purple-500/10 px-5 py-2.5 rounded-full border border-purple-500/20 w-fit">
             <Activity size={12} /> Live Telemetry
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-10">
        <div className="card-premium group relative bg-gradient-to-b from-[var(--bg-surface)] to-[var(--bg-base)]">
           <div className="flex items-center justify-between mb-12 flex-wrap gap-4 relative z-10">
              <div className="flex items-center gap-5">
                 <div className="w-14 h-14 bg-blue-600/10 rounded-[1.25rem] flex items-center justify-center text-blue-500 shadow-xl border border-blue-500/20">
                    <Activity size={24} />
                 </div>
                 <div>
                    <h3 className="text-2xl font-black text-[var(--text-primary)] uppercase tracking-tighter">{t('dash_diskAnalysis')}</h3>
                    <p className="text-[10px] font-black text-[var(--text-muted)] uppercase tracking-widest mt-1">Resource Distribution</p>
                 </div>
              </div>
              <div className="text-[9px] font-black text-blue-400 uppercase tracking-widest bg-blue-500/5 px-4 py-2 rounded-full border border-blue-500/10">Real-time Stream</div>
           </div>
           <div className="relative z-10 h-80">
              <DiskUsageGraph />
           </div>
        </div>

        <div className="bg-gradient-to-br from-blue-700 via-indigo-900 to-black rounded-[2.5rem] p-12 md:p-20 flex flex-col justify-center shadow-premium relative overflow-hidden group">
           <div className="absolute top-0 right-0 w-full h-full bg-[radial-gradient(circle_at_top_right,rgba(255,255,255,0.1),transparent)]" />
           <div className="absolute -bottom-20 -right-20 w-96 h-96 bg-blue-500/20 blur-[120px] rounded-full animate-pulse" />
           
           <div className="relative z-10 space-y-8">
              <h3 className="text-4xl md:text-6xl font-black text-white tracking-tighter leading-[0.9] uppercase break-words">
                {t('dash_deploy')}
              </h3>
              <p className="text-blue-100/70 text-lg md:text-xl leading-relaxed font-medium max-w-md">
                {t('dash_deployDesc')}
              </p>
              <Link to="/explore" className="btn-premium bg-white text-blue-900 hover:bg-blue-50 flex items-center gap-4 w-fit px-12">
                 {t('dash_openHub')} <ArrowRight size={16} />
              </Link>
           </div>
        </div>
      </div>
    </motion.div>
  );
}

function AppContent() {
  const { lang } = useApp();
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const location = useLocation();

  return (
    <ToastProvider>
      <div className={`flex h-screen bg-[var(--bg-base)] text-[var(--text-primary)] overflow-hidden font-sans selection:bg-blue-500/30 antialiased`} dir={lang === 'ar' ? 'rtl' : 'ltr'}>
        <Sidebar isOpen={isMobileMenuOpen} onClose={() => setIsMobileMenuOpen(false)} />
        
        <main className="flex-1 overflow-y-auto overflow-x-hidden bg-[var(--bg-base)] flex flex-col relative no-scrollbar">
          {/* Mobile Header */}
          <header className="lg:hidden flex items-center justify-between p-6 bg-[var(--bg-surface)]/80 border-b border-[var(--border)] sticky top-0 z-[100] backdrop-blur-3xl">
             <h1 className="text-2xl font-black tracking-tighter bg-gradient-to-br from-blue-400 via-indigo-500 to-purple-600 bg-clip-text text-transparent">Centraliza.ai</h1>
             <button 
               onClick={() => setIsMobileMenuOpen(true)}
               className="p-3 bg-[var(--bg-input)] rounded-2xl border border-[var(--border)] text-[var(--text-primary)] active:scale-90 transition-all shadow-xl"
             >
               <Menu size={20} />
             </button>
          </header>

          <div className="flex-1">
            <AnimatePresence mode="wait">
              <Routes location={location} key={location.pathname}>
                <Route path="/" element={<Dashboard />} />
                <Route path="/models" element={<MyModels />} />
                <Route path="/centralize" element={<Centralization />} />
                <Route path="/explore" element={<ExploreStore />} />
                <Route path="/hardware" element={<HardwareLab />} />
                <Route path="/test" element={<ModelTester />} />
                <Route path="/settings" element={<Settings />} />
                <Route path="/extensions" element={<Extensions />} />
              </Routes>
            </AnimatePresence>
          </div>
        </main>
        <DownloadTracker />
      </div>
    </ToastProvider>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <AppContent />
    </BrowserRouter>
  );
}



