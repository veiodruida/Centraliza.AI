import { BrowserRouter as Router, Routes, Route, Link, useLocation } from 'react-router-dom';
import { LayoutGrid, HardDrive, Search, Cpu, MessageSquare, Settings, Activity, Zap, CheckCircle } from 'lucide-react';
import { useEffect, useState } from 'react';
import MyModels from './pages/MyModels';
import ExploreStore from './pages/ExploreStore';

function Sidebar() {
  const location = useLocation();
  const menuItems = [
    { icon: LayoutGrid, label: 'Dashboard', path: '/' },
    { icon: HardDrive, label: 'My Models', path: '/models' },
    { icon: Search, label: 'Explore Store', path: '/explore' },
    { icon: Cpu, label: 'Hardware Check', path: '/hardware' },
    { icon: MessageSquare, label: 'Test & Chat', path: '/test' },
  ];

  return (
    <div className="w-64 h-screen bg-slate-900 border-r border-slate-800 flex flex-col shrink-0">
      <div className="p-8">
        <h1 className="text-2xl font-black bg-gradient-to-r from-blue-400 to-indigo-500 bg-clip-text text-transparent flex items-center gap-2">
          CentralizaIA <span className="text-[10px] px-2 py-0.5 rounded-full bg-indigo-500/20 text-indigo-400 font-bold border border-indigo-500/20">V2</span>
        </h1>
      </div>
      <nav className="flex-1 px-4 space-y-1">
        {menuItems.map((item) => {
          const Icon = item.icon;
          const isActive = location.pathname === item.path;
          return (
            <Link
              key={item.path}
              to={item.path}
              className={`flex items-center gap-3 px-4 py-3 rounded-2xl transition-all duration-300 ${
                isActive
                  ? 'bg-blue-600 text-white shadow-lg shadow-blue-600/20 scale-[1.02]'
                  : 'text-slate-500 hover:bg-slate-800 hover:text-slate-300'
              }`}
            >
              <Icon size={20} />
              <span className="font-semibold text-sm">{item.label}</span>
            </Link>
          );
        })}
      </nav>
      <div className="p-4 border-t border-slate-800 m-4 rounded-2xl bg-slate-800/50">
        <div className="flex items-center gap-3 text-slate-400 text-xs font-bold mb-3 px-2">
          <Activity size={14} />
          SYSTEM STATUS
        </div>
        <div className="space-y-2">
           <div className="h-1.5 w-full bg-slate-700 rounded-full overflow-hidden">
              <div className="h-full bg-emerald-500 w-[45%]" />
           </div>
           <div className="flex justify-between text-[10px] text-slate-500 uppercase font-bold">
              <span>RAM USAGE</span>
              <span>45%</span>
           </div>
        </div>
      </div>
    </div>
  );
}

function Dashboard() {
  return (
    <div className="p-10 max-w-5xl mx-auto">
      <div className="mb-12">
        <h2 className="text-4xl font-black text-white mb-2">Hello, Welcome Back!</h2>
        <p className="text-slate-400">Everything is centralized and running smoothly.</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-8 mb-12">
        <div className="bg-slate-800/50 p-8 rounded-[2rem] border border-slate-700 backdrop-blur-xl relative overflow-hidden group">
          <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity">
             <HardDrive size={80} />
          </div>
          <h3 className="text-slate-500 font-bold text-xs uppercase tracking-widest mb-4">ACTIVE MODELS</h3>
          <p className="text-5xl font-black text-white">12</p>
          <div className="mt-4 flex items-center gap-2 text-emerald-400 text-xs font-bold">
             <CheckCircle size={14} /> +2 this week
          </div>
        </div>

        <div className="bg-slate-800/50 p-8 rounded-[2rem] border border-slate-700 backdrop-blur-xl relative overflow-hidden group">
          <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity">
             <Zap size={80} />
          </div>
          <h3 className="text-slate-500 font-bold text-xs uppercase tracking-widest mb-4">DUPLICATION SAVED</h3>
          <p className="text-5xl font-black text-white">45<span className="text-xl">GB</span></p>
          <div className="mt-4 flex items-center gap-2 text-blue-400 text-xs font-bold">
             Using NTFS Hardlinks
          </div>
        </div>

        <div className="bg-slate-800/50 p-8 rounded-[2rem] border border-slate-700 backdrop-blur-xl relative overflow-hidden group">
          <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity">
             <Cpu size={80} />
          </div>
          <h3 className="text-slate-500 font-bold text-xs uppercase tracking-widest mb-4">LOCAL INFERENCE</h3>
          <p className="text-5xl font-black text-white">READY</p>
          <div className="mt-4 flex items-center gap-2 text-purple-400 text-xs font-bold">
             Ollama API connected
          </div>
        </div>
      </div>

      <div className="bg-gradient-to-r from-blue-600 to-indigo-700 rounded-[2.5rem] p-10 flex items-center justify-between shadow-2xl shadow-blue-600/20">
         <div className="max-w-md">
            <h3 className="text-2xl font-black text-white mb-2">Ready to explore new capabilities?</h3>
            <p className="text-blue-100 text-sm opacity-80 mb-6">Discover the best models for your specific hardware and install them with one click.</p>
            <Link to="/explore" className="bg-white text-blue-600 font-black py-3 px-8 rounded-2xl hover:scale-105 transition-transform inline-block">
               Open Model Store
            </Link>
         </div>
         <div className="hidden lg:block">
            <Search size={120} className="text-white opacity-20" />
         </div>
      </div>
    </div>
  );
}


export default function App() {
  return (
    <Router>
      <div className="flex h-screen bg-slate-950 text-slate-100 overflow-hidden font-sans selection:bg-blue-500/30">
        <Sidebar />
        <main className="flex-1 overflow-y-auto bg-slate-950">
          <Routes>
            <Route path="/" element={<Dashboard />} />
            <Route path="/models" element={<MyModels />} />
            <Route path="/explore" element={<ExploreStore />} />
            <Route path="/hardware" element={<div className="p-20 text-center"><Cpu size={64} className="mx-auto mb-4 opacity-20" /><h2 className="text-2xl font-bold">Hardware Lab Coming Soon</h2></div>} />
            <Route path="/test" element={<div className="p-20 text-center"><MessageSquare size={64} className="mx-auto mb-4 opacity-20" /><h2 className="text-2xl font-bold">Model Playground Coming Soon</h2><p className="text-slate-500 mt-2">Test your models directly from here.</p></div>} />
          </Routes>
        </main>
      </div>
    </Router>
  );
}
