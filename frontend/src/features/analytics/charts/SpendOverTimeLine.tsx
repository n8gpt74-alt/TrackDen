import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';

import type { DailySpendPoint } from '../api';
import { formatDayLabel } from '../../../shared/lib/date';
import { formatMoney } from '../../../shared/lib/money';

type SpendOverTimeLineProps = {
  data: DailySpendPoint[];
};

export function SpendOverTimeLine({ data }: SpendOverTimeLineProps) {
  if (data.length === 0) {
    return <div className="rounded-3xl border border-dashed border-[var(--app-border)] p-6 text-sm text-[var(--app-muted)]">График появится после первых операций.</div>;
  }

  return (
    <div className="h-72 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data}>
          <CartesianGrid stroke="rgba(148, 163, 184, 0.16)" vertical={false} />
          <XAxis dataKey="date" tickFormatter={formatDayLabel} tick={{ fill: 'var(--app-muted)', fontSize: 12 }} />
          <YAxis tickFormatter={(value) => `${Math.round(Number(value))}`} tick={{ fill: 'var(--app-muted)', fontSize: 12 }} />
          <Tooltip
            labelFormatter={(value) => formatDayLabel(String(value))}
            formatter={(value, name) => [formatMoney(Number(value ?? 0)), name === 'expense' ? 'Расход' : 'Доход']}
            contentStyle={{
              borderRadius: 16,
              border: '1px solid var(--app-border)',
              background: 'var(--app-surface-strong)',
            }}
          />
          <Line type="monotone" dataKey="expense" stroke="#ef4444" strokeWidth={3} dot={false} />
          <Line type="monotone" dataKey="income" stroke="#16a34a" strokeWidth={3} dot={false} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
