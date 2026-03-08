import type { Category } from '../auth/api';
import type { TransactionType } from '../transactions/api';
import {
  SUBSCRIPTION_AMOUNT_TOLERANCE_RATIO,
  SUBSCRIPTION_CONFIDENCE_THRESHOLD,
  SUBSCRIPTION_MAX_INTERVAL_DAYS,
  SUBSCRIPTION_MIN_INTERVAL_DAYS,
  SUBSCRIPTION_MIN_MATCHES,
  normalizeSubscriptionState,
  type RecurringCandidate,
  type SubscriptionManagerData,
  type SubscriptionOverview,
  type SubscriptionRecord,
  type SubscriptionWorkspaceState,
} from './model';

export type SubscriptionTransactionLike = {
  id: string;
  amount: number;
  currency: string;
  description?: string | null;
  merchant?: string | null;
  occurred_at: string;
  type: TransactionType;
  category_id?: string | null;
};

export type SubscriptionWorkspaceLike = SubscriptionWorkspaceState & {
  categories: Category[];
  transactions: SubscriptionTransactionLike[];
};

const DAY_MS = 24 * 60 * 60 * 1000;

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function roundMoney(value: number) {
  return Math.round(value * 100) / 100;
}

function startOfDay(value: Date) {
  return new Date(value.getFullYear(), value.getMonth(), value.getDate());
}

