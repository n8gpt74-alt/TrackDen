import { ApiError } from './errors';
import { getLocalWorkspaceContext, writeWorkspace } from './localApi';

import {
  buildNextChargeAt,
  detectRecurringCandidates,
  buildSubscriptionManagerData,
  buildSubscriptionOverview,
  synchronizeSubscriptionState,
} from '../../features/subscriptions/engine';
import {
  type RecurringCandidate,
  type SubscriptionManagerData,
  type SubscriptionOverview,
  type SubscriptionRecord,
  type SubscriptionStatus,
  type SubscriptionUpsertInput,
} from '../../features/subscriptions/model';

function createId() {
  return globalThis.crypto?.randomUUID?.() ?? `local-${Math.random().toString(36).slice(2)}-${Date.now()}`;
}

function buildWorkspaceSnapshot(initDataRaw?: string) {
  const { principal, workspace } = getLocalWorkspaceContext(initDataRaw);
  const subscriptionState = synchronizeSubscriptionState(
    {
      categories: workspace.categories,
      transactions: workspace.transactions,
      subscriptions: workspace.subscriptions,
      dismissed_recurring_keys: workspace.dismissed_recurring_keys,
    },
  );

  return {
    principal,
    workspace: {
      ...workspace,
      ...subscriptionState,
    },
  };
}

function persistSubscriptionState(
  scopeId: string,
  workspace: ReturnType<typeof buildWorkspaceSnapshot>['workspace'],
) {
  return writeWorkspace(scopeId, workspace);
}

function requireSubscription(workspace: ReturnType<typeof buildWorkspaceSnapshot>['workspace'], id: string) {
  const subscription = workspace.subscriptions.find((item) => item.id === id);
  if (!subscription) {
    throw new ApiError({
      code: 'subscription_not_found',
      message: 'Подписка не найдена.',
    });
  }

  return subscription;
}

function requireCandidate(workspace: ReturnType<typeof buildWorkspaceSnapshot>['workspace'], candidateId: string) {
  const candidates = detectRecurringCandidates(
    workspace.transactions,
    workspace.dismissed_recurring_keys,
    workspace.subscriptions,
  );
  const candidate = candidates.find((item) => item.id === candidateId);

  if (!candidate) {
    throw new ApiError({
      code: 'recurring_candidate_not_found',
      message: 'Кандидат в подписки больше не найден.',
    });
  }

  return candidate;
}

function validateAmount(amount: number) {
  if (!Number.isFinite(amount) || amount <= 0) {
    throw new ApiError({
      code: 'invalid_subscription_amount',
      message: 'Сумма подписки должна быть больше нуля.',
    });
  }
}

function validateExpectedDay(expectedDay: number) {
  if (!Number.isInteger(expectedDay) || expectedDay < 1 || expectedDay > 31) {
    throw new ApiError({
      code: 'invalid_subscription_day',
      message: 'День списания должен быть в диапазоне от 1 до 31.',
    });
  }
}

