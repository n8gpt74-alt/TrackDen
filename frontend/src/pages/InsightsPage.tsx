import clsx from 'clsx';
import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';

import { useOverviewQuery } from '../features/analytics/api';
import { useBudgetOverviewQuery } from '../features/budgets/api';
import type { BudgetStatus } from '../features/budgets/model';
import { useFinanceSheet } from '../features/finance-sheet/useFinanceSheet';
import { useTransactionsQuery, type TransactionType } from '../features/transactions/api';
import { isLocalDataMode } from '../shared/api/mode';
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

function getBudgetTone(status: BudgetStatus) {
  switch (status) {
    case 'exceeded':
      return {
        label: 'Перелимит',
        badgeClass: 'border-red-400/20 bg-red-400/10 text-red-100',
        fill: '#ff7d7d',
        textClass: 'text-[var(--app-danger)]',
      };
    case 'warning':
      return {
        label: '80%+',
        badgeClass: 'border-amber-400/20 bg-amber-400/10 text-amber-100',
        fill: '#f59e0b',
        textClass: 'text-amber-200',
      };
    case 'normal':
      return {
        label: 'В норме',
        badgeClass: 'border-emerald-400/20 bg-emerald-400/10 text-emerald-100',
        fill: '#2fd39a',
        textClass: 'text-[var(--app-success)]',
      };
    default:
      return {
        label: 'Не настроено',
        badgeClass: 'border-[var(--app-stroke)] bg-white/[0.03] text-[var(--app-muted)]',
        fill: '#6f6bff',
        textClass: 'text-[var(--app-muted)]',
      };
  }
}

function formatBudgetFooter(remaining: number | null) {
  if (remaining == null) {
    return 'Лимит не задан';
  }

  if (remaining >= 0) {
    return `Осталось ${formatMoney(remaining)}`;
  }

  return `Перерасход ${formatMoney(Math.abs(remaining))}`;
}

export function InsightsPage() {
  const month = currentMonthKey();
  const navigate = useNavigate();
  const localMode = isLocalDataMode();
  const [segment, setSegment] = useState<TransactionType>('expense');
  const overviewQuery = useOverviewQuery(month);
  const budgetOverviewQuery = useBudgetOverviewQuery(month);
  const transactionsQuery = useTransactionsQuery(month, 100);
  const { openSheet } = useFinanceSheet();

  const overview = overviewQuery.data;
  const budgetOverview = localMode ? budgetOverviewQuery.data : null;
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
        <button className="icon-circle-button" onClick={() => openSheet('budget')} type="button">
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

      {localMode && segment === 'expense' ? (
        <section>
          <div className="mb-3 flex items-center justify-between gap-3">
            <div>
              <p className="soft-kicker">Budget vs actual</p>
              <h2 className="mt-1 text-xl font-semibold text-white">Лимиты и факт</h2>
            </div>
            <button className="text-sm text-[var(--app-accent)]" onClick={() => openSheet('budget')} type="button">
              Настроить
            </button>
          </div>

          {budgetOverviewQuery.isLoading ? (
            <div className="space-y-3">
              <Skeleton className="h-28 w-full rounded-[24px]" />
              <Skeleton className="h-24 w-full rounded-[24px]" />
            </div>
          ) : !budgetOverview || budgetOverview.configured_count === 0 ? (
            <div className="empty-card">
              Здесь появится управленческий слой: общий бюджет месяца и категории, которые быстрее всего подходят к лимиту.
            </div>
          ) : (
            <div className="space-y-3">
              {budgetOverview.overall.enabled ? (
                <div className="premium-card rounded-[26px] p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-sm text-[var(--app-muted)]">Общий лимит</p>
                      <p className="mt-2 text-2xl font-semibold tracking-[-0.04em] text-white">{formatMoney(budgetOverview.overall.spent)}</p>
                    </div>
                    <div className={clsx('rounded-full border px-3 py-2 text-xs font-semibold uppercase tracking-[0.18em]', getBudgetTone(budgetOverview.overall.status).badgeClass)}>
                      {getBudgetTone(budgetOverview.overall.status).label}
                    </div>
                  </div>
                  <div className="mt-4 h-3 overflow-hidden rounded-full bg-white/[0.05]">
                    <div
                      className="h-full rounded-full"
                      style={{
                        width: `${Math.min(100, Math.max(6, Math.round(budgetOverview.overall.ratio * 100)))}%`,
                        background: getBudgetTone(budgetOverview.overall.status).fill,
                      }}
                    />
                  </div>
                  <div className="mt-3 flex items-center justify-between gap-3 text-sm text-[var(--app-muted)]">
                    <span>Лимит {formatMoney(budgetOverview.overall.limit ?? 0)}</span>
                    <span className={getBudgetTone(budgetOverview.overall.status).textClass}>{formatBudgetFooter(budgetOverview.overall.remaining)}</span>
                  </div>
                </div>
              ) : (
                <div className="rounded-[24px] border border-[var(--app-stroke)] bg-white/[0.03] p-4 text-sm leading-6 text-[var(--app-muted)]">
                  Общий лимит пока не задан, поэтому ниже сравниваем только расходы по категориям.
                </div>
              )}

              {budgetOverview.categories.length === 0 ? (
                <div className="rounded-[24px] border border-[var(--app-stroke)] bg-white/[0.03] p-4 text-sm leading-6 text-[var(--app-muted)]">
                  По категориям лимиты ещё не включены. Можно оставить только общий бюджет или добавить категории в шторке настроек.
                </div>
              ) : (
                budgetOverview.categories.map((item) => {
                  const tone = getBudgetTone(item.status);
                  return (
                    <div key={item.category_id} className="rounded-[24px] border border-[var(--app-stroke)] bg-white/[0.03] p-4">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="text-base font-medium text-white">{item.category_name}</p>
                          <p className="mt-1 text-sm text-[var(--app-muted)]">{formatMoney(item.spent)} из {formatMoney(item.limit ?? 0)}</p>
                        </div>
                        <div className={clsx('rounded-full border px-3 py-2 text-xs font-semibold uppercase tracking-[0.18em]', tone.badgeClass)}>
                          {tone.label}
                        </div>
                      </div>
                      <div className="mt-4 h-2.5 overflow-hidden rounded-full bg-white/[0.05]">
                        <div
                          className="h-full rounded-full"
                          style={{
                            width: `${Math.min(100, Math.max(6, Math.round(item.ratio * 100)))}%`,
                            background: tone.fill,
                          }}
                        />
                      </div>
                      <p className={clsx('mt-3 text-sm', tone.textClass)}>{formatBudgetFooter(item.remaining)}</p>
                    </div>
                  );
                })
              )}
            </div>
          )}
        </section>
      ) : null}

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
