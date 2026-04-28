import { BrowserRouter as Router, Routes, Route, Link, useLocation } from 'react-router-dom';
import { LayoutGrid, HardDrive, Search, Cpu, MessageSquare, Settings as SettingsIcon, Puzzle, Activity, Zap, CheckCircle, Shield } from 'lucide-react';
import { useEffect, useState } from 'react';
import MyModels from './pages/MyModels';
import ExploreStore from './pages/ExploreStore';
import ModelTester from './pages/ModelTester';
import HardwareLab from './pages/HardwareLab';
import Settings from './pages/Settings';
import Extensions from './pages/Extensions';
import Centralization from './pages/Centralization';

function Sidebar() {
  const location = useLocation();
  const menuItems = [
    { icon: LayoutGrid, label: 'Dashboard', path: '/' },
    { icon: HardDrive, label: 'My Models', path: '/models' },
    { icon: Shield, label: 'Centralization', path: '/centralize' },
    { icon: Search, label: 'AI Model Hub', path: '/explore' },
    { icon: Cpu, label: 'Hardware Lab', path: '/hardware' },
    { icon: MessageSquare, label: 'Test & Chat', path: '/test' },
    { icon: Puzzle, label: 'Extensions', path: '/extensions' },
    { icon: SettingsIcon, label: 'Settings', path: '/settings' },
  ];

  return (
    <div className="w-72 h-screen bg-slate-950 border-r border-slate-900 flex flex-col shrink-0">
      <div className="p-10">
        <h1 className="text-2xl font-black bg-gradient-to-r from-blue-400 to-indigo-500 bg-clip-text text-transparent flex items-center gap-2">
          CentralizaIA <span className="text-[10px] px-2 py-0.5 rounded-full bg-indigo-500/20 text-indigo-400 font-bold border border-indigo-500/20">V2</span>
        </h1>
      </div>
      <nav className="flex-1 px-6 space-y-2 overflow-y-auto custom-scrollbar">
        {menuItems.map((item) => {
          const Icon = item.icon;
          const isActive = location.pathname === item.path;
          return (
            <Link
              key={item.path}
              to={item.path}
              className={`flex items-center gap-4 px-5 py-4 rounded-[1.5rem] transition-all duration-300 ${
                isActive
                  ? 'bg-blue-600 text-white shadow-2xl shadow-blue-600/30 scale-[1.03]'
                  : 'text-slate-500 hover:bg-slate-900 hover:text-slate-300'
              }`}
            >
              <Icon size={20} />
              <span className="font-black text-xs uppercase tracking-widest">{item.label}</span>
            </Link>
          );
        })}
      </nav>
      <div className="p-6 border-t border-slate-900 m-6 rounded-[2rem] bg-slate-900/40 backdrop-blur-md">
        <div className="flex items-center gap-3 text-slate-500 text-[10px] font-black mb-4 px-2 tracking-widest">
          <Activity size={14} />
          SYSTEM PULSE
        </div>
        <div className="space-y-3">
           <div className="h-1.5 w-full bg-slate-800 rounded-full overflow-hidden">
              <div className="h-full bg-blue-500 w-[60%] shadow-[0_0_10px_rgba(59,130,246,0.5)]" />
           </div>
           <div className="flex justify-between text-[9px] text-slate-600 uppercase font-black tracking-widest">
              <span>RAM USAGE</span>
              <span>60%</span>
           </div>
        </div>
      </div>
    </div>
  );
}

