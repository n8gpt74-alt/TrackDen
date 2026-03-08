import clsx from 'clsx';
import { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';

import { useOverviewQuery } from '../features/analytics/api';
import { useSessionQuery } from '../features/auth/api';
import { useBudgetOverviewQuery } from '../features/budgets/api';
import type { BudgetOverview, BudgetStatus } from '../features/budgets/model';
import { useFinanceSheet } from '../features/finance-sheet/useFinanceSheet';
import { useTransactionsQuery } from '../features/transactions/api';
import { isLocalDataMode } from '../shared/api/mode';
import { currentMonthKey } from '../shared/lib/date';
import { buildRecurringPreview, calculateAverageTicket, calculateRecentTrend } from '../shared/lib/finance';
import { formatCompactMoney, formatMoney, formatSignedPercent } from '../shared/lib/money';
import {
  ActivityIcon,
  IconCircleButton,
  ReceiptIcon,
  SettingsIcon,
  SparklesIcon,
} from '../shared/ui/premium';
import { Skeleton } from '../shared/ui/Skeleton';

function buildHeroBars(values: number[]) {
  if (values.length === 0) {
    return Array.from({ length: 24 }, (_, index) => ({ height: 16 + (index % 4) * 8, active: index % 6 !== 0 }));
  }

  const sample = Array.from({ length: 24 }, (_, index) => {
    const sampleIndex = values.length - 24 + index;
    return sampleIndex >= 0 ? values[sampleIndex] ?? 0 : 0;
  });
  const maxValue = Math.max(...sample, 1);

  return sample.map((value) => ({
    height: 16 + Math.max(10, Math.round((value / maxValue) * 52)),
    active: value > 0,
  }));
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
        label: 'Порог 80%',
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

function formatBudgetBalance(overview: BudgetOverview) {
  if (!overview.overall.enabled || overview.overall.remaining == null) {
    return 'Общий лимит не задан';
  }

  if (overview.overall.remaining >= 0) {
    return `Осталось ${formatMoney(overview.overall.remaining)}`;
  }

  return `Перерасход ${formatMoney(Math.abs(overview.overall.remaining))}`;
}

export function DashboardPage() {
  const navigate = useNavigate();
  const month = currentMonthKey();
  const localMode = isLocalDataMode();
  const sessionQuery = useSessionQuery();
  const overviewQuery = useOverviewQuery(month);
  const budgetOverviewQuery = useBudgetOverviewQuery(month);
  const transactionsQuery = useTransactionsQuery(month, 12);
  const { openSheet } = useFinanceSheet();

  const overview = overviewQuery.data;
  const budgetOverview = localMode ? budgetOverviewQuery.data : null;
  const transactions = transactionsQuery.data?.items ?? [];
  const user = sessionQuery.data?.user;

  const derived = useMemo(() => {
    const expenseValues = overview?.by_day.map((point) => point.expense) ?? [];
    const trend = calculateRecentTrend(overview?.by_day ?? [], 'expense');
    const latestExpense = transactions.find((transaction) => transaction.type === 'expense');
    const avgTicket = calculateAverageTicket(transactions, 'expense');
    const recurring = buildRecurringPreview(transactions, 3);
    const target = Math.max(overview?.total_income ?? 0, (overview?.total_expense ?? 0) * 1.25, 1000);
    const available = Math.max(target - (overview?.total_expense ?? 0), 0);
    const today = new Date();
    const daysLeft = Math.max(1, new Date(today.getFullYear(), today.getMonth() + 1, 0).getDate() - today.getDate() + 1);

    return {
      bars: buildHeroBars(expenseValues),
      trend,
      latestExpense,
      avgTicket,
      recurring,
      target,
      available,
      daysLeft,
      dayBudget: available / daysLeft,
    };
  }, [overview, transactions]);

  const budgetState = resolveBudgetState(budgetOverview);
  const budgetTone = getBudgetTone(budgetState);
  const budgetProgress = budgetOverview?.overall.enabled
    ? budgetOverview.overall
    : budgetOverview?.highlighted[0] ?? null;

  const firstName = user?.first_name?.trim() || 'друг';
  const balance = overview?.balance ?? 0;

  return (
    <div className="space-y-5">
      <header className="page-topbar">
        <div className="flex items-center gap-3">
          {user?.photo_url ? (
            <img alt={firstName} className="h-11 w-11 rounded-full border border-[var(--app-stroke)] object-cover" src={user.photo_url} />
          ) : (
            <div className="flex h-11 w-11 items-center justify-center rounded-full border border-[var(--app-stroke)] bg-white/[0.04] text-sm font-semibold text-white">
              {firstName.slice(0, 1).toUpperCase()}
            </div>
          )}
          <div>
            <p className="soft-kicker">Premium ledger</p>
            <p className="text-sm text-[var(--app-muted)]">{overview?.month ?? 'Этот месяц'}</p>
          </div>
        </div>

        <div className="flex gap-2">
          <IconCircleButton onClick={() => navigate('/settings')}>
            <SettingsIcon size={18} />
          </IconCircleButton>
          <IconCircleButton onClick={() => openSheet('ocr')}>
            <ReceiptIcon size={18} />
          </IconCircleButton>
        </div>
      </header>

      <section>
        <p className="text-[34px] font-semibold leading-[1.02] tracking-[-0.04em] text-white">Привет, {firstName}</p>
        <p className="mt-2 max-w-[280px] text-[15px] leading-6 text-[var(--app-muted)]">Вот краткий обзор движения денег и самых важных трат за текущий месяц.</p>
      </section>

      {overviewQuery.isLoading ? (
        <Skeleton className="h-[250px] w-full rounded-[28px]" />
      ) : (
        <section className="hero-card p-5">
          <div className="glow-dot left-[-30px] top-[-28px] h-24 w-24 bg-[var(--app-glow-a)]" />
          <div className="glow-dot bottom-[-28px] right-[-20px] h-24 w-24 bg-[var(--app-glow-b)]" />
          <div className="relative">
            <p className="text-[15px] font-medium text-[var(--app-muted-strong)]">Финансовый ритм месяца</p>
            <p className="mt-1 max-w-[250px] text-sm leading-6 text-[var(--app-muted)]">Следи за темпом расходов и добавляй операции, не выпадая из потока.</p>

            <div className="bar-strip mt-6">
              {derived.bars.map((bar, index) => (
                <span
                  key={`${bar.height}-${index}`}
                  className={clsx('bar-strip__item', bar.active && 'bar-strip__item--active')}
                  style={{ height: `${bar.height}px` }}
                />
              ))}
            </div>

            <div className="mt-6 grid grid-cols-2 gap-4">
              <div>
                <p className="text-xs uppercase tracking-[0.2em] text-[var(--app-muted)]">Баланс</p>
                <p className={clsx('mt-2 text-[28px] font-semibold tracking-[-0.04em]', balance >= 0 ? 'text-[var(--app-success)]' : 'text-[var(--app-danger)]')}>
                  {formatMoney(balance)}
                </p>
              </div>
              <div>
                <p className="text-right text-xs uppercase tracking-[0.2em] text-[var(--app-muted)]">Траты месяца</p>
                <p className="mt-2 text-right text-[28px] font-semibold tracking-[-0.04em] text-white">{formatMoney(overview?.total_expense ?? 0)}</p>
              </div>
            </div>

            <div className="mt-5 flex gap-3">
              <button className="sheet-primary-button" onClick={() => openSheet('add')} type="button">
                Добавить операцию
              </button>
              <button className="sheet-secondary-button" onClick={() => openSheet('ocr')} type="button">
                OCR чек
              </button>
            </div>
          </div>
        </section>
      )}

      {localMode ? (
        budgetOverviewQuery.isLoading ? (
          <Skeleton className="h-[224px] w-full rounded-[28px]" />
        ) : (
          <section className="premium-card rounded-[28px] p-5">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="soft-kicker">Budget control</p>
                <h2 className="mt-1 text-xl font-semibold text-white">Лимиты месяца</h2>
              </div>
              <button className="rounded-full border border-[var(--app-stroke)] bg-white/[0.03] px-3 py-2 text-xs font-medium uppercase tracking-[0.18em] text-[var(--app-muted)]" onClick={() => openSheet('budget')} type="button">
                Настроить
              </button>
            </div>

            {!budgetOverview || budgetOverview.configured_count === 0 ? (
              <div className="mt-4 rounded-[24px] border border-dashed border-[var(--app-stroke)] bg-white/[0.02] p-4">
                <p className="text-base font-medium text-white">Пока без лимитов</p>
                <p className="mt-2 text-sm leading-6 text-[var(--app-muted)]">Задай общий бюджет или потолки по категориям — и мы сразу покажем, где появляется давление на месяц.</p>
                <button className="sheet-primary-button mt-4 w-full" onClick={() => openSheet('budget')} type="button">
                  Настроить бюджеты
                </button>
              </div>
            ) : (
              <>
                <div className="mt-4 flex items-start justify-between gap-4">
                  <div>
                    <p className="text-sm text-[var(--app-muted)]">{budgetOverview.overall.enabled ? 'Потрачено от общего лимита' : 'Под контролем категорий'}</p>
                    <p className="mt-2 text-[30px] font-semibold tracking-[-0.04em] text-white">
                      {budgetOverview.overall.enabled ? formatMoney(budgetOverview.overall.spent) : `${budgetOverview.categories.length}`}
                    </p>
                    <p className={clsx('mt-2 text-sm', budgetTone.textClass)}>{formatBudgetBalance(budgetOverview)}</p>
                  </div>
                  <div className={clsx('rounded-full border px-3 py-2 text-xs font-semibold uppercase tracking-[0.18em]', budgetTone.badgeClass)}>
                    {budgetTone.label}
                  </div>
                </div>

                <div className="mt-4 h-3 overflow-hidden rounded-full bg-white/[0.05]">
                  <div
                    className="h-full rounded-full transition-all"
                    style={{
                      width: `${Math.max(8, Math.min(100, Math.round((budgetProgress?.ratio ?? 0) * 100)))}%`,
                      background: budgetTone.fill,
                      opacity: budgetProgress ? 1 : 0.3,
                    }}
                  />
                </div>

                <div className="mt-3 flex items-center justify-between gap-3 text-sm text-[var(--app-muted)]">
                  <span>
                    {budgetOverview.overall.enabled && budgetOverview.overall.limit
                      ? `Лимит ${formatMoney(budgetOverview.overall.limit)}`
                      : `${budgetOverview.categories.length} категорий с лимитами`}
                  </span>
                  <span>{budgetOverview.exceeded_count > 0 ? `${budgetOverview.exceeded_count} в красной зоне` : `${budgetOverview.warning_count} близко к лимиту`}</span>
                </div>

                {budgetOverview.highlighted.length > 0 ? (
                  <div className="mt-4 grid grid-cols-3 gap-3">
                    {budgetOverview.highlighted.map((item) => {
                      const tone = getBudgetTone(item.status);
                      return (
                        <div key={item.category_id} className="rounded-[22px] border border-[var(--app-stroke)] bg-[#0c1018] p-3">
                          <div className="flex items-center justify-between gap-2">
                            <p className="truncate text-sm font-medium text-white">{item.category_name}</p>
                            <span className={clsx('rounded-full px-2 py-1 text-[10px] uppercase tracking-[0.16em]', tone.badgeClass)}>
                              {Math.round(item.ratio * 100)}%
                            </span>
                          </div>
                          <p className="mt-3 text-sm font-semibold text-white">{formatCompactMoney(item.spent)}</p>
                          <p className="mt-1 text-xs text-[var(--app-muted)]">из {formatCompactMoney(item.limit ?? 0)}</p>
                        </div>
                      );
                    })}
                  </div>
                ) : null}
              </>
            )}
          </section>
        )
      ) : null}

      <section className="grid grid-cols-2 gap-3">
        {overviewQuery.isLoading ? (
          Array.from({ length: 4 }).map((_, index) => <Skeleton key={index} className="h-32 w-full rounded-[24px]" />)
        ) : (
          <>
            <div className="metric-tile">
              <p className="text-sm text-[var(--app-muted)]">Недельный тренд</p>
              <p className={clsx('mt-2 text-[28px] font-semibold tracking-[-0.04em]', derived.trend >= 0 ? 'text-[var(--app-success)]' : 'text-[var(--app-danger)]')}>
                {formatSignedPercent(derived.trend)}
              </p>
              <p className="mt-2 text-xs text-[var(--app-muted)]">Сравнение с предыдущими 7 днями</p>
            </div>
            <div className="metric-tile">
              <p className="text-sm text-[var(--app-muted)]">Последняя покупка</p>
              <p className="mt-2 text-[28px] font-semibold tracking-[-0.04em] text-[var(--app-danger)]">-{formatCompactMoney(derived.latestExpense?.amount ?? 0)}</p>
              <p className="mt-2 text-xs text-[var(--app-muted)]">{derived.latestExpense?.merchant || derived.latestExpense?.category?.name || 'Нет данных'}</p>
            </div>
            <div className="metric-tile">
              <p className="text-sm text-[var(--app-muted)]">Средний чек</p>
              <p className="mt-2 text-[28px] font-semibold tracking-[-0.04em] text-white">{formatCompactMoney(derived.avgTicket)}</p>
              <p className="mt-2 text-xs text-[var(--app-muted)]">По последним операциям месяца</p>
            </div>
            <div className="metric-tile">
              <p className="text-sm text-[var(--app-muted)]">Дневной ритм</p>
              <p className="mt-2 text-[28px] font-semibold tracking-[-0.04em] text-[var(--app-accent)]">{formatCompactMoney(derived.dayBudget)}</p>
              <p className="mt-2 text-xs text-[var(--app-muted)]">Чтобы удержать текущий баланс</p>
            </div>
          </>
        )}
      </section>

      <section className="premium-card rounded-[28px] p-4">
        <div className="mb-4 flex items-center justify-between">
          <div>
            <p className="soft-kicker">Quick patterns</p>
            <h2 className="mt-1 text-xl font-semibold text-white">Частые платежи</h2>
          </div>
          <button className="text-sm text-[var(--app-accent)]" onClick={() => openSheet('add')} type="button">
            Добавить
          </button>
        </div>

        {overviewQuery.isLoading ? (
          <div className="grid grid-cols-3 gap-3">
            {Array.from({ length: 3 }).map((_, index) => <Skeleton key={index} className="h-24 w-full rounded-[20px]" />)}
          </div>
        ) : derived.recurring.length === 0 ? (
          <div className="empty-card">Пока нет частых операций. Добавь несколько покупок — и здесь появятся быстрые паттерны.</div>
        ) : (
          <div className="grid grid-cols-3 gap-3">
            {derived.recurring.map((item) => (
              <div key={item.title} className="rounded-[22px] border border-[var(--app-stroke)] bg-white/[0.03] p-3">
                <div className="transaction-avatar h-11 w-11 rounded-[16px] text-sm" style={{ background: `${item.color}22`, color: item.color }}>
                  {item.title.slice(0, 1).toUpperCase()}
                </div>
                <p className="mt-3 truncate text-sm font-medium text-white">{item.title}</p>
                <p className="mt-1 truncate text-xs text-[var(--app-muted)]">{item.subtitle}</p>
                <p className="mt-2 text-sm font-semibold text-white">{formatCompactMoney(item.amount)}</p>
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="premium-card rounded-[28px] p-4">
        <div className="mb-4 flex items-center justify-between">
          <div>
            <p className="soft-kicker">Recent activity</p>
            <h2 className="mt-1 text-xl font-semibold text-white">Последние операции</h2>
          </div>
          <button className="inline-flex items-center gap-2 text-sm text-[var(--app-accent)]" onClick={() => openSheet('add')} type="button">
            <SparklesIcon size={14} />
            Быстрый ввод
          </button>
        </div>

        {transactionsQuery.isLoading ? (
          <div className="space-y-3">
            <Skeleton className="h-20 w-full rounded-[22px]" />
            <Skeleton className="h-20 w-full rounded-[22px]" />
            <Skeleton className="h-20 w-full rounded-[22px]" />
          </div>
        ) : transactions.length === 0 ? (
          <div className="empty-card">Сохрани первую операцию, чтобы главная начала выглядеть как в референсе — живой и полезной.</div>
        ) : (
          <div className="space-y-3">
            {transactions.slice(0, 3).map((transaction) => {
              const isExpense = transaction.type === 'expense';
              return (
                <button
                  key={transaction.id}
                  className="transaction-row w-full text-left"
                  onClick={() => openSheet('edit', { transactionId: transaction.id })}
                  type="button"
                >
                  <div className="flex items-center gap-3">
                    <div
                      className="transaction-avatar"
                      style={{
                        background: `${transaction.category?.color ?? (isExpense ? '#ff7d7d' : '#2fd39a')}22`,
                        color: transaction.category?.color ?? (isExpense ? '#ff7d7d' : '#2fd39a'),
                      }}
                    >
                      {isExpense ? <ActivityIcon size={18} /> : <SparklesIcon size={18} />}
                    </div>
                    <div>
                      <p className="font-medium text-white">{transaction.merchant || transaction.description || 'Без названия'}</p>
                      <p className="mt-1 text-sm text-[var(--app-muted)]">{transaction.category?.name ?? 'Автокатегория'}</p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className={clsx('text-base font-semibold', isExpense ? 'text-[var(--app-danger)]' : 'text-[var(--app-success)]')}>
                      {isExpense ? '-' : '+'}
                      {formatMoney(transaction.amount, transaction.currency)}
                    </p>
                    <p className="mt-1 text-xs text-[var(--app-muted)]">{new Date(transaction.occurred_at).toLocaleDateString('ru-RU')}</p>
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}
