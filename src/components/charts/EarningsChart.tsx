import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { formatCurrency } from '../../lib/format';
import { useIsDark } from '../../hooks/useTheme';

/** One bar: a label plus an amount per series key (job id). */
export type EarningsPoint = { label: string } & Record<string, number | string>;

export interface EarningsSeries {
  key: string;
  name: string;
  color: string;
}

/** Earnings per period, stacked by job in each job's colour. */
export function EarningsChart({ data, series }: { data: EarningsPoint[]; series: EarningsSeries[] }) {
  const isDark = useIsDark();
  const gridStroke = isDark ? '#334155' : '#e2e8f0';
  const tickFill = isDark ? '#94a3b8' : '#64748b';
  const cursorFill = isDark ? '#334155' : '#f1f5f9';

  return (
    <div className="h-64 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 8, right: 4, left: 8, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={gridStroke} />
          <XAxis dataKey="label" tick={{ fontSize: 12, fill: tickFill }} axisLine={false} tickLine={false} />
          <YAxis tick={{ fontSize: 12, fill: tickFill }} axisLine={false} tickLine={false} tickFormatter={(v) => `$${v}`} width={48} />
          <Tooltip
            formatter={(value, name) => [formatCurrency(Number(value)), name]}
            cursor={{ fill: cursorFill }}
            contentStyle={
              isDark
                ? { backgroundColor: '#1e293b', border: '1px solid #334155', color: '#e2e8f0', borderRadius: 12 }
                : { borderRadius: 12 }
            }
          />
          {series.map((s, i) => (
            <Bar
              key={s.key}
              dataKey={s.key}
              name={s.name}
              stackId="earnings"
              fill={s.color}
              radius={i === series.length - 1 ? [4, 4, 0, 0] : [0, 0, 0, 0]}
            />
          ))}
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
