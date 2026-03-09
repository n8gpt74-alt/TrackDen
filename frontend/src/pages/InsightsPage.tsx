import clsx from 'clsx';
import { useId, useMemo, useState } from 'react';

import { useOverviewQuery } from '../features/analytics/api';
import { useBudgetOverviewQuery } from '../features/budgets/api';
import type { BudgetStatus } from '../features/budgets/model';
import { useFinanceSheet } from '../features/finance-sheet/useFinanceSheet';
import { useForecastOverviewQuery, useMerchantInsightsQuery, useWeeklyReviewQuery } from '../features/intelligence/api';
import { useSubscriptionOverviewQuery } from '../features/subscriptions/api';
import { useTransactionsQuery, type TransactionType } from '../features/transactions/api';
import { isLocalDataMode } from '../shared/api/mode';
import { currentMonthKey, formatMonthCaption, formatShortDateLabel } from '../shared/lib/date';
import { buildSourceBreakdown, buildWeeklyBuckets, calculateRecentTrend } from '../shared/lib/finance';
import { formatCompactMoney, formatMoney, formatSignedPercent } from '../shared/lib/money';
import { IconCircleButton, SettingsIcon } from '../shared/ui/premium';
import {
  EmptyStateCard,
  HeroPanel,
  ListCard,
  ListRow,
  PremiumStatTile,
  ScreenHeader,
  SectionHeader,
  StatusBadge,
  SurfaceCard,
} from '../shared/ui/premium-kit';
import { SegmentedControl } from '../shared/ui/premium';
import { Skeleton } from '../shared/ui/Skeleton';

function GaugeCard({ amount, label, percent }: { amount: number; label: string; percent: number }) {
  const gradientId = useId();
  const dashArray = `${percent * 1.57} 157`;

  return (
    <SurfaceCard>
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-sm text-[var(--app-muted)]">{label}</p>
          <p className="mt-2 text-2xl font-semibold tracking-[-0.04em] text-white">{formatCompactMoney(amount)}</p>
        </div>
        <svg className="gauge" viewBox="0 0 120 60">
          <defs>
            <linearGradient id={gradientId} x1="0%" x2="100%">
              <stop offset="0%" stopColor="#28d2a3" />
              <stop offset="100%" stopColor="#ffffff" />
            </linearGradient>
          </defs>
          <path className="track" d="M10 50a50 50 0 0 1 100 0" fill="none" strokeWidth="10" />
          <path d="M10 50a50 50 0 0 1 100 0" fill="none" stroke={`url(#${gradientId})`} strokeDasharray={dashArray} strokeLinecap="round" strokeWidth="10" />
          <text fill="rgba(255,255,255,0.76)" fontSize="12" textAnchor="middle" x="60" y="42">{Math.round(percent)}%</text>
        </svg>
      </div>
    </SurfaceCard>
  );
}

function getBudgetTone(status: BudgetStatus) {
  switch (status) {
    case 'exceeded':
      return { badge: 'danger', fill: '#ff7d7d', label: 'Over limit' } as const;
    case 'warning':
      return { badge: 'warning', fill: '#f59e0b', label: 'Near limit' } as const;
    case 'normal':
      return { badge: 'success', fill: '#2fd39a', label: 'On track' } as const;
    default:
      return { badge: 'neutral', fill: '#6f6bff', label: 'Not set' } as const;
  }
}

function formatBudgetFooter(remaining: number | null) {
  if (remaining == null) {
    return 'Budget is not set';
  }

  if (remaining >= 0) {
    return `Remaining ${formatMoney(remaining)}`;
  }

  return `Over by ${formatMoney(Math.abs(remaining))}`;
}

