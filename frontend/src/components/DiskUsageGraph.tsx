import { useState, useEffect } from 'react';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip, Legend } from 'recharts';

const COLORS = ['#3b82f6', '#8b5cf6', '#1e293b'];

export default function DiskUsageGraph() {
  const [data, setData] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchData = async () => {
    try {
      const res = await fetch('/api/system/disk');
      const json = await res.json();
      
      const formatted = [
        { name: 'Centraliza.ai (Links)', value: json.centraliza },
        { name: 'Outros Arquivos', value: json.others },
        { name: 'Espaço Livre', value: json.free }
      ];
      setData(formatted);
    } catch (e) { console.error('Disk fetch failed'); }
    finally { setLoading(false); }
  };

  useEffect(() => { fetchData(); }, []);

  const formatGB = (val: number) => (val / (1024 ** 3)).toFixed(1) + ' GB';

  if (loading) return <div className="h-64 flex items-center justify-center text-[10px] font-black text-slate-600 uppercase tracking-widest animate-pulse">Analyzing Storage...</div>;

  return (
    <div className="h-80 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <PieChart>
          <Pie
            data={data}
            cx="50%"
            cy="50%"
            innerRadius={60}
            outerRadius={100}
            paddingAngle={8}
            dataKey="value"
            stroke="none"
          >
            {data.map((_, index) => (
              <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
            ))}
          </Pie>
          <Tooltip 
            formatter={(value: number) => formatGB(value)}
            contentStyle={{ backgroundColor: '#0f172a', border: '1px solid #1e293b', borderRadius: '1rem', color: '#fff', fontSize: '10px', fontWeight: '900' }}
          />
          <Legend 
            verticalAlign="bottom" 
            align="center"
            iconType="circle"
            formatter={(value) => <span className="text-[9px] font-black text-slate-500 uppercase tracking-widest ml-2">{value}</span>}
          />
        </PieChart>
      </ResponsiveContainer>
    </div>
  );
}