function normalizeRecurringKey(value: string) {
  return value
    .normalize('NFKD')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function createSubscriptionRecord(candidate: RecurringCandidate): SubscriptionRecord {
  const now = new Date().toISOString();

  return {
    id: createId(),
    merchant_label: candidate.merchant_label,
    normalized_key: candidate.normalized_key,
    expected_amount: candidate.expected_amount,
    currency: candidate.currency,
    category_id: candidate.category_id,
    cadence: 'monthly',
    expected_day: candidate.expected_day,
    status: 'active',
    source: 'auto',
    confidence: candidate.confidence,
    last_match_at: candidate.last_charge_at,
    next_charge_at: candidate.next_charge_at,
    created_at: now,
    updated_at: now,
  };
}

export function getSubscriptionManagerData(initDataRaw?: string): SubscriptionManagerData {
  const { workspace } = buildWorkspaceSnapshot(initDataRaw);
  return buildSubscriptionManagerData(workspace);
}

export function getSubscriptionOverview(month: string, initDataRaw?: string): SubscriptionOverview {
  const { workspace } = buildWorkspaceSnapshot(initDataRaw);
  return buildSubscriptionOverview(workspace, month);
}

export function confirmRecurringCandidate(candidateId: string, initDataRaw?: string) {
  const { principal, workspace } = buildWorkspaceSnapshot(initDataRaw);
  const candidate = requireCandidate(workspace, candidateId);
  const nextWorkspace = {
    ...workspace,
    subscriptions: [createSubscriptionRecord(candidate), ...workspace.subscriptions],
    dismissed_recurring_keys: workspace.dismissed_recurring_keys.filter((key) => key !== candidateId),
  };

  return persistSubscriptionState(principal.scopeId, nextWorkspace);
}

export function dismissRecurringCandidate(candidateId: string, initDataRaw?: string) {
  const { principal, workspace } = buildWorkspaceSnapshot(initDataRaw);
  requireCandidate(workspace, candidateId);

  const nextWorkspace = {
    ...workspace,
    dismissed_recurring_keys: Array.from(new Set([...workspace.dismissed_recurring_keys, candidateId])),
  };

  return persistSubscriptionState(principal.scopeId, nextWorkspace);
}

export function saveSubscription(input: SubscriptionUpsertInput, initDataRaw?: string) {
  validateAmount(input.expected_amount);
  validateExpectedDay(input.expected_day);

  const { principal, workspace } = buildWorkspaceSnapshot(initDataRaw);
  const merchantLabel = input.merchant_label.trim();
  if (!merchantLabel) {
    throw new ApiError({
      code: 'invalid_subscription_label',
      message: 'Нужно указать название подписки или сервиса.',
    });
  }

  const categoryId = input.category_id && workspace.categories.some((category) => category.id === input.category_id)
    ? input.category_id
    : null;
  const now = new Date().toISOString();

  if (input.id) {
    const current = requireSubscription(workspace, input.id);
    const updated: SubscriptionRecord = {
      ...current,
      merchant_label: merchantLabel,
      normalized_key: normalizeRecurringKey(merchantLabel),
      expected_amount: Math.round(input.expected_amount * 100) / 100,
      currency: (input.currency || current.currency || 'RUB').trim().toUpperCase(),
      category_id: categoryId,
      expected_day: input.expected_day,
      status: input.status ?? current.status,
      updated_at: now,
      next_charge_at: buildNextChargeAt(input.expected_day),
    };

    return persistSubscriptionState(principal.scopeId, {
      ...workspace,
      subscriptions: workspace.subscriptions.map((subscription) => (subscription.id === current.id ? updated : subscription)),
    });
  }

  const created: SubscriptionRecord = {
    id: createId(),
    merchant_label: merchantLabel,
    normalized_key: normalizeRecurringKey(merchantLabel),
    expected_amount: Math.round(input.expected_amount * 100) / 100,
    currency: (input.currency || 'RUB').trim().toUpperCase(),
    category_id: categoryId,
    cadence: 'monthly',
    expected_day: input.expected_day,
    status: input.status ?? 'active',
    source: 'manual',
    confidence: 1,
    last_match_at: null,
    next_charge_at: buildNextChargeAt(input.expected_day),
    created_at: now,
    updated_at: now,
  };

  return persistSubscriptionState(principal.scopeId, {
    ...workspace,
    subscriptions: [created, ...workspace.subscriptions],
  });
}

export function updateSubscriptionStatus(id: string, status: SubscriptionStatus, initDataRaw?: string) {
  const { principal, workspace } = buildWorkspaceSnapshot(initDataRaw);
  const current = requireSubscription(workspace, id);
  const nextSubscription: SubscriptionRecord = {
    ...current,
    status,
    updated_at: new Date().toISOString(),
  };

  return persistSubscriptionState(principal.scopeId, {
    ...workspace,
    subscriptions: workspace.subscriptions.map((subscription) => (subscription.id === current.id ? nextSubscription : subscription)),
  });
}

export function deleteSubscription(id: string, initDataRaw?: string) {
  const { principal, workspace } = buildWorkspaceSnapshot(initDataRaw);
  const current = requireSubscription(workspace, id);

  if (current.source !== 'manual') {
    throw new ApiError({
      code: 'subscription_delete_forbidden',
      message: 'Автоматически найденные подписки можно отменить, но не удалить.',
    });
  }

  return persistSubscriptionState(principal.scopeId, {
    ...workspace,
    subscriptions: workspace.subscriptions.filter((subscription) => subscription.id !== current.id),
  });
}
