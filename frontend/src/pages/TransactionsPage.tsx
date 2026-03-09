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
import { UI_TEXT } from '../shared/i18n/ui';
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
    if (!window.confirm('\u0423\u0434\u0430\u043b\u0438\u0442\u044c \u044d\u0442\u0443 \u043e\u043f\u0435\u0440\u0430\u0446\u0438\u044e?')) {
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
        eyebrow="\u041b\u0435\u043d\u0442\u0430"
        title="\u041e\u043f\u0435\u0440\u0430\u0446\u0438\u043e\u043d\u043d\u044b\u0439 \u0434\u0435\u043d\u044c"
        description="\u0428\u0430\u0431\u043b\u043e\u043d\u044b, \u043f\u043e\u0434\u0441\u043a\u0430\u0437\u043a\u0438 \u043f\u043e \u043f\u043e\u0434\u043f\u0438\u0441\u043a\u0430\u043c \u0438 \u043f\u043e\u0441\u043b\u0435\u0434\u043d\u044f\u044f \u0430\u043a\u0442\u0438\u0432\u043d\u043e\u0441\u0442\u044c \u0441\u043e\u0431\u0440\u0430\u043d\u044b \u043d\u0430 \u043e\u0434\u043d\u043e\u043c \u044d\u043a\u0440\u0430\u043d\u0435."
        actions={
          localMode ? (
            <div className="flex gap-2">
              <button className="pill-button pill-button--ghost" onClick={() => openSheet('automation')} type="button">
                \u0410\u0432\u0442\u043e\u043c\u0430\u0442\u0438\u0437\u0430\u0446\u0438\u044f
              </button>
              <button className="pill-button pill-button--ghost" onClick={() => openSheet('subscriptions')} type="button">
                \u041e\u0442\u043a\u0440\u044b\u0442\u044c
              </button>
            </div>
          ) : undefined
        }
      />

      <SegmentedControl
        onChange={setSegment}
        options={[
          { label: UI_TEXT.common.income, value: 'income' },
          { label: '\u0420\u0430\u0441\u0445\u043e\u0434\u044b', value: 'expense' },
        ]}
        value={segment}
      />

      <section className="space-y-4">
        <SectionHeader
          eyebrow={UI_TEXT.common.templates}
          title="\u0411\u044b\u0441\u0442\u0440\u044b\u0435 \u043e\u043f\u0435\u0440\u0430\u0446\u0438\u0438"
          description="\u0421\u043e\u0445\u0440\u0430\u043d\u0451\u043d\u043d\u044b\u0435 \u0438 \u043f\u043e\u0434\u0441\u043a\u0430\u0437\u0430\u043d\u043d\u044b\u0435 \u0448\u0430\u0431\u043b\u043e\u043d\u044b \u0441\u0438\u043b\u044c\u043d\u043e \u0443\u0441\u043a\u043e\u0440\u044f\u044e\u0442 \u043f\u043e\u0432\u0442\u043e\u0440\u043d\u044b\u0435 \u0437\u0430\u043f\u0438\u0441\u0438."
          action={localMode ? <button className="pill-button pill-button--ghost" onClick={() => openSheet('automation')} type="button">{UI_TEXT.common.open}</button> : undefined}
        />

        {transactionsQuery.isLoading || automationQuery.isLoading ? (
          <div className="grid grid-cols-3 gap-3">
            {Array.from({ length: 3 }).map((_, index) => <Skeleton key={index} className="h-28 w-full rounded-[22px]" />)}
          </div>
        ) : templates.length === 0 ? (
          <EmptyStateCard title="\u0428\u0430\u0431\u043b\u043e\u043d\u043e\u0432 \u043f\u043e\u043a\u0430 \u043d\u0435\u0442" description="\u0421\u0434\u0435\u043b\u0430\u0439 \u043d\u0435\u0441\u043a\u043e\u043b\u044c\u043a\u043e \u043f\u043e\u0445\u043e\u0436\u0438\u0445 \u0437\u0430\u043f\u0438\u0441\u0435\u0439 \u0438\u043b\u0438 \u0441\u043e\u0445\u0440\u0430\u043d\u0438 \u0441\u0432\u043e\u0439 \u0448\u0430\u0431\u043b\u043e\u043d, \u0438 \u0431\u044b\u0441\u0442\u0440\u044b\u0435 \u0434\u0435\u0439\u0441\u0442\u0432\u0438\u044f \u043f\u043e\u044f\u0432\u044f\u0442\u0441\u044f \u0437\u0434\u0435\u0441\u044c \u0430\u0432\u0442\u043e\u043c\u0430\u0442\u0438\u0447\u0435\u0441\u043a\u0438." />
        ) : (
          <div className="grid grid-cols-3 gap-3">
            {templates.map((item) => (
              <SurfaceCard key={item.id} className="p-3" tone="soft">
                <button className="w-full text-left" onClick={() => openSheet('add', { templateId: item.id })} type="button">
                  <div className="transaction-avatar h-11 w-11 rounded-[16px] text-sm" style={{ background: 'rgba(111,107,255,0.16)', color: '#cbc9ff' }}>
                    {item.label.slice(0, 1).toUpperCase()}
                  </div>
                  <p className="mt-3 truncate text-sm font-medium text-white">{item.label}</p>
                  <p className="mt-1 truncate text-xs text-[var(--app-muted)]">{item.merchant || item.description || (item.source === 'manual' ? UI_TEXT.common.noDescription : '\u041f\u043e\u0434\u0441\u043a\u0430\u0437\u043a\u0430 TrackDen')}</p>
                  <p className="mt-2 text-sm font-semibold text-white">{item.amount ? formatCompactMoney(item.amount) : UI_TEXT.common.noAmount}</p>
                </button>
              </SurfaceCard>
            ))}
          </div>
        )}
      </section>

      {localMode && segment === 'expense' ? (
        <section className="space-y-4">
          <SectionHeader
            eyebrow={UI_TEXT.common.subscriptions}
            title="\u041a\u0430\u043d\u0434\u0438\u0434\u0430\u0442\u044b \u0432 \u043f\u043e\u0434\u043f\u0438\u0441\u043a\u0438"
            description="TrackDen \u0437\u0430\u043c\u0435\u0442\u0438\u043b \u043f\u043e\u0432\u0442\u043e\u0440\u044f\u044e\u0449\u0438\u0435\u0441\u044f \u0435\u0436\u0435\u043c\u0435\u0441\u044f\u0447\u043d\u044b\u0435 \u0442\u0440\u0430\u0442\u044b \u0438 \u043f\u0440\u0435\u0434\u043b\u0430\u0433\u0430\u0435\u0442 \u043f\u0440\u0435\u0432\u0440\u0430\u0442\u0438\u0442\u044c \u0438\u0445 \u0432 \u043f\u043e\u0434\u043f\u0438\u0441\u043a\u0438."
            action={<StatusBadge tone="accent">{subscriptionManagerQuery.data?.candidate_count ?? 0} \u043a\u0430\u043d\u0434\u0438\u0434\u0430\u0442\u043e\u0432</StatusBadge>}
          />

          {subscriptionManagerQuery.isLoading ? (
            <div className="space-y-3">
              <Skeleton className="h-28 w-full rounded-[24px]" />
              <Skeleton className="h-28 w-full rounded-[24px]" />
            </div>
          ) : candidates.length === 0 ? (
            <EmptyStateCard title="\u041f\u043e\u043a\u0430 \u043d\u0438\u0447\u0435\u0433\u043e \u043d\u0435 \u043d\u0430\u0439\u0434\u0435\u043d\u043e" description="\u041a\u0430\u043a \u0442\u043e\u043b\u044c\u043a\u043e \u0432 \u0438\u0441\u0442\u043e\u0440\u0438\u0438 \u043f\u043e\u044f\u0432\u044f\u0442\u0441\u044f \u043f\u043e\u0445\u043e\u0436\u0438\u0435 \u0435\u0436\u0435\u043c\u0435\u0441\u044f\u0447\u043d\u044b\u0435 \u0440\u0430\u0441\u0445\u043e\u0434\u044b, \u0437\u0434\u0435\u0441\u044c \u043f\u043e\u044f\u0432\u044f\u0442\u0441\u044f \u043a\u0430\u043d\u0434\u0438\u0434\u0430\u0442\u044b \u043d\u0430 \u043f\u043e\u0434\u043f\u0438\u0441\u043a\u0438." />
          ) : (
            <div className="space-y-3">
              {candidates.map((candidate) => (
                <SurfaceCard key={candidate.id}>
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-base font-medium text-white">{candidate.merchant_label}</p>
                      <p className="mt-1 text-sm text-[var(--app-muted)]">
                        {candidate.match_count} \u0441\u043e\u0432\u043f\u0430\u0434\u0435\u043d\u0438\u044f \u00b7 {Math.round(candidate.confidence * 100)}% \u0443\u0432\u0435\u0440\u0435\u043d\u043d\u043e\u0441\u0442\u0438
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="text-base font-semibold text-white">{formatMoney(candidate.expected_amount, candidate.currency)}</p>
                      <p className="mt-1 text-sm text-[var(--app-muted)]">{candidate.expected_day} \u0447\u0438\u0441\u043b\u0430</p>
                    </div>
                  </div>
                  <div className="mt-4 flex flex-wrap gap-3">
                    <button className="pill-button pill-button--primary" onClick={() => void handleCandidateConfirm(candidate.id)} type="button">
                      \u041f\u043e\u0434\u0442\u0432\u0435\u0440\u0434\u0438\u0442\u044c
                    </button>
                    <button className="pill-button" onClick={() => void handleCandidateDismiss(candidate.id)} type="button">
                      \u041d\u0435 \u043f\u043e\u0434\u043f\u0438\u0441\u043a\u0430
                    </button>
                    <button className="pill-button" onClick={() => openSheet('subscriptions')} type="button">
                      \u041f\u043e\u0437\u0436\u0435
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
          eyebrow={UI_TEXT.common.history}
          title="\u0412\u0441\u0435 \u043e\u043f\u0435\u0440\u0430\u0446\u0438\u0438"
          description="\u0421\u0433\u0440\u0443\u043f\u043f\u0438\u0440\u043e\u0432\u0430\u043d\u043d\u0430\u044f \u043f\u043e \u0434\u043d\u044f\u043c \u0438 \u043a\u0430\u0442\u0435\u0433\u043e\u0440\u0438\u044f\u043c \u043b\u0435\u043d\u0442\u0430 \u043f\u043e\u043c\u043e\u0433\u0430\u0435\u0442 \u043b\u0435\u0433\u043a\u043e \u0432\u0435\u0440\u043d\u0443\u0442\u044c\u0441\u044f \u043a \u043b\u044e\u0431\u043e\u0439 \u0437\u0430\u043f\u0438\u0441\u0438."
          action={<button className="pill-button pill-button--primary" onClick={() => openSheet('add')} type="button">{UI_TEXT.common.add}</button>}
        />

        {transactionsQuery.isLoading ? (
          <div className="space-y-3">
            <Skeleton className="h-24 w-full rounded-[24px]" />
            <Skeleton className="h-24 w-full rounded-[24px]" />
            <Skeleton className="h-24 w-full rounded-[24px]" />
          </div>
        ) : groupedTransactions.length === 0 ? (
          <EmptyStateCard title="\u0412 \u044d\u0442\u043e\u043c \u043c\u0435\u0441\u044f\u0446\u0435 \u0435\u0449\u0451 \u043d\u0435\u0442 \u043e\u043f\u0435\u0440\u0430\u0446\u0438\u0439" description="\u0414\u043e\u0431\u0430\u0432\u044c \u043f\u0435\u0440\u0432\u0443\u044e \u0437\u0430\u043f\u0438\u0441\u044c, \u0438 \u043b\u0435\u043d\u0442\u0430 \u043d\u0430\u0447\u043d\u0451\u0442 \u0441\u0442\u0440\u043e\u0438\u0442\u044c\u0441\u044f \u043f\u043e \u0434\u043d\u044f\u043c \u0438 \u043a\u0430\u0442\u0435\u0433\u043e\u0440\u0438\u044f\u043c." />
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
                            <p className="list-row__title">{transaction.merchant || transaction.description || UI_TEXT.common.noDescription}</p>
                            <p className="list-row__subtitle">{transaction.category?.name ?? UI_TEXT.common.uncategorized}</p>
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
