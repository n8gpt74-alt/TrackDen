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
      return { badge: 'danger', fill: '#ff7d7d', label: 'Over limit' } as const;
    case 'warning':
      return { badge: 'warning', fill: '#f59e0b', label: 'Near limit' } as const;
    case 'normal':
      return { badge: 'success', fill: '#2fd39a', label: 'On track' } as const;
    default:
      return { badge: 'neutral', fill: '#6f6bff', label: 'Not set' } as const;
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
    return `${overview.categories.length} categories in focus`;
  }

  if (overview.overall.remaining >= 0) {
    return `Remaining ${formatMoney(overview.overall.remaining)}`;
  }

  return `Over by ${formatMoney(Math.abs(overview.overall.remaining))}`;
}

function getForecastMeta(status: 'safe' | 'attention' | 'risk') {
  switch (status) {
    case 'risk':
      return { badge: 'danger', label: 'Risk' } as const;
    case 'attention':
      return { badge: 'warning', label: 'Watch' } as const;
    default:
      return { badge: 'success', label: 'Calm' } as const;
  }
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

  const firstName = user?.first_name?.trim() || 'friend';
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
    <div className="space-y-6">
      <ScreenHeader
        eyebrow="TrackDen"
        title={`Hello, ${firstName}`}
        description={`Here is your pulse for ${monthCaption}. Everything important stays in one place.`}
        leading={profileBadge}
        actions={(
          <>
            <IconCircleButton onClick={() => openSheet('ocr')}>
              <ReceiptIcon size={18} />
            </IconCircleButton>
            <IconCircleButton onClick={() => openSheet('add')}>
              <SparklesIcon size={18} />
            </IconCircleButton>
            <IconCircleButton onClick={() => navigate('/settings')}>
              <SettingsIcon size={18} />
            </IconCircleButton>
          </>
        )}
      />

      {overviewQuery.isLoading ? (
        <Skeleton className="h-[288px] w-full rounded-[28px]" />
      ) : (
        <HeroPanel
          eyebrow="Home"
          title={formatMoney(balance)}
          description={`Income ${formatMoney(overview?.total_income ?? 0)} vs expenses ${formatMoney(overview?.total_expense ?? 0)} this month.`}
        >
          <div className="bar-strip mt-6">
            {derived.bars.map((bar, index) => (
              <span
                key={`${bar.height}-${index}`}
                className={clsx('bar-strip__item', bar.active && 'bar-strip__item--active')}
                style={{ height: `${bar.height}px` }}
              />
            ))}
          </div>

          <div className="hero-panel__metrics">
            <div className="hero-panel__metric">
              <p className="hero-panel__metric-label">Month runway</p>
              <p className="hero-panel__metric-value">{formatCompactMoney(overview?.total_expense ?? 0)}</p>
              <p className="hero-panel__metric-hint">Free margin left for the current cycle</p>
            </div>
            <div className="hero-panel__metric">
              <p className="hero-panel__metric-label">Monthly spend</p>
              <p className="hero-panel__metric-value">{formatCompactMoney(derived.safePace)}</p>
              <p className="hero-panel__metric-hint">Current spending pace across all expenses</p>
            </div>
          </div>

          <div className="mt-5 flex flex-wrap gap-3">
            <button className="sheet-primary-button" onClick={() => openSheet('add')} type="button">
              Quick add
            </button>
            <button className="sheet-secondary-button" onClick={() => openSheet('ocr')} type="button">
              Scan receipt
            </button>
          </div>
        </HeroPanel>
      )}

      {localMode ? (
        <SurfaceCard>
          <SectionHeader
            eyebrow="Smart layer"
            title="Forecast and automation"
            description="TrackDen already sees your spending rhythm, surfaces quick actions, and keeps useful templates close."
            action={<button className="pill-button pill-button--ghost" onClick={() => openSheet('automation')} type="button">Automation</button>}
          />

          {forecastQuery.isLoading || weeklyReviewQuery.isLoading || automationQuery.isLoading ? (
            <div className="mt-4 space-y-3">
              <Skeleton className="h-24 w-full rounded-[22px]" />
              <Skeleton className="h-24 w-full rounded-[22px]" />
            </div>
          ) : (
            <>
              <div className="mt-4 grid gap-3 md:grid-cols-2">
                <SurfaceCard tone="soft">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-sm text-[var(--app-muted)]">End-of-month forecast</p>
                      <p className="mt-2 text-[28px] font-semibold tracking-[-0.04em] text-white">{formatMoney(forecast?.projected_expense ?? 0)}</p>
                      <p className="mt-2 text-sm text-[var(--app-muted)]">{forecast?.summary ?? 'Forecast appears once a bit of spending history is available.'}</p>
                    </div>
                    <StatusBadge tone={forecastMeta.badge}>{forecastMeta.label}</StatusBadge>
                  </div>
                  <div className="mt-4 flex gap-3 text-sm text-[var(--app-muted)]">
                    <span>??? {forecast?.remaining_days ?? 0} ??.</span>
                    <span>Fixed upcoming {formatCompactMoney(forecast?.fixed_upcoming ?? 0)}</span>
                  </div>
                </SurfaceCard>

                <SurfaceCard tone="soft">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-sm text-[var(--app-muted)]">Weekly pulse</p>
                      <p className="mt-2 text-[28px] font-semibold tracking-[-0.04em] text-white">{formatSignedPercent(weeklyReview?.delta_ratio ?? 0)}</p>
                      <p className="mt-2 text-sm text-[var(--app-muted)]">{weeklyReview?.summary ?? 'Weekly review will appear after a few expense records.'}</p>
                    </div>
                    <StatusBadge tone={(weeklyReview?.delta_ratio ?? 0) > 15 ? 'danger' : (weeklyReview?.delta_ratio ?? 0) < -10 ? 'success' : 'neutral'}>
                      {weeklyReview?.transaction_count ?? 0} entries
                    </StatusBadge>
                  </div>
                </SurfaceCard>
              </div>

              <div className="mt-4">
                <SectionHeader
                  eyebrow="Templates"
                  title="Quick actions"
                  description="Save frequent expenses and income items so you can log them again in a couple of taps."
                />
                <div className="mt-3 flex flex-wrap gap-2.5">
                  {quickTemplates.length ? quickTemplates.map((template) => (
                    <button key={template.id} className="pill-button pill-button--ghost" onClick={() => openSheet('add', { templateId: template.id })} type="button">
                      {template.label}
                      {template.amount ? <span className="ml-2 text-[var(--app-muted)]">{formatCompactMoney(template.amount)}</span> : null}
                    </button>
                  )) : (
                    <EmptyStateCard title="No templates yet" description="Create a few similar records or add a manual template, and TrackDen will surface quick actions here." action={<button className="sheet-primary-button mt-4 w-full" onClick={() => openSheet('automation')} type="button">Open automation</button>} />
                  )}
                </div>
              </div>
            </>
          )}
        </SurfaceCard>
      ) : null}

      <div className="space-y-4">
        {localMode ? (
          budgetOverviewQuery.isLoading ? (
            <Skeleton className="h-[214px] w-full rounded-[28px]" />
          ) : (
            <SurfaceCard>
              <SectionHeader
                eyebrow="Budgets"
                title="Monthly budget"
                description="Keep your spending visible and see where pressure is building first."
                action={<StatusBadge tone={budgetTone.badge}>{budgetTone.label}</StatusBadge>}
              />

              {!budgetOverview || budgetOverview.configured_count === 0 ? (
                <div className="mt-4">
                  <EmptyStateCard
                    title="Budgets are not set"
                    description="Add one overall limit or a few category limits and TrackDen will show progress here."
                    action={<button className="sheet-primary-button mt-4 w-full" onClick={() => openSheet('budget')} type="button">Set budgets</button>}
                  />
                </div>
              ) : (
                <>
                  <div className="mt-4 flex items-start justify-between gap-4">
                    <div>
                      <p className="text-sm text-[var(--app-muted)]">{budgetOverview.overall.enabled ? 'Left before overall limit' : 'Overall budget disabled'}</p>
                      <p className="mt-2 text-[30px] font-semibold tracking-[-0.04em] text-white">
                        {budgetOverview.overall.enabled ? formatMoney(budgetOverview.overall.spent) : budgetOverview.configured_count}
                      </p>
                      <p className="mt-2 text-sm text-[var(--app-muted)]">{formatBudgetCopy(budgetOverview)}</p>
                    </div>
                    <button className="pill-button pill-button--ghost" onClick={() => openSheet('budget')} type="button">
                      Categories
                    </button>
                  </div>

                  <div className="mt-4 h-3 overflow-hidden rounded-full bg-white/[0.05]">
                    <div
                      className="h-full rounded-full transition-all"
                      style={{
                        width: `${Math.max(8, Math.min(100, Math.round((budgetProgress?.ratio ?? 0) * 100)))}%`,
                        background: budgetTone.fill,
                      }}
                    />
                  </div>

                  {budgetOverview.highlighted.length > 0 ? (
                    <div className="mt-4 grid grid-cols-2 gap-3">
                      {budgetOverview.highlighted.slice(0, 2).map((item) => (
                        <PremiumStatTile
                          key={item.category_id}
                          hint={`?? ${formatCompactMoney(item.limit ?? 0)}`}
                          label={item.category_name}
                          tone={item.status === 'exceeded' ? 'danger' : item.status === 'warning' ? 'warning' : 'success'}
                          value={`${Math.round(item.ratio * 100)}%`}
                        />
                      ))}
                    </div>
                  ) : null}
                </>
              )}
            </SurfaceCard>
          )
        ) : null}

        {localMode ? (
          subscriptionManagerQuery.isLoading ? (
            <Skeleton className="h-[214px] w-full rounded-[28px]" />
          ) : (
            <SurfaceCard>
              <SectionHeader
                eyebrow="Subscriptions"
                title="Fixed monthly charges"
                description="Track subscriptions and repeating payments without manual math."
                action={<StatusBadge tone="accent">{subscriptionManager?.active_count ?? 0} active</StatusBadge>}
              />

              {!subscriptionManager || (subscriptionManager.active_count === 0 && subscriptionManager.candidate_count === 0) ? (
                <div className="mt-4">
                  <EmptyStateCard
                    title="No subscriptions yet"
                    description="Once similar monthly charges appear, TrackDen will suggest turning them into subscriptions."
                    action={<button className="sheet-primary-button mt-4 w-full" onClick={() => openSheet('subscriptions')} type="button">Open subscriptions</button>}
                  />
                </div>
              ) : (
                <>
                  <div className="mt-4 flex items-start justify-between gap-4">
                    <div>
                      <p className="text-sm text-[var(--app-muted)]">This month in subscriptions</p>
                      <p className="mt-2 text-[30px] font-semibold tracking-[-0.04em] text-white">{formatMoney(subscriptionManager.monthly_total)}</p>
                      <p className="mt-2 text-sm text-[var(--app-muted)]">{subscriptionManager.candidate_count} candidates for future subscriptions.</p>
                    </div>
                    <button className="pill-button pill-button--ghost" onClick={() => openSheet('subscriptions')} type="button">
                      Candidates
                    </button>
                  </div>

                  <div className="mt-4 space-y-3">
                    {subscriptionManager.upcoming.length > 0 ? (
                      subscriptionManager.upcoming.slice(0, 2).map((subscription) => (
                        <ListCard key={subscription.id}>
                          <ListRow
                            leading={<div className="transaction-avatar" style={{ background: 'rgba(111,107,255,0.18)', color: '#cbc9ff' }}>{subscription.merchant_label.slice(0, 1).toUpperCase()}</div>}
                            subtitle={subscription.next_charge_at ? `Next charge ${formatShortDateLabel(subscription.next_charge_at)}` : 'Date pending'}
                            title={subscription.merchant_label}
                            trailing={<div className="text-right text-sm font-semibold text-white">{formatMoney(subscription.expected_amount, subscription.currency)}</div>}
                          />
                        </ListCard>
                      ))
                    ) : (
                      <EmptyStateCard
                        title="No scheduled charges this month"
                        description="As soon as active subscriptions appear, the nearest mandatory charges will show up here."
                      />
                    )}
                  </div>
                </>
              )}
            </SurfaceCard>
          )
        ) : null}
      </div>

      <div className="stat-grid">
        {overviewQuery.isLoading ? (
          Array.from({ length: 4 }).map((_, index) => <Skeleton key={index} className="h-34 w-full rounded-[24px]" />)
        ) : (
          <>
            <PremiumStatTile
              hint="Change vs previous 7 days"
              label="Weekly pulse"
              tone={derived.trend >= 0 ? 'success' : 'danger'}
              value={formatSignedPercent(derived.trend)}
            />
            <PremiumStatTile
              hint={derived.latestExpense?.merchant || derived.latestExpense?.category?.name || 'No data'}
              label="Last purchase"
              tone="danger"
              value={`-${formatCompactMoney(derived.latestExpense?.amount ?? 0)}`}
            />
            <PremiumStatTile
              hint="Based on current spending shape"
              label="Day budget"
              tone="neutral"
              value={formatCompactMoney(derived.avgTicket)}
            />
            <PremiumStatTile
              hint="Average ticket for this month"
              label="Average spend"
              tone="accent"
              value={formatCompactMoney(derived.safePace)}
            />
          </>
        )}
      </div>

      <SurfaceCard>
        <SectionHeader
          eyebrow="History"
          title="Latest transactions"
          description="The freshest records stay visible so it is easy to keep control during the day."
          action={<button className="pill-button pill-button--primary" onClick={() => openSheet('add')} type="button">Add expense</button>}
        />

        {transactionsQuery.isLoading ? (
          <div className="mt-4 space-y-3">
            <Skeleton className="h-20 w-full rounded-[22px]" />
            <Skeleton className="h-20 w-full rounded-[22px]" />
            <Skeleton className="h-20 w-full rounded-[22px]" />
          </div>
        ) : transactions.length === 0 ? (
          <div className="mt-4">
            <EmptyStateCard title="No transactions yet" description="Add your first transaction and TrackDen will start building a live financial picture for you." />
          </div>
        ) : (
          <div className="mt-4 space-y-3">
            {transactions.slice(0, 3).map((transaction) => {
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
                    subtitle={transaction.category?.name ?? 'Uncategorized'}
                    title={transaction.merchant || transaction.description || 'No description'}
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
