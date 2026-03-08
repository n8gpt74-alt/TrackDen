import { useQueryClient } from '@tanstack/react-query';
import { type ReactNode, useEffect, useMemo, useState } from 'react';

import { useSessionQuery } from '../auth/api';
import {
  useConfirmRecurringCandidateMutation,
  useDeleteSubscriptionMutation,
  useDismissRecurringCandidateMutation,
  useSaveSubscriptionMutation,
  useSubscriptionManagerQuery,
  useSubscriptionStatusMutation,
} from './api';
import { type SubscriptionRecord, type SubscriptionStatus } from './model';
import { useFinanceSheet } from '../finance-sheet/useFinanceSheet';
import { formatShortDateLabel } from '../../shared/lib/date';
import { formatCompactMoney, formatMoney } from '../../shared/lib/money';
import { ChevronLeftIcon, TrashIcon } from '../../shared/ui/premium';
import {
  BottomSheetScaffold,
  EmptyStateCard,
  ListCard,
  ListRow,
  PremiumStatTile,
  SectionHeader,
  StatusBadge,
  SurfaceCard,
} from '../../shared/ui/premium-kit';
import { Skeleton } from '../../shared/ui/Skeleton';

type SubscriptionFormState = {
  merchant_label: string;
  expected_amount: string;
  currency: string;
  category_id: string;
  expected_day: string;
};

const DEFAULT_FORM: SubscriptionFormState = {
  merchant_label: '',
  expected_amount: '',
  currency: 'RUB',
  category_id: '',
  expected_day: '',
};

function buildFormState(subscription?: SubscriptionRecord | null): SubscriptionFormState {
  if (!subscription) {
    return DEFAULT_FORM;
  }

  return {
    merchant_label: subscription.merchant_label,
    expected_amount: String(subscription.expected_amount),
    currency: subscription.currency,
    category_id: subscription.category_id ?? '',
    expected_day: String(subscription.expected_day),
  };
}

function getStatusMeta(status: SubscriptionStatus) {
  switch (status) {
    case 'paused':
      return { label: 'На паузе', tone: 'warning' } as const;
    case 'cancelled':
      return { label: 'Отменена', tone: 'danger' } as const;
    default:
      return { label: 'Активна', tone: 'success' } as const;
  }
}

function SectionTitle({ title, hint, action }: { title: string; hint: string; action?: ReactNode }) {
  return <SectionHeader eyebrow={hint} title={title} action={action} />;
}

