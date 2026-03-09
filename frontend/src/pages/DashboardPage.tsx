import clsx from 'clsx';
import { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';

import { useOverviewQuery } from '../features/analytics/api';
import { useSessionQuery } from '../features/auth/api';
import { useBudgetOverviewQuery } from '../features/budgets/api';
import type { BudgetOverview, BudgetStatus } from '../features/budgets/model';
import { useFinanceSheet } from '../features/finance-sheet/useFinanceSheet';
import { useAutomationOverviewQuery, useForecastOverviewQuery, useWeeklyReviewQuery } from '../features/intelligence/api';
import { useSubscriptionManagerQuery } from '../features/subscriptions/api';
import { useTransactionsQuery } from '../features/transactions/api';
import { isLocalDataMode } from '../shared/api/mode';
import { currentMonthKey, formatMonthCaption, formatShortDateLabel } from '../shared/lib/date';
import { calculateAverageTicket, calculateRecentTrend } from '../shared/lib/finance';
import { formatCompactMoney, formatMoney, formatSignedPercent } from '../shared/lib/money';
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
import { ActivityIcon, IconCircleButton, ReceiptIcon, SettingsIcon, SparklesIcon } from '../shared/ui/premium';
import { Skeleton } from '../shared/ui/Skeleton';
import { UI_TEXT } from '../shared/i18n/ui';

function buildHeroBars(values: number[]) {
  if (values.length === 0) {
    return Array.from({ length: 24 }, (_, index) => ({ height: 18 + (index % 4) * 8, active: index % 6 !== 0 }));
  }

  const sample = Array.from({ length: 24 }, (_, index) => {
    const sampleIndex = values.length - 24 + index;
    return sampleIndex >= 0 ? values[sampleIndex] ?? 0 : 0;
  });
  const maxValue = Math.max(...sample, 1);

  return sample.map((value) => ({
    height: 18 + Math.max(10, Math.round((value / maxValue) * 56)),
    active: value > 0,
  }));
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

function resolveBudgetState(overview: BudgetOverview | undefined | null): BudgetStatus {
  if (!overview || overview.configured_count === 0) {
    return 'inactive';
  }

  if (overview.overall.status === 'exceeded' || overview.exceeded_count > 0) {
    return 'exceeded';
  }

  if (overview.overall.status === 'warning' || overview.warning_count > 0) {
    return 'warning';
  }

  return overview.overall.enabled || overview.categories.length > 0 ? 'normal' : 'inactive';
}

function formatBudgetCopy(overview: BudgetOverview) {
  if (!overview.overall.enabled || overview.overall.remaining == null) {
    return `${overview.categories.length} ????????? ??? ?????????`;
  }

  if (overview.overall.remaining >= 0) {
    return `???????? ${formatMoney(overview.overall.remaining)}`;
  }

  return `?????????? ?? ${formatMoney(Math.abs(overview.overall.remaining))}`;
}

function getForecastMeta(status: 'safe' | 'attention' | 'risk') {
  switch (status) {
    case 'risk':
      return { badge: 'danger', label: '????' } as const;
    case 'attention':
      return { badge: 'warning', label: '????????' } as const;
    default:
      return { badge: 'success', label: '????????' } as const;
  }
}

function getExpenseTrendTone(trend: number) {
  if (trend > 8) {
    return 'danger' as const;
  }

  if (trend < -8) {
    return 'success' as const;
  }

  return 'neutral' as const;
}

export function DashboardPage() {
  const navigate = useNavigate();
  const month = currentMonthKey();
  const localMode = isLocalDataMode();
  const sessionQuery = useSessionQuery();
  const overviewQuery = useOverviewQuery(month);
  const budgetOverviewQuery = useBudgetOverviewQuery(month);
  const subscriptionManagerQuery = useSubscriptionManagerQuery();
  const automationQuery = useAutomationOverviewQuery();
  const forecastQuery = useForecastOverviewQuery(month);
  const weeklyReviewQuery = useWeeklyReviewQuery();
  const transactionsQuery = useTransactionsQuery(month, 12);
  const { openSheet } = useFinanceSheet();

  const overview = overviewQuery.data;
  const budgetOverview = localMode ? budgetOverviewQuery.data : null;
  const subscriptionManager = localMode ? subscriptionManagerQuery.data : null;
  const automation = localMode ? automationQuery.data : null;
  const forecast = localMode ? forecastQuery.data : null;
  const weeklyReview = localMode ? weeklyReviewQuery.data : null;
  const transactions = transactionsQuery.data?.items ?? [];
  const user = sessionQuery.data?.user;

  const derived = useMemo(() => {
    const expenseValues = overview?.by_day.map((point) => point.expense) ?? [];
    const trend = calculateRecentTrend(overview?.by_day ?? [], 'expense');
    const latestExpense = transactions.find((transaction) => transaction.type === 'expense');
    const avgTicket = calculateAverageTicket(transactions, 'expense');
    const today = new Date();
    const daysLeft = Math.max(1, new Date(today.getFullYear(), today.getMonth() + 1, 0).getDate() - today.getDate() + 1);
    const safePace = Math.max((overview?.balance ?? 0) / daysLeft, 0);

    return {
      bars: buildHeroBars(expenseValues),
      trend,
      latestExpense,
      avgTicket,
      safePace,
    };
  }, [overview, transactions]);

  const budgetState = resolveBudgetState(budgetOverview);
  const budgetTone = getBudgetTone(budgetState);
  const budgetProgress = budgetOverview?.overall.enabled
    ? budgetOverview.overall
    : budgetOverview?.highlighted[0] ?? null;
  const forecastMeta = getForecastMeta(forecast?.status ?? 'safe');
  const trendTone = getExpenseTrendTone(derived.trend);

  const firstName = user?.first_name?.trim() || '????';
  const balance = overview?.balance ?? 0;
  const monthCaption = formatMonthCaption(month);
  const quickTemplates = automation ? [...automation.quick_templates, ...automation.suggested_templates].slice(0, 4) : [];

  const profileBadge = user?.photo_url ? (
    <img alt={firstName} className="h-12 w-12 rounded-full border border-[var(--app-stroke)] object-cover" src={user.photo_url} />
  ) : (
    <div className="flex h-12 w-12 items-center justify-center rounded-full border border-[var(--app-stroke)] bg-white/[0.04] text-sm font-semibold text-white">
      {firstName.slice(0, 1).toUpperCase()}
    </div>
  );

  return (
    <div className="space-y-7">
      <ScreenHeader
        eyebrow="TrackDen"
        title={`??????, ${firstName}`}
        description={`??? ???? ???? ?? ${monthCaption}. ??? ?????? ??? ?? ?????.`}
        leading={profileBadge}
        actions={(
          <>
            <IconCircleButton onClick={() => openSheet('ocr')}>
              <ReceiptIcon size={18} />
            </IconCircleButton>
            <IconCircleButton onClick={() => openSheet('automation')}>
              <SparklesIcon size={18} />
            </IconCircleButton>
            <IconCircleButton onClick={() => navigate('/settings')}>
              <SettingsIcon size={18} />
            </IconCircleButton>
          </>
        )}
      />

      {overviewQuery.isLoading ? (
        <Skeleton className="h-[320px] w-full rounded-[28px]" />
      ) : (
        <HeroPanel
          eyebrow="??????? ?????"
          title={formatMoney(balance)}
          description={`?????? ${formatMoney(overview?.total_income ?? 0)} ? ??????? ${formatMoney(overview?.total_expense ?? 0)} ?? ???? ?????.`}
          actions={<StatusBadge tone={trendTone}>{formatSignedPercent(derived.trend)}</StatusBadge>}
        >
          <div className="home-hero-summary">
            <div className="home-hero-summary__item">
              <span className="home-hero-summary__label">??????</span>
              <strong className="home-hero-summary__value">{formatCompactMoney(overview?.total_income ?? 0)}</strong>
            </div>
            <div className="home-hero-summary__item">
              <span className="home-hero-summary__label">???????</span>
              <strong className="home-hero-summary__value">{formatCompactMoney(overview?.total_expense ?? 0)}</strong>
            </div>
            <div className="home-hero-summary__item">
              <span className="home-hero-summary__label">?????</span>
              <strong className="home-hero-summary__value">{monthCaption}</strong>
            </div>
          </div>

          <div className="bar-strip mt-6">
            {derived.bars.map((bar, index) => (
              <span
                key={`${bar.height}-${index}`}
                className={clsx('bar-strip__item', bar.active && 'bar-strip__item--active')}
                style={{ height: `${bar.height}px` }}
              />
            ))}
          </div>

          <div className="hero-grid home-hero-grid">
            <div className="hero-panel__metric">
              <p className="hero-panel__metric-label">???????? ? ????</p>
              <p className="hero-panel__metric-value">{formatCompactMoney(derived.safePace)}</p>
              <p className="hero-panel__metric-hint">????? ????????? ??????? ?????? ?? ????? ??????.</p>
            </div>
            <div className="hero-panel__metric">
              <p className="hero-panel__metric-label">??????? ???</p>
              <p className="hero-panel__metric-value">{formatCompactMoney(derived.avgTicket)}</p>
              <p className="hero-panel__metric-hint">??????? ????? ????????? ???????? ?? ???? ?????.</p>
            </div>
          </div>

          <div className="home-hero-actions">
            <button className="sheet-primary-button" onClick={() => openSheet('add')} type="button">
              ???????? ??????
            </button>
            <button className="sheet-secondary-button" onClick={() => openSheet('ocr')} type="button">
              ??????????? ???
            </button>
            <button className="sheet-secondary-button" onClick={() => navigate('/transactions')} type="button">
              ??????? ???????
            </button>
          </div>
        </HeroPanel>
      )}

      {localMode ? (
        <section className="space-y-4">
          <SectionHeader
            eyebrow="???????? ??????"
            title="?????? ? ????????????? ????????"
            description="??? ??????? ????? ????????: ??? ?????? ??? ????? ? ????? ???????????? ????? ??? ???????."
          />

          <div className="home-focus-grid">
            {budgetOverviewQuery.isLoading ? (
              <Skeleton className="h-[248px] w-full rounded-[28px]" />
            ) : (
              <SurfaceCard className="home-focus-card" tone="soft">
                <div className="home-focus-card__top">
                  <div>
                    <p className="soft-kicker">{UI_TEXT.common.budgets}</p>
                    <h3 className="home-focus-card__title">?????? ??????</h3>
                  </div>
                  <StatusBadge tone={budgetTone.badge}>{budgetTone.label}</StatusBadge>
                </div>

                {!budgetOverview || budgetOverview.configured_count === 0 ? (
                  <EmptyStateCard
                    className="mt-4"
                    title="?????? ??? ?? ??????"
                    description="?????? ????? ????? ??? ???? ????????? ? ? TrackDen ????? ??????? ????????." 
                    action={(
                      <button className="sheet-primary-button mt-4 w-full" onClick={() => openSheet('budget')} type="button">
                        ????????? ??????
                      </button>
                    )}
                  />
                ) : (
                  <>
                    <div className="home-focus-card__value-wrap">
                      <p className="home-focus-card__label">{budgetOverview.overall.enabled ? '????????? ?? ?????? ??????' : '???????? ????????? ??? ?????????'}</p>
                      <p className="home-focus-card__value">
                        {budgetOverview.overall.enabled ? formatMoney(budgetOverview.overall.spent) : String(budgetOverview.configured_count)}
                      </p>
                      <p className="home-focus-card__hint">{formatBudgetCopy(budgetOverview)}</p>
                    </div>

                    <div className="home-progress">
                      <div
                        className="home-progress__bar"
                        style={{
                          width: `${Math.max(8, Math.min(100, Math.round((budgetProgress?.ratio ?? 0) * 100)))}%`,
                          background: budgetTone.fill,
                        }}
                      />
                    </div>

                    <div className="home-mini-stack">
                      {budgetOverview.highlighted.length > 0 ? budgetOverview.highlighted.slice(0, 2).map((item) => (
                        <div className="home-mini-row" key={item.category_id}>
                          <div>
                            <p className="home-mini-row__title">{item.category_name}</p>
                            <p className="home-mini-row__hint">????? {formatCompactMoney(item.limit ?? 0)}</p>
                          </div>
                          <div className="home-mini-row__value">{Math.round(item.ratio * 100)}%</div>
                        </div>
                      )) : (
                        <div className="home-mini-row home-mini-row--ghost">
                          <div>
                            <p className="home-mini-row__title">????? ?? ??????????</p>
                            <p className="home-mini-row__hint">TrackDen ??????? ???? ?????, ??? ?????? ???????? ??????.</p>
                          </div>
                        </div>
                      )}
                    </div>

                    <button className="pill-button pill-button--ghost mt-4" onClick={() => openSheet('budget')} type="button">
                      ????????? ????????
                    </button>
                  </>
                )}
              </SurfaceCard>
            )}

            {subscriptionManagerQuery.isLoading ? (
              <Skeleton className="h-[248px] w-full rounded-[28px]" />
            ) : (
              <SurfaceCard className="home-focus-card" tone="soft">
                <div className="home-focus-card__top">
                  <div>
                    <p className="soft-kicker">{UI_TEXT.common.subscriptions}</p>
                    <h3 className="home-focus-card__title">????????????? ????????</h3>
                  </div>
                  <StatusBadge tone="accent">{subscriptionManager?.active_count ?? 0} ????????</StatusBadge>
                </div>

                {!subscriptionManager || (subscriptionManager.active_count === 0 && subscriptionManager.candidate_count === 0) ? (
                  <EmptyStateCard
                    className="mt-4"
                    title="???????? ???? ???"
                    description="????? ? ??????? ???????? ??????? ??????????? ????????, TrackDen ????????? ???????? ?? ??? ????????."
                    action={(
                      <button className="sheet-primary-button mt-4 w-full" onClick={() => openSheet('subscriptions')} type="button">
                        ??????? ????????
                      </button>
                    )}
                  />
                ) : (
                  <>
                    <div className="home-focus-card__value-wrap">
                      <p className="home-focus-card__label">???????? ? ???? ??????</p>
                      <p className="home-focus-card__value">{formatMoney(subscriptionManager.monthly_total)}</p>
                      <p className="home-focus-card__hint">{subscriptionManager.candidate_count} ?????????? ?? ??????? ????????.</p>
                    </div>

                    <div className="home-mini-stack">
                      {subscriptionManager.upcoming.length > 0 ? subscriptionManager.upcoming.slice(0, 2).map((subscription) => (
                        <div className="home-mini-row" key={subscription.id}>
                          <div>
                            <p className="home-mini-row__title">{subscription.merchant_label}</p>
                            <p className="home-mini-row__hint">
                              {subscription.next_charge_at ? `????????? ???????? ${formatShortDateLabel(subscription.next_charge_at)}` : '???? ??????????'}
                            </p>
                          </div>
                          <div className="home-mini-row__value">{formatCompactMoney(subscription.expected_amount)}</div>
                        </div>
                      )) : (
                        <div className="home-mini-row home-mini-row--ghost">
                          <div>
                            <p className="home-mini-row__title">????????? ???????? ???? ???</p>
                            <p className="home-mini-row__hint">??? ?????? ???????? ???????? ????????, ????? ????? ????????? ??????.</p>
                          </div>
                        </div>
                      )}
                    </div>

                    <button className="pill-button pill-button--ghost mt-4" onClick={() => openSheet('subscriptions')} type="button">
                      ????????? ??????????
                    </button>
                  </>
                )}
              </SurfaceCard>
            )}
          </div>
        </section>
      ) : null}

      {localMode ? (
        <SurfaceCard>
          <SectionHeader
            eyebrow="????? ????????"
            title="??????? ? ??????? ????????"
            description="TrackDen ??? ????? ???? ???? ????, ???????????? ????? ?????? ? ?????? ?????? ???????? ??? ?????."
            action={(
              <button className="pill-button pill-button--ghost" onClick={() => openSheet('automation')} type="button">
                {UI_TEXT.common.automation}
              </button>
            )}
          />

          {forecastQuery.isLoading || weeklyReviewQuery.isLoading || automationQuery.isLoading ? (
            <div className="mt-4 space-y-3">
              <Skeleton className="h-24 w-full rounded-[22px]" />
              <Skeleton className="h-24 w-full rounded-[22px]" />
            </div>
          ) : (
            <>
              <div className="home-review-grid mt-4">
                <SurfaceCard tone="soft">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-sm text-[var(--app-muted)]">??????? ?? ????? ??????</p>
                      <p className="mt-2 text-[28px] font-semibold tracking-[-0.04em] text-white">{formatMoney(forecast?.projected_expense ?? 0)}</p>
                      <p className="mt-2 text-sm text-[var(--app-muted)]">{forecast?.summary ?? '??????? ????????, ????? ????????? ???? ?? ??????? ??????? ????.'}</p>
                    </div>
                    <StatusBadge tone={forecastMeta.badge}>{forecastMeta.label}</StatusBadge>
                  </div>
                  <div className="mt-4 flex flex-wrap gap-3 text-sm text-[var(--app-muted)]">
                    <span>{`???????? ${forecast?.remaining_days ?? 0} ??.`}</span>
                    <span>{`????????? ???????? ${formatCompactMoney(forecast?.fixed_upcoming ?? 0)}`}</span>
                  </div>
                </SurfaceCard>

                <SurfaceCard tone="soft">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-sm text-[var(--app-muted)]">????? ??????</p>
                      <p className="mt-2 text-[28px] font-semibold tracking-[-0.04em] text-white">{formatSignedPercent(weeklyReview?.delta_ratio ?? 0)}</p>
                      <p className="mt-2 text-sm text-[var(--app-muted)]">{weeklyReview?.summary ?? '????????? ????? ???????? ????? ?????? ????????? ???????.'}</p>
                    </div>
                    <StatusBadge tone={trendTone}>{weeklyReview?.transaction_count ?? 0} ???????</StatusBadge>
                  </div>
                </SurfaceCard>
              </div>

              <div className="mt-5">
                <SectionHeader
                  eyebrow={UI_TEXT.common.templates}
                  title="??????? ????????"
                  description="?????? ????? ? ?????? ?????? ??? ????? ? ????? ???????? ?????? ?? ???? ???????."
                />
                <div className="home-template-wrap mt-3">
                  {quickTemplates.length ? quickTemplates.map((template) => (
                    <button key={template.id} className="pill-button pill-button--ghost" onClick={() => openSheet('add', { templateId: template.id })} type="button">
                      {template.label}
                      {template.amount ? <span className="ml-2 text-[var(--app-muted)]">{formatCompactMoney(template.amount)}</span> : null}
                    </button>
                  )) : (
                    <EmptyStateCard
                      title="???????? ???? ???"
                      description="?????? ???? ??????? ??????? ??? ?????? ?????? ??????? ? ? ??????? ???????? ???????? ?????."
                      action={(
                        <button className="sheet-primary-button mt-4 w-full" onClick={() => openSheet('automation')} type="button">
                          ??????? ?????????????
                        </button>
                      )}
                    />
                  )}
                </div>
              </div>
            </>
          )}
        </SurfaceCard>
      ) : null}

      <section className="space-y-4">
        <SectionHeader
          eyebrow="???????? ???????"
          title="????? ??????"
          description="???????? ???? ?? ??????, ???????? ???? ? ????????? ??????? ? ??? ?????????? ???????."
        />

        <div className="stat-grid">
          {overviewQuery.isLoading ? (
            Array.from({ length: 4 }).map((_, index) => <Skeleton key={index} className="h-34 w-full rounded-[24px]" />)
          ) : (
            <>
              <PremiumStatTile
                hint="????????? ? ??????? 7 ????"
                label="????? ??????"
                tone={trendTone}
                value={formatSignedPercent(derived.trend)}
              />
              <PremiumStatTile
                hint={derived.latestExpense?.merchant || derived.latestExpense?.category?.name || UI_TEXT.common.noData}
                label="????????? ?????"
                tone="danger"
                value={`-${formatCompactMoney(derived.latestExpense?.amount ?? 0)}`}
              />
              <PremiumStatTile
                hint="??????? ????? ????????? ????????"
                label="??????? ???"
                tone="accent"
                value={formatCompactMoney(derived.avgTicket)}
              />
              <PremiumStatTile
                hint="????? ?? ?????? ???? ????? ??????"
                label="???????? ? ????"
                tone="neutral"
                value={formatCompactMoney(derived.safePace)}
              />
            </>
          )}
        </div>
      </section>

      <SurfaceCard>
        <SectionHeader
          eyebrow={UI_TEXT.common.history}
          title="????????? ????????"
          description="?????? ?????? ?? ????, ????? ???? ? ????? ???? ??? ?????????."
          action={(
            <button className="pill-button pill-button--ghost" onClick={() => navigate('/transactions')} type="button">
              ??? ???????
            </button>
          )}
        />

        {transactionsQuery.isLoading ? (
          <div className="mt-4 space-y-3">
            <Skeleton className="h-20 w-full rounded-[22px]" />
            <Skeleton className="h-20 w-full rounded-[22px]" />
            <Skeleton className="h-20 w-full rounded-[22px]" />
          </div>
        ) : transactions.length === 0 ? (
          <div className="mt-4">
            <EmptyStateCard title="???????? ???? ???" description="?????? ?????? ??????, ? TrackDen ?????? ??????? ????? ??????? ??????." />
          </div>
        ) : (
          <div className="mt-4 space-y-3">
            {transactions.slice(0, 4).map((transaction) => {
              const isExpense = transaction.type === 'expense';
              return (
                <ListCard key={transaction.id}>
                  <ListRow
                    leading={(
                      <div
                        className="transaction-avatar"
                        style={{
                          background: `${transaction.category?.color ?? (isExpense ? '#ff7d7d' : '#2fd39a')}22`,
                          color: transaction.category?.color ?? (isExpense ? '#ff7d7d' : '#2fd39a'),
                        }}
                      >
                        {isExpense ? <ActivityIcon size={18} /> : <SparklesIcon size={18} />}
                      </div>
                    )}
                    onClick={() => openSheet('edit', { transactionId: transaction.id })}
                    subtitle={transaction.category?.name ?? UI_TEXT.common.uncategorized}
                    title={transaction.merchant || transaction.description || UI_TEXT.common.noDescription}
                    trailing={(
                      <div className="text-right">
                        <p className={clsx('text-base font-semibold', isExpense ? 'text-[var(--app-danger)]' : 'text-[var(--app-success)]')}>
                          {isExpense ? '-' : '+'}
                          {formatMoney(transaction.amount, transaction.currency)}
                        </p>
                        <p className="mt-1 text-xs text-[var(--app-muted)]">{new Date(transaction.occurred_at).toLocaleDateString('ru-RU')}</p>
                      </div>
                    )}
                  />
                </ListCard>
              );
            })}
          </div>
        )}
      </SurfaceCard>
    </div>
  );
}
