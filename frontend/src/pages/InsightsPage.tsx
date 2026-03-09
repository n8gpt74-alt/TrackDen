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
import { UI_TEXT } from '../shared/i18n/ui';

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
      return { badge: 'danger', fill: '#ff7d7d', label: '\u041f\u0435\u0440\u0435\u0440\u0430\u0441\u0445\u043e\u0434' } as const;
    case 'warning':
      return { badge: 'warning', fill: '#f59e0b', label: '\u0423 \u043b\u0438\u043c\u0438\u0442\u0430' } as const;
    case 'normal':
      return { badge: 'success', fill: '#2fd39a', label: '\u0412 \u043d\u043e\u0440\u043c\u0435' } as const;
    default:
      return { badge: 'neutral', fill: '#6f6bff', label: '\u041d\u0435 \u0437\u0430\u0434\u0430\u043d' } as const;
  }
}

function formatBudgetFooter(remaining: number | null) {
  if (remaining == null) {
    return '\u041b\u0438\u043c\u0438\u0442 \u043d\u0435 \u0437\u0430\u0434\u0430\u043d';
  }

  if (remaining >= 0) {
    return `\u041e\u0441\u0442\u0430\u043b\u043e\u0441\u044c ${formatMoney(remaining)}`;
  }

  return `\u041f\u0435\u0440\u0435\u0440\u0430\u0441\u0445\u043e\u0434 \u043d\u0430 ${formatMoney(Math.abs(remaining))}`;
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
        eyebrow="\u0421\u0442\u0430\u0442\u0438\u0441\u0442\u0438\u043a\u0430"
        title="\u0410\u043d\u0430\u043b\u0438\u0442\u0438\u043a\u0430 \u043c\u0435\u0441\u044f\u0446\u0430"
        description="\u041e\u0434\u0438\u043d \u044d\u043a\u0440\u0430\u043d \u0434\u043b\u044f \u0442\u0440\u0435\u043d\u0434\u043e\u0432, \u043b\u0438\u043c\u0438\u0442\u043e\u0432 \u0438 \u043f\u043e\u0432\u0442\u043e\u0440\u044f\u044e\u0449\u0438\u0445\u0441\u044f \u0441\u043f\u0438\u0441\u0430\u043d\u0438\u0439 \u0431\u0435\u0437 \u043b\u0438\u0448\u043d\u0435\u0433\u043e \u0448\u0443\u043c\u0430."
        actions={(
          <>
            {segment === 'expense' ? (
              <button className="pill-button pill-button--ghost" onClick={() => openSheet('budget')} type="button">
                \u041d\u0430\u0441\u0442\u0440\u043e\u0438\u0442\u044c
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
          { label: UI_TEXT.common.income, value: 'income' },
          { label: '\u0420\u0430\u0441\u0445\u043e\u0434\u044b', value: 'expense' },
        ]}
        value={segment}
      />

      {overviewQuery.isLoading ? (
        <Skeleton className="h-[320px] w-full rounded-[28px]" />
      ) : (
        <HeroPanel
          eyebrow="\u0413\u043b\u0430\u0432\u043d\u044b\u0439 \u0433\u0440\u0430\u0444\u0438\u043a"
          title={formatMoney(derived.total)}
          description={`\u0421\u043c\u043e\u0442\u0440\u0438\u043c \u043d\u0430 ${formatMonthCaption(month)} \u0438 \u0432\u0438\u0434\u0438\u043c, \u043a\u0430\u043a \u043d\u0435\u0434\u0435\u043b\u044f \u043a \u043d\u0435\u0434\u0435\u043b\u0435 \u0432\u0435\u0434\u0443\u0442 \u0441\u0435\u0431\u044f ${segment === 'expense' ? '\u0440\u0430\u0441\u0445\u043e\u0434\u044b' : '\u0434\u043e\u0445\u043e\u0434\u044b'}.`}
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
            eyebrow="\u0423\u043c\u043d\u044b\u0439 \u043e\u0431\u0437\u043e\u0440"
            title="\u0427\u0442\u043e \u043f\u0440\u043e\u0438\u0441\u0445\u043e\u0434\u0438\u0442 \u0441 \u0434\u0435\u043d\u044c\u0433\u0430\u043c\u0438"
            description="\u041f\u0440\u043e\u0433\u043d\u043e\u0437, \u043e\u0431\u0437\u043e\u0440 \u043d\u0435\u0434\u0435\u043b\u0438 \u0438 \u0438\u043d\u0441\u0430\u0439\u0442\u044b \u043f\u043e \u043f\u0440\u043e\u0434\u0430\u0432\u0446\u0430\u043c \u043f\u043e\u043c\u043e\u0433\u0430\u044e\u0442 \u0431\u044b\u0441\u0442\u0440\u043e \u0443\u0432\u0438\u0434\u0435\u0442\u044c, \u043a\u0443\u0434\u0430 \u0441\u043c\u0435\u0449\u0430\u0435\u0442\u0441\u044f \u043c\u0435\u0441\u044f\u0446."
          />

          {forecastQuery.isLoading || weeklyReviewQuery.isLoading || merchantInsightsQuery.isLoading ? (
            <div className="space-y-3">
              <Skeleton className="h-28 w-full rounded-[24px]" />
              <Skeleton className="h-24 w-full rounded-[24px]" />
            </div>
          ) : (
            <>
              <div className="stat-grid">
                <PremiumStatTile hint="\u041f\u0440\u043e\u0433\u043d\u043e\u0437 \u0440\u0430\u0441\u0445\u043e\u0434\u043e\u0432 \u043a \u043a\u043e\u043d\u0446\u0443 \u043c\u0435\u0441\u044f\u0446\u0430" label="\u041f\u0440\u043e\u0433\u043d\u043e\u0437 \u0442\u0440\u0430\u0442" tone={forecast?.status === 'risk' ? 'danger' : forecast?.status === 'attention' ? 'warning' : 'success'} value={formatMoney(forecast?.projected_expense ?? 0)} />
                <PremiumStatTile hint="\u041f\u043e\u0441\u043b\u0435 \u043e\u0436\u0438\u0434\u0430\u0435\u043c\u044b\u0445 \u0441\u043f\u0438\u0441\u0430\u043d\u0438\u0439" label="\u0411\u0430\u043b\u0430\u043d\u0441 \u043c\u0435\u0441\u044f\u0446\u0430" tone={forecast && forecast.projected_balance < 0 ? 'danger' : 'accent'} value={formatMoney(forecast?.projected_balance ?? 0)} />
                <PremiumStatTile hint="\u0418\u0437\u043c\u0435\u043d\u0435\u043d\u0438\u0435 \u043a \u043f\u0440\u043e\u0448\u043b\u043e\u0439 \u043d\u0435\u0434\u0435\u043b\u0435" label="\u041e\u0431\u0437\u043e\u0440 \u043d\u0435\u0434\u0435\u043b\u0438" tone={(weeklyReview?.delta_ratio ?? 0) > 10 ? 'danger' : (weeklyReview?.delta_ratio ?? 0) < -10 ? 'success' : 'neutral'} value={formatSignedPercent(weeklyReview?.delta_ratio ?? 0)} />
                <PremiumStatTile hint="\u0421\u0430\u043c\u0430\u044f \u0437\u0430\u043c\u0435\u0442\u043d\u0430\u044f \u043a\u0430\u0442\u0435\u0433\u043e\u0440\u0438\u044f" label="\u0413\u043b\u0430\u0432\u043d\u0430\u044f \u043a\u0430\u0442\u0435\u0433\u043e\u0440\u0438\u044f" tone="neutral" value={weeklyReview?.top_category_name ?? UI_TEXT.common.noData} />
              </div>

              <SurfaceCard>
                <p className="text-sm text-[var(--app-muted)]">\u041e\u0431\u0437\u043e\u0440 \u043d\u0435\u0434\u0435\u043b\u0438</p>
                <p className="mt-2 text-base font-semibold text-white">{weeklyReview?.summary ?? '\u0414\u0430\u043d\u043d\u044b\u0445 \u0434\u043b\u044f \u043d\u0435\u0434\u0435\u043b\u044c\u043d\u043e\u0433\u043e \u043e\u0431\u0437\u043e\u0440\u0430 \u043f\u043e\u043a\u0430 \u043d\u0435 \u0445\u0432\u0430\u0442\u0430\u0435\u0442.'}</p>
                {forecast ? <p className="mt-3 text-sm text-[var(--app-muted)]">{forecast.summary}</p> : null}
              </SurfaceCard>
            </>
          )}
        </section>
      ) : null}

      <section className="space-y-4">
        <SectionHeader
          eyebrow="\u0421\u0440\u0435\u0437\u044b"
          title={segment === 'expense' ? '\u0421\u0442\u0440\u0443\u043a\u0442\u0443\u0440\u0430 \u0440\u0430\u0441\u0445\u043e\u0434\u043e\u0432' : '\u0421\u0442\u0440\u0443\u043a\u0442\u0443\u0440\u0430 \u0434\u043e\u0445\u043e\u0434\u043e\u0432'}
          description="\u0421\u0440\u0430\u0437\u0443 \u0432\u0438\u0434\u043d\u043e \u043a\u0440\u0443\u043f\u043d\u044b\u0435 \u0437\u043e\u043d\u044b \u0432\u043b\u0438\u044f\u043d\u0438\u044f, \u043f\u043e\u044d\u0442\u043e\u043c\u0443 \u043f\u0440\u043e\u0449\u0435 \u043f\u043e\u043d\u044f\u0442\u044c, \u0447\u0442\u043e \u0438\u043c\u0435\u043d\u043d\u043e \u0444\u043e\u0440\u043c\u0438\u0440\u0443\u0435\u0442 \u043c\u0435\u0441\u044f\u0446."
        />

        {overviewQuery.isLoading ? (
          <div className="space-y-3">
            <Skeleton className="h-32 w-full rounded-[26px]" />
            <Skeleton className="h-32 w-full rounded-[26px]" />
          </div>
        ) : derived.breakdown.length === 0 ? (
          <EmptyStateCard title="\u0414\u0430\u043d\u043d\u044b\u0445 \u043f\u043e\u043a\u0430 \u043d\u0435\u0434\u043e\u0441\u0442\u0430\u0442\u043e\u0447\u043d\u043e" description="\u0414\u043e\u0431\u0430\u0432\u044c \u043d\u0435\u0441\u043a\u043e\u043b\u044c\u043a\u043e \u043e\u043f\u0435\u0440\u0430\u0446\u0438\u0439 \u0432 \u044d\u0442\u043e\u043c \u043c\u0435\u0441\u044f\u0446\u0435, \u0438 \u0437\u0434\u0435\u0441\u044c \u043f\u043e\u044f\u0432\u044f\u0442\u0441\u044f \u0441\u0442\u0440\u0443\u043a\u0442\u0443\u0440\u0430 \u0438 \u0434\u0438\u043d\u0430\u043c\u0438\u043a\u0430." />
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
            eyebrow="\u041f\u0440\u043e\u0434\u0430\u0432\u0446\u044b"
            title="\u0418\u043d\u0441\u0430\u0439\u0442\u044b \u043f\u043e \u043f\u0440\u043e\u0434\u0430\u0432\u0446\u0430\u043c"
            description="\u0421\u0440\u0430\u0437\u0443 \u0432\u0438\u0434\u043d\u043e, \u043a\u0442\u043e \u0441\u0438\u043b\u044c\u043d\u0435\u0435 \u0432\u0441\u0435\u0433\u043e \u0432\u043b\u0438\u044f\u0435\u0442 \u043d\u0430 \u0431\u044e\u0434\u0436\u0435\u0442 \u0438 \u0433\u0434\u0435 \u0440\u0430\u0441\u0442\u0451\u0442 \u0441\u0440\u0435\u0434\u043d\u0438\u0439 \u0447\u0435\u043a."
          />

          {merchantInsightsQuery.isLoading ? (
            <div className="space-y-3">
              <Skeleton className="h-24 w-full rounded-[24px]" />
              <Skeleton className="h-24 w-full rounded-[24px]" />
            </div>
          ) : merchantInsights.length === 0 ? (
            <EmptyStateCard title="\u041f\u043e \u043f\u0440\u043e\u0434\u0430\u0432\u0446\u0430\u043c \u043f\u043e\u043a\u0430 \u043d\u0435\u0442 \u0441\u0438\u0433\u043d\u0430\u043b\u0430" description="\u0414\u043e\u0431\u0430\u0432\u044c \u0432 \u044d\u0442\u043e\u043c \u043c\u0435\u0441\u044f\u0446\u0435 \u043d\u0435\u0441\u043a\u043e\u043b\u044c\u043a\u043e \u043f\u043e\u0432\u0442\u043e\u0440\u044f\u044e\u0449\u0438\u0445\u0441\u044f \u043f\u043e\u043a\u0443\u043f\u043e\u043a, \u0438 TrackDen \u043f\u043e\u043a\u0430\u0436\u0435\u0442, \u043a\u0430\u043a\u0438\u0435 \u043f\u0440\u043e\u0434\u0430\u0432\u0446\u044b \u0444\u043e\u0440\u043c\u0438\u0440\u0443\u044e\u0442 \u0442\u0432\u043e\u0439 \u0440\u0438\u0442\u043c \u0442\u0440\u0430\u0442." />
          ) : (
            <div className="space-y-3">
              {merchantInsights.map((item) => (
                <ListCard key={item.merchant_label}>
                  <ListRow
                    title={item.merchant_label}
                    subtitle={`${item.transaction_count} \u043e\u043f\u0435\u0440\u0430\u0446\u0438\u0439 \u2022 ${item.category_name ?? '\u0431\u0435\u0437 \u043a\u0430\u0442\u0435\u0433\u043e\u0440\u0438\u0438'} \u2022 \u043f\u043e\u0441\u043b\u0435\u0434\u043d\u0438\u0439 \u0440\u0430\u0437 ${formatShortDateLabel(item.last_seen_at)}`}
                    trailing={(
                      <div className="text-right">
                        <p className="text-base font-semibold text-white">{formatMoney(item.total_amount)}</p>
                        <p className={clsx('mt-1 text-xs', item.delta_ratio == null ? 'text-[var(--app-muted)]' : item.delta_ratio > 0 ? 'text-[var(--app-danger)]' : 'text-[var(--app-success)]')}>
                          {item.delta_ratio == null ? '\u041d\u043e\u0432\u044b\u0439 \u0432 \u044d\u0442\u043e\u043c \u043c\u0435\u0441\u044f\u0446\u0435' : `${item.delta_ratio > 0 ? '+' : ''}${Math.round(item.delta_ratio)}% \u043a \u043f\u0440\u043e\u0448\u043b\u043e\u043c\u0443 \u043c\u0435\u0441\u044f\u0446\u0443`}
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
            eyebrow={UI_TEXT.common.budgets}
            title="\u041b\u0438\u043c\u0438\u0442 \u0438 \u0444\u0430\u043a\u0442"
            description="\u0421\u043c\u043e\u0442\u0440\u0438, \u0433\u0434\u0435 \u043f\u043b\u0430\u043d \u0435\u0449\u0451 \u0441\u043f\u043e\u043a\u043e\u0435\u043d, \u0430 \u0433\u0434\u0435 \u043c\u0435\u0441\u044f\u0446 \u0443\u0436\u0435 \u0434\u0430\u0432\u0438\u0442 \u043d\u0430 \u043b\u0438\u043c\u0438\u0442\u044b."
            action={<button className="pill-button pill-button--ghost" onClick={() => openSheet('budget')} type="button">{'\u041d\u0430\u0441\u0442\u0440\u043e\u0438\u0442\u044c'}</button>}
          />

          {budgetOverviewQuery.isLoading ? (
            <div className="space-y-3">
              <Skeleton className="h-28 w-full rounded-[24px]" />
              <Skeleton className="h-24 w-full rounded-[24px]" />
            </div>
          ) : !budgetOverview || budgetOverview.configured_count === 0 ? (
            <EmptyStateCard title="\u041b\u0438\u043c\u0438\u0442\u044b \u0435\u0449\u0451 \u043d\u0435 \u0437\u0430\u0434\u0430\u043d\u044b" description="\u0414\u043e\u0431\u0430\u0432\u044c \u043e\u0431\u0449\u0438\u0439 \u0431\u044e\u0434\u0436\u0435\u0442 \u0438\u043b\u0438 \u043b\u0438\u043c\u0438\u0442\u044b \u043f\u043e \u043a\u0430\u0442\u0435\u0433\u043e\u0440\u0438\u044f\u043c, \u0438 TrackDen \u043f\u043e\u043a\u0430\u0436\u0435\u0442 \u0436\u0438\u0432\u043e\u0439 \u043f\u0440\u043e\u0433\u0440\u0435\u0441\u0441 \u043f\u043e \u043c\u0435\u0440\u0435 \u043c\u0435\u0441\u044f\u0446\u0430." />
          ) : (
            <div className="space-y-3">
              {budgetOverview.overall.enabled ? (
                <SurfaceCard>
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-sm text-[var(--app-muted)]">\u041e\u0431\u0449\u0438\u0439 \u043b\u0438\u043c\u0438\u0442</p>
                      <p className="mt-2 text-2xl font-semibold tracking-[-0.04em] text-white">{formatMoney(budgetOverview.overall.spent)}</p>
                      <p className="mt-2 text-sm text-[var(--app-muted)]">\u041b\u0438\u043c\u0438\u0442 {formatMoney(budgetOverview.overall.limit ?? 0)}</p>
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
                          <p className="mt-1 text-sm text-[var(--app-muted)]">{formatMoney(item.spent)} \u0438\u0437 {formatMoney(item.limit ?? 0)}</p>
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
                <EmptyStateCard title="\u041a\u0430\u0442\u0435\u0433\u043e\u0440\u0438\u0439\u043d\u044b\u0435 \u043b\u0438\u043c\u0438\u0442\u044b \u0435\u0449\u0451 \u043d\u0435 \u0437\u0430\u0434\u0430\u043d\u044b" description="TrackDen \u0443\u0436\u0435 \u0432\u0438\u0434\u0438\u0442 \u0440\u0430\u0441\u0445\u043e\u0434\u044b \u043f\u043e \u043a\u0430\u0442\u0435\u0433\u043e\u0440\u0438\u044f\u043c. \u0414\u043e\u0431\u0430\u0432\u044c \u043b\u0438\u043c\u0438\u0442\u044b, \u0447\u0442\u043e\u0431\u044b \u043f\u0440\u0435\u0432\u0440\u0430\u0442\u0438\u0442\u044c \u044d\u0442\u043e \u0432 \u043f\u043e\u043d\u044f\u0442\u043d\u044b\u0435 \u0441\u0438\u0433\u043d\u0430\u043b\u044b." />
              )}
            </div>
          )}
        </section>
      ) : null}

      {localMode && segment === 'expense' ? (
        <section className="space-y-4">
          <SectionHeader
            eyebrow={UI_TEXT.common.subscriptions}
            title="\u0424\u0438\u043a\u0441\u0438\u0440\u043e\u0432\u0430\u043d\u043d\u044b\u0435 \u0438 \u0433\u0438\u0431\u043a\u0438\u0435 \u0442\u0440\u0430\u0442\u044b"
            description="\u0420\u0430\u0437\u0434\u0435\u043b\u0438 \u043e\u0431\u044f\u0437\u0430\u0442\u0435\u043b\u044c\u043d\u044b\u0435 \u0441\u043f\u0438\u0441\u0430\u043d\u0438\u044f \u0438 \u043e\u0431\u044b\u0447\u043d\u044b\u0435 \u0442\u0440\u0430\u0442\u044b, \u0447\u0442\u043e\u0431\u044b \u043c\u0435\u0441\u044f\u0446 \u0447\u0438\u0442\u0430\u043b\u0441\u044f \u043f\u0440\u043e\u0449\u0435."
            action={<button className="pill-button pill-button--ghost" onClick={() => openSheet('subscriptions')} type="button">{UI_TEXT.common.open}</button>}
          />

          {subscriptionOverviewQuery.isLoading ? (
            <div className="space-y-3">
              <Skeleton className="h-28 w-full rounded-[24px]" />
              <Skeleton className="h-24 w-full rounded-[24px]" />
            </div>
          ) : !subscriptionOverview ? (
            <EmptyStateCard title="\u041f\u043e\u0434\u043f\u0438\u0441\u043e\u043a \u043f\u043e\u043a\u0430 \u043d\u0435\u0434\u043e\u0441\u0442\u0430\u0442\u043e\u0447\u043d\u043e" description="\u041f\u043e \u043c\u0435\u0440\u0435 \u0440\u043e\u0441\u0442\u0430 \u043b\u043e\u043a\u0430\u043b\u044c\u043d\u043e\u0439 \u0438\u0441\u0442\u043e\u0440\u0438\u0438 \u0437\u0434\u0435\u0441\u044c \u043f\u043e\u044f\u0432\u0438\u0442\u0441\u044f \u0431\u043e\u043b\u0435\u0435 \u044f\u0441\u043d\u044b\u0439 \u0441\u043b\u043e\u0439 \u0444\u0438\u043a\u0441\u0438\u0440\u043e\u0432\u0430\u043d\u043d\u044b\u0445 \u0442\u0440\u0430\u0442." />
          ) : (
            <div className="stat-grid">
              <PremiumStatTile hint={`${subscriptionOverview.matched_this_month} \u0441\u043e\u0432\u043f\u0430\u0434\u0435\u043d\u0438\u0439 \u0432 \u043c\u0435\u0441\u044f\u0446\u0435`} label="\u0424\u0438\u043a\u0441\u0438\u0440\u043e\u0432\u0430\u043d\u043d\u043e\u0435" tone="accent" value={formatMoney(subscriptionOverview.fixed_spent)} />
              <PremiumStatTile hint="\u0412\u0441\u0451, \u0447\u0442\u043e \u043d\u0435 \u043e\u0442\u043d\u043e\u0441\u0438\u0442\u0441\u044f \u043a \u043f\u043e\u0434\u043f\u0438\u0441\u043a\u0430\u043c" label="\u0413\u0438\u0431\u043a\u043e\u0435" tone="neutral" value={formatMoney(subscriptionOverview.flexible_spent)} />
              <PremiumStatTile hint="\u0415\u0449\u0451 \u043e\u0436\u0438\u0434\u0430\u0435\u0442\u0441\u044f \u0434\u043e \u043a\u043e\u043d\u0446\u0430 \u043c\u0435\u0441\u044f\u0446\u0430" label="\u0415\u0449\u0451 \u0432\u043f\u0435\u0440\u0435\u0434\u0438" tone="warning" value={formatMoney(subscriptionOverview.upcoming_total)} />
              <PremiumStatTile hint={`${subscriptionOverview.active_count} \u0430\u043a\u0442\u0438\u0432\u043d\u044b\u0445 \u043f\u043e\u0434\u043f\u0438\u0441\u043e\u043a`} label="\u041f\u0440\u043e\u0433\u043d\u043e\u0437 \u043c\u0435\u0441\u044f\u0446\u0430" tone="success" value={formatMoney(subscriptionOverview.forecast_total)} />
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
            <PremiumStatTile hint="\u0418\u0437\u043c\u0435\u043d\u0435\u043d\u0438\u0435 \u043a \u043f\u0440\u043e\u0448\u043b\u043e\u043c\u0443 \u043c\u0435\u0441\u044f\u0446\u0443" label="\u0422\u0440\u0435\u043d\u0434" tone={derived.trend >= 0 ? (segment === 'expense' ? 'danger' : 'success') : (segment === 'expense' ? 'success' : 'danger')} value={formatSignedPercent(derived.trend)} />
            <PremiumStatTile hint="\u0421\u0440\u0435\u0434\u043d\u0438\u0439 \u043e\u0431\u044a\u0451\u043c \u043f\u043e 4 \u043d\u0435\u0434\u0435\u043b\u044f\u043c" label="\u0421\u0440\u0435\u0434\u043d\u044f\u044f \u043d\u0435\u0434\u0435\u043b\u044f" tone="neutral" value={formatCompactMoney(derived.averagePerWeek)} />
          </>
        )}
      </div>
    </div>
  );
}
