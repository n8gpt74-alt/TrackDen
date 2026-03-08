import type { DailySpendPoint } from '../../features/analytics/api';
import type { Transaction, TransactionType } from '../../features/transactions/api';

export type WeeklyBucket = {
  label: string;
  value: number;
};

export type TransactionGroup = {
  label: string;
  items: Transaction[];
};

export type RecurringPreview = {
  title: string;
  subtitle: string;
  amount: number;
  color: string;
};

const PREVIEW_COLORS = ['#6f6bff', '#28d2a3', '#ff9f43', '#60a5fa'];

export function buildWeeklyBuckets(data: DailySpendPoint[], mode: TransactionType) {
  const buckets = [0, 0, 0, 0];

  for (const point of data) {
    const day = new Date(point.date).getDate();
    const bucketIndex = Math.min(3, Math.floor((day - 1) / 7));
    const currentValue = buckets[bucketIndex] ?? 0;
    buckets[bucketIndex] = currentValue + (mode === 'expense' ? point.expense : point.income);
  }

  return buckets.map((value, index) => ({
    label: `Week ${index + 1}`,
    value,
  } satisfies WeeklyBucket));
}

export function calculateRecentTrend(data: DailySpendPoint[], mode: TransactionType) {
  const values = [...data]
    .sort((left, right) => new Date(left.date).getTime() - new Date(right.date).getTime())
    .map((point) => (mode === 'expense' ? point.expense : point.income));

  const recent = values.slice(-7).reduce((sum, value) => sum + value, 0);
  const previous = values.slice(-14, -7).reduce((sum, value) => sum + value, 0);

  if (recent === 0 && previous === 0) {
    return 0;
  }

  if (previous === 0) {
    return 100;
  }

  return ((recent - previous) / previous) * 100;
}

export function calculateAverageTicket(items: Transaction[], mode: TransactionType) {
  const filtered = items.filter((transaction) => transaction.type === mode);
  if (filtered.length === 0) {
    return 0;
  }

  return filtered.reduce((sum, transaction) => sum + transaction.amount, 0) / filtered.length;
}

export function buildRecurringPreview(items: Transaction[], limit = 3) {
  const unique = new Map<string, RecurringPreview>();

  for (const transaction of items) {
    const merchant = transaction.merchant || transaction.category?.name || transaction.description;
    if (!merchant || unique.has(merchant)) {
      continue;
    }

    unique.set(merchant, {
      title: merchant,
      subtitle: transaction.category?.name ?? 'Повторяющийся платёж',
      amount: transaction.amount,
      color: PREVIEW_COLORS[unique.size % PREVIEW_COLORS.length] ?? PREVIEW_COLORS[0] ?? '#6f6bff',
    });

    if (unique.size >= limit) {
      break;
    }
  }

  return [...unique.values()];
}

export function groupTransactionsByDate(items: Transaction[]) {
  const groups = new Map<string, Transaction[]>();

  for (const transaction of items) {
    const dateKey = new Date(transaction.occurred_at).toDateString();
    const existing = groups.get(dateKey) ?? [];
    existing.push(transaction);
    groups.set(dateKey, existing);
  }

  return [...groups.entries()].map(([label, groupedItems]) => ({
    label,
    items: groupedItems,
  } satisfies TransactionGroup));
}

export function buildSourceBreakdown(items: Transaction[], mode: TransactionType) {
  const totals = new Map<string, number>();

  for (const transaction of items) {
    if (transaction.type !== mode) {
      continue;
    }

    const key = transaction.merchant || transaction.category?.name || (mode === 'income' ? 'Поступления' : 'Без категории');
    totals.set(key, (totals.get(key) ?? 0) + transaction.amount);
  }

  return [...totals.entries()]
    .map(([name, amount]) => ({ name, amount }))
    .sort((left, right) => right.amount - left.amount)
    .slice(0, 3);
}
