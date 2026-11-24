import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from 'recharts';
import { useApp } from '../context/AppContext';

export interface StorageLocation {
  path: string;
  label: string;
  bytes: number;
  count: number;
  percent: number;
  savedBytes?: number;
}

interface Props {
  data: StorageLocation[];
  selected?: string | null;
  onSelect?: (path: string | null) => void;
  height?: number;
}

const COLORS = ['#3b82f6', '#8b5cf6', '#10b981', '#f59e0b', '#ec4899', '#06b6d4', '#ef4444', '#84cc16'];

const formatBytes = (bytes: number) => {
  const n = Number(bytes) || 0;
  const GB = 1024 ** 3;
  const TB = 1024 ** 4;
  if (n >= TB) return `${(n / TB).toFixed(2)} TB`;
  if (n >= GB) return `${(n / GB).toFixed(1)} GB`;
  return `${Math.round(n / (1024 ** 2))} MB`;
};

/**
 * Gráfico (donut) do espaço ocupado por localização dos modelos (RF-012).
 * Clicar numa fatia filtra a lista (RF-013); a fatia ativa é realçada.
 */
export default function StorageLocationChart({ data, selected = null, onSelect, height = 280 }: Props) {
  const { t } = useApp();

  if (!data.length) {
    return (
      <div className="flex items-center justify-center text-xs font-black uppercase tracking-widest text-[var(--text-muted)]" style={{ height }}>
        {t('models_noModels')}
      </div>
    );
  }

  const chartData = data.map((d, i) => ({
    ...d,
    color: COLORS[i % COLORS.length],
    isSelected: selected === d.path,
    opacity: selected && selected !== d.path ? 0.35 : 1
  }));

  return (
    <div className="w-full min-w-0" style={{ height }}>
      <ResponsiveContainer width="100%" height="100%">
        <PieChart margin={{ top: 14, right: 14, bottom: 14, left: 14 }}>
          <Pie
            data={chartData}
            dataKey="bytes"
            nameKey="label"
            cx="50%"
            cy="50%"
            innerRadius="48%"
            outerRadius="76%"
            paddingAngle={3}
            stroke="none"
            animationDuration={700}
            onClick={(entry: any) => onSelect && onSelect(entry && entry.path ? (entry.path === selected ? null : entry.path) : null)}
            label={(props: any) => {
              const percent = Number(props.percent) || 0;
              if (percent < 6) return null;
              return `${Math.round(percent)}%`;
            }}
            labelLine={false}
          >
            {chartData.map((entry) => (
              <Cell
                key={entry.path}
                fill={entry.color}
                fillOpacity={entry.opacity}
                stroke={entry.isSelected ? 'var(--text-primary)' : 'none'}
                strokeWidth={entry.isSelected ? 2 : 0}
                style={{ cursor: onSelect ? 'pointer' : 'default', outline: 'none' }}
              />
            ))}
          </Pie>
          <Tooltip
            formatter={(_value: any, _name: any, item: any) => {
              const d = item && item.payload ? item.payload : null;
              if (!d) return [] as any;
              return [`${formatBytes(d.bytes)} · ${t('central_modelsInLocation' as any, { count: d.count })}`, d.label] as any;
            }}
            contentStyle={{
              backgroundColor: 'rgba(var(--bg-surface-rgb), 0.92)',
              backdropFilter: 'blur(20px)',
              border: '1px solid var(--border)',
              borderRadius: '1rem',
              color: 'var(--text-primary)',
              fontSize: '11px',
              fontWeight: 800,
              boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.5)',
              padding: '10px 14px',
              maxWidth: '18rem'
            }}
          />
        </PieChart>
      </ResponsiveContainer>
    </div>
  );
}
