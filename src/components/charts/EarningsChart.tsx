import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { formatCurrency } from '../../lib/format';
import { useIsDark } from '../../hooks/useTheme';

export interface EarningsPoint {
  label: string;
  total: number;
}

export function EarningsChart({ data, compact = false }: { data: EarningsPoint[]; compact?: boolean }) {
  const isDark = useIsDark();
  const gridStroke = isDark ? '#334155' : '#e2e8f0';
  const tickFill = isDark ? '#94a3b8' : '#64748b';
  const barFill = isDark ? '#818cf8' : '#3b82f6';
  const cursorFill = isDark ? '#334155' : '#f1f5f9';

  return (
    <div className={compact ? 'h-24 w-full' : 'h-64 w-full'}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 8, right: 4, left: compact ? -20 : 8, bottom: 0 }}>
          {!compact && <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={gridStroke} />}
          <XAxis dataKey="label" tick={{ fontSize: compact ? 10 : 12, fill: tickFill }} axisLine={false} tickLine={false} />
          {!compact && (
            <YAxis
              tick={{ fontSize: 12, fill: tickFill }}
              axisLine={false}
              tickLine={false}
              tickFormatter={(v) => `$${v}`}
              width={48}
            />
          )}
          <Tooltip
            formatter={(value) => formatCurrency(Number(value))}
            cursor={{ fill: cursorFill }}
            contentStyle={
              isDark ? { backgroundColor: '#1e293b', border: '1px solid #334155', color: '#e2e8f0' } : undefined
            }
          />
          <Bar dataKey="total" fill={barFill} radius={[4, 4, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
