import clsx from 'clsx';
import { useMemo, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';

import { useFinanceSheet } from '../features/finance-sheet/useFinanceSheet';
import { useAutomationOverviewQuery } from '../features/intelligence/api';
import {
  useConfirmRecurringCandidateMutation,
  useDismissRecurringCandidateMutation,
  useSubscriptionManagerQuery,
} from '../features/subscriptions/api';
import { type TransactionType, useDeleteTransactionMutation, useTransactionsQuery } from '../features/transactions/api';
import { isLocalDataMode } from '../shared/api/mode';
import { currentMonthKey, formatDateGroupLabel } from '../shared/lib/date';
import { groupTransactionsByDate } from '../shared/lib/finance';
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
  const automationQuery = useAutomationOverviewQuery();
  const subscriptionManagerQuery = useSubscriptionManagerQuery();
  const deleteMutation = useDeleteTransactionMutation();
  const confirmCandidateMutation = useConfirmRecurringCandidateMutation();
  const dismissCandidateMutation = useDismissRecurringCandidateMutation();
  const { openSheet } = useFinanceSheet();

  const transactions = transactionsQuery.data?.items ?? [];
  const groupedTransactions = useMemo(() => groupTransactionsByDate(transactions), [transactions]);
  const templates = localMode && automationQuery.data ? [...automationQuery.data.quick_templates, ...automationQuery.data.suggested_templates].slice(0, 3) : [];
  const candidates = localMode && segment === 'expense' ? (subscriptionManagerQuery.data?.candidates ?? []).slice(0, 2) : [];

  const invalidateFinanceData = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['transactions'] }),
      queryClient.invalidateQueries({ queryKey: ['analytics'] }),
      queryClient.invalidateQueries({ queryKey: ['budgets'] }),
      queryClient.invalidateQueries({ queryKey: ['subscriptions'] }),
      queryClient.invalidateQueries({ queryKey: ['intelligence'] }),
    ]);
  };

  const handleDelete = async (id: string) => {
    if (!window.confirm('Delete this transaction?')) {
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
        eyebrow="Activity"
        title="Operations feed"
        description="Templates, subscription suggestions, and your latest activity stay together on one screen."
        actions={
          localMode ? (
            <div className="flex gap-2">
              <button className="pill-button pill-button--ghost" onClick={() => openSheet('automation')} type="button">
                Automation
              </button>
              <button className="pill-button pill-button--ghost" onClick={() => openSheet('subscriptions')} type="button">
                Add
              </button>
            </div>
          ) : undefined
        }
      />

      <SegmentedControl
        onChange={setSegment}
        options={[
          { label: 'Income', value: 'income' },
          { label: 'Expenses', value: 'expense' },
        ]}
        value={segment}
      />

      <section className="space-y-4">
        <SectionHeader
          eyebrow="Templates"
          title="Quick transactions"
          description="Saved and suggested templates make repeat entries much faster."
          action={localMode ? <button className="pill-button pill-button--ghost" onClick={() => openSheet('automation')} type="button">Open</button> : undefined}
        />

        {transactionsQuery.isLoading || automationQuery.isLoading ? (
          <div className="grid grid-cols-3 gap-3">
            {Array.from({ length: 3 }).map((_, index) => <Skeleton key={index} className="h-28 w-full rounded-[22px]" />)}
          </div>
        ) : templates.length === 0 ? (
          <EmptyStateCard title="No templates yet" description="Create a few similar records or save your own template and quick actions will appear here automatically." />
        ) : (
          <div className="grid grid-cols-3 gap-3">
            {templates.map((item) => (
              <SurfaceCard key={item.id} className="p-3" tone="soft">
                <button className="w-full text-left" onClick={() => openSheet('add', { templateId: item.id })} type="button">
                  <div className="transaction-avatar h-11 w-11 rounded-[16px] text-sm" style={{ background: 'rgba(111,107,255,0.16)', color: '#cbc9ff' }}>
                    {item.label.slice(0, 1).toUpperCase()}
                  </div>
                  <p className="mt-3 truncate text-sm font-medium text-white">{item.label}</p>
                  <p className="mt-1 truncate text-xs text-[var(--app-muted)]">{item.merchant || item.description || (item.source === 'manual' ? 'No description' : 'TrackDen suggestion')}</p>
                  <p className="mt-2 text-sm font-semibold text-white">{item.amount ? formatCompactMoney(item.amount) : 'No amount'}</p>
                </button>
              </SurfaceCard>
            ))}
          </div>
        )}
      </section>

      {localMode && segment === 'expense' ? (
        <section className="space-y-4">
          <SectionHeader
            eyebrow="Subscriptions"
            title="Suggested subscriptions"
            description="TrackDen spotted repeating monthly spending patterns and suggests turning them into subscriptions."
            action={<StatusBadge tone="accent">{subscriptionManagerQuery.data?.candidate_count ?? 0} candidates</StatusBadge>}
          />

          {subscriptionManagerQuery.isLoading ? (
            <div className="space-y-3">
              <Skeleton className="h-28 w-full rounded-[24px]" />
              <Skeleton className="h-28 w-full rounded-[24px]" />
            </div>
          ) : candidates.length === 0 ? (
            <EmptyStateCard title="Nothing flagged yet" description="Once repeating monthly expenses appear in history, candidates for subscriptions will show up here." />
          ) : (
            <div className="space-y-3">
              {candidates.map((candidate) => (
                <SurfaceCard key={candidate.id}>
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-base font-medium text-white">{candidate.merchant_label}</p>
                      <p className="mt-1 text-sm text-[var(--app-muted)]">
                        {candidate.match_count} matches ? {Math.round(candidate.confidence * 100)}% confidence
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="text-base font-semibold text-white">{formatMoney(candidate.expected_amount, candidate.currency)}</p>
                      <p className="mt-1 text-sm text-[var(--app-muted)]">{candidate.expected_day} day of month</p>
                    </div>
                  </div>
                  <div className="mt-4 flex flex-wrap gap-3">
                    <button className="pill-button pill-button--primary" onClick={() => void handleCandidateConfirm(candidate.id)} type="button">
                      Confirm
                    </button>
                    <button className="pill-button" onClick={() => void handleCandidateDismiss(candidate.id)} type="button">
                      Not a subscription
                    </button>
                    <button className="pill-button" onClick={() => openSheet('subscriptions')} type="button">
                      Later
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
          eyebrow="History"
          title="All transactions"
          description="A grouped feed by day and category makes it easy to return to any entry."
          action={<button className="pill-button pill-button--primary" onClick={() => openSheet('add')} type="button">Add</button>}
        />

        {transactionsQuery.isLoading ? (
          <div className="space-y-3">
            <Skeleton className="h-24 w-full rounded-[24px]" />
            <Skeleton className="h-24 w-full rounded-[24px]" />
            <Skeleton className="h-24 w-full rounded-[24px]" />
          </div>
        ) : groupedTransactions.length === 0 ? (
          <EmptyStateCard title="No transactions this month yet" description="Add your first record and the activity feed will start building itself by day and category." />
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
                            <p className="list-row__title">{transaction.merchant || transaction.description || 'No description'}</p>
                            <p className="list-row__subtitle">{transaction.category?.name ?? 'Uncategorized'}</p>
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
