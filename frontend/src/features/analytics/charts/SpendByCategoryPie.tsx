import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from 'recharts';

import type { CategorySpendPoint } from '../api';
import { formatMoney } from '../../../shared/lib/money';

const FALLBACK_COLORS = ['#0f766e', '#f59e0b', '#3b82f6', '#ef4444', '#8b5cf6', '#10b981'];

type SpendByCategoryPieProps = {
  data: CategorySpendPoint[];
};

export function SpendByCategoryPie({ data }: SpendByCategoryPieProps) {
  if (data.length === 0) {
    return <div className="rounded-3xl border border-dashed border-[var(--app-border)] p-6 text-sm text-[var(--app-muted)]">Пока нет расходов за этот месяц.</div>;
  }

  return (
    <div className="h-72 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <PieChart>
          <Pie data={data} dataKey="amount" nameKey="category_name" innerRadius={54} outerRadius={88} paddingAngle={3}>
            {data.map((entry, index) => (
              <Cell key={entry.category_name} fill={entry.color ?? FALLBACK_COLORS[index % FALLBACK_COLORS.length]} />
            ))}
          </Pie>
          <Tooltip
            formatter={(value) => formatMoney(Number(value ?? 0))}
            contentStyle={{
              borderRadius: 16,
              border: '1px solid var(--app-border)',
              background: 'var(--app-surface-strong)',
            }}
          />
        </PieChart>
      </ResponsiveContainer>
    </div>
  );
}
