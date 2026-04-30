import { useState, useEffect } from 'react';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip, Legend } from 'recharts';
import { useApp } from '../context/AppContext';

export default function DiskUsageGraph() {
  const { t } = useApp();
  const [data, setData] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchData = async () => {
    try {
      const res = await fetch('/api/system/disk');
      const json = await res.json();
      
      const formatted = [
        { name: t('disk_centraliza') || 'Centraliza.ai (Links)', value: json.centraliza },
        { name: t('disk_others') || 'Other Files', value: json.others },
        { name: t('disk_free') || 'Free Space', value: json.free }
      ];
      setData(formatted);
    } catch (e) { console.error('Disk fetch failed'); }
    finally { setLoading(false); }
  };

  useEffect(() => { fetchData(); }, []);

  const formatGB = (val: number) => (val / (1024 ** 3)).toFixed(1) + ' GB';

  if (loading) return <div className="h-48 sm:h-64 flex items-center justify-center text-[9px] sm:text-[11px] font-black text-[var(--text-muted)] uppercase tracking-[0.2em] sm:tracking-[0.4em] animate-pulse">Analyzing Storage Engine...</div>;

  const COLORS = ['#3b82f6', '#a855f7', 'var(--bg-input)'];

  return (
    <div className="h-full w-full animate-in zoom-in duration-1000">
      <ResponsiveContainer width="100%" height="100%">
        <PieChart>
          <Pie
            data={data}
            cx="50%"
            cy="50%"
            innerRadius={40}
            outerRadius={70}
            paddingAngle={10}
            dataKey="value"
            stroke="none"
            animationBegin={0}
            animationDuration={1500}
          >
            {data.map((_, index) => (
              <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} className="focus:outline-none drop-shadow-2xl" />
            ))}
          </Pie>
          <Tooltip 
            formatter={(value: any) => formatGB(Number(value))}
            contentStyle={{ 
              backgroundColor: 'var(--bg-surface)', 
              border: '1px solid var(--border)', 
              borderRadius: '1rem', 
              color: 'var(--text-primary)', 
              fontSize: '9px', 
              fontWeight: '900',
              backdropFilter: 'blur(10px)',
              boxShadow: '0 20px 50px rgba(0,0,0,0.3)',
              textTransform: 'uppercase',
              letterSpacing: '0.05em',
              padding: '8px 12px'
            }}
            itemStyle={{ color: 'var(--text-primary)' }}
            cursor={{ stroke: 'var(--border)', strokeWidth: 2 }}
          />
          <Legend 
            verticalAlign="bottom" 
            align="center"
            iconType="circle"
            formatter={(value) => <span className="text-[8px] sm:text-[10px] font-black text-[var(--text-muted)] uppercase tracking-[0.1em] sm:tracking-[0.2em] ml-2 hover:text-[var(--text-primary)] transition-colors cursor-default">{value}</span>}
            wrapperStyle={{ paddingTop: '12px' }}
          />
        </PieChart>
      </ResponsiveContainer>
    </div>
  );
}
