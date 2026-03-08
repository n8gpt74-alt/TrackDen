import clsx from 'clsx';
import { useMemo, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';

import { useFinanceSheet } from '../features/finance-sheet/useFinanceSheet';
import {
  useConfirmRecurringCandidateMutation,
  useDismissRecurringCandidateMutation,
  useSubscriptionManagerQuery,
} from '../features/subscriptions/api';
import { type TransactionType, useDeleteTransactionMutation, useTransactionsQuery } from '../features/transactions/api';
import { isLocalDataMode } from '../shared/api/mode';
import { currentMonthKey, formatDateGroupLabel } from '../shared/lib/date';
import { buildRecurringPreview, groupTransactionsByDate } from '../shared/lib/finance';
import { formatCompactMoney, formatMoney } from '../shared/lib/money';
import {
  EmptyStateCard,
  ListCard,
  ListRow,
  ScreenHeader,
  SectionHeader,
  StatusBadge,
  SurfaceCard,
} from '../shared/ui/premium-kit';
import { ActivityIcon, IconCircleButton, PencilIcon, SegmentedControl, TrashIcon } from '../shared/ui/premium';
import { Skeleton } from '../shared/ui/Skeleton';

export function TransactionsPage() {
  const queryClient = useQueryClient();
  const month = currentMonthKey();
  const localMode = isLocalDataMode();
  const [segment, setSegment] = useState<TransactionType>('expense');
  const transactionsQuery = useTransactionsQuery(month, 80, segment);
  const subscriptionManagerQuery = useSubscriptionManagerQuery();
  const deleteMutation = useDeleteTransactionMutation();
  const confirmCandidateMutation = useConfirmRecurringCandidateMutation();
  const dismissCandidateMutation = useDismissRecurringCandidateMutation();
  const { openSheet } = useFinanceSheet();

  const transactions = transactionsQuery.data?.items ?? [];
  const groupedTransactions = useMemo(() => groupTransactionsByDate(transactions), [transactions]);
  const recurring = useMemo(() => buildRecurringPreview(transactions, 3), [transactions]);
  const candidates = localMode && segment === 'expense' ? (subscriptionManagerQuery.data?.candidates ?? []).slice(0, 2) : [];

  const invalidateFinanceData = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['transactions'] }),
      queryClient.invalidateQueries({ queryKey: ['analytics'] }),
      queryClient.invalidateQueries({ queryKey: ['budgets'] }),
      queryClient.invalidateQueries({ queryKey: ['subscriptions'] }),
    ]);
  };

  const handleDelete = async (id: string) => {
    if (!window.confirm('Удалить эту операцию?')) {
      return;
    }

    await deleteMutation.mutateAsync(id);
    await invalidateFinanceData();
  };

  const handleCandidateConfirm = async (candidateId: string) => {
    await confirmCandidateMutation.mutateAsync(candidateId);
    await invalidateFinanceData();
  };

  const handleCandidateDismiss = async (candidateId: string) => {
    await dismissCandidateMutation.mutateAsync(candidateId);
    await invalidateFinanceData();
  };

  return (
    <div className="space-y-6">
      <ScreenHeader
        eyebrow="История"
        title="Операционный экран"
        description="Все транзакции месяца, частые сценарии и предложения по регулярным списаниям в одном ритме."
        actions={
          localMode ? (
            <button className="pill-button pill-button--ghost" onClick={() => openSheet('subscriptions')} type="button">
              Подписки
            </button>
          ) : undefined
        }
      />

      <SegmentedControl
        onChange={setSegment}
        options={[
          { label: 'Доходы', value: 'income' },
          { label: 'Расходы', value: 'expense' },
        ]}
        value={segment}
      />

      <section className="space-y-4">
        <SectionHeader
          eyebrow="Паттерны"
          title="Частые операции"
          description="Быстрые сценарии, которые чаще всего встречаются в этом месяце."
        />

        {transactionsQuery.isLoading ? (
          <div className="grid grid-cols-3 gap-3">
            {Array.from({ length: 3 }).map((_, index) => <Skeleton key={index} className="h-28 w-full rounded-[22px]" />)}
          </div>
        ) : recurring.length === 0 ? (
          <EmptyStateCard title="Паттерны ещё не появились" description="Когда операций станет больше, здесь появятся самые частые сценарии для быстрого ввода." />
        ) : (
          <div className="grid grid-cols-3 gap-3">
            {recurring.map((item) => (
              <SurfaceCard key={item.title} className="p-3" tone="soft">
                <button className="w-full text-left" onClick={() => openSheet('add')} type="button">
                  <div className="transaction-avatar h-11 w-11 rounded-[16px] text-sm" style={{ background: `${item.color}22`, color: item.color }}>
                    {item.title.slice(0, 1).toUpperCase()}
                  </div>
                  <p className="mt-3 truncate text-sm font-medium text-white">{item.title}</p>
                  <p className="mt-1 truncate text-xs text-[var(--app-muted)]">{item.subtitle}</p>
                  <p className="mt-2 text-sm font-semibold text-white">{formatCompactMoney(item.amount)}</p>
                </button>
              </SurfaceCard>
            ))}
          </div>
        )}
      </section>

      {localMode && segment === 'expense' ? (
        <section className="space-y-4">
          <SectionHeader
            eyebrow="Предложения"
            title="Подписки из истории"
            description="Лёгкий слой подтверждения: TrackDen показывает только действительно похожие ежемесячные списания."
            action={<StatusBadge tone="accent">{subscriptionManagerQuery.data?.candidate_count ?? 0} кандидатов</StatusBadge>}
          />

          {subscriptionManagerQuery.isLoading ? (
            <div className="space-y-3">
              <Skeleton className="h-28 w-full rounded-[24px]" />
              <Skeleton className="h-28 w-full rounded-[24px]" />
            </div>
          ) : candidates.length === 0 ? (
            <EmptyStateCard title="Пока без кандидатов" description="Когда в истории накопятся похожие ежемесячные списания, здесь появится предложение подтвердить подписку." />
          ) : (
            <div className="space-y-3">
              {candidates.map((candidate) => (
                <SurfaceCard key={candidate.id}>
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-base font-medium text-white">{candidate.merchant_label}</p>
                      <p className="mt-1 text-sm text-[var(--app-muted)]">
                        {candidate.match_count} совпадения · {Math.round(candidate.confidence * 100)}% уверенности
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="text-base font-semibold text-white">{formatMoney(candidate.expected_amount, candidate.currency)}</p>
                      <p className="mt-1 text-sm text-[var(--app-muted)]">{candidate.expected_day} число</p>
                    </div>
                  </div>
                  <div className="mt-4 flex flex-wrap gap-3">
                    <button className="pill-button pill-button--primary" onClick={() => void handleCandidateConfirm(candidate.id)} type="button">
                      Подтвердить
                    </button>
                    <button className="pill-button" onClick={() => void handleCandidateDismiss(candidate.id)} type="button">
                      Не подписка
                    </button>
                    <button className="pill-button" onClick={() => openSheet('subscriptions')} type="button">
                      Позже
                    </button>
                  </div>
                </SurfaceCard>
              ))}
            </div>
          )}
        </section>
      ) : null}

      <section className="space-y-4">
        <SectionHeader
          eyebrow="Лента"
          title="Все транзакции"
          description="Чистая группировка по датам и аккуратные действия редактирования без визуального шума."
          action={<button className="pill-button pill-button--primary" onClick={() => openSheet('add')} type="button">Добавить</button>}
        />

        {transactionsQuery.isLoading ? (
          <div className="space-y-3">
            <Skeleton className="h-24 w-full rounded-[24px]" />
            <Skeleton className="h-24 w-full rounded-[24px]" />
            <Skeleton className="h-24 w-full rounded-[24px]" />
          </div>
        ) : groupedTransactions.length === 0 ? (
          <EmptyStateCard title="Транзакций за этот месяц пока нет" description="Добавь первую операцию, и здесь появится аккуратная лента по датам и категориям." />
        ) : (
          <div className="space-y-5">
            {groupedTransactions.map((group) => (
              <div key={group.label} className="space-y-3">
                <div className="flex items-center justify-between px-1">
                  <p className="soft-kicker">{formatDateGroupLabel(group.label)}</p>
                </div>
                <div className="space-y-3">
                  {group.items.map((transaction) => {
                    const isExpense = transaction.type === 'expense';
                    return (
                      <ListCard key={transaction.id}>
                        <div className="list-row">
                          <div className="list-row__leading">
                            <div
                              className="transaction-avatar"
                              style={{
                                background: `${transaction.category?.color ?? (isExpense ? '#ff7d7d' : '#2fd39a')}22`,
                                color: transaction.category?.color ?? (isExpense ? '#ff7d7d' : '#2fd39a'),
                              }}
                            >
                              <ActivityIcon size={18} />
                            </div>
                          </div>
                          <div className="list-row__content">
                            <p className="list-row__title">{transaction.merchant || transaction.description || 'Без названия'}</p>
                            <p className="list-row__subtitle">{transaction.category?.name ?? 'Автокатегория'}</p>
                          </div>
                          <div className="list-row__trailing flex items-center gap-3">
                            <div className="text-right">
                              <p className={clsx('text-base font-semibold', isExpense ? 'text-[var(--app-danger)]' : 'text-[var(--app-success)]')}>
                                {isExpense ? '-' : '+'}
                                {formatMoney(transaction.amount, transaction.currency)}
                              </p>
                              {transaction.ai_confidence ? (
                                <p className="mt-1 text-xs text-[var(--app-muted)]">AI {Math.round(transaction.ai_confidence * 100)}%</p>
                              ) : null}
                            </div>
                            <div className="flex gap-2">
                              <IconCircleButton className="icon-circle-button--small" onClick={() => openSheet('edit', { transactionId: transaction.id })}>
                                <PencilIcon size={15} />
                              </IconCircleButton>
                              <IconCircleButton className="icon-circle-button--small" onClick={() => void handleDelete(transaction.id)}>
                                <TrashIcon size={15} />
                              </IconCircleButton>
                            </div>
                          </div>
                        </div>
                      </ListCard>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