export function SubscriptionActionSheet() {
  const queryClient = useQueryClient();
  const { closeSheet, isOpen, mode, openSheet, subscriptionId } = useFinanceSheet();
  const sessionQuery = useSessionQuery();
  const managerQuery = useSubscriptionManagerQuery();
  const confirmMutation = useConfirmRecurringCandidateMutation();
  const dismissMutation = useDismissRecurringCandidateMutation();
  const saveMutation = useSaveSubscriptionMutation();
  const statusMutation = useSubscriptionStatusMutation();
  const deleteMutation = useDeleteSubscriptionMutation();
  const [form, setForm] = useState<SubscriptionFormState>(DEFAULT_FORM);

  const isSubscriptionMode = mode === 'subscriptions' || mode === 'subscription-edit';
  const manager = managerQuery.data;
  const selectedSubscription = useMemo(
    () => manager?.all.find((subscription) => subscription.id === subscriptionId) ?? null,
    [manager?.all, subscriptionId],
  );
  const categories = sessionQuery.data?.categories ?? [];

  useEffect(() => {
    if (!isOpen || mode !== 'subscription-edit') {
      return;
    }

    setForm(buildFormState(selectedSubscription));
  }, [isOpen, mode, selectedSubscription]);

  const canSave = form.merchant_label.trim().length > 0 && Number(form.expected_amount) > 0 && Number(form.expected_day) >= 1 && Number(form.expected_day) <= 31;

  const invalidateSubscriptionData = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['subscriptions'] }),
      queryClient.invalidateQueries({ queryKey: ['transactions'] }),
      queryClient.invalidateQueries({ queryKey: ['analytics'] }),
    ]);
  };

  const handleCandidateConfirm = async (candidateId: string) => {
    await confirmMutation.mutateAsync(candidateId);
    await invalidateSubscriptionData();
  };

  const handleCandidateDismiss = async (candidateId: string) => {
    await dismissMutation.mutateAsync(candidateId);
    await invalidateSubscriptionData();
  };

  const handleSave = async () => {
    if (!canSave) {
      return;
    }

    await saveMutation.mutateAsync({
      id: selectedSubscription?.id ?? null,
      merchant_label: form.merchant_label,
      expected_amount: Number(form.expected_amount),
      currency: form.currency,
      category_id: form.category_id || null,
      expected_day: Number(form.expected_day),
      status: selectedSubscription?.status,
    });
    await invalidateSubscriptionData();
    openSheet('subscriptions');
  };

  const handleStatusChange = async (status: SubscriptionStatus) => {
    if (!selectedSubscription) {
      return;
    }

    await statusMutation.mutateAsync({ id: selectedSubscription.id, status });
    await invalidateSubscriptionData();
    openSheet('subscriptions');
  };

  const handleDelete = async () => {
    if (!selectedSubscription || selectedSubscription.source !== 'manual') {
      return;
    }

    if (!window.confirm('Удалить эту подписку?')) {
      return;
    }

    await deleteMutation.mutateAsync(selectedSubscription.id);
    await invalidateSubscriptionData();
    openSheet('subscriptions');
  };

  if (!isOpen || !mode || !isSubscriptionMode) {
    return null;
  }

  const isLoading = sessionQuery.isLoading || managerQuery.isLoading;
  const selectedMeta = selectedSubscription ? getStatusMeta(selectedSubscription.status) : null;

  if (mode === 'subscription-edit') {
    return (
      <BottomSheetScaffold
        description="Настрой сумму, день списания и статус без отдельного экрана редактирования."
        eyebrow="Подписки"
        footer={(
          <div className="flex gap-3">
            <button className="sheet-secondary-button" onClick={() => openSheet('subscriptions')} type="button">
              Назад
            </button>
            <button className="sheet-primary-button" disabled={!canSave || saveMutation.isPending} onClick={() => void handleSave()} type="button">
              {saveMutation.isPending ? 'Сохраняем…' : selectedSubscription ? 'Сохранить изменения' : 'Создать подписку'}
            </button>
          </div>
        )}
        leading={(
          <button className="pill-button pill-button--ghost" onClick={() => openSheet('subscriptions')} type="button">
            <ChevronLeftIcon size={16} />
            Назад
          </button>
        )}
        onClose={closeSheet}
        title={selectedSubscription ? 'Редактировать подписку' : 'Новая подписка'}
      >
        {isLoading ? (
          <div className="space-y-3">
            <Skeleton className="h-24 w-full rounded-[22px]" />
            <Skeleton className="h-24 w-full rounded-[22px]" />
          </div>
        ) : (
          <>
            {selectedSubscription ? (
              <SurfaceCard>
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-sm text-[var(--app-muted)]">Источник</p>
                    <p className="mt-1 text-sm font-medium text-white">
                      {selectedSubscription.source === 'auto' ? 'Подтверждена из истории расходов' : 'Создана вручную'}
                    </p>
                  </div>
                  {selectedMeta ? <StatusBadge tone={selectedMeta.tone}>{selectedMeta.label}</StatusBadge> : null}
                </div>
              </SurfaceCard>
            ) : null}

            <SurfaceCard>
              <div className="space-y-3">
                <input
                  className="sheet-input"
                  onChange={(event) => setForm((current) => ({ ...current, merchant_label: event.target.value }))}
                  placeholder="Название сервиса или магазина"
                  value={form.merchant_label}
                />
                <div className="grid grid-cols-[minmax(0,1fr)_88px] gap-3">
                  <input
                    className="sheet-input"
                    inputMode="decimal"
                    min="0"
                    onChange={(event) => setForm((current) => ({ ...current, expected_amount: event.target.value }))}
                    placeholder="Сумма в месяц"
                    step="0.01"
                    type="number"
                    value={form.expected_amount}
                  />
                  <input
                    className="sheet-input text-center uppercase"
                    maxLength={3}
                    onChange={(event) => setForm((current) => ({ ...current, currency: event.target.value.toUpperCase() }))}
                    value={form.currency}
                  />
                </div>
                <div className="grid grid-cols-[minmax(0,1fr)_112px] gap-3">
                  <select
                    className="sheet-input"
                    onChange={(event) => setForm((current) => ({ ...current, category_id: event.target.value }))}
                    value={form.category_id}
                  >
                    <option value="">Без категории</option>
                    {categories
                      .filter((category) => category.is_system)
                      .map((category) => (
                        <option key={category.id} value={category.id}>
                          {category.name}
                        </option>
                      ))}
                  </select>
                  <input
                    className="sheet-input text-center"
                    inputMode="numeric"
                    max="31"
                    min="1"
                    onChange={(event) => setForm((current) => ({ ...current, expected_day: event.target.value }))}
                    placeholder="День"
                    type="number"
                    value={form.expected_day}
                  />
                </div>
              </div>
            </SurfaceCard>

            {selectedSubscription ? (
              <section className="space-y-3">
                <SectionTitle hint="Управление" title="Статус подписки" />
                <div className="flex flex-wrap gap-3">
                  {selectedSubscription.status === 'active' ? (
                    <button className="pill-button" onClick={() => void handleStatusChange('paused')} type="button">
                      Поставить на паузу
                    </button>
                  ) : (
                    <button className="pill-button pill-button--success" onClick={() => void handleStatusChange('active')} type="button">
                      Возобновить
                    </button>
                  )}
                  {selectedSubscription.status !== 'cancelled' ? (
                    <button className="pill-button pill-button--danger" onClick={() => void handleStatusChange('cancelled')} type="button">
                      Отменить
                    </button>
                  ) : (
                    <button className="pill-button pill-button--ghost" onClick={() => void handleStatusChange('active')} type="button">
                      Вернуть в активные
                    </button>
                  )}
                  {selectedSubscription.source === 'manual' ? (
                    <button className="pill-button pill-button--danger" onClick={() => void handleDelete()} type="button">
                      <TrashIcon size={16} />
                      Удалить запись
                    </button>
                  ) : null}
                </div>
              </section>
            ) : null}
          </>
        )}
      </BottomSheetScaffold>
    );
  }

  return (
    <BottomSheetScaffold
      description="Повторяющиеся траты, подтверждённые подписки и архив собраны в одной аккуратной шторке."
      eyebrow="Подписки"
      footer={(
        <div className="flex gap-3">
          <button className="sheet-primary-button" onClick={() => openSheet('subscription-edit')} type="button">
            Создать вручную
          </button>
          <button className="sheet-secondary-button" onClick={closeSheet} type="button">
            Закрыть
          </button>
        </div>
      )}
      onClose={closeSheet}
      title="Фиксированные списания"
    >
      {isLoading ? (
        <div className="space-y-3">
          <Skeleton className="h-24 w-full rounded-[22px]" />
          <Skeleton className="h-24 w-full rounded-[22px]" />
          <Skeleton className="h-24 w-full rounded-[22px]" />
        </div>
      ) : (
        <>
          <div className="stat-grid">
            <PremiumStatTile hint="По активным подпискам" label="В месяц" tone="accent" value={formatCompactMoney(manager?.monthly_total ?? 0)} />
            <PremiumStatTile hint="Уже подтверждены" label="Активных" tone="success" value={manager?.active_count ?? 0} />
            <PremiumStatTile hint="Можно разобрать сейчас" label="Кандидаты" tone="warning" value={manager?.candidate_count ?? 0} />
            <PremiumStatTile hint="Временно скрыты" label="На паузе" tone="neutral" value={manager?.paused_count ?? 0} />
          </div>

          {manager?.candidates.length ? (
            <section className="space-y-3">
              <SectionTitle hint="Из истории" title="Подтвердить кандидатов" />
              {manager.candidates.map((candidate) => (
                <SurfaceCard key={candidate.id}>
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-base font-medium text-white">{candidate.merchant_label}</p>
                      <p className="mt-1 text-sm text-[var(--app-muted)]">
                        {candidate.match_count} совпадения · уверенность {Math.round(candidate.confidence * 100)}%
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
                  </div>
                </SurfaceCard>
              ))}
            </section>
          ) : null}

          <section className="space-y-3">
            <SectionTitle hint="Активные" title="Текущие подписки" />
            {manager?.active.length ? (
              manager.active.map((subscription) => {
                const meta = getStatusMeta(subscription.status);
                return (
                  <ListCard key={subscription.id}>
                    <ListRow
                      leading={<div className="transaction-avatar" style={{ background: 'rgba(111,107,255,0.18)', color: '#cbc9ff' }}>{subscription.merchant_label.slice(0, 1).toUpperCase()}</div>}
                      onClick={() => openSheet('subscription-edit', { subscriptionId: subscription.id })}
                      subtitle={subscription.next_charge_at ? `Следующее списание ${formatShortDateLabel(subscription.next_charge_at)}` : 'Дата уточняется'}
                      title={subscription.merchant_label}
                      trailing={(
                        <div className="text-right">
                          <p className="text-base font-semibold text-white">{formatMoney(subscription.expected_amount, subscription.currency)}</p>
                          <div className="mt-2"><StatusBadge tone={meta.tone}>{meta.label}</StatusBadge></div>
                        </div>
                      )}
                    />
                  </ListCard>
                );
              })
            ) : (
              <EmptyStateCard title="Активных подписок пока нет" description="Подтверди кандидата из истории или создай запись вручную — она сразу попадёт в прогноз месяца." />
            )}
          </section>

          {manager?.paused.length ? (
            <section className="space-y-3">
              <SectionTitle hint="На паузе" title="Временно выключенные" />
              {manager.paused.map((subscription) => (
                <ListCard key={subscription.id}>
                  <ListRow
                    leading={<div className="transaction-avatar" style={{ background: 'rgba(245,158,11,0.14)', color: '#ffd48b' }}>{subscription.merchant_label.slice(0, 1).toUpperCase()}</div>}
                    onClick={() => openSheet('subscription-edit', { subscriptionId: subscription.id })}
                    subtitle="Вернётся в прогноз после возобновления."
                    title={subscription.merchant_label}
                    trailing={<StatusBadge tone="warning">На паузе</StatusBadge>}
                  />
                </ListCard>
              ))}
            </section>
          ) : null}

          {manager?.cancelled.length ? (
            <section className="space-y-3">
              <SectionTitle hint="Архив" title="Отменённые подписки" />
              {manager.cancelled.map((subscription) => (
                <ListCard key={subscription.id}>
                  <ListRow
                    leading={<div className="transaction-avatar" style={{ background: 'rgba(255,125,125,0.14)', color: '#ffc1c1' }}>{subscription.merchant_label.slice(0, 1).toUpperCase()}</div>}
                    onClick={() => openSheet('subscription-edit', { subscriptionId: subscription.id })}
                    subtitle="История сохранена, автоматический матчинг отключён."
                    title={subscription.merchant_label}
                    trailing={<StatusBadge tone="danger">Отменена</StatusBadge>}
                  />
                </ListCard>
              ))}
            </section>
          ) : null}
        </>
      )}
    </BottomSheetScaffold>
  );
}
