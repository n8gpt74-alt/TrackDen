import clsx from 'clsx';
import { useMemo, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';

import { useFinanceSheet } from '../features/finance-sheet/useFinanceSheet';
import { type TransactionType, useDeleteTransactionMutation, useTransactionsQuery } from '../features/transactions/api';
import { currentMonthKey, formatDateGroupLabel } from '../shared/lib/date';
import { buildRecurringPreview, groupTransactionsByDate } from '../shared/lib/finance';
import { formatCompactMoney, formatMoney } from '../shared/lib/money';
import { ActivityIcon, ChevronLeftIcon, DotsIcon, PencilIcon, SegmentedControl, TrashIcon } from '../shared/ui/premium';
import { Skeleton } from '../shared/ui/Skeleton';

export function TransactionsPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const month = currentMonthKey();
  const [segment, setSegment] = useState<TransactionType>('expense');
  const transactionsQuery = useTransactionsQuery(month, 80, segment);
  const deleteMutation = useDeleteTransactionMutation();
  const { openSheet } = useFinanceSheet();

  const transactions = transactionsQuery.data?.items ?? [];
  const groupedTransactions = useMemo(() => groupTransactionsByDate(transactions), [transactions]);
  const recurring = useMemo(() => buildRecurringPreview(transactions, 3), [transactions]);

  const handleDelete = async (id: string) => {
    if (!window.confirm('Удалить эту операцию?')) {
      return;
    }

    await deleteMutation.mutateAsync(id);
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['transactions'] }),
      queryClient.invalidateQueries({ queryKey: ['analytics'] }),
      queryClient.invalidateQueries({ queryKey: ['budgets'] }),
    ]);
  };

  return (
    <div className="space-y-5">
      <header className="page-topbar">
        <button className="icon-circle-button" onClick={() => navigate('/dashboard')} type="button">
          <ChevronLeftIcon size={18} />
        </button>
        <button className="icon-circle-button" type="button">
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

      <section>
        <div className="mb-4 flex items-end justify-between">
          <div>
            <p className="soft-kicker">Pinned shortcuts</p>
            <h2 className="mt-1 text-[22px] font-semibold text-white">Частые операции</h2>
          </div>
          <button className="rounded-full border border-[var(--app-stroke)] bg-white/[0.03] px-3 py-2 text-xs font-medium uppercase tracking-[0.18em] text-[var(--app-muted)]" type="button">
            Month
          </button>
        </div>

        {transactionsQuery.isLoading ? (
          <div className="grid grid-cols-3 gap-3">
            {Array.from({ length: 3 }).map((_, index) => <Skeleton key={index} className="h-24 w-full rounded-[22px]" />)}
          </div>
        ) : recurring.length === 0 ? (
          <div className="empty-card">Когда появятся операции этого типа, сюда вынесем самые частые сценарии.</div>
        ) : (
          <div className="grid grid-cols-3 gap-3">
            {recurring.map((item) => (
              <button key={item.title} className="premium-card rounded-[22px] p-3 text-left" onClick={() => openSheet('add')} type="button">
                <div className="transaction-avatar h-11 w-11 rounded-[16px] text-sm" style={{ background: `${item.color}22`, color: item.color }}>
                  {item.title.slice(0, 1).toUpperCase()}
                </div>
                <p className="mt-3 truncate text-sm font-medium text-white">{item.title}</p>
                <p className="mt-1 truncate text-xs text-[var(--app-muted)]">{item.subtitle}</p>
                <p className="mt-2 text-sm font-semibold text-white">{formatCompactMoney(item.amount)}</p>
              </button>
            ))}
          </div>
        )}
      </section>

      <section>
        <div className="mb-4 flex items-end justify-between">
          <div>
            <p className="soft-kicker">Activity</p>
            <h2 className="mt-1 text-[22px] font-semibold text-white">Все транзакции</h2>
          </div>
          <button className="rounded-full border border-[var(--app-stroke)] bg-white/[0.03] px-3 py-2 text-xs font-medium uppercase tracking-[0.18em] text-[var(--app-muted)]" onClick={() => openSheet('add')} type="button">
            Add
          </button>
        </div>

        {transactionsQuery.isLoading ? (
          <div className="space-y-3">
            <Skeleton className="h-24 w-full rounded-[24px]" />
            <Skeleton className="h-24 w-full rounded-[24px]" />
            <Skeleton className="h-24 w-full rounded-[24px]" />
          </div>
        ) : groupedTransactions.length === 0 ? (
          <div className="empty-card">Транзакций за этот месяц пока нет.</div>
        ) : (
          <div className="space-y-5">
            {groupedTransactions.map((group) => (
              <div key={group.label} className="space-y-3">
                <div className="flex items-center justify-between px-1">
                  <p className="text-sm font-medium text-[var(--app-muted)]">{formatDateGroupLabel(group.label)}</p>
                </div>
                {group.items.map((transaction) => {
                  const isExpense = transaction.type === 'expense';
                  return (
                    <div key={transaction.id} className="transaction-row">
                      <div className="flex items-center gap-3">
                        <div
                          className="transaction-avatar"
                          style={{
                            background: `${transaction.category?.color ?? (isExpense ? '#ff7d7d' : '#2fd39a')}22`,
                            color: transaction.category?.color ?? (isExpense ? '#ff7d7d' : '#2fd39a'),
                          }}
                        >
                          <ActivityIcon size={18} />
                        </div>
                        <div>
                          <p className="font-medium text-white">{transaction.merchant || transaction.description || 'Без названия'}</p>
                          <p className="mt-1 text-sm text-[var(--app-muted)]">{transaction.category?.name ?? 'Автокатегория'}</p>
                        </div>
                      </div>

                      <div className="flex items-center gap-3">
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
                          <button className="icon-circle-button" onClick={() => openSheet('edit', { transactionId: transaction.id })} type="button">
                            <PencilIcon size={16} />
                          </button>
                          <button className="icon-circle-button" onClick={() => void handleDelete(transaction.id)} type="button">
                            <TrashIcon size={16} />
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