function normalizeText(value: string) {
  return value
    .normalize('NFKD')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function pickTransactionLabel(transaction: SubscriptionTransactionLike) {
  const merchant = transaction.merchant?.trim();
  if (merchant) {
    return merchant;
  }

  const description = transaction.description?.trim();
  return description ?? '';
}

function countByValue(values: Array<string | null | undefined>) {
  const counts = new Map<string, number>();

  for (const value of values) {
    if (!value) {
      continue;
    }

    counts.set(value, (counts.get(value) ?? 0) + 1);
  }

  return [...counts.entries()].sort((left, right) => right[1] - left[1])[0]?.[0] ?? null;
}

function compareDatesAsc(left: string, right: string) {
  return new Date(left).getTime() - new Date(right).getTime();
}

function compareDatesDesc(left: string, right: string) {
  return new Date(right).getTime() - new Date(left).getTime();
}

function getMonthKey(value: string) {
  return value.slice(0, 7);
}

function getDaysBetween(left: string, right: string) {
  return Math.round(Math.abs(new Date(right).getTime() - new Date(left).getTime()) / DAY_MS);
}

function getTransactionRecurringKey(transaction: SubscriptionTransactionLike) {
  return normalizeText(pickTransactionLabel(transaction));
}

function getCandidateBaseKey(normalizedKey: string, currency: string) {
  return `${normalizedKey}::${currency}`;
}

export function buildRecurringCandidateId(normalizedKey: string, currency: string, expectedAmount: number) {
  return `${normalizedKey}::${currency}::${Math.round(expectedAmount * 100)}`;
}

function buildMonthlyDate(year: number, monthIndex: number, expectedDay: number) {
  const daysInMonth = new Date(year, monthIndex + 1, 0).getDate();
  const safeDay = Math.min(Math.max(1, expectedDay), daysInMonth);
  return new Date(year, monthIndex, safeDay, 12, 0, 0, 0);
}

export function buildNextChargeAt(expectedDay: number, reference: string | Date | null | undefined = new Date()) {
  const baseDate = reference instanceof Date ? reference : reference ? new Date(reference) : new Date();
  const start = startOfDay(baseDate);
  let target = buildMonthlyDate(start.getFullYear(), start.getMonth(), expectedDay);

  if (target.getTime() < start.getTime()) {
    target = buildMonthlyDate(start.getFullYear(), start.getMonth() + 1, expectedDay);
  }

  return target.toISOString();
}

function isAmountStable(items: SubscriptionTransactionLike[], averageAmount: number) {
  return items.every((transaction) => Math.abs(transaction.amount - averageAmount) / averageAmount <= SUBSCRIPTION_AMOUNT_TOLERANCE_RATIO);
}

function getCandidateConfidence(intervals: number[], averageAmount: number, items: SubscriptionTransactionLike[]) {
  const averageInterval = intervals.reduce((sum, value) => sum + value, 0) / Math.max(intervals.length, 1);
  const intervalScore = clamp(1 - Math.abs(averageInterval - 30) / 10, 0, 1);
  const amountSpread = Math.max(
    ...items.map((transaction) => Math.abs(transaction.amount - averageAmount) / averageAmount),
    0,
  );
  const amountScore = clamp(1 - amountSpread / SUBSCRIPTION_AMOUNT_TOLERANCE_RATIO, 0, 1);

  return clamp(
    0.58 + Math.min(items.length - SUBSCRIPTION_MIN_MATCHES, 3) * 0.08 + intervalScore * 0.18 + amountScore * 0.16,
    0,
    0.97,
  );
}

function buildCandidateFromGroup(
  items: SubscriptionTransactionLike[],
  dismissedRecurringKeys: string[],
  existingKeys: Set<string>,
  now: Date,
): RecurringCandidate | null {
  if (items.length < SUBSCRIPTION_MIN_MATCHES) {
    return null;
  }

  const sortedItems = [...items].sort((left, right) => compareDatesAsc(left.occurred_at, right.occurred_at));
  const intervals = sortedItems.slice(1).map((item, index) => getDaysBetween(sortedItems[index]!.occurred_at, item.occurred_at));
  if (intervals.some((interval) => interval < SUBSCRIPTION_MIN_INTERVAL_DAYS || interval > SUBSCRIPTION_MAX_INTERVAL_DAYS)) {
    return null;
  }

  const averageAmount = roundMoney(
    sortedItems.reduce((sum, transaction) => sum + transaction.amount, 0) / Math.max(sortedItems.length, 1),
  );
  if (!isAmountStable(sortedItems, averageAmount)) {
    return null;
  }

  const mostRecent = sortedItems[sortedItems.length - 1];
  if (!mostRecent) {
    return null;
  }

  const normalizedKey = getTransactionRecurringKey(mostRecent);
  if (!normalizedKey) {
    return null;
  }

  const currency = mostRecent.currency || 'RUB';
  const existingKey = getCandidateBaseKey(normalizedKey, currency);
  if (existingKeys.has(existingKey)) {
    return null;
  }

  const candidateId = buildRecurringCandidateId(normalizedKey, currency, averageAmount);
  if (dismissedRecurringKeys.includes(candidateId)) {
    return null;
  }

  const confidence = getCandidateConfidence(intervals, averageAmount, sortedItems);
  if (confidence < SUBSCRIPTION_CONFIDENCE_THRESHOLD) {
    return null;
  }

  return {
    id: candidateId,
    merchant_label: pickTransactionLabel(mostRecent) || 'Без названия',
    normalized_key: normalizedKey,
    expected_amount: averageAmount,
    currency,
    category_id: countByValue(sortedItems.map((transaction) => transaction.category_id ?? null)),
    expected_day: new Date(mostRecent.occurred_at).getDate(),
    confidence,
    match_count: sortedItems.length,
    last_charge_at: mostRecent.occurred_at,
    next_charge_at: buildNextChargeAt(new Date(mostRecent.occurred_at).getDate(), now),
    transaction_ids: sortedItems.map((transaction) => transaction.id),
  };
}

export function detectRecurringCandidates(
  transactions: SubscriptionTransactionLike[],
  dismissedRecurringKeys: string[],
  subscriptions: SubscriptionRecord[],
  now = new Date(),
) {
  const groups = new Map<string, SubscriptionTransactionLike[]>();
  const existingKeys = new Set(subscriptions.map((subscription) => getCandidateBaseKey(subscription.normalized_key, subscription.currency)));

  for (const transaction of transactions) {
    if (transaction.type !== 'expense') {
      continue;
    }

    const normalizedKey = getTransactionRecurringKey(transaction);
    if (!normalizedKey) {
      continue;
    }

    const groupKey = getCandidateBaseKey(normalizedKey, transaction.currency || 'RUB');
    const current = groups.get(groupKey) ?? [];
    current.push(transaction);
    groups.set(groupKey, current);
  }

  return [...groups.values()]
    .map((items) => buildCandidateFromGroup(items, dismissedRecurringKeys, existingKeys, now))
    .filter((candidate): candidate is RecurringCandidate => candidate !== null)
    .sort((left, right) => {
      if (right.confidence !== left.confidence) {
        return right.confidence - left.confidence;
      }

      return compareDatesDesc(left.last_charge_at, right.last_charge_at);
    });
}

export function matchesSubscription(transaction: SubscriptionTransactionLike, subscription: SubscriptionRecord) {
  if (transaction.type !== 'expense') {
    return false;
  }

  if ((transaction.currency || 'RUB') !== subscription.currency) {
    return false;
  }

  const recurringKey = getTransactionRecurringKey(transaction);
  if (!recurringKey || recurringKey !== subscription.normalized_key) {
    return false;
  }

  return Math.abs(transaction.amount - subscription.expected_amount) / subscription.expected_amount <= SUBSCRIPTION_AMOUNT_TOLERANCE_RATIO;
}

export function findMatchingTransactionsForSubscription(subscription: SubscriptionRecord, transactions: SubscriptionTransactionLike[]) {
  const cutoff = subscription.status === 'active'
    ? Number.POSITIVE_INFINITY
    : new Date(subscription.updated_at || subscription.created_at).getTime();

  return transactions
    .filter((transaction) => matchesSubscription(transaction, subscription))
    .filter((transaction) => new Date(transaction.occurred_at).getTime() <= cutoff)
    .sort((left, right) => compareDatesAsc(left.occurred_at, right.occurred_at));
}

function sortSubscriptions(subscriptions: SubscriptionRecord[]) {
  const statusOrder: Record<SubscriptionRecord['status'], number> = {
    active: 0,
    paused: 1,
    cancelled: 2,
  };

  return [...subscriptions].sort((left, right) => {
    if (statusOrder[left.status] !== statusOrder[right.status]) {
      return statusOrder[left.status] - statusOrder[right.status];
    }

    if (left.status === 'active' && left.next_charge_at && right.next_charge_at) {
      return compareDatesAsc(left.next_charge_at, right.next_charge_at);
    }

    return compareDatesDesc(left.updated_at, right.updated_at);
  });
}

export function synchronizeSubscriptionState(workspace: SubscriptionWorkspaceLike, now = new Date()): SubscriptionWorkspaceState {
  const normalizedState = normalizeSubscriptionState(workspace, workspace.categories);

  return {
    subscriptions: sortSubscriptions(
      normalizedState.subscriptions.map((subscription) => {
        const matches = findMatchingTransactionsForSubscription(subscription, workspace.transactions);
        const latestMatch = matches[matches.length - 1]?.occurred_at ?? subscription.last_match_at ?? null;

        return {
          ...subscription,
          last_match_at: latestMatch,
          next_charge_at: subscription.status === 'cancelled' ? null : buildNextChargeAt(subscription.expected_day, now),
        };
      }),
    ),
    dismissed_recurring_keys: normalizedState.dismissed_recurring_keys,
  };
}

export function buildSubscriptionManagerData(workspace: SubscriptionWorkspaceLike, now = new Date()): SubscriptionManagerData {
  const synchronized = synchronizeSubscriptionState(workspace, now);
  const active = synchronized.subscriptions.filter((subscription) => subscription.status === 'active');
  const paused = synchronized.subscriptions.filter((subscription) => subscription.status === 'paused');
  const cancelled = synchronized.subscriptions.filter((subscription) => subscription.status === 'cancelled');
  const candidates = detectRecurringCandidates(workspace.transactions, synchronized.dismissed_recurring_keys, synchronized.subscriptions, now);
  const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  const start = startOfDay(now).getTime();

  return {
    active,
    paused,
    cancelled,
    all: synchronized.subscriptions,
    candidates,
    monthly_total: roundMoney(active.reduce((sum, subscription) => sum + subscription.expected_amount, 0)),
    upcoming_total: roundMoney(
      active
        .filter((subscription) => subscription.next_charge_at)
        .filter((subscription) => getMonthKey(subscription.next_charge_at!) === currentMonth)
        .filter((subscription) => new Date(subscription.next_charge_at!).getTime() >= start)
        .reduce((sum, subscription) => sum + subscription.expected_amount, 0),
    ),
    upcoming: active
      .filter((subscription) => subscription.next_charge_at)
      .filter((subscription) => new Date(subscription.next_charge_at!).getTime() >= start)
      .slice(0, 3),
    active_count: active.length,
    paused_count: paused.length,
    cancelled_count: cancelled.length,
    candidate_count: candidates.length,
  };
}

export function buildSubscriptionOverview(
  workspace: SubscriptionWorkspaceLike,
  month: string,
  now = new Date(),
): SubscriptionOverview {
  const manager = buildSubscriptionManagerData(workspace, now);
  const expenseTransactions = workspace.transactions.filter((transaction) => transaction.type === 'expense' && getMonthKey(transaction.occurred_at) === month);
  const matchedTransactionIds = new Set<string>();

  for (const subscription of manager.active) {
    for (const transaction of findMatchingTransactionsForSubscription(subscription, expenseTransactions)) {
      matchedTransactionIds.add(transaction.id);
    }
  }

  const fixedSpent = roundMoney(
    expenseTransactions
      .filter((transaction) => matchedTransactionIds.has(transaction.id))
      .reduce((sum, transaction) => sum + transaction.amount, 0),
  );
  const totalExpense = roundMoney(expenseTransactions.reduce((sum, transaction) => sum + transaction.amount, 0));

  return {
    ...manager,
    month,
    fixed_spent: fixedSpent,
    flexible_spent: roundMoney(Math.max(totalExpense - fixedSpent, 0)),
    matched_this_month: matchedTransactionIds.size,
    forecast_total: roundMoney(fixedSpent + manager.upcoming_total),
  };
}
