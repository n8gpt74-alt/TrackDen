import clsx from 'clsx';
import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';

import { useOverviewQuery } from '../features/analytics/api';
import { useTransactionsQuery, type TransactionType } from '../features/transactions/api';
import { currentMonthKey, formatMonthCaption } from '../shared/lib/date';
import { buildSourceBreakdown, buildWeeklyBuckets, calculateRecentTrend } from '../shared/lib/finance';
import { formatCompactMoney, formatMoney, formatSignedPercent } from '../shared/lib/money';
import { ChevronLeftIcon, DotsIcon, SegmentedControl } from '../shared/ui/premium';
import { Skeleton } from '../shared/ui/Skeleton';

function GaugeCard({ amount, label, percent }: { amount: number; label: string; percent: number }) {
  const dashArray = `${percent * 1.57} 157`;

  return (
    <div className="premium-card rounded-[26px] p-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-sm text-[var(--app-muted)]">{label}</p>
          <p className="mt-2 text-2xl font-semibold tracking-[-0.04em] text-white">{formatCompactMoney(amount)}</p>
        </div>
        <svg className="gauge" viewBox="0 0 120 60">
          <defs>
            <linearGradient id="gaugeGradient" x1="0%" x2="100%">
              <stop offset="0%" stopColor="#28d2a3" />
              <stop offset="100%" stopColor="#ffffff" />
            </linearGradient>
          </defs>
          <path className="track" d="M10 50a50 50 0 0 1 100 0" fill="none" strokeWidth="10" />
          <path className="value" d="M10 50a50 50 0 0 1 100 0" fill="none" strokeDasharray={dashArray} strokeLinecap="round" strokeWidth="10" />
          <text fill="rgba(255,255,255,0.76)" fontSize="12" textAnchor="middle" x="60" y="42">{Math.round(percent)}%</text>
        </svg>
      </div>
    </div>
  );
}

export function InsightsPage() {
  const month = currentMonthKey();
  const navigate = useNavigate();
  const [segment, setSegment] = useState<TransactionType>('expense');
  const overviewQuery = useOverviewQuery(month);
  const transactionsQuery = useTransactionsQuery(month, 100);

  const overview = overviewQuery.data;
  const transactions = transactionsQuery.data?.items ?? [];

  const derived = useMemo(() => {
    const weekly = buildWeeklyBuckets(overview?.by_day ?? [], segment);
    const total = segment === 'expense' ? overview?.total_expense ?? 0 : overview?.total_income ?? 0;
    const breakdown = segment === 'expense'
      ? (overview?.by_category ?? []).map((item) => ({ name: item.category_name, amount: item.amount })).slice(0, 2)
      : buildSourceBreakdown(transactions, 'income').slice(0, 2);
    const trend = calculateRecentTrend(overview?.by_day ?? [], segment);
    const averagePerWeek = weekly.reduce((sum, item) => sum + item.value, 0) / Math.max(weekly.length, 1);
    const peak = Math.max(...weekly.map((item) => item.value), 1);

    return {
      total,
      breakdown,
      trend,
      weekly,
      averagePerWeek,
      peak,
    };
  }, [overview, segment, transactions]);

  return (
    <div className="space-y-5">
      <header className="page-topbar">
        <button className="icon-circle-button" onClick={() => navigate('/dashboard')} type="button">
          <ChevronLeftIcon size={18} />
        </button>
        <button className="icon-circle-button" type="button">
          <DotsIcon size={18} />
        </button>
      </header>

      <SegmentedControl
        onChange={setSegment}
        options={[
          { label: 'Income', value: 'income' },
          { label: 'Expenses', value: 'expense' },
        ]}
        value={segment}
      />

      {overviewQuery.isLoading ? (
        <Skeleton className="h-[290px] w-full rounded-[28px]" />
      ) : (
        <section className="premium-card rounded-[30px] p-5">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-sm text-[var(--app-muted)]">Total {segment === 'expense' ? 'expense' : 'income'}</p>
              <h1 className="mt-2 text-[40px] font-semibold tracking-[-0.05em] text-white">{formatMoney(derived.total)}</h1>
            </div>
            <button className="rounded-full border border-[var(--app-stroke)] bg-white/[0.03] px-3 py-2 text-xs font-medium uppercase tracking-[0.18em] text-[var(--app-muted)]" type="button">
              {formatMonthCaption(month)}
            </button>
          </div>

          <div className="insights-bars mt-6">
            {derived.weekly.map((item) => {
              const height = Math.max(24, Math.round((item.value / derived.peak) * 124));
              return (
                <div key={item.label} className="insights-bar">
                  <div className="insights-bar__ghost">
                    <div className="insights-bar__fill" style={{ height }} />
                  </div>
                  <p className="text-center text-xs text-[var(--app-muted)]">{item.label}</p>
                </div>
              );
            })}
          </div>
        </section>
      )}

      <section>
        <div className="mb-3 flex items-center justify-between">
          <div>
            <p className="soft-kicker">Breakdown</p>
            <h2 className="mt-1 text-xl font-semibold text-white">{segment === 'expense' ? 'Структура расходов' : 'Источники дохода'}</h2>
          </div>
        </div>

        {overviewQuery.isLoading ? (
          <div className="space-y-3">
            <Skeleton className="h-32 w-full rounded-[26px]" />
            <Skeleton className="h-32 w-full rounded-[26px]" />
          </div>
        ) : derived.breakdown.length === 0 ? (
          <div className="empty-card">Здесь появятся категории и источники, когда в месяце накопятся операции.</div>
        ) : (
          <div className="space-y-3">
            {derived.breakdown.map((item) => (
              <GaugeCard
                key={item.name}
                amount={item.amount}
                label={item.name}
                percent={Math.min(100, derived.total > 0 ? (item.amount / derived.total) * 100 : 0)}
              />
            ))}
          </div>
        )}
      </section>

      <section className="grid grid-cols-2 gap-3">
        {overviewQuery.isLoading ? (
          <>
            <Skeleton className="h-28 w-full rounded-[24px]" />
            <Skeleton className="h-28 w-full rounded-[24px]" />
          </>
        ) : (
          <>
            <div className="metric-tile">
              <p className="text-sm text-[var(--app-muted)]">Тренд</p>
              <p className={clsx('mt-2 text-[28px] font-semibold tracking-[-0.04em]', derived.trend >= 0 ? 'text-[var(--app-success)]' : 'text-[var(--app-danger)]')}>
                {formatSignedPercent(derived.trend)}
              </p>
              <p className="mt-2 text-xs text-[var(--app-muted)]">Динамика относительно прошлой недели</p>
            </div>
            <div className="metric-tile">
              <p className="text-sm text-[var(--app-muted)]">Средняя неделя</p>
              <p className="mt-2 text-[28px] font-semibold tracking-[-0.04em] text-white">{formatCompactMoney(derived.averagePerWeek)}</p>
              <p className="mt-2 text-xs text-[var(--app-muted)]">Среднее значение по 4 недельным слотам</p>
            </div>
          </>
        )}
      </section>
    </div>
  );
}