export function InsightsPage() {
  const month = currentMonthKey();
  const localMode = isLocalDataMode();
  const [segment, setSegment] = useState<TransactionType>('expense');
  const overviewQuery = useOverviewQuery(month);
  const budgetOverviewQuery = useBudgetOverviewQuery(month);
  const subscriptionOverviewQuery = useSubscriptionOverviewQuery(month);
  const forecastQuery = useForecastOverviewQuery(month);
  const weeklyReviewQuery = useWeeklyReviewQuery();
  const merchantInsightsQuery = useMerchantInsightsQuery(month);
  const transactionsQuery = useTransactionsQuery(month, 100);
  const { openSheet } = useFinanceSheet();

  const overview = overviewQuery.data;
  const budgetOverview = localMode ? budgetOverviewQuery.data : null;
  const subscriptionOverview = localMode ? subscriptionOverviewQuery.data : null;
  const forecast = localMode ? forecastQuery.data : null;
  const weeklyReview = localMode ? weeklyReviewQuery.data : null;
  const merchantInsights = localMode ? merchantInsightsQuery.data ?? [] : [];
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
    <div className="space-y-6">
      <ScreenHeader
        eyebrow="Insights"
        title="Monthly analytics"
        description="One screen for trends, budgets, and recurring charges without extra noise."
        actions={(
          <>
            {segment === 'expense' ? (
              <button className="pill-button pill-button--ghost" onClick={() => openSheet('budget')} type="button">
                Settings
              </button>
            ) : null}
            <IconCircleButton onClick={() => openSheet(segment === 'expense' ? 'automation' : 'add')}>
              <SettingsIcon size={18} />
            </IconCircleButton>
          </>
        )}
      />

      <SegmentedControl
        onChange={setSegment}
        options={[
          { label: 'Income', value: 'income' },
          { label: 'Expenses', value: 'expense' },
        ]}
        value={segment}
      />

      {overviewQuery.isLoading ? (
        <Skeleton className="h-[320px] w-full rounded-[28px]" />
      ) : (
        <HeroPanel
          eyebrow="Main chart"
          title={formatMoney(derived.total)}
          description={`We are looking at ${formatMonthCaption(month)} and how ${segment === 'expense' ? 'expenses' : 'income'} behave week over week.`}
          actions={<StatusBadge tone={derived.trend >= 0 ? (segment === 'expense' ? 'danger' : 'success') : (segment === 'expense' ? 'success' : 'danger')}>{formatSignedPercent(derived.trend)}</StatusBadge>}
        >
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
        </HeroPanel>
      )}

      {localMode && segment === 'expense' ? (
        <section className="space-y-4">
          <SectionHeader
            eyebrow="Smart review"
            title="What is happening with money"
            description="Forecasts, weekly review, and merchant insights help you spot where the month is drifting."
          />

          {forecastQuery.isLoading || weeklyReviewQuery.isLoading || merchantInsightsQuery.isLoading ? (
            <div className="space-y-3">
              <Skeleton className="h-28 w-full rounded-[24px]" />
              <Skeleton className="h-24 w-full rounded-[24px]" />
            </div>
          ) : (
            <>
              <div className="stat-grid">
                <PremiumStatTile hint="Projected expenses by month end" label="Spend forecast" tone={forecast?.status === 'risk' ? 'danger' : forecast?.status === 'attention' ? 'warning' : 'success'} value={formatMoney(forecast?.projected_expense ?? 0)} />
                <PremiumStatTile hint="After expected charges" label="Month balance" tone={forecast && forecast.projected_balance < 0 ? 'danger' : 'accent'} value={formatMoney(forecast?.projected_balance ?? 0)} />
                <PremiumStatTile hint="Change vs last week" label="Weekly review" tone={(weeklyReview?.delta_ratio ?? 0) > 10 ? 'danger' : (weeklyReview?.delta_ratio ?? 0) < -10 ? 'success' : 'neutral'} value={formatSignedPercent(weeklyReview?.delta_ratio ?? 0)} />
                <PremiumStatTile hint="Most visible category" label="Top category" tone="neutral" value={weeklyReview?.top_category_name ?? 'No data'} />
              </div>

              <SurfaceCard>
                <p className="text-sm text-[var(--app-muted)]">Weekly review</p>
                <p className="mt-2 text-base font-semibold text-white">{weeklyReview?.summary ?? 'There is not enough data for the weekly review yet.'}</p>
                {forecast ? <p className="mt-3 text-sm text-[var(--app-muted)]">{forecast.summary}</p> : null}
              </SurfaceCard>
            </>
          )}
        </section>
      ) : null}

      <section className="space-y-4">
        <SectionHeader
          eyebrow="Breakdown"
          title={segment === 'expense' ? 'Expense structure' : 'Income structure'}
          description="Large zones of influence become visible, so it is easier to see what really shapes the month."
        />

        {overviewQuery.isLoading ? (
          <div className="space-y-3">
            <Skeleton className="h-32 w-full rounded-[26px]" />
            <Skeleton className="h-32 w-full rounded-[26px]" />
          </div>
        ) : derived.breakdown.length === 0 ? (
          <EmptyStateCard title="Not enough data yet" description="Add a few transactions this month and the structure and dynamics will appear here." />
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
        <section className="space-y-4">
          <SectionHeader
            eyebrow="Merchants"
            title="Merchant insights"
            description="See who drives the biggest share of your budget and where the average ticket is rising."
          />

          {merchantInsightsQuery.isLoading ? (
            <div className="space-y-3">
              <Skeleton className="h-24 w-full rounded-[24px]" />
              <Skeleton className="h-24 w-full rounded-[24px]" />
            </div>
          ) : merchantInsights.length === 0 ? (
            <EmptyStateCard title="No merchant signal yet" description="Add several repeating purchases this month and TrackDen will highlight which merchants shape the spending pattern." />
          ) : (
            <div className="space-y-3">
              {merchantInsights.map((item) => (
                <ListCard key={item.merchant_label}>
                  <ListRow
                    title={item.merchant_label}
                    subtitle={`${item.transaction_count} transactions ? ${item.category_name ?? 'uncategorized'} ? last seen ${formatShortDateLabel(item.last_seen_at)}`}
                    trailing={(
                      <div className="text-right">
                        <p className="text-base font-semibold text-white">{formatMoney(item.total_amount)}</p>
                        <p className={clsx('mt-1 text-xs', item.delta_ratio == null ? 'text-[var(--app-muted)]' : item.delta_ratio > 0 ? 'text-[var(--app-danger)]' : 'text-[var(--app-success)]')}>
                          {item.delta_ratio == null ? 'New this month' : `${item.delta_ratio > 0 ? '+' : ''}${Math.round(item.delta_ratio)}% vs previous month`}
                        </p>
                      </div>
                    )}
                  />
                </ListCard>
              ))}
            </div>
          )}
        </section>
      ) : null}

      {localMode && segment === 'expense' ? (
        <section className="space-y-4">
          <SectionHeader
            eyebrow="Budgets"
            title="Budget vs actual"
            description="See where the plan is still healthy and where the month is already pressing against limits."
            action={<button className="pill-button pill-button--ghost" onClick={() => openSheet('budget')} type="button">Configure</button>}
          />

          {budgetOverviewQuery.isLoading ? (
            <div className="space-y-3">
              <Skeleton className="h-28 w-full rounded-[24px]" />
              <Skeleton className="h-24 w-full rounded-[24px]" />
            </div>
          ) : !budgetOverview || budgetOverview.configured_count === 0 ? (
            <EmptyStateCard title="Budgets are not set" description="Add an overall budget or category limits and TrackDen will show live progress through the month." />
          ) : (
            <div className="space-y-3">
              {budgetOverview.overall.enabled ? (
                <SurfaceCard>
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-sm text-[var(--app-muted)]">Overall budget</p>
                      <p className="mt-2 text-2xl font-semibold tracking-[-0.04em] text-white">{formatMoney(budgetOverview.overall.spent)}</p>
                      <p className="mt-2 text-sm text-[var(--app-muted)]">Limit {formatMoney(budgetOverview.overall.limit ?? 0)}</p>
                    </div>
                    <StatusBadge tone={getBudgetTone(budgetOverview.overall.status).badge}>{getBudgetTone(budgetOverview.overall.status).label}</StatusBadge>
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
                  <p className={clsx('mt-3 text-sm', budgetOverview.overall.status === 'exceeded' ? 'text-[var(--app-danger)]' : budgetOverview.overall.status === 'warning' ? 'text-amber-200' : 'text-[var(--app-muted)]')}>
                    {formatBudgetFooter(budgetOverview.overall.remaining)}
                  </p>
                </SurfaceCard>
              ) : null}

              {budgetOverview.categories.length > 0 ? (
                budgetOverview.categories.map((item) => {
                  const tone = getBudgetTone(item.status);
                  return (
                    <SurfaceCard key={item.category_id}>
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="text-base font-medium text-white">{item.category_name}</p>
                          <p className="mt-1 text-sm text-[var(--app-muted)]">{formatMoney(item.spent)} ?? {formatMoney(item.limit ?? 0)}</p>
                        </div>
                        <StatusBadge tone={tone.badge}>{tone.label}</StatusBadge>
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
                      <p className="mt-3 text-sm text-[var(--app-muted)]">{formatBudgetFooter(item.remaining)}</p>
                    </SurfaceCard>
                  );
                })
              ) : (
                <EmptyStateCard title="Category budgets are not set" description="TrackDen already sees category spending. Add limits to turn that into actionable pressure signals." />
              )}
            </div>
          )}
        </section>
      ) : null}

      {localMode && segment === 'expense' ? (
        <section className="space-y-4">
          <SectionHeader
            eyebrow="Subscriptions"
            title="Fixed vs flexible spending"
            description="Separate mandatory charges from normal spending so the month feels easier to read."
            action={<button className="pill-button pill-button--ghost" onClick={() => openSheet('subscriptions')} type="button">Open</button>}
          />

          {subscriptionOverviewQuery.isLoading ? (
            <div className="space-y-3">
              <Skeleton className="h-28 w-full rounded-[24px]" />
              <Skeleton className="h-24 w-full rounded-[24px]" />
            </div>
          ) : !subscriptionOverview ? (
            <EmptyStateCard title="Not enough subscriptions yet" description="As the local-first history grows, this section will show a clearer layer of fixed monthly spending." />
          ) : (
            <div className="stat-grid">
              <PremiumStatTile hint={`${subscriptionOverview.matched_this_month} matches this month`} label="Fixed" tone="accent" value={formatMoney(subscriptionOverview.fixed_spent)} />
              <PremiumStatTile hint="Everything outside subscriptions" label="Flexible" tone="neutral" value={formatMoney(subscriptionOverview.flexible_spent)} />
              <PremiumStatTile hint="Still expected before month end" label="To come" tone="warning" value={formatMoney(subscriptionOverview.upcoming_total)} />
              <PremiumStatTile hint={`${subscriptionOverview.active_count} active subscriptions`} label="Monthly forecast" tone="success" value={formatMoney(subscriptionOverview.forecast_total)} />
            </div>
          )}
        </section>
      ) : null}

      <div className="stat-grid">
        {overviewQuery.isLoading ? (
          <>
            <Skeleton className="h-28 w-full rounded-[24px]" />
            <Skeleton className="h-28 w-full rounded-[24px]" />
          </>
        ) : (
          <>
            <PremiumStatTile hint="Change relative to previous month" label="Trend" tone={derived.trend >= 0 ? (segment === 'expense' ? 'danger' : 'success') : (segment === 'expense' ? 'success' : 'danger')} value={formatSignedPercent(derived.trend)} />
            <PremiumStatTile hint="Average volume across 4 weeks" label="Average week" tone="neutral" value={formatCompactMoney(derived.averagePerWeek)} />
          </>
        )}
      </div>
    </div>
  );
}
