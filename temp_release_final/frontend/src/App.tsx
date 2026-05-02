import { BrowserRouter, Routes, Route, Link, useLocation } from 'react-router-dom';
import { LayoutGrid, HardDrive, Search, Cpu, MessageSquare, Settings as SettingsIcon, Puzzle, Activity, Zap, Shield, Menu, X, ArrowRight, Info, Box, Terminal } from 'lucide-react';
import { useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import MyModels from './pages/MyModels';
import ExploreStore from './pages/ExploreStore';
import ModelTester from './pages/ModelTester';
import HardwareLab from './pages/HardwareLab';
import Settings from './pages/Settings';
import Extensions from './pages/Extensions';
import Centralization from './pages/Centralization';

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
            <span className="text-xs mt-1 font-black uppercase tracking-widest text-[var(--text-muted)] flex items-center gap-1.5">
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
                className={`flex items-center gap-4 px-6 py-5 rounded-2xl transition-all duration-300 group relative overflow-hidden shrink-0 ${
                  isActive
                    ? 'bg-blue-600/10 text-blue-500 border border-blue-500/20 shadow-glow-blue'
                    : 'text-[var(--text-secondary)] hover:bg-[var(--bg-input)] hover:text-[var(--text-primary)] border border-transparent'
                }`}
              >
                <Icon size={20} className={`flex-shrink-0 transition-transform duration-500 ${isActive ? 'scale-110' : 'group-hover:rotate-6 group-hover:scale-110 opacity-70'}`} />
                <span className="font-bold text-xs md:text-[13px] uppercase tracking-wider whitespace-nowrap truncate">{item.label}</span>
                {isActive && (
                  <motion.div 
                    layoutId="active-pill"
                    className="absolute left-0 w-1.5 h-8 bg-blue-500 rounded-r-full shadow-[0_0_15px_rgba(59,130,246,0.5)]"
                  />
                )}
              </Link>
            );
          })}
        </nav>

        <div className="p-6 border-t border-[var(--border)] m-4 rounded-[2rem] bg-[var(--bg-input)]/50 backdrop-blur-xl border border-[var(--border)]/50 shadow-inner">
          <div className="flex items-center gap-2 text-[var(--text-muted)] text-[10px] md:text-xs font-black mb-4 px-1 tracking-[0.2em] uppercase">
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
             <div className="flex justify-between text-[10px] md:text-xs text-[var(--text-muted)] uppercase font-black tracking-widest px-1">
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
  

  

  return (
    <motion.div 
      variants={PAGE_VARIANTS}
      initial="initial"
      animate="animate"
      exit="exit"
      className="p-6 md:p-12 lg:p-16 max-w-[100rem] mx-auto pb-20 space-y-20"
    >
      <header>
        <h2 className="text-[11px] font-black text-blue-500 uppercase tracking-[0.5em] mb-4">{t('dash_title')}</h2>
        <h1 className="text-4xl md:text-8xl font-black text-[var(--text-primary)] tracking-tighter leading-[0.85] uppercase max-w-4xl">{t('dash_subtitle')}</h1>
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-12">
         <div className="card-premium p-10 md:p-16 flex flex-col justify-between overflow-hidden relative group">
            <div className="absolute top-0 right-0 p-12 opacity-5 group-hover:opacity-10 transition-opacity"><HardDrive size={240} /></div>
            <div className="relative z-10 flex items-center justify-between mb-12">
               <div className="flex flex-col">
                  <span className="text-[11px] font-black text-[var(--text-muted)] uppercase tracking-widest mb-1">{t('dash_diskAnalysis')}</span>
                  <span className="text-4xl font-black text-[var(--text-primary)] tracking-tighter uppercase">Local Storage</span>
               </div>
               <div className="text-xs font-black text-blue-400 uppercase tracking-widest bg-blue-500/5 px-4 py-2 rounded-full border border-blue-500/10">Real-time Stream</div>
            </div>
            <div className="relative z-10 h-80">
               <DiskUsageGraph />
            </div>
         </div>

         <div className="bg-gradient-to-br from-blue-700 via-indigo-900 to-black rounded-[2.5rem] p-12 md:p-16 flex flex-col justify-center shadow-premium relative overflow-hidden group">
            <div className="absolute top-0 right-0 w-full h-full bg-[radial-gradient(circle_at_top_right,rgba(255,255,255,0.1),transparent)]" />
            <div className="absolute -bottom-20 -right-20 w-96 h-96 bg-blue-500/20 blur-[120px] rounded-full animate-pulse" />
            
            <div className="relative z-10 space-y-8">
               <h3 className="text-4xl md:text-6xl font-black text-white tracking-tighter leading-[0.9] uppercase">
                 {t('dash_deploy')}
               </h3>
               <div className="space-y-6">
                 <p className="text-blue-100 text-xl md:text-2xl leading-relaxed font-bold">
                   {t('dash_deployDesc')}
                 </p>
                 <p className="text-blue-200/60 text-base md:text-lg leading-relaxed font-medium italic border-l-4 border-blue-500/30 pl-6">
                   {t('dash_purposeDetail')}
                 </p>
               </div>
               <div className="flex flex-wrap gap-6 pt-4">
                 <Link to="/explore" className="btn-premium bg-white text-blue-900 hover:bg-blue-50 flex items-center gap-4 w-fit px-12 py-5 shadow-2xl">
                    {t('dash_openHub')} <ArrowRight size={18} />
                 </Link>
                 <Link to="/centralize" className="btn-premium bg-blue-600/20 border border-blue-400/30 text-white hover:bg-blue-600/30 flex items-center gap-4 w-fit px-12 py-5">
                    {t('central_title')} <Zap size={18} />
                 </Link>
               </div>
            </div>
         </div>
      </div>

      {/* Benefits Section */}
      <section className="space-y-12">
        <div className="text-center space-y-4">
          <h2 className="text-3xl md:text-5xl font-black text-[var(--text-primary)] tracking-tighter uppercase">{t('dash_benefitTitle')}</h2>
          <div className="w-20 h-1 bg-blue-600 mx-auto rounded-full" />
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
          {[1, 2, 3].map(i => (
            <div key={i} className="card-premium p-10 space-y-6 hover:translate-y-[-8px] transition-transform">
              <div className="w-14 h-14 bg-blue-600/10 rounded-2xl flex items-center justify-center text-blue-500">
                {i === 1 ? <Zap size={28} /> : i === 2 ? <Box size={28} /> : <Info size={28} />}
              </div>
              <h3 className="text-2xl font-black text-[var(--text-primary)] uppercase tracking-tighter">{t(`dash_benefit${i}` as any)}</h3>
              <p className="text-[var(--text-secondary)] text-lg leading-relaxed opacity-80">{t(`dash_benefit${i}Desc` as any)}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Tutorial Section */}
      <section className="bg-[var(--bg-input)]/30 rounded-[3.5rem] p-12 md:p-20 border border-[var(--border)] relative overflow-hidden">
        <div className="absolute top-0 right-0 w-96 h-96 bg-blue-600/5 blur-[120px] rounded-full" />
        <h2 className="text-3xl md:text-5xl font-black text-[var(--text-primary)] tracking-tighter uppercase mb-16 flex items-center gap-6">
          <Terminal size={40} className="text-blue-500" />
          {t('dash_tutorialTitle')}
        </h2>
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-12 relative">
          <div className="absolute hidden lg:block top-10 left-0 w-full h-0.5 bg-gradient-to-r from-blue-500/0 via-blue-500/20 to-blue-500/0" />
          {[1, 2, 3].map(i => (
            <div key={i} className="relative space-y-6">
              <div className="w-12 h-12 bg-blue-600 text-white rounded-full flex items-center justify-center font-black text-xl shadow-xl shadow-blue-600/20 z-10 relative">
                {i}
              </div>
              <h3 className="text-2xl font-black text-[var(--text-primary)] uppercase tracking-tighter">{t(`dash_step${i}` as any)}</h3>
              <p className="text-[var(--text-secondary)] text-lg leading-relaxed opacity-80">{t(`dash_step${i}Desc` as any)}</p>
            </div>
          ))}
        </div>
      </section>

      {/* FAQ Section */}
      <section className="max-w-4xl mx-auto space-y-12 pb-10">
        <h2 className="text-3xl md:text-5xl font-black text-[var(--text-primary)] tracking-tighter uppercase text-center">{t('dash_faqTitle')}</h2>
        <div className="space-y-6">
          {[1, 2].map(i => (
            <div key={i} className="bg-[var(--bg-surface)] border border-[var(--border)] rounded-[2rem] p-8 md:p-12 space-y-4 hover:border-blue-500/30 transition-colors">
              <h4 className="text-xl font-black text-[var(--text-primary)] flex items-center gap-4">
                <div className="w-2 h-2 rounded-full bg-blue-500" />
                {t(`dash_faqQ${i}` as any)}
              </h4>
              <p className="text-[var(--text-secondary)] text-lg leading-relaxed pl-6 border-l-2 border-[var(--border)]">{t(`dash_faqA${i}` as any)}</p>
            </div>
          ))}
        </div>
      </section>
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


