import { useState, useEffect } from 'react';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip, Legend } from 'recharts';
import { motion } from 'framer-motion';
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

  if (loading) return <div className="h-48 sm:h-64 flex items-center justify-center text-xs font-black text-[var(--text-secondary)] uppercase tracking-widest animate-pulse">Analyzing Storage Engine...</div>;

  const COLORS = ['#3b82f6', '#8b5cf6', 'var(--bg-input)'];

  return (
    <motion.div 
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      className="h-full w-full"
    >
      <ResponsiveContainer width="100%" height="100%">
        <PieChart>
          <Pie
            data={data}
            cx="50%"
            cy="50%"
            innerRadius="60%"
            outerRadius="90%"
            paddingAngle={8}
            dataKey="value"
            stroke="none"
            animationBegin={0}
            animationDuration={1500}
            animationEasing="ease-out"
          >
            {data.map((_, index) => (
              <Cell 
                key={`cell-${index}`} 
                fill={COLORS[index % COLORS.length]} 
                className="focus:outline-none"
                style={{ filter: 'drop-shadow(0 0 10px rgba(0,0,0,0.1))' }}
              />
            ))}
          </Pie>
          <Tooltip 
            formatter={(value: any) => formatGB(Number(value))}
            contentStyle={{ 
              backgroundColor: 'rgba(var(--bg-surface-rgb), 0.8)', 
              backdropFilter: 'blur(20px)',
              border: '1px solid var(--border)', 
              borderRadius: '1.5rem', 
              color: 'var(--text-primary)', 
              fontSize: '10px', 
              fontWeight: '900',
              boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.5)',
              textTransform: 'uppercase',
              letterSpacing: '0.1em',
              padding: '12px 16px'
            }}
            itemStyle={{ color: 'var(--text-primary)' }}
            cursor={{ stroke: 'var(--border)', strokeWidth: 2 }}
          />
          <Legend 
            verticalAlign="bottom" 
            align="center"
            iconType="circle"
            iconSize={8}
            formatter={(value) => <span className="text-xs font-black text-[var(--text-secondary)] uppercase tracking-widest ml-3 hover:text-[var(--text-primary)] transition-colors cursor-default">{value}</span>}
            wrapperStyle={{ paddingTop: '32px' }}
          />
        </PieChart>
      </ResponsiveContainer>
    </motion.div>
  );
}

