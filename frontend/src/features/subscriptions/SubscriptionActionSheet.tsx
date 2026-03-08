import clsx from 'clsx';
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
import { ChevronLeftIcon, CloseIcon, SparklesIcon, TrashIcon } from '../../shared/ui/premium';
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

function getStatusLabel(status: SubscriptionStatus) {
  switch (status) {
    case 'paused':
      return 'На паузе';
    case 'cancelled':
      return 'Отменена';
    default:
      return 'Активна';
  }
}

function getStatusClass(status: SubscriptionStatus) {
  switch (status) {
    case 'paused':
      return 'border-amber-400/20 bg-amber-400/10 text-amber-100';
    case 'cancelled':
      return 'border-red-400/20 bg-red-400/10 text-red-100';
    default:
      return 'border-emerald-400/20 bg-emerald-400/10 text-emerald-100';
  }
}

function SectionHeader({ title, hint, action }: { title: string; hint: string; action?: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <div>
        <p className="soft-kicker">{hint}</p>
        <h3 className="mt-1 text-lg font-semibold text-white">{title}</h3>
      </div>
      {action}
    </div>
  );
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

  return (
    <div className="sheet-backdrop" onClick={closeSheet} role="presentation">
      <div className="premium-sheet" onClick={(event) => event.stopPropagation()} role="dialog" aria-modal="true">
        <div className="sheet-handle" />

        {mode === 'subscription-edit' ? (
          <>
            <div className="flex items-start justify-between gap-4">
              <div className="flex items-start gap-3">
                <button className="icon-circle-button" onClick={() => openSheet('subscriptions')} type="button">
                  <ChevronLeftIcon size={18} />
                </button>
                <div>
                  <p className="text-xs uppercase tracking-[0.28em] text-[var(--app-muted)]">Recurring editor</p>
                  <h2 className="mt-2 text-[26px] font-semibold leading-tight text-[var(--app-text)]">
                    {selectedSubscription ? 'Редактировать подписку' : 'Новая подписка'}
                  </h2>
                  <p className="mt-2 max-w-[280px] text-sm leading-6 text-[var(--app-muted)]">
                    Сохрани фиксированное списание, чтобы TrackDen учитывал его в прогнозе месяца.
                  </p>
                </div>
              </div>
              <button className="icon-circle-button" onClick={closeSheet} type="button">
                <CloseIcon size={18} />
              </button>
            </div>

            {isLoading ? (
              <div className="mt-6 space-y-3">
                <Skeleton className="h-24 w-full rounded-[22px]" />
                <Skeleton className="h-24 w-full rounded-[22px]" />
              </div>
            ) : (
              <>
                {selectedSubscription ? (
                  <div className="mt-6 flex items-center justify-between rounded-[22px] border border-[var(--app-stroke)] bg-white/[0.03] px-4 py-3">
                    <div>
                      <p className="text-sm text-[var(--app-muted)]">Источник</p>
                      <p className="mt-1 text-sm font-medium text-white">
                        {selectedSubscription.source === 'auto' ? 'Подтверждена из истории расходов' : 'Создана вручную'}
                      </p>
                    </div>
                    <div className={clsx('rounded-full border px-3 py-2 text-xs font-semibold uppercase tracking-[0.18em]', getStatusClass(selectedSubscription.status))}>
                      {getStatusLabel(selectedSubscription.status)}
                    </div>
                  </div>
                ) : null}

                <div className="mt-6 space-y-3 premium-card p-4">
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
                  <div className="grid grid-cols-[minmax(0,1fr)_110px] gap-3">
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

                {selectedSubscription ? (
                  <div className="mt-5 space-y-3">
                    <SectionHeader hint="Status" title="Управление подпиской" />
                    <div className="grid grid-cols-2 gap-3">
                      {selectedSubscription.status === 'active' ? (
                        <button className="sheet-secondary-button" onClick={() => void handleStatusChange('paused')} type="button">
                          Поставить на паузу
                        </button>
                      ) : (
                        <button className="sheet-secondary-button" onClick={() => void handleStatusChange('active')} type="button">
                          Возобновить
                        </button>
                      )}
                      {selectedSubscription.status !== 'cancelled' ? (
                        <button className="sheet-secondary-button border-[var(--app-danger)]/25 text-[var(--app-danger)]" onClick={() => void handleStatusChange('cancelled')} type="button">
                          Отменить подписку
                        </button>
                      ) : (
                        <button className="sheet-secondary-button" onClick={() => void handleStatusChange('active')} type="button">
                          Вернуть в активные
                        </button>
                      )}
                    </div>
                    {selectedSubscription.source === 'manual' ? (
                      <button className="sheet-secondary-button w-full border-[var(--app-danger)]/25 text-[var(--app-danger)]" onClick={() => void handleDelete()} type="button">
                        <span className="inline-flex items-center gap-2">
                          <TrashIcon size={16} />
                          Удалить запись
                        </span>
                      </button>
                    ) : null}
                  </div>
                ) : null}
              </>
            )}

            <div className="mt-6 flex gap-3">
              <button className="sheet-secondary-button" onClick={() => openSheet('subscriptions')} type="button">
                Назад
              </button>
              <button className="sheet-primary-button" disabled={!canSave || saveMutation.isPending} onClick={() => void handleSave()} type="button">
                {saveMutation.isPending ? 'Сохраняем…' : selectedSubscription ? 'Сохранить изменения' : 'Создать подписку'}
              </button>
            </div>
          </>
        ) : (
          <>
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-xs uppercase tracking-[0.28em] text-[var(--app-muted)]">Recurring control</p>
                <h2 className="mt-2 text-[26px] font-semibold leading-tight text-[var(--app-text)]">Фиксированные списания</h2>
                <p className="mt-2 max-w-[300px] text-sm leading-6 text-[var(--app-muted)]">
                  TrackDen нашёл повторяющиеся траты и держит под рукой активные подписки, чтобы ты видел обязательные расходы заранее.
                </p>
              </div>
              <button className="icon-circle-button" onClick={closeSheet} type="button">
                <CloseIcon size={18} />
              </button>
            </div>

            {isLoading ? (
              <div className="mt-6 space-y-3">
                <Skeleton className="h-24 w-full rounded-[22px]" />
                <Skeleton className="h-24 w-full rounded-[22px]" />
                <Skeleton className="h-24 w-full rounded-[22px]" />
              </div>
            ) : (
              <>
                <div className="mt-6 grid grid-cols-3 gap-3">
                  <div className="metric-tile !p-4">
                    <p className="text-sm text-[var(--app-muted)]">В месяц</p>
                    <p className="mt-2 text-2xl font-semibold text-white">{formatCompactMoney(manager?.monthly_total ?? 0)}</p>
                  </div>
                  <div className="metric-tile !p-4">
                    <p className="text-sm text-[var(--app-muted)]">Активных</p>
                    <p className="mt-2 text-2xl font-semibold text-white">{manager?.active_count ?? 0}</p>
                  </div>
                  <div className="metric-tile !p-4">
                    <p className="text-sm text-[var(--app-muted)]">Кандидаты</p>
                    <p className="mt-2 text-2xl font-semibold text-white">{manager?.candidate_count ?? 0}</p>
                  </div>
                </div>

                <div className="mt-5 flex gap-3">
                  <button className="sheet-primary-button" onClick={() => openSheet('subscription-edit')} type="button">
                    Создать вручную
                  </button>
                  <button className="sheet-secondary-button" onClick={closeSheet} type="button">
                    Закрыть
                  </button>
                </div>

                {manager?.candidates.length ? (
                  <section className="mt-6 space-y-3">
                    <SectionHeader hint="Suggested recurring" title="Подтвердить из истории" />
                    {manager.candidates.map((candidate) => (
                      <div key={candidate.id} className="premium-card rounded-[24px] p-4">
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
                        <div className="mt-4 flex gap-3">
                          <button className="sheet-primary-button" onClick={() => void handleCandidateConfirm(candidate.id)} type="button">
                            Подтвердить
                          </button>
                          <button className="sheet-secondary-button" onClick={() => void handleCandidateDismiss(candidate.id)} type="button">
                            Не подписка
                          </button>
                        </div>
                      </div>
                    ))}
                  </section>
                ) : null}

                <section className="mt-6 space-y-3">
                  <SectionHeader hint="Active recurring" title="Активные подписки" />
                  {manager?.active.length ? (
                    manager.active.map((subscription) => (
                      <button
                        key={subscription.id}
                        className="transaction-row w-full text-left"
                        onClick={() => openSheet('subscription-edit', { subscriptionId: subscription.id })}
                        type="button"
                      >
                        <div>
                          <p className="font-medium text-white">{subscription.merchant_label}</p>
                          <p className="mt-1 text-sm text-[var(--app-muted)]">
                            Следующее списание {subscription.next_charge_at ? formatShortDateLabel(subscription.next_charge_at) : 'неизвестно'}
                          </p>
                        </div>
                        <div className="text-right">
                          <p className="text-base font-semibold text-white">{formatMoney(subscription.expected_amount, subscription.currency)}</p>
                          <p className={clsx('mt-1 text-xs', getStatusClass(subscription.status))}>{getStatusLabel(subscription.status)}</p>
                        </div>
                      </button>
                    ))
                  ) : (
                    <div className="empty-card">Активных подписок пока нет. Можно подтвердить кандидата из истории или создать запись вручную.</div>
                  )}
                </section>

                {manager?.paused.length ? (
                  <section className="mt-6 space-y-3">
                    <SectionHeader hint="Paused recurring" title="На паузе" />
                    {manager.paused.map((subscription) => (
                      <button
                        key={subscription.id}
                        className="transaction-row w-full text-left"
                        onClick={() => openSheet('subscription-edit', { subscriptionId: subscription.id })}
                        type="button"
                      >
                        <div>
                          <p className="font-medium text-white">{subscription.merchant_label}</p>
                          <p className="mt-1 text-sm text-[var(--app-muted)]">Вернётся в прогноз после возобновления.</p>
                        </div>
                        <div className={clsx('rounded-full border px-3 py-2 text-xs font-semibold uppercase tracking-[0.18em]', getStatusClass(subscription.status))}>
                          {getStatusLabel(subscription.status)}
                        </div>
                      </button>
                    ))}
                  </section>
                ) : null}

                {manager?.cancelled.length ? (
                  <section className="mt-6 space-y-3">
                    <SectionHeader hint="Archive" title="Архив подписок" />
                    {manager.cancelled.map((subscription) => (
                      <button
                        key={subscription.id}
                        className="transaction-row w-full text-left"
                        onClick={() => openSheet('subscription-edit', { subscriptionId: subscription.id })}
                        type="button"
                      >
                        <div>
                          <p className="font-medium text-white">{subscription.merchant_label}</p>
                          <p className="mt-1 text-sm text-[var(--app-muted)]">История сохранена, автоматический матчинг выключен.</p>
                        </div>
                        <div className={clsx('rounded-full border px-3 py-2 text-xs font-semibold uppercase tracking-[0.18em]', getStatusClass(subscription.status))}>
                          {getStatusLabel(subscription.status)}
                        </div>
                      </button>
                    ))}
                  </section>
                ) : null}
              </>
            )}
          </>
        )}
      </div>
    </div>
  );
}

