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
  const safePercent = Math.max(0, Math.min(100, percent));
  const dashArray = `${safePercent * 1.57} 157`;

  return (
    <SurfaceCard tone="soft">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-sm text-[var(--app-muted)]">{label}</p>
          <p className="mt-2 text-2xl font-semibold tracking-[-0.04em] text-white">{formatCompactMoney(amount)}</p>
        </div>
        <div className="analytics-gauge-wrap">
          <svg className="gauge" viewBox="0 0 120 60">
            <defs>
              <linearGradient id={gradientId} x1="0%" x2="100%">
                <stop offset="0%" stopColor="#28d2a3" />
                <stop offset="100%" stopColor="#ffffff" />
              </linearGradient>
            </defs>
            <path className="track" d="M10 50a50 50 0 0 1 100 0" fill="none" strokeWidth="10" />
            <path d="M10 50a50 50 0 0 1 100 0" fill="none" stroke={`url(#${gradientId})`} strokeDasharray={dashArray} strokeLinecap="round" strokeWidth="10" />
            <text fill="rgba(255,255,255,0.76)" fontSize="12" textAnchor="middle" x="60" y="42">{Math.round(safePercent)}%</text>
          </svg>
        </div>
      </div>
    </SurfaceCard>
  );
}

function getBudgetTone(status: BudgetStatus) {
  switch (status) {
    case 'exceeded':
      return { badge: 'danger', fill: '#ff7d7d', label: '??????????' } as const;
    case 'warning':
      return { badge: 'warning', fill: '#f59e0b', label: '? ??????' } as const;
    case 'normal':
      return { badge: 'success', fill: '#2fd39a', label: '? ?????' } as const;
    default:
      return { badge: 'neutral', fill: '#6f6bff', label: '?? ?????' } as const;
  }
}

function formatBudgetFooter(remaining: number | null) {
  if (remaining == null) {
    return '????? ?? ?????';
  }

  if (remaining >= 0) {
    return `???????? ${formatMoney(remaining)}`;
  }

  return `?????????? ?? ${formatMoney(Math.abs(remaining))}`;
}

