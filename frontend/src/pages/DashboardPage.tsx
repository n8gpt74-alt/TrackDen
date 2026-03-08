import clsx from 'clsx';
import { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';

import { useOverviewQuery } from '../features/analytics/api';
import { useSessionQuery } from '../features/auth/api';
import { useBudgetOverviewQuery } from '../features/budgets/api';
import type { BudgetOverview, BudgetStatus } from '../features/budgets/model';
import { useFinanceSheet } from '../features/finance-sheet/useFinanceSheet';
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
      return { badge: 'danger', fill: '#ff7d7d', label: 'Перелимит' } as const;
    case 'warning':
      return { badge: 'warning', fill: '#f59e0b', label: 'На контроле' } as const;
    case 'normal':
      return { badge: 'success', fill: '#2fd39a', label: 'В норме' } as const;
    default:
      return { badge: 'neutral', fill: '#6f6bff', label: 'Не задано' } as const;
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
    return `${overview.categories.length} категорий под контролем`;
  }

  if (overview.overall.remaining >= 0) {
    return `Осталось ${formatMoney(overview.overall.remaining)}`;
  }

  return `Перерасход ${formatMoney(Math.abs(overview.overall.remaining))}`;
}

export function DashboardPage() {
  const month = currentMonthKey();
  const localMode = isLocalDataMode();
  const sessionQuery = useSessionQuery();
  const overviewQuery = useOverviewQuery(month);
  const budgetOverviewQuery = useBudgetOverviewQuery(month);
  const subscriptionManagerQuery = useSubscriptionManagerQuery();
  const transactionsQuery = useTransactionsQuery(month, 12);
  const { openSheet } = useFinanceSheet();
  const navigate = useNavigate();

  const overview = overviewQuery.data;
  const budgetOverview = localMode ? budgetOverviewQuery.data : null;
  const subscriptionManager = localMode ? subscriptionManagerQuery.data : null;
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

  const firstName = user?.first_name?.trim() || 'друг';
  const balance = overview?.balance ?? 0;
  const monthCaption = formatMonthCaption(month);

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
        title={`Привет, ${firstName}`}
        description={`Спокойный обзор за ${monthCaption}. Всё важное — на одном экране.`}
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
          eyebrow="Главный обзор"
          title={formatMoney(balance)}
          description={`После ${formatMoney(overview?.total_income ?? 0)} доходов и ${formatMoney(overview?.total_expense ?? 0)} расходов в этом месяце.`}
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
              <p className="hero-panel__metric-label">Расходы месяца</p>
              <p className="hero-panel__metric-value">{formatCompactMoney(overview?.total_expense ?? 0)}</p>
              <p className="hero-panel__metric-hint">Главный ориентир по темпу трат</p>
            </div>
            <div className="hero-panel__metric">
              <p className="hero-panel__metric-label">Доступный ритм</p>
              <p className="hero-panel__metric-value">{formatCompactMoney(derived.safePace)}</p>
              <p className="hero-panel__metric-hint">Комфортный дневной темп до конца месяца</p>
            </div>
          </div>

          <div className="mt-5 flex flex-wrap gap-3">
            <button className="sheet-primary-button" onClick={() => openSheet('add')} type="button">
              Добавить операцию
            </button>
            <button className="sheet-secondary-button" onClick={() => openSheet('ocr')} type="button">
              Сканировать чек
            </button>
          </div>
        </HeroPanel>
      )}

      <div className="space-y-4">
        {localMode ? (
          budgetOverviewQuery.isLoading ? (
            <Skeleton className="h-[214px] w-full rounded-[28px]" />
          ) : (
            <SurfaceCard>
              <SectionHeader
                eyebrow="Лимиты"
                title="Контроль бюджета"
                description="Единый взгляд на общий лимит и категории, где уже чувствуется давление." 
                action={<StatusBadge tone={budgetTone.badge}>{budgetTone.label}</StatusBadge>}
              />

              {!budgetOverview || budgetOverview.configured_count === 0 ? (
                <div className="mt-4">
                  <EmptyStateCard
                    title="Бюджеты ещё не заданы"
                    description="Добавь общий лимит или несколько категорий — и TrackDen сразу покажет давление по месяцу."
                    action={<button className="sheet-primary-button mt-4 w-full" onClick={() => openSheet('budget')} type="button">Настроить лимиты</button>}
                  />
                </div>
              ) : (
                <>
                  <div className="mt-4 flex items-start justify-between gap-4">
                    <div>
                      <p className="text-sm text-[var(--app-muted)]">{budgetOverview.overall.enabled ? 'Потрачено от общего лимита' : 'Активных лимитов'}</p>
                      <p className="mt-2 text-[30px] font-semibold tracking-[-0.04em] text-white">
                        {budgetOverview.overall.enabled ? formatMoney(budgetOverview.overall.spent) : budgetOverview.configured_count}
                      </p>
                      <p className="mt-2 text-sm text-[var(--app-muted)]">{formatBudgetCopy(budgetOverview)}</p>
                    </div>
                    <button className="pill-button pill-button--ghost" onClick={() => openSheet('budget')} type="button">
                      Настроить
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
                          hint={`Из ${formatCompactMoney(item.limit ?? 0)}`}
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
                eyebrow="Подписки"
                title="Фиксированные списания"
                description="Активные ежемесячные траты и ближайшие обязательные списания без перегруза деталями."
                action={<StatusBadge tone="accent">{subscriptionManager?.active_count ?? 0} активных</StatusBadge>}
              />

              {!subscriptionManager || (subscriptionManager.active_count === 0 && subscriptionManager.candidate_count === 0) ? (
                <div className="mt-4">
                  <EmptyStateCard
                    title="Пока без подписок"
                    description="Когда появятся похожие ежемесячные списания, TrackDen предложит подтвердить их автоматически."
                    action={<button className="sheet-primary-button mt-4 w-full" onClick={() => openSheet('subscriptions')} type="button">Открыть менеджер</button>}
                  />
                </div>
              ) : (
                <>
                  <div className="mt-4 flex items-start justify-between gap-4">
                    <div>
                      <p className="text-sm text-[var(--app-muted)]">В месяц по активным подпискам</p>
                      <p className="mt-2 text-[30px] font-semibold tracking-[-0.04em] text-white">{formatMoney(subscriptionManager.monthly_total)}</p>
                      <p className="mt-2 text-sm text-[var(--app-muted)]">{subscriptionManager.candidate_count} предложений из истории ждут решения.</p>
                    </div>
                    <button className="pill-button pill-button--ghost" onClick={() => openSheet('subscriptions')} type="button">
                      Управлять
                    </button>
                  </div>

                  <div className="mt-4 space-y-3">
                    {subscriptionManager.upcoming.length > 0 ? (
                      subscriptionManager.upcoming.slice(0, 2).map((subscription) => (
                        <ListCard key={subscription.id}>
                          <ListRow
                            leading={<div className="transaction-avatar" style={{ background: 'rgba(111,107,255,0.18)', color: '#cbc9ff' }}>{subscription.merchant_label.slice(0, 1).toUpperCase()}</div>}
                            subtitle={subscription.next_charge_at ? `Следующее списание ${formatShortDateLabel(subscription.next_charge_at)}` : 'Дата уточняется'}
                            title={subscription.merchant_label}
                            trailing={<div className="text-right text-sm font-semibold text-white">{formatMoney(subscription.expected_amount, subscription.currency)}</div>}
                          />
                        </ListCard>
                      ))
                    ) : (
                      <EmptyStateCard
                        title="Все обязательные списания уже учтены"
                        description="Новые совпадения появятся автоматически после следующих операций этого месяца."
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
              hint="Сравнение с предыдущими 7 днями"
              label="Недельный тренд"
              tone={derived.trend >= 0 ? 'success' : 'danger'}
              value={formatSignedPercent(derived.trend)}
            />
            <PremiumStatTile
              hint={derived.latestExpense?.merchant || derived.latestExpense?.category?.name || 'Нет данных'}
              label="Последняя покупка"
              tone="danger"
              value={`-${formatCompactMoney(derived.latestExpense?.amount ?? 0)}`}
            />
            <PremiumStatTile
              hint="По последним операциям месяца"
              label="Средний чек"
              tone="neutral"
              value={formatCompactMoney(derived.avgTicket)}
            />
            <PremiumStatTile
              hint="Комфортный темп до конца месяца"
              label="Дневной ритм"
              tone="accent"
              value={formatCompactMoney(derived.safePace)}
            />
          </>
        )}
      </div>

      <SurfaceCard>
        <SectionHeader
          eyebrow="История"
          title="Последние операции"
          description="Чистая лента последних действий без лишнего шума."
          action={<button className="pill-button pill-button--primary" onClick={() => openSheet('add')} type="button">Быстрый ввод</button>}
        />

        {transactionsQuery.isLoading ? (
          <div className="mt-4 space-y-3">
            <Skeleton className="h-20 w-full rounded-[22px]" />
            <Skeleton className="h-20 w-full rounded-[22px]" />
            <Skeleton className="h-20 w-full rounded-[22px]" />
          </div>
        ) : transactions.length === 0 ? (
          <div className="mt-4">
            <EmptyStateCard title="История пока пустая" description="Сохрани первую операцию, и TrackDen начнёт собирать для тебя живую картину месяца." />
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
                    subtitle={transaction.category?.name ?? 'Автокатегория'}
                    title={transaction.merchant || transaction.description || 'Без названия'}
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

