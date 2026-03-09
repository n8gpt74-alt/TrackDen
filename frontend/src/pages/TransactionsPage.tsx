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
  PremiumStatTile,
  ScreenHeader,
  SectionHeader,
  StatusBadge,
  SurfaceCard,
} from '../shared/ui/premium-kit';
import { ActivityIcon, IconCircleButton, PencilIcon, SegmentedControl, TrashIcon } from '../shared/ui/premium';
import { Skeleton } from '../shared/ui/Skeleton';

function getSegmentSummaryLabel(segment: TransactionType) {
  return segment === 'expense' ? '????????? ???????? ??????' : '???????? ???????? ??????';
}

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
  const templates = localMode && automationQuery.data ? [...automationQuery.data.quick_templates, ...automationQuery.data.suggested_templates].slice(0, 4) : [];
  const candidates = localMode && segment === 'expense' ? (subscriptionManagerQuery.data?.candidates ?? []).slice(0, 3) : [];

  const totalVolume = useMemo(() => transactions.reduce((sum, item) => sum + item.amount, 0), [transactions]);

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
    if (!window.confirm('??????? ??? ?????????')) {
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
    <div className="space-y-7">
      <ScreenHeader
        eyebrow="???????"
        title="???????????? ????"
        description="???????, ????????? ? ?????? ????? ?????? ??????? ? ????? ????????? ??????."
        actions={
          localMode ? (
            <div className="flex gap-2">
              <button className="pill-button pill-button--ghost" onClick={() => openSheet('automation')} type="button">
                ?????????????
              </button>
              <button className="pill-button pill-button--ghost" onClick={() => openSheet('subscriptions')} type="button">
                ????????
              </button>
            </div>
          ) : undefined
        }
      />

      <SegmentedControl
        onChange={setSegment}
        options={[
          { label: UI_TEXT.common.income, value: 'income' },
          { label: '???????', value: 'expense' },
        ]}
        value={segment}
      />

      <SurfaceCard className="activity-hero-card" tone="soft">
        <div className="activity-hero-card__top">
          <div>
            <p className="soft-kicker">????? ?????</p>
            <h2 className="home-focus-card__title">{segment === 'expense' ? '??????? ??? ?????????' : '?????? ??????'}</h2>
            <p className="mt-2 text-sm text-[var(--app-muted)]">{getSegmentSummaryLabel(segment)}</p>
          </div>
          <StatusBadge tone={segment === 'expense' ? 'danger' : 'success'}>{transactions.length} ???????</StatusBadge>
        </div>

        <div className="activity-hero-grid">
          <PremiumStatTile
            hint="????? ?? ???????? ???????"
            label="????? ??????"
            tone={segment === 'expense' ? 'danger' : 'success'}
            value={formatMoney(totalVolume)}
          />
          <PremiumStatTile
            hint="??????? ????? ?? ????? ?????? ? ?????"
            label="???? ? ?????"
            tone="neutral"
            value={String(groupedTransactions.length)}
          />
        </div>
      </SurfaceCard>

      <section className="space-y-4">
        <SectionHeader
          eyebrow={UI_TEXT.common.templates}
          title="??????? ????????"
          description="????????????? ???????? ?????? ??? ?????, ????? ???????? ?? ??? ?????? ?????."
          action={localMode ? <button className="pill-button pill-button--ghost" onClick={() => openSheet('automation')} type="button">{UI_TEXT.common.open}</button> : undefined}
        />

        {transactionsQuery.isLoading || automationQuery.isLoading ? (
          <div className="activity-template-grid">
            {Array.from({ length: 4 }).map((_, index) => <Skeleton key={index} className="h-32 w-full rounded-[22px]" />)}
          </div>
        ) : templates.length === 0 ? (
          <EmptyStateCard title="???????? ???? ???" description="?????? ????????? ??????? ??????? ??? ??????? ?????? ???????, ? ??????? ???????? ???????? ????? ?????????????." />
        ) : (
          <div className="activity-template-grid">
            {templates.map((item) => (
              <SurfaceCard key={item.id} className="activity-template-card" tone="soft">
                <button className="w-full text-left" onClick={() => openSheet('add', { templateId: item.id })} type="button">
                  <div className="transaction-avatar h-11 w-11 rounded-[16px] text-sm" style={{ background: 'rgba(111,107,255,0.16)', color: '#cbc9ff' }}>
                    {item.label.slice(0, 1).toUpperCase()}
                  </div>
                  <p className="mt-3 truncate text-sm font-medium text-white">{item.label}</p>
                  <p className="mt-1 min-h-[34px] text-xs leading-4 text-[var(--app-muted)]">{item.merchant || item.description || (item.source === 'manual' ? UI_TEXT.common.noDescription : '????????? TrackDen')}</p>
                  <p className="mt-3 text-sm font-semibold text-white">{item.amount ? formatCompactMoney(item.amount) : UI_TEXT.common.noAmount}</p>
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
            title="????????? ? ????????"
            description="???? TrackDen ????? ????????????? ??????????? ??????, ?? ?????????? ??? ????? ??? ???????? ?????????????."
            action={<StatusBadge tone="accent">{subscriptionManagerQuery.data?.candidate_count ?? 0} ??????????</StatusBadge>}
          />

          {subscriptionManagerQuery.isLoading ? (
            <div className="space-y-3">
              <Skeleton className="h-28 w-full rounded-[24px]" />
              <Skeleton className="h-28 w-full rounded-[24px]" />
            </div>
          ) : candidates.length === 0 ? (
            <EmptyStateCard title="???? ?????? ?? ???????" description="??? ?????? ???????? ??????? ??????????? ???????, ????? ???????? ????????? ?? ????????." />
          ) : (
            <div className="space-y-3">
              {candidates.map((candidate) => (
                <SurfaceCard key={candidate.id} className="activity-candidate-card">
                  <div className="activity-candidate-card__top">
                    <div>
                      <p className="text-base font-medium text-white">{candidate.merchant_label}</p>
                      <p className="mt-1 text-sm text-[var(--app-muted)]">{candidate.match_count} ?????????? ? {Math.round(candidate.confidence * 100)}% ???????????</p>
                    </div>
                    <div className="text-right">
                      <p className="text-base font-semibold text-white">{formatMoney(candidate.expected_amount, candidate.currency)}</p>
                      <p className="mt-1 text-sm text-[var(--app-muted)]">{candidate.expected_day} ?????</p>
                    </div>
                  </div>
                  <div className="activity-candidate-actions">
                    <button className="pill-button pill-button--primary" onClick={() => void handleCandidateConfirm(candidate.id)} type="button">
                      ???????????
                    </button>
                    <button className="pill-button" onClick={() => void handleCandidateDismiss(candidate.id)} type="button">
                      ?? ????????
                    </button>
                    <button className="pill-button" onClick={() => openSheet('subscriptions')} type="button">
                      ?????
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
          title="??? ????????"
          description="????? ??????? ?? ????, ????? ?????? ???????? ???????? ??????? ? ??? ????."
          action={<button className="pill-button pill-button--ghost" onClick={() => openSheet('add')} type="button">????????</button>}
        />

        {transactionsQuery.isLoading ? (
          <div className="space-y-3">
            <Skeleton className="h-24 w-full rounded-[24px]" />
            <Skeleton className="h-24 w-full rounded-[24px]" />
            <Skeleton className="h-24 w-full rounded-[24px]" />
          </div>
        ) : groupedTransactions.length === 0 ? (
          <EmptyStateCard title="? ???? ?????? ??? ??? ????????" description="?????? ?????? ??????, ? ????? ?????? ????????? ?? ???? ? ??????????." />
        ) : (
          <div className="space-y-5">
            {groupedTransactions.map((group) => (
              <div key={group.label} className="space-y-3">
                <div className="activity-group-header">
                  <p className="soft-kicker">{formatDateGroupLabel(group.label)}</p>
                  <span className="activity-group-header__count">{group.items.length}</span>
                </div>
                <div className="space-y-3">
                  {group.items.map((transaction) => {
                    const isExpense = transaction.type === 'expense';
                    return (
                      <ListCard key={transaction.id}>
                        <div className="activity-row">
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

                          <div className="activity-row__aside">
                            <div className="text-right">
                              <p className={clsx('text-base font-semibold', isExpense ? 'text-[var(--app-danger)]' : 'text-[var(--app-success)]')}>
                                {isExpense ? '-' : '+'}
                                {formatMoney(transaction.amount, transaction.currency)}
                              </p>
                              <p className="mt-1 text-xs text-[var(--app-muted)]">
                                {transaction.ai_confidence ? `AI ${Math.round(transaction.ai_confidence * 100)}%` : '?????? ??????'}
                              </p>
                            </div>
                            <div className="activity-row__actions">
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
