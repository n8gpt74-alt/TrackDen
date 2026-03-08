import clsx from 'clsx';
import { useId, useMemo, useState } from 'react';

import { useOverviewQuery } from '../features/analytics/api';
import { useBudgetOverviewQuery } from '../features/budgets/api';
import type { BudgetStatus } from '../features/budgets/model';
import { useFinanceSheet } from '../features/finance-sheet/useFinanceSheet';
import { useSubscriptionOverviewQuery } from '../features/subscriptions/api';
import { useTransactionsQuery, type TransactionType } from '../features/transactions/api';
import { isLocalDataMode } from '../shared/api/mode';
import { currentMonthKey, formatMonthCaption } from '../shared/lib/date';
import { buildSourceBreakdown, buildWeeklyBuckets, calculateRecentTrend } from '../shared/lib/finance';
import { formatCompactMoney, formatMoney, formatSignedPercent } from '../shared/lib/money';
import { IconCircleButton, SettingsIcon } from '../shared/ui/premium';
import {
  EmptyStateCard,
  HeroPanel,
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
      return { badge: 'danger', fill: '#ff7d7d', label: 'Перелимит' } as const;
    case 'warning':
      return { badge: 'warning', fill: '#f59e0b', label: 'На контроле' } as const;
    case 'normal':
      return { badge: 'success', fill: '#2fd39a', label: 'В норме' } as const;
    default:
      return { badge: 'neutral', fill: '#6f6bff', label: 'Не задано' } as const;
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
  const localMode = isLocalDataMode();
  const [segment, setSegment] = useState<TransactionType>('expense');
  const overviewQuery = useOverviewQuery(month);
  const budgetOverviewQuery = useBudgetOverviewQuery(month);
  const subscriptionOverviewQuery = useSubscriptionOverviewQuery(month);
  const transactionsQuery = useTransactionsQuery(month, 100);
  const { openSheet } = useFinanceSheet();

  const overview = overviewQuery.data;
  const budgetOverview = localMode ? budgetOverviewQuery.data : null;
  const subscriptionOverview = localMode ? subscriptionOverviewQuery.data : null;
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
        eyebrow="Аналитика"
        title="Чёткая картина месяца"
        description="Один главный график и несколько спокойных аналитических срезов без перегруза деталями."
        actions={(
          <>
            {segment === 'expense' ? (
              <button className="pill-button pill-button--ghost" onClick={() => openSheet('budget')} type="button">
                Лимиты
              </button>
            ) : null}
            <IconCircleButton onClick={() => openSheet(segment === 'expense' ? 'subscriptions' : 'add')}>
              <SettingsIcon size={18} />
            </IconCircleButton>
          </>
        )}
      />

      <SegmentedControl
        onChange={setSegment}
        options={[
          { label: 'Доходы', value: 'income' },
          { label: 'Расходы', value: 'expense' },
        ]}
        value={segment}
      />

      {overviewQuery.isLoading ? (
        <Skeleton className="h-[320px] w-full rounded-[28px]" />
      ) : (
        <HeroPanel
          eyebrow="Главный график"
          title={formatMoney(derived.total)}
          description={`Помесячный срез за ${formatMonthCaption(month)} — фокус на том, как движется ${segment === 'expense' ? 'расход' : 'доход'} внутри месяца.`}
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

      <section className="space-y-4">
        <SectionHeader
          eyebrow="Состав"
          title={segment === 'expense' ? 'Главные категории расходов' : 'Ключевые источники дохода'}
          description="Верхние драйверы месяца, которые сильнее всего влияют на общую картину."
        />

        {overviewQuery.isLoading ? (
          <div className="space-y-3">
            <Skeleton className="h-32 w-full rounded-[26px]" />
            <Skeleton className="h-32 w-full rounded-[26px]" />
          </div>
        ) : derived.breakdown.length === 0 ? (
          <EmptyStateCard title="Пока мало данных" description="Когда в месяце накопится больше операций, здесь появятся главные драйверы и срезы." />
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
            eyebrow="Лимиты"
            title="Лимиты и факт"
            description="Управленческий слой: где всё спокойно, а где бюджет уже начал поджимать месяц."
            action={<button className="pill-button pill-button--ghost" onClick={() => openSheet('budget')} type="button">Настроить</button>}
          />

          {budgetOverviewQuery.isLoading ? (
            <div className="space-y-3">
              <Skeleton className="h-28 w-full rounded-[24px]" />
              <Skeleton className="h-24 w-full rounded-[24px]" />
            </div>
          ) : !budgetOverview || budgetOverview.configured_count === 0 ? (
            <EmptyStateCard title="Лимиты пока не включены" description="Добавь общий бюджет или категории с лимитами — и TrackDen покажет картину по факту и остатку." />
          ) : (
            <div className="space-y-3">
              {budgetOverview.overall.enabled ? (
                <SurfaceCard>
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-sm text-[var(--app-muted)]">Общий лимит</p>
                      <p className="mt-2 text-2xl font-semibold tracking-[-0.04em] text-white">{formatMoney(budgetOverview.overall.spent)}</p>
                      <p className="mt-2 text-sm text-[var(--app-muted)]">Лимит {formatMoney(budgetOverview.overall.limit ?? 0)}</p>
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
                          <p className="mt-1 text-sm text-[var(--app-muted)]">{formatMoney(item.spent)} из {formatMoney(item.limit ?? 0)}</p>
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
                <EmptyStateCard title="Категорийные лимиты не включены" description="Сейчас TrackDen следит только за общим лимитом. При желании можно добавить лимиты по категориям." />
              )}
            </div>
          )}
        </section>
      ) : null}

      {localMode && segment === 'expense' ? (
        <section className="space-y-4">
          <SectionHeader
            eyebrow="Подписки"
            title="Фиксированные и гибкие траты"
            description="Разделение обязательных платежей и остальных расходов помогает видеть реальный простор месяца."
            action={<button className="pill-button pill-button--ghost" onClick={() => openSheet('subscriptions')} type="button">Управлять</button>}
          />

          {subscriptionOverviewQuery.isLoading ? (
            <div className="space-y-3">
              <Skeleton className="h-28 w-full rounded-[24px]" />
              <Skeleton className="h-24 w-full rounded-[24px]" />
            </div>
          ) : !subscriptionOverview ? (
            <EmptyStateCard title="Подписки ещё загружаются" description="Когда local-first данные будут готовы, здесь появится прогноз фиксированных трат." />
          ) : (
            <div className="stat-grid">
              <PremiumStatTile hint={`${subscriptionOverview.matched_this_month} совпадений в месяце`} label="Фиксированные" tone="accent" value={formatMoney(subscriptionOverview.fixed_spent)} />
              <PremiumStatTile hint="Все остальные расходные операции" label="Гибкие" tone="neutral" value={formatMoney(subscriptionOverview.flexible_spent)} />
              <PremiumStatTile hint="Ещё впереди в этом месяце" label="До конца месяца" tone="warning" value={formatMoney(subscriptionOverview.upcoming_total)} />
              <PremiumStatTile hint={`${subscriptionOverview.active_count} активных подписок`} label="Прогноз минимума" tone="success" value={formatMoney(subscriptionOverview.forecast_total)} />
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
            <PremiumStatTile hint="Динамика относительно прошлой недели" label="Тренд" tone={derived.trend >= 0 ? (segment === 'expense' ? 'danger' : 'success') : (segment === 'expense' ? 'success' : 'danger')} value={formatSignedPercent(derived.trend)} />
            <PremiumStatTile hint="Среднее значение по 4 недельным слотам" label="Средняя неделя" tone="neutral" value={formatCompactMoney(derived.averagePerWeek)} />
          </>
        )}
      </div>
    </div>
  );
}



