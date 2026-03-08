import type { Category } from '../auth/api';

export const SUBSCRIPTION_WORKSPACE_VERSION = 4;
export const SUBSCRIPTION_MIN_MATCHES = 2;
export const SUBSCRIPTION_MIN_INTERVAL_DAYS = 25;
export const SUBSCRIPTION_MAX_INTERVAL_DAYS = 40;
export const SUBSCRIPTION_AMOUNT_TOLERANCE_RATIO = 0.15;
export const SUBSCRIPTION_CONFIDENCE_THRESHOLD = 0.72;

export type SubscriptionStatus = 'active' | 'paused' | 'cancelled';
export type SubscriptionSource = 'auto' | 'manual';
export type SubscriptionCadence = 'monthly';

export type SubscriptionRecord = {
  id: string;
  merchant_label: string;
  normalized_key: string;
  expected_amount: number;
  currency: string;
  category_id: string | null;
  cadence: SubscriptionCadence;
  expected_day: number;
  status: SubscriptionStatus;
  source: SubscriptionSource;
  confidence: number;
  last_match_at: string | null;
  next_charge_at: string | null;
  created_at: string;
  updated_at: string;
};

export type RecurringCandidate = {
  id: string;
  merchant_label: string;
  normalized_key: string;
  expected_amount: number;
  currency: string;
  category_id: string | null;
  expected_day: number;
  confidence: number;
  match_count: number;
  last_charge_at: string;
  next_charge_at: string;
  transaction_ids: string[];
};

export type SubscriptionUpsertInput = {
  id?: string | null;
  merchant_label: string;
  expected_amount: number;
  currency: string;
  category_id?: string | null;
  expected_day: number;
  status?: SubscriptionStatus;
};

export type SubscriptionManagerData = {
  active: SubscriptionRecord[];
  paused: SubscriptionRecord[];
  cancelled: SubscriptionRecord[];
  all: SubscriptionRecord[];
  candidates: RecurringCandidate[];
  monthly_total: number;
  upcoming_total: number;
  upcoming: SubscriptionRecord[];
  active_count: number;
  paused_count: number;
  cancelled_count: number;
  candidate_count: number;
};

export type SubscriptionOverview = SubscriptionManagerData & {
  month: string;
  fixed_spent: number;
  flexible_spent: number;
  matched_this_month: number;
  forecast_total: number;
};

export type SubscriptionWorkspaceState = {
  subscriptions: SubscriptionRecord[];
  dismissed_recurring_keys: string[];
};

function clampExpectedDay(value: unknown) {
  const normalized = Number(value);
  if (!Number.isFinite(normalized)) {
    return 1;
  }

  return Math.min(31, Math.max(1, Math.round(normalized)));
}

function normalizeMoney(value: unknown) {
  const normalized = Number(value);
  if (!Number.isFinite(normalized) || normalized <= 0) {
    return null;
  }

  return Math.round(normalized * 100) / 100;
}

function normalizeConfidence(value: unknown, fallback: number) {
  const normalized = Number(value);
  if (!Number.isFinite(normalized)) {
    return fallback;
  }

  return Math.min(1, Math.max(0, normalized));
}

function normalizeStatus(value: unknown): SubscriptionStatus {
  return value === 'paused' || value === 'cancelled' ? value : 'active';
}

function normalizeSource(value: unknown): SubscriptionSource {
  return value === 'auto' ? 'auto' : 'manual';
}

function normalizeCurrency(value: unknown) {
  if (typeof value !== 'string') {
    return 'RUB';
  }

  const trimmed = value.trim().toUpperCase();
  return trimmed || 'RUB';
}

function normalizeMerchantLabel(value: unknown) {
  if (typeof value !== 'string') {
    return 'Без названия';
  }

  const trimmed = value.trim();
  return trimmed || 'Без названия';
}

export function createEmptySubscriptionState(): SubscriptionWorkspaceState {
  return {
    subscriptions: [],
    dismissed_recurring_keys: [],
  };
}

export function normalizeSubscriptionState(
  state: Partial<SubscriptionWorkspaceState> | SubscriptionWorkspaceState | null | undefined,
  categories: Category[] = [],
): SubscriptionWorkspaceState {
  if (!state) {
    return createEmptySubscriptionState();
  }

  const allowedCategoryIds = new Set(categories.map((category) => category.id));
  const seenSubscriptions = new Set<string>();
  const subscriptions: SubscriptionRecord[] = [];

  for (const rawRecord of Array.isArray(state.subscriptions) ? state.subscriptions : []) {
    if (!rawRecord || typeof rawRecord !== 'object') {
      continue;
    }

    const id = typeof rawRecord.id === 'string' ? rawRecord.id : '';
    const expectedAmount = normalizeMoney(rawRecord.expected_amount);
    if (!id || !expectedAmount || seenSubscriptions.has(id)) {
      continue;
    }

    seenSubscriptions.add(id);

    const categoryId = typeof rawRecord.category_id === 'string' && allowedCategoryIds.has(rawRecord.category_id)
      ? rawRecord.category_id
      : null;
    const source = normalizeSource(rawRecord.source);

    subscriptions.push({
      id,
      merchant_label: normalizeMerchantLabel(rawRecord.merchant_label),
      normalized_key: typeof rawRecord.normalized_key === 'string' && rawRecord.normalized_key.trim()
        ? rawRecord.normalized_key.trim()
        : normalizeMerchantLabel(rawRecord.merchant_label).toLowerCase(),
      expected_amount: expectedAmount,
      currency: normalizeCurrency(rawRecord.currency),
      category_id: categoryId,
      cadence: 'monthly',
      expected_day: clampExpectedDay(rawRecord.expected_day),
      status: normalizeStatus(rawRecord.status),
      source,
      confidence: normalizeConfidence(rawRecord.confidence, source === 'auto' ? 0.82 : 1),
      last_match_at: typeof rawRecord.last_match_at === 'string' ? rawRecord.last_match_at : null,
      next_charge_at: typeof rawRecord.next_charge_at === 'string' ? rawRecord.next_charge_at : null,
      created_at: typeof rawRecord.created_at === 'string' ? rawRecord.created_at : new Date().toISOString(),
      updated_at: typeof rawRecord.updated_at === 'string' ? rawRecord.updated_at : new Date().toISOString(),
    });
  }

  const dismissedKeys = Array.from(
    new Set(
      (Array.isArray(state.dismissed_recurring_keys) ? state.dismissed_recurring_keys : [])
        .filter((value): value is string => typeof value === 'string')
        .map((value) => value.trim())
        .filter(Boolean),
    ),
  );

  return {
    subscriptions,
    dismissed_recurring_keys: dismissedKeys,
  };
}