function Dashboard() {
  const [stats, setStats] = useState({ models: 0, space: 0 });

  useEffect(() => {
    fetch('/api/models')
      .then(res => res.json())
      .then(data => {
        const totalSize = data.reduce((acc: number, m: any) => acc + (m.isSymlink ? m.size : 0), 0);
        setStats({ models: data.length, space: totalSize });
      });
  }, []);

  return (
    <div className="p-12 max-w-6xl mx-auto animate-in fade-in duration-700">
      <div className="mb-16">
        <h2 className="text-5xl font-black text-white mb-4 tracking-tighter">Command Center</h2>
        <p className="text-slate-500 text-lg">Your AI infrastructure is centralized and optimized.</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-8 mb-16">
        <div className="bg-slate-900/50 p-10 rounded-[3rem] border border-slate-800 backdrop-blur-xl relative overflow-hidden group shadow-2xl">
          <div className="absolute top-0 right-0 p-8 opacity-5 group-hover:opacity-10 transition-opacity">
             <HardDrive size={100} />
          </div>
          <h3 className="text-slate-500 font-black text-[10px] uppercase tracking-[0.2em] mb-6">Total Models</h3>
          <p className="text-6xl font-black text-white">{stats.models}</p>
          <div className="mt-6 flex items-center gap-2 text-emerald-400 text-xs font-black uppercase tracking-widest">
             <CheckCircle size={14} /> Health 100%
          </div>
        </div>

        <div className="bg-slate-900/50 p-10 rounded-[3rem] border border-slate-800 backdrop-blur-xl relative overflow-hidden group shadow-2xl">
          <div className="absolute top-0 right-0 p-8 opacity-5 group-hover:opacity-10 transition-opacity">
             <Zap size={100} />
          </div>
          <h3 className="text-slate-500 font-black text-[10px] uppercase tracking-[0.2em] mb-6">Space Saved</h3>
          <p className="text-6xl font-black text-white">{(stats.space / (1024**3)).toFixed(1)}<span className="text-xl">GB</span></p>
          <div className="mt-6 flex items-center gap-2 text-blue-400 text-xs font-black uppercase tracking-widest">
             <Zap size={14} /> Link Engine Active
          </div>
        </div>

        <div className="bg-slate-900/50 p-10 rounded-[3rem] border border-slate-800 backdrop-blur-xl relative overflow-hidden group shadow-2xl">
          <div className="absolute top-0 right-0 p-8 opacity-5 group-hover:opacity-10 transition-opacity">
             <Cpu size={100} />
          </div>
          <h3 className="text-slate-500 font-black text-[10px] uppercase tracking-[0.2em] mb-6">Neural Status</h3>
          <p className="text-6xl font-black text-white uppercase tracking-tighter">READY</p>
          <div className="mt-6 flex items-center gap-2 text-purple-400 text-xs font-black uppercase tracking-widest">
             Adapters active
          </div>
        </div>
      </div>

      <div className="bg-gradient-to-br from-blue-600 to-indigo-800 rounded-[4rem] p-16 flex items-center justify-between shadow-2xl shadow-blue-600/20 relative overflow-hidden group">
         <div className="absolute top-0 right-0 w-full h-full bg-[radial-gradient(circle_at_top_right,rgba(255,255,255,0.1),transparent)]" />
         <div className="max-w-xl relative z-10">
            <h3 className="text-4xl font-black text-white mb-4 tracking-tight">Deploy new intelligence.</h3>
            <p className="text-blue-100 text-lg opacity-80 mb-10 leading-relaxed font-medium font-sans">Discover top-tier models and benchmark them against your hardware in seconds.</p>
            <Link to="/explore" className="bg-white text-blue-700 font-black py-4 px-12 rounded-[1.5rem] hover:scale-105 transition-all inline-block shadow-2xl shadow-white/10 active:scale-95 text-xs uppercase tracking-widest">
               Open Model Hub
            </Link>
         </div>
         <div className="hidden lg:block relative z-10">
            <Search size={140} className="text-white opacity-20 group-hover:scale-110 transition-transform duration-700" />
         </div>
      </div>
    </div>
  );
}

export default function App() {
  return (
    <Router>
      <div className="flex h-screen bg-slate-950 text-slate-100 overflow-hidden font-sans selection:bg-blue-500/30 antialiased">
        <Sidebar />
        <main className="flex-1 overflow-y-auto bg-slate-950">
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
        </main>
      </div>
    </Router>
  );
}
