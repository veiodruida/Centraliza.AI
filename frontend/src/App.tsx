import { BrowserRouter as Router, Routes, Route, Link, useLocation } from 'react-router-dom';
import { LayoutGrid, HardDrive, Search, Cpu, MessageSquare, Settings as SettingsIcon, Puzzle, Activity, Zap, CheckCircle, Shield, Menu, X } from 'lucide-react';
import { useEffect, useState } from 'react';
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

function Sidebar({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) {
  const { t } = useApp();
  const location = useLocation();
  const menuItems = [
    { icon: LayoutGrid, label: t('nav_dashboard'), path: '/' },
    { icon: HardDrive, label: t('nav_myModels'), path: '/models' },
    { icon: Shield, label: t('nav_centralization'), path: '/centralize' },
    { icon: Search, label: t('nav_hub'), path: '/explore' },
    { icon: Cpu, label: t('nav_hardware'), path: '/hardware' },
    { icon: MessageSquare, label: t('nav_test'), path: '/test' },
    { icon: Puzzle, label: t('nav_extensions'), path: '/extensions' },
    { icon: SettingsIcon, label: t('nav_settings'), path: '/settings' },
  ];

  return (
    <>
      <div 
        className={`fixed inset-0 bg-black/40 backdrop-blur-md z-[100] transition-opacity duration-700 lg:hidden ${isOpen ? 'opacity-100' : 'opacity-0 pointer-events-none'}`} 
        onClick={onClose}
      />
      
      <div className={`fixed lg:static inset-y-0 left-0 w-64 sm:w-72 bg-[var(--bg-surface)] border-r border-[var(--border)] flex flex-col shrink-0 z-[110] transition-all duration-500 cubic-bezier(0.4, 0, 0.2, 1) shadow-2xl lg:translate-x-0 ${isOpen ? 'translate-x-0' : '-translate-x-full'}`}>
        <div className="p-4 sm:p-6 md:p-8 flex items-center justify-between">
          <h1 className="text-lg sm:text-xl md:text-2xl font-black tracking-tighter bg-gradient-to-br from-blue-500 via-indigo-500 to-purple-600 bg-clip-text text-transparent flex flex-col gap-0.5">
            Centraliza.ai 
            <span className="text-[8px] px-2 py-0.5 rounded-full bg-blue-500/10 text-blue-500 font-black border border-blue-500/10 w-fit uppercase tracking-widest">V3.2.0</span>
          </h1>
          <button onClick={onClose} className="lg:hidden p-2.5 bg-[var(--bg-input)] rounded-xl text-[var(--text-muted)] hover:text-red-500 transition-colors border border-[var(--border)]">
            <X size={18} />
          </button>
        </div>
        
        <nav className="flex-1 px-2 sm:px-4 space-y-1 sm:space-y-1.5 overflow-y-auto no-scrollbar">
          {menuItems.map((item) => {
            const Icon = item.icon;
            const isActive = location.pathname === item.path;
            return (
              <Link
                key={item.path}
                to={item.path}
                onClick={() => { if (window.innerWidth < 1024) onClose(); }}
                className={`flex items-center gap-2 sm:gap-4 px-3 sm:px-5 py-3 sm:py-4 rounded-lg sm:rounded-2xl transition-all duration-300 group relative overflow-hidden ${
                  isActive
                    ? 'bg-blue-600 text-white shadow-lg shadow-blue-600/20'
                    : 'text-[var(--text-muted)] hover:bg-[var(--bg-input)] hover:text-[var(--text-primary)]'
                }`}
              >
                <Icon size={16} className={`flex-shrink-0 transition-all duration-500 ${isActive ? 'rotate-0' : 'group-hover:rotate-12 group-hover:scale-110 opacity-70'}`} />
                <span className="font-black text-[8px] sm:text-[10px] uppercase tracking-[0.1em] sm:tracking-[0.2em] truncate">{item.label}</span>
                {isActive && <div className="absolute right-4 w-1.5 h-1.5 rounded-full bg-white shadow-[0_0_8px_rgba(255,255,255,0.8)]" />}
              </Link>
            );
          })}
        </nav>

        <div className="p-4 sm:p-6 border-t border-[var(--border)] m-2 sm:m-4 rounded-2xl sm:rounded-3xl bg-[var(--bg-input)]/30 backdrop-blur-xl border border-[var(--border)]/50 shadow-inner group/pulse">
          <div className="flex items-center gap-2 text-[var(--text-muted)] text-[7px] sm:text-[8px] font-black mb-3 sm:mb-4 px-1 tracking-[0.2em] sm:tracking-[0.3em] uppercase">
            <Activity size={10} className="text-blue-500 group-hover/pulse:animate-pulse flex-shrink-0" />
            <span className="truncate">System Pulse</span>
          </div>
          <div className="space-y-2 sm:space-y-3">
             <div className="h-1 w-full bg-[var(--bg-base)] rounded-full overflow-hidden p-[1px] border border-[var(--border)]/50">
                <div className="h-full bg-gradient-to-r from-blue-500 to-indigo-500 rounded-full w-[64%] shadow-[0_0_10px_rgba(59,130,246,0.3)]" />
             </div>
             <div className="flex justify-between text-[8px] text-[var(--text-muted)] uppercase font-black tracking-widest px-1">
                <span>Memory</span>
                <span className="text-blue-500 font-mono">64.2%</span>
             </div>
          </div>
        </div>
      </div>
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
    <div className="p-3 sm:p-6 md:p-10 lg:p-12 max-w-[90rem] mx-auto animate-in fade-in duration-1000 pb-24">
      <div className="mb-6 sm:mb-10 md:mb-16 flex justify-between items-end flex-wrap gap-4 sm:gap-6">
        <div className="space-y-3 sm:space-y-4 w-full sm:w-auto">
           <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-blue-500/10 border border-blue-500/20 text-blue-500 text-[8px] sm:text-[9px] font-black uppercase tracking-[0.15em] sm:tracking-[0.2em] mb-2">
              <Zap size={10} className="fill-current flex-shrink-0" /> {t('dash_ready')}
           </div>
           <h2 className="text-2xl sm:text-4xl md:text-6xl font-black text-[var(--text-primary)] tracking-tighter leading-[1.1] uppercase break-words">
             {t('dash_title').split(' ')[0]} <br/>
             <span className="bg-gradient-to-r from-blue-500 via-indigo-600 to-purple-600 bg-clip-text text-transparent">{t('dash_title').split(' ').slice(1).join(' ')}</span>
           </h2>
           <p className="text-[var(--text-secondary)] text-sm sm:text-base md:text-lg font-medium max-w-xl leading-relaxed opacity-70 break-words">{t('dash_subtitle')}</p>
        </div>
        <div className="flex gap-2 sm:gap-4 w-full sm:w-auto">
           <Link to="/explore" className="flex-1 sm:flex-none text-center bg-[var(--text-primary)] text-[var(--bg-base)] hover:bg-blue-600 hover:text-white font-black py-3 sm:py-4 px-4 sm:px-8 md:px-10 rounded-lg sm:rounded-2xl transition-all shadow-premium active:scale-95 text-[9px] sm:text-[10px] uppercase tracking-[0.15em] sm:tracking-[0.2em] whitespace-nowrap">
              {t('dash_openHub')}
           </Link>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6 md:gap-8 mb-8 sm:mb-12 md:mb-16">
        <div className="bg-[var(--bg-surface)] p-6 sm:p-8 md:p-10 rounded-2xl sm:rounded-[2.5rem] md:rounded-[3rem] border border-[var(--border)] backdrop-blur-3xl relative overflow-hidden group shadow-xl hover:border-blue-500/30 transition-all active:scale-[0.98]">
          <div className="absolute top-4 sm:top-6 right-4 sm:right-8 z-20 scale-75 sm:scale-90">
             <HelpTooltip text={t('dash_totalModels')} />
          </div>
          <div className="absolute -bottom-6 -right-6 p-4 sm:p-8 opacity-[0.03] group-hover:opacity-10 group-hover:scale-110 transition-all duration-1000 text-[var(--text-primary)] -rotate-12">
             <HardDrive size={100} className="sm:scale-150" />
          </div>
          <h3 className="text-[var(--text-muted)] font-black text-[8px] sm:text-[9px] uppercase tracking-[0.2em] sm:tracking-[0.3em] mb-4 sm:mb-8">{t('dash_totalModels')}</h3>
          <p className="text-4xl sm:text-5xl md:text-7xl font-black text-[var(--text-primary)] tracking-tighter leading-none">{stats.models}</p>
          <div className="mt-4 sm:mt-8 flex items-center gap-2 sm:gap-3">
             <div className="h-1 flex-1 bg-[var(--bg-input)] rounded-full overflow-hidden border border-[var(--border)]/50">
                <div className="h-full bg-blue-500 w-[75%] shadow-[0_0_10px_rgba(59,130,246,0.3)]" />
             </div>
             <span className="text-[7px] sm:text-[8px] font-black text-blue-500 uppercase tracking-widest whitespace-nowrap">Synced</span>
          </div>
        </div>

        <div className="bg-[var(--bg-surface)] p-6 sm:p-8 md:p-10 rounded-2xl sm:rounded-[2.5rem] md:rounded-[3rem] border border-[var(--border)] backdrop-blur-3xl relative overflow-hidden group shadow-xl hover:border-emerald-500/30 transition-all active:scale-[0.98]">
          <div className="absolute top-4 sm:top-6 right-4 sm:right-8 z-20 scale-75 sm:scale-90">
             <HelpTooltip text={t('central_spaceSavedHelp')} />
          </div>
          <div className="absolute -bottom-6 -right-6 p-8 opacity-[0.03] group-hover:opacity-10 group-hover:scale-110 transition-all duration-1000 text-[var(--text-primary)] -rotate-12">
             <Zap size={160} />
          </div>
          <h3 className="text-[var(--text-muted)] font-black text-[8px] sm:text-[9px] uppercase tracking-[0.2em] sm:tracking-[0.3em] mb-4 sm:mb-8">{t('central_spaceSavedHelp')}</h3>
          <div className="flex items-baseline gap-2">
            <p className="text-4xl sm:text-5xl md:text-7xl font-black text-[var(--text-primary)] tracking-tighter leading-none">{(stats.space / (1024**3)).toFixed(1)}</p>
            <span className="text-base sm:text-lg md:text-2xl font-black text-[var(--text-muted)] uppercase tracking-tighter">GB</span>
          </div>
          <div className="mt-4 sm:mt-8 flex items-center gap-2 sm:gap-3 text-emerald-500 text-[7px] sm:text-[8px] font-black uppercase tracking-widest bg-emerald-500/10 px-3 sm:px-4 py-2 rounded-full border border-emerald-500/20 w-fit">
             <CheckCircle size={10} className="fill-current" /> {stats.centralized} {t('central_centralized')}
          </div>
        </div>

        <div className="bg-[var(--bg-surface)] p-6 sm:p-8 md:p-10 rounded-2xl sm:rounded-[2.5rem] md:rounded-[3rem] border border-[var(--border)] backdrop-blur-3xl relative overflow-hidden group shadow-xl hover:border-purple-500/30 transition-all active:scale-[0.98]">
          <div className="absolute -bottom-6 -right-6 p-4 sm:p-8 opacity-[0.03] group-hover:opacity-10 group-hover:scale-110 transition-all duration-1000 text-[var(--text-primary)] -rotate-12">
             <Cpu size={100} className="sm:scale-150" />
          </div>
          <h3 className="text-[var(--text-muted)] font-black text-[8px] sm:text-[9px] uppercase tracking-[0.2em] sm:tracking-[0.3em] mb-4 sm:mb-8">{t('dash_status')}</h3>
          <p className="text-3xl sm:text-4xl md:text-6xl font-black text-[var(--text-primary)] uppercase tracking-tighter leading-none truncate">{t('dash_ready')}</p>
          <div className="mt-4 sm:mt-8 flex items-center gap-2 sm:gap-3 text-purple-500 text-[7px] sm:text-[8px] font-black uppercase tracking-widest bg-purple-500/10 px-3 sm:px-4 py-2 rounded-full border border-purple-500/20 w-fit">
             <Activity size={10} /> Stable
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4 sm:gap-6 md:gap-8 lg:gap-10 mb-8 sm:mb-16">
        <div className="bg-[var(--bg-surface)] border border-[var(--border)] rounded-2xl sm:rounded-[2.5rem] md:rounded-[3rem] p-6 sm:p-8 md:p-10 lg:p-12 shadow-premium relative overflow-hidden group">
           <div className="absolute top-0 right-0 w-60 h-60 sm:w-80 sm:h-80 bg-blue-500/5 blur-[100px] rounded-full" />
           <div className="flex items-center justify-between mb-6 sm:mb-8 flex-wrap gap-3 sm:gap-4 relative z-10">
              <h3 className="text-base sm:text-lg md:text-xl lg:text-2xl font-black text-[var(--text-primary)] flex items-center gap-2 sm:gap-4 uppercase tracking-tighter break-words">
                 <div className="w-8 h-8 sm:w-10 sm:h-10 md:w-12 md:h-12 bg-blue-600/10 rounded-lg sm:rounded-xl md:rounded-2xl flex items-center justify-center text-blue-500 shadow-xl shadow-blue-500/10 flex-shrink-0">
                    <Activity size={18} className="sm:scale-100" />
                 </div>
                 {t('dash_diskAnalysis')}
              </h3>
              <div className="text-[7px] sm:text-[8px] font-black text-[var(--text-muted)] uppercase tracking-[0.15em] sm:tracking-[0.2em] bg-[var(--bg-input)] px-2 sm:px-3 py-1 sm:py-1.5 rounded-full border border-[var(--border)] whitespace-nowrap">Real-time</div>
           </div>
           <div className="relative z-10 h-48 sm:h-64 md:h-72 lg:h-80">
              <DiskUsageGraph />
           </div>
        </div>

        <div className="bg-gradient-to-br from-blue-700 via-indigo-800 to-indigo-950 rounded-2xl sm:rounded-[2.5rem] md:rounded-[3rem] p-6 sm:p-8 md:p-12 lg:p-16 flex flex-col justify-center shadow-2xl relative overflow-hidden group min-h-[250px] sm:min-h-[300px] md:min-h-[350px]">
           <div className="absolute top-0 right-0 w-full h-full bg-[radial-gradient(circle_at_top_right,rgba(255,255,255,0.08),transparent)]" />
           <div className="relative z-10 space-y-4 sm:space-y-6">
              <h3 className="text-2xl sm:text-3xl md:text-4xl lg:text-5xl font-black text-white tracking-tighter leading-[1] uppercase break-words">{t('dash_deploy')}</h3>
              <p className="text-blue-100/80 text-sm sm:text-base md:text-lg leading-relaxed font-medium max-w-sm break-words">{t('dash_deployDesc')}</p>
              <Link to="/explore" className="bg-white text-blue-900 hover:bg-blue-50 font-black py-3 sm:py-4 px-6 sm:px-10 rounded-lg sm:rounded-2xl hover:scale-105 transition-all inline-block shadow-xl shadow-black/20 active:scale-95 text-[9px] sm:text-[10px] uppercase tracking-[0.15em] sm:tracking-[0.2em] w-fit">
                 {t('dash_openHub')}
              </Link>
           </div>
        </div>
      </div>
    </div>
  );
}

export default function App() {
  const { lang } = useApp();
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  return (
    <ToastProvider>
      <Router>
        <div className={`flex h-screen bg-[var(--bg-base)] text-[var(--text-primary)] overflow-hidden font-sans selection:bg-blue-500/30 antialiased`} dir={lang === 'ar' ? 'rtl' : 'ltr'}>
          <Sidebar isOpen={isMobileMenuOpen} onClose={() => setIsMobileMenuOpen(false)} />
          
          <main className="flex-1 overflow-y-auto bg-[var(--bg-base)] flex flex-col relative no-scrollbar">
            {/* Mobile Header */}
            <header className="lg:hidden flex items-center justify-between p-5 bg-[var(--bg-surface)] border-b border-[var(--border)] sticky top-0 z-30 backdrop-blur-2xl">
               <h1 className="text-xl font-black tracking-tighter bg-gradient-to-br from-blue-500 via-indigo-500 to-purple-600 bg-clip-text text-transparent">Centraliza.ai</h1>
               <button 
                 onClick={() => setIsMobileMenuOpen(true)}
                 className="p-3 bg-[var(--bg-input)] rounded-xl border border-[var(--border)] text-[var(--text-primary)] active:scale-90 transition-all shadow-sm"
               >
                 <Menu size={20} />
               </button>
            </header>

            <div className="flex-1">
              <Routes>
                <Route path="/" element={<Dashboard />} />
                <Route path="/models" element={<MyModels />} />
                <Route path="/centralize" element={<Centralization />} />
                <Route path="/explore" element={<ExploreStore />} />
                <Route path="/hardware" element={<HardwareLab />} />
                <Route path="/test" element={<ModelTester />} />
                <Route path="/settings" element={<Settings />} />
                <Route path="/extensions" element={<Extensions />} />
              </Routes>
            </div>
          </main>
          <DownloadTracker />
        </div>
      </Router>
    </ToastProvider>
  );
}