function getTrendTone(segment: TransactionType, trend: number) {
  if (trend === 0) {
    return 'neutral' as const;
  }

  if (segment === 'expense') {
    return trend > 0 ? 'danger' as const : 'success' as const;
  }

  return trend > 0 ? 'success' as const : 'danger' as const;
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
      ? (overview?.by_category ?? []).map((item) => ({ name: item.category_name, amount: item.amount })).slice(0, 3)
      : buildSourceBreakdown(transactions, 'income').slice(0, 3);
    const trend = calculateRecentTrend(overview?.by_day ?? [], segment);
    const averagePerWeek = weekly.reduce((sum, item) => sum + item.value, 0) / Math.max(weekly.length, 1);
    const peak = Math.max(...weekly.map((item) => item.value), 1);
    const mainBreakdown = breakdown[0];

    return {
      total,
      breakdown,
      trend,
      weekly,
      averagePerWeek,
      peak,
      mainBreakdown,
    };
  }, [overview, segment, transactions]);

  const trendTone = getTrendTone(segment, derived.trend);

  return (
    <div className="space-y-7">
      <ScreenHeader
        eyebrow="??????????"
        title="????????? ??????"
        description="???? ????????? ????? ??? ???????, ???????, ????????????? ???? ? ????? ???????? ?? ??????."
        actions={(
          <>
            {segment === 'expense' ? (
              <button className="pill-button pill-button--ghost" onClick={() => openSheet('budget')} type="button">
                ?????????
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
          { label: '???????', value: 'expense' },
        ]}
        value={segment}
      />

      {overviewQuery.isLoading ? (
        <Skeleton className="h-[336px] w-full rounded-[28px]" />
      ) : (
        <HeroPanel
          eyebrow="??????? ??????"
          title={formatMoney(derived.total)}
          description={`??????? ?? ${formatMonthCaption(month)} ? ?????, ??? ?????? ? ?????? ????? ???? ${segment === 'expense' ? '???????' : '??????'}.`}
          actions={<StatusBadge tone={trendTone}>{formatSignedPercent(derived.trend)}</StatusBadge>}
        >
          <div className="analytics-hero-meta">
            <div className="analytics-hero-meta__item">
              <span className="analytics-hero-meta__label">??????? ??????</span>
              <strong className="analytics-hero-meta__value">{formatCompactMoney(derived.averagePerWeek)}</strong>
            </div>
            <div className="analytics-hero-meta__item">
              <span className="analytics-hero-meta__label">??????? ????</span>
              <strong className="analytics-hero-meta__value">{derived.mainBreakdown?.name ?? UI_TEXT.common.noData}</strong>
            </div>
            <div className="analytics-hero-meta__item">
              <span className="analytics-hero-meta__label">?????</span>
              <strong className="analytics-hero-meta__value">{segment === 'expense' ? '???????' : '??????'}</strong>
            </div>
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
        </HeroPanel>
      )}

      {localMode && segment === 'expense' ? (
        <section className="space-y-4">
          <SectionHeader
            eyebrow="??????? ??????"
            title="??????? ? ????? ??????"
            description="????? ?????, ??? ????? ? ??????? ?????? ? ??? ??? ???????? ????? ???????? ?? ??????."
          />

          {forecastQuery.isLoading || weeklyReviewQuery.isLoading ? (
            <div className="space-y-3">
              <Skeleton className="h-28 w-full rounded-[24px]" />
              <Skeleton className="h-24 w-full rounded-[24px]" />
            </div>
          ) : (
            <>
              <div className="analytics-grid">
                <PremiumStatTile hint="??????? ???????? ? ????? ??????" label="??????? ????" tone={forecast?.status === 'risk' ? 'danger' : forecast?.status === 'attention' ? 'warning' : 'success'} value={formatMoney(forecast?.projected_expense ?? 0)} />
                <PremiumStatTile hint="????? ????????? ????????" label="??????? ??????" tone={forecast && forecast.projected_balance < 0 ? 'danger' : 'accent'} value={formatMoney(forecast?.projected_balance ?? 0)} />
                <PremiumStatTile hint="????????? ? ??????? ??????" label="????? ??????" tone={(weeklyReview?.delta_ratio ?? 0) > 10 ? 'danger' : (weeklyReview?.delta_ratio ?? 0) < -10 ? 'success' : 'neutral'} value={formatSignedPercent(weeklyReview?.delta_ratio ?? 0)} />
                <PremiumStatTile hint="????? ???????? ?????????" label="??????? ?????????" tone="neutral" value={weeklyReview?.top_category_name ?? UI_TEXT.common.noData} />
              </div>

              <SurfaceCard tone="soft">
                <p className="text-sm text-[var(--app-muted)]">??????? ?????</p>
                <p className="mt-2 text-base font-semibold text-white">{weeklyReview?.summary ?? '?????? ??? ?????????? ?????? ???? ?? ???????.'}</p>
                {forecast ? <p className="mt-3 text-sm text-[var(--app-muted)]">{forecast.summary}</p> : null}
              </SurfaceCard>
            </>
          )}
        </section>
      ) : null}

      <section className="space-y-4">
        <SectionHeader
          eyebrow="????????? ??????"
          title={segment === 'expense' ? '??? ????????? ???????' : '??? ????????? ??????'}
          description="??????? ???? ??????? ????? ????? ? ??? ????? ??????, ??? ????????????? ?????? ???????."
        />

        {overviewQuery.isLoading ? (
          <div className="space-y-3">
            <Skeleton className="h-32 w-full rounded-[26px]" />
            <Skeleton className="h-32 w-full rounded-[26px]" />
          </div>
        ) : derived.breakdown.length === 0 ? (
          <EmptyStateCard title="?????? ???? ????????????" description="?????? ????????? ???????? ? ???? ??????, ? ????? ???????? ????????? ? ????????." />
        ) : (
          <div className="analytics-gauge-grid">
            {derived.breakdown.map((item) => (
              <GaugeCard
                key={item.name}
                amount={item.amount}
                label={item.name}
                percent={derived.total > 0 ? (item.amount / derived.total) * 100 : 0}
              />
            ))}
          </div>
        )}
      </section>

      {localMode && segment === 'expense' ? (
        <section className="space-y-4">
          <SectionHeader
            eyebrow="????? ????????"
            title="????????, ?????? ? ?????????????"
            description="??? ?????? ????: ??? ??????? ????? ?????? ?? ??????, ??? ????? ?????? ? ??????? ???????? ????????????? ?????."
          />

          <div className="analytics-stack-grid">
            <SurfaceCard>
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="soft-kicker">????????</p>
                  <h3 className="home-focus-card__title">??? ?????? ?? ?????</h3>
                </div>
                <StatusBadge tone="neutral">{merchantInsights.length}</StatusBadge>
              </div>

              {merchantInsightsQuery.isLoading ? (
                <div className="mt-4 space-y-3">
                  <Skeleton className="h-20 w-full rounded-[22px]" />
                  <Skeleton className="h-20 w-full rounded-[22px]" />
                </div>
              ) : merchantInsights.length === 0 ? (
                <EmptyStateCard
                  className="mt-4"
                  title="?? ????????? ???? ??? ???????"
                  description="?????? ????????? ????????????? ???????, ? TrackDen ???????, ??? ??????? ????? ?????? ?? ?????."
                />
              ) : (
                <div className="mt-4 space-y-3">
                  {merchantInsights.slice(0, 3).map((item) => (
                    <ListCard key={item.merchant_label}>
                      <ListRow
                        title={item.merchant_label}
                        subtitle={`${item.transaction_count} ???????? ? ${item.category_name ?? '??? ?????????'} ? ????????? ??? ${formatShortDateLabel(item.last_seen_at)}`}
                        trailing={(
                          <div className="text-right">
                            <p className="text-base font-semibold text-white">{formatMoney(item.total_amount)}</p>
                            <p className={clsx('mt-1 text-xs', item.delta_ratio == null ? 'text-[var(--app-muted)]' : item.delta_ratio > 0 ? 'text-[var(--app-danger)]' : 'text-[var(--app-success)]')}>
                              {item.delta_ratio == null ? '????? ? ???? ??????' : `${item.delta_ratio > 0 ? '+' : ''}${Math.round(item.delta_ratio)}% ? ???????? ??????`}
                            </p>
                          </div>
                        )}
                      />
                    </ListCard>
                  ))}
                </div>
              )}
            </SurfaceCard>

            <SurfaceCard>
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="soft-kicker">{UI_TEXT.common.budgets}</p>
                  <h3 className="home-focus-card__title">????? ? ????</h3>
                </div>
                <button className="pill-button pill-button--ghost" onClick={() => openSheet('budget')} type="button">
                  ?????????
                </button>
              </div>

              {budgetOverviewQuery.isLoading ? (
                <div className="mt-4 space-y-3">
                  <Skeleton className="h-28 w-full rounded-[24px]" />
                  <Skeleton className="h-24 w-full rounded-[24px]" />
                </div>
              ) : !budgetOverview || budgetOverview.configured_count === 0 ? (
                <EmptyStateCard
                  className="mt-4"
                  title="?????? ??? ?? ??????"
                  description="?????? ????? ?????? ??? ?????? ?? ??????????, ? TrackDen ??????? ????? ???????? ??????."
                />
              ) : (
                <div className="mt-4 space-y-3">
                  {budgetOverview.overall.enabled ? (
                    <SurfaceCard tone="soft">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="text-sm text-[var(--app-muted)]">????? ?????</p>
                          <p className="mt-2 text-2xl font-semibold tracking-[-0.04em] text-white">{formatMoney(budgetOverview.overall.spent)}</p>
                          <p className="mt-2 text-sm text-[var(--app-muted)]">????? {formatMoney(budgetOverview.overall.limit ?? 0)}</p>
                        </div>
                        <StatusBadge tone={getBudgetTone(budgetOverview.overall.status).badge}>{getBudgetTone(budgetOverview.overall.status).label}</StatusBadge>
                      </div>
                      <div className="home-progress mt-4">
                        <div
                          className="home-progress__bar"
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

                  {budgetOverview.categories.length > 0 ? budgetOverview.categories.slice(0, 3).map((item) => {
                    const tone = getBudgetTone(item.status);
                    return (
                      <SurfaceCard key={item.category_id} tone="soft">
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <p className="text-base font-medium text-white">{item.category_name}</p>
                            <p className="mt-1 text-sm text-[var(--app-muted)]">{formatMoney(item.spent)} ?? {formatMoney(item.limit ?? 0)}</p>
                          </div>
                          <StatusBadge tone={tone.badge}>{tone.label}</StatusBadge>
                        </div>
                        <div className="home-progress mt-4">
                          <div
                            className="home-progress__bar"
                            style={{
                              width: `${Math.min(100, Math.max(6, Math.round(item.ratio * 100)))}%`,
                              background: tone.fill,
                            }}
                          />
                        </div>
                        <p className="mt-3 text-sm text-[var(--app-muted)]">{formatBudgetFooter(item.remaining)}</p>
                      </SurfaceCard>
                    );
                  }) : (
                    <EmptyStateCard title="???????????? ?????? ??? ?? ??????" description="TrackDen ??? ????? ??????? ?? ??????????. ?????? ??????, ????? ?????????? ??? ? ???????? ???????." />
                  )}
                </div>
              )}
            </SurfaceCard>
          </div>
        </section>
      ) : null}

      {localMode && segment === 'expense' ? (
        <section className="space-y-4">
          <SectionHeader
            eyebrow={UI_TEXT.common.subscriptions}
            title="????????????? ? ?????? ?????"
            description="??????? ???????????? ???????? ? ??????? ?????, ????? ????? ??????? ????? ? ?????????."
            action={<button className="pill-button pill-button--ghost" onClick={() => openSheet('subscriptions')} type="button">{UI_TEXT.common.open}</button>}
          />

          {subscriptionOverviewQuery.isLoading ? (
            <div className="space-y-3">
              <Skeleton className="h-28 w-full rounded-[24px]" />
              <Skeleton className="h-24 w-full rounded-[24px]" />
            </div>
          ) : !subscriptionOverview ? (
            <EmptyStateCard title="???????? ???? ????????????" description="?? ???? ????? ????????? ??????? ????? ???????? ????? ????? ???? ????????????? ????." />
          ) : (
            <div className="analytics-grid">
              <PremiumStatTile hint={`${subscriptionOverview.matched_this_month} ?????????? ? ??????`} label="?????????????" tone="accent" value={formatMoney(subscriptionOverview.fixed_spent)} />
              <PremiumStatTile hint="???, ??? ?? ????????? ? ?????????" label="??????" tone="neutral" value={formatMoney(subscriptionOverview.flexible_spent)} />
              <PremiumStatTile hint="??? ????????? ?? ????? ??????" label="??? ???????" tone="warning" value={formatMoney(subscriptionOverview.upcoming_total)} />
              <PremiumStatTile hint={`${subscriptionOverview.active_count} ???????? ????????`} label="??????? ??????" tone="success" value={formatMoney(subscriptionOverview.forecast_total)} />
            </div>
          )}
        </section>
      ) : null}
    </div>
  );
}
