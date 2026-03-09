import { BUDGET_WARNING_RATIO } from '../budgets/model';
import { buildSubscriptionOverview } from '../subscriptions/engine';
import type { SubscriptionRecord } from '../subscriptions/model';
import type { Category } from '../auth/api';
import type { Transaction, TransactionType } from '../transactions/api';
import type {
  AutomationOverview,
  ForecastOverview,
  MerchantInsight,
  QuickTemplate,
  SmartRule,
  WeeklyReview,
} from './model';

type TransactionLike = Transaction | (Omit<Transaction, 'category'> & { category?: Transaction['category'] | null });

type WorkspaceLike = {
  categories: Category[];
  transactions: TransactionLike[];
  budgets: {
    overall_enabled: boolean;
    overall_amount: number | null;
  };
  subscriptions: SubscriptionRecord[];
  dismissed_recurring_keys: string[];
  smart_rules: SmartRule[];
  quick_templates: QuickTemplate[];
};

type RuleMatchInput = {
  merchant?: string | null;
  description?: string | null;
  type: TransactionType;
};

function monthKey(value: string) {
  const date = new Date(value);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

function roundMoney(value: number) {
  return Math.round(value * 100) / 100;
}

function normalizeText(value: string | null | undefined) {
  return (value ?? '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function capitalize(value: string) {
  return value ? value.slice(0, 1).toUpperCase() + value.slice(1) : value;
}

function resolveCategoryName(transaction: TransactionLike) {
  return transaction.category?.name ?? '\u0411\u0435\u0437 \u043a\u0430\u0442\u0435\u0433\u043e\u0440\u0438\u0438';
}

function buildTemplateLabel(transaction: TransactionLike) {
  return transaction.merchant || transaction.category?.name || transaction.description || '\u0411\u0435\u0437 \u043a\u0430\u0442\u0435\u0433\u043e\u0440\u0438\u0438';
}

export function findMatchingSmartRule(
  categories: Category[],
  rules: SmartRule[],
  input: RuleMatchInput,
): { category: Category; rule: SmartRule } | null {
  const merchant = normalizeText(input.merchant);
  const description = normalizeText(input.description);

  for (const rule of [...rules].sort((left, right) => right.pattern.length - left.pattern.length || right.use_count - left.use_count)) {
    if (!rule.active) {
      continue;
    }

    if (rule.transaction_type !== 'any' && rule.transaction_type !== input.type) {
      continue;
    }

    const pattern = normalizeText(rule.pattern);
    if (!pattern) {
      continue;
    }

    const haystack = rule.field === 'merchant'
      ? merchant
      : rule.field === 'description'
        ? description
        : `${merchant} ${description}`.trim();

    if (!haystack.includes(pattern)) {
      continue;
    }

    const category = categories.find((item) => item.id === rule.category_id);
    if (category) {
      return { category, rule };
    }
  }

  return null;
}

export function buildSuggestedTemplates(items: TransactionLike[], limit = 4): QuickTemplate[] {
  const groups = new Map<string, TransactionLike[]>();

  for (const transaction of items) {
    const label = buildTemplateLabel(transaction);
    const normalized = normalizeText(label);
    if (!normalized) {
      continue;
    }

    const categoryId = transaction.category?.id ?? 'none';
    const roundedAmount = Math.round(transaction.amount);
    const key = `${transaction.type}:${normalized}:${categoryId}:${roundedAmount}`;
    const bucket = groups.get(key) ?? [];
    bucket.push(transaction);
    groups.set(key, bucket);
  }

  return [...groups.values()]
    .filter((bucket) => bucket.length >= 2)
    .map((bucket) => {
      const latest = [...bucket].sort((left, right) => new Date(right.occurred_at).getTime() - new Date(left.occurred_at).getTime())[0]!;
      const amount = roundMoney(bucket.reduce((sum, item) => sum + item.amount, 0) / bucket.length);
      return {
        id: `learned:${latest.type}:${normalizeText(buildTemplateLabel(latest))}:${latest.category?.id ?? 'none'}`,
        label: capitalize(buildTemplateLabel(latest)),
        type: latest.type,
        amount,
        currency: latest.currency,
        category_id: latest.category?.id ?? null,
        merchant: latest.merchant ?? null,
        description: latest.description ?? null,
        source: 'learned',
        pinned: false,
        use_count: bucket.length,
        last_used_at: latest.occurred_at,
        created_at: latest.created_at,
        updated_at: latest.updated_at,
      } satisfies QuickTemplate;
    })
    .sort((left, right) => right.use_count - left.use_count || new Date(right.last_used_at ?? 0).getTime() - new Date(left.last_used_at ?? 0).getTime())
    .slice(0, limit);
}

export function buildAutomationOverview(workspace: WorkspaceLike): AutomationOverview {
  const suggestedTemplates = buildSuggestedTemplates(workspace.transactions);

  return {
    rules: [...workspace.smart_rules].sort((left, right) => Number(right.active) - Number(left.active) || right.use_count - left.use_count),
    quick_templates: [...workspace.quick_templates].sort((left, right) => Number(right.pinned) - Number(left.pinned) || right.use_count - left.use_count),
    suggested_templates: suggestedTemplates,
    active_rule_count: workspace.smart_rules.filter((rule) => rule.active).length,
    manual_template_count: workspace.quick_templates.length,
    suggested_template_count: suggestedTemplates.length,
  };
}

export function buildForecastOverview(workspace: WorkspaceLike, month: string, now = new Date()): ForecastOverview {
  const subscriptionOverview = buildSubscriptionOverview(workspace, month, now);
  const monthTransactions = workspace.transactions.filter((transaction) => monthKey(transaction.occurred_at) === month);
  const actualIncome = roundMoney(monthTransactions.filter((transaction) => transaction.type === 'income').reduce((sum, transaction) => sum + transaction.amount, 0));
  const actualExpense = roundMoney(monthTransactions.filter((transaction) => transaction.type === 'expense').reduce((sum, transaction) => sum + transaction.amount, 0));
  const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
  const daysElapsed = Math.min(daysInMonth, Math.max(1, now.getDate()));
  const remainingDays = Math.max(0, daysInMonth - daysElapsed);
  const flexiblePacePerDay = subscriptionOverview.flexible_spent > 0 ? roundMoney(subscriptionOverview.flexible_spent / daysElapsed) : 0;
  const projectedFlexible = roundMoney(flexiblePacePerDay * remainingDays);
  const projectedExpense = roundMoney(actualExpense + projectedFlexible + subscriptionOverview.upcoming_total);
  const projectedIncome = actualIncome;
  const projectedBalance = roundMoney(projectedIncome - projectedExpense);
  const budgetLimit = workspace.budgets.overall_enabled ? workspace.budgets.overall_amount ?? null : null;
  const budgetGap = budgetLimit == null ? null : roundMoney(budgetLimit - projectedExpense);
  const budgetRatio = budgetLimit ? projectedExpense / budgetLimit : null;
  const status = projectedBalance < 0 || (budgetRatio != null && budgetRatio >= 1)
    ? 'risk'
    : projectedBalance < actualIncome * 0.1 || (budgetRatio != null && budgetRatio >= BUDGET_WARNING_RATIO)
      ? 'attention'
      : 'safe';

  const summary = status === 'risk'
    ? `\u0415\u0441\u0442\u044c \u0440\u0438\u0441\u043a \u0432\u044b\u0439\u0442\u0438 \u0437\u0430 \u043f\u043b\u0430\u043d: \u043f\u0440\u043e\u0433\u043d\u043e\u0437 \u043f\u043e \u0440\u0430\u0441\u0445\u043e\u0434\u0430\u043c \u2014 ${projectedExpense.toLocaleString('ru-RU')} \u20bd.`
    : status === 'attention'
      ? '\u0422\u044b \u0435\u0449\u0451 \u0434\u0435\u0440\u0436\u0438\u0448\u044c \u0441\u0438\u0442\u0443\u0430\u0446\u0438\u044e \u043f\u043e\u0434 \u043a\u043e\u043d\u0442\u0440\u043e\u043b\u0435\u043c, \u043d\u043e \u0437\u0430\u043f\u0430\u0441 \u0441\u0442\u0430\u043d\u043e\u0432\u0438\u0442\u0441\u044f \u0442\u0435\u0441\u043d\u044b\u043c. \u0421\u0442\u043e\u0438\u0442 \u0447\u0443\u0442\u044c \u0432\u043d\u0438\u043c\u0430\u0442\u0435\u043b\u044c\u043d\u0435\u0435 \u0441\u043b\u0435\u0434\u0438\u0442\u044c \u0437\u0430 \u0442\u0440\u0430\u0442\u0430\u043c\u0438.'
      : '\u041f\u0440\u043e\u0433\u043d\u043e\u0437 \u0441\u043f\u043e\u043a\u043e\u0439\u043d\u044b\u0439: \u0435\u0441\u043b\u0438 \u0434\u0435\u0440\u0436\u0430\u0442\u044c \u0442\u0435\u043a\u0443\u0449\u0438\u0439 \u0442\u0435\u043c\u043f, \u043c\u0435\u0441\u044f\u0446 \u0437\u0430\u043a\u0440\u043e\u0435\u0442\u0441\u044f \u0431\u0435\u0437 \u0434\u0430\u0432\u043b\u0435\u043d\u0438\u044f.';

  return {
    month,
    actual_income: actualIncome,
    actual_expense: actualExpense,
    projected_income: projectedIncome,
    projected_expense: projectedExpense,
    projected_balance: projectedBalance,
    flexible_pace_per_day: flexiblePacePerDay,
    fixed_upcoming: subscriptionOverview.upcoming_total,
    days_elapsed: daysElapsed,
    days_in_month: daysInMonth,
    remaining_days: remainingDays,
    budget_limit: budgetLimit,
    budget_gap: budgetGap,
    status,
    summary,
  };
}

export function buildWeeklyReview(workspace: WorkspaceLike, now = new Date()): WeeklyReview {
  const end = new Date(now);
  end.setHours(23, 59, 59, 999);
  const start = new Date(end);
  start.setDate(end.getDate() - 6);
  start.setHours(0, 0, 0, 0);
  const previousStart = new Date(start);
  previousStart.setDate(start.getDate() - 7);
  const previousEnd = new Date(start);
  previousEnd.setMilliseconds(-1);

  const current = workspace.transactions.filter((transaction) => transaction.type === 'expense' && new Date(transaction.occurred_at) >= start && new Date(transaction.occurred_at) <= end);
  const previous = workspace.transactions.filter((transaction) => transaction.type === 'expense' && new Date(transaction.occurred_at) >= previousStart && new Date(transaction.occurred_at) <= previousEnd);

  const totalExpense = roundMoney(current.reduce((sum, transaction) => sum + transaction.amount, 0));
  const previousExpense = roundMoney(previous.reduce((sum, transaction) => sum + transaction.amount, 0));
  const deltaRatio = previousExpense > 0 ? ((totalExpense - previousExpense) / previousExpense) * 100 : totalExpense > 0 ? 100 : 0;

  const categoryTotals = new Map<string, number>();
  const merchantTotals = new Map<string, number>();
  for (const transaction of current) {
    const categoryName = resolveCategoryName(transaction);
    categoryTotals.set(categoryName, (categoryTotals.get(categoryName) ?? 0) + transaction.amount);
    const merchantName = transaction.merchant || transaction.description || categoryName;
    merchantTotals.set(merchantName, (merchantTotals.get(merchantName) ?? 0) + transaction.amount);
  }

  const topCategory = [...categoryTotals.entries()].sort((left, right) => right[1] - left[1])[0] ?? null;
  const topMerchant = [...merchantTotals.entries()].sort((left, right) => right[1] - left[1])[0] ?? null;
  const summary = totalExpense === 0
    ? '\u0417\u0430 \u043f\u043e\u0441\u043b\u0435\u0434\u043d\u0438\u0435 7 \u0434\u043d\u0435\u0439 \u0442\u0440\u0430\u0442 \u043d\u0435 \u0431\u044b\u043b\u043e \u2014 \u043d\u0435\u0434\u0435\u043b\u044e \u043c\u043e\u0436\u043d\u043e \u0441\u0447\u0438\u0442\u0430\u0442\u044c \u0447\u0438\u0441\u0442\u044b\u043c \u0441\u0442\u0430\u0440\u0442\u043e\u043c.'
    : deltaRatio > 15
      ? `\u041d\u0430 \u044d\u0442\u043e\u0439 \u043d\u0435\u0434\u0435\u043b\u0435 \u0442\u0440\u0430\u0442\u044b \u0443\u0441\u043a\u043e\u0440\u0438\u043b\u0438\u0441\u044c. \u0411\u043e\u043b\u044c\u0448\u0435 \u0432\u0441\u0435\u0433\u043e \u0434\u0430\u0432\u0438\u0442 \u043a\u0430\u0442\u0435\u0433\u043e\u0440\u0438\u044f \u00ab${topCategory?.[0] ?? '\u043e\u0441\u043d\u043e\u0432\u043d\u044b\u0435 \u0442\u0440\u0430\u0442\u044b'}\u00bb.`
      : deltaRatio < -10
        ? `\u041d\u0430 \u044d\u0442\u043e\u0439 \u043d\u0435\u0434\u0435\u043b\u0435 \u0442\u0440\u0430\u0442\u044b \u0441\u043d\u0438\u0437\u0438\u043b\u0438\u0441\u044c, \u043e\u0441\u043e\u0431\u0435\u043d\u043d\u043e \u0432 \u00ab${topCategory?.[0] ?? '\u0433\u043b\u0430\u0432\u043d\u044b\u0445 \u043a\u0430\u0442\u0435\u0433\u043e\u0440\u0438\u044f\u0445'}\u00bb.`
        : `\u041d\u0435\u0434\u0435\u043b\u044f \u0432\u044b\u0433\u043b\u044f\u0434\u0438\u0442 \u0440\u043e\u0432\u043d\u043e: \u043e\u0441\u043d\u043e\u0432\u043d\u0430\u044f \u0434\u043e\u043b\u044f \u0442\u0440\u0430\u0442 \u043f\u0440\u0438\u0448\u043b\u0430\u0441\u044c \u043d\u0430 \u00ab${topCategory?.[0] ?? '\u0433\u043b\u0430\u0432\u043d\u044b\u0435 \u043a\u0430\u0442\u0435\u0433\u043e\u0440\u0438\u0438'}\u00bb.`;

  return {
    period_start: start.toISOString(),
    period_end: end.toISOString(),
    total_expense: totalExpense,
    previous_expense: previousExpense,
    delta_ratio: roundMoney(deltaRatio),
    transaction_count: current.length,
    top_category_name: topCategory?.[0] ?? null,
    top_category_amount: roundMoney(topCategory?.[1] ?? 0),
    top_merchant_name: topMerchant?.[0] ?? null,
    top_merchant_amount: roundMoney(topMerchant?.[1] ?? 0),
    summary,
  };
}

export function buildMerchantInsights(workspace: WorkspaceLike, month: string, limit = 4): MerchantInsight[] {
  const currentMonth = workspace.transactions.filter((transaction) => transaction.type === 'expense' && monthKey(transaction.occurred_at) === month);
  const date = new Date(`${month}-15T12:00:00`);
  const previousMonth = `${date.getMonth() === 0 ? date.getFullYear() - 1 : date.getFullYear()}-${String(date.getMonth() === 0 ? 12 : date.getMonth()).padStart(2, '0')}`;
  const previousMonthTransactions = workspace.transactions.filter((transaction) => transaction.type === 'expense' && monthKey(transaction.occurred_at) === previousMonth);

  const previousTotals = new Map<string, number>();
  for (const transaction of previousMonthTransactions) {
    const merchant = transaction.merchant || transaction.description || resolveCategoryName(transaction);
    previousTotals.set(merchant, (previousTotals.get(merchant) ?? 0) + transaction.amount);
  }

  const grouped = new Map<string, TransactionLike[]>();
  for (const transaction of currentMonth) {
    const merchant = transaction.merchant || transaction.description || resolveCategoryName(transaction);
    const bucket = grouped.get(merchant) ?? [];
    bucket.push(transaction);
    grouped.set(merchant, bucket);
  }

  return [...grouped.entries()]
    .map(([merchant, bucket]) => {
      const totalAmount = roundMoney(bucket.reduce((sum, transaction) => sum + transaction.amount, 0));
      const previousAmount = roundMoney(previousTotals.get(merchant) ?? 0);
      return {
        merchant_label: merchant,
        total_amount: totalAmount,
        average_amount: roundMoney(totalAmount / bucket.length),
        transaction_count: bucket.length,
        category_name: bucket[0]?.category?.name ?? null,
        previous_month_amount: previousAmount,
        delta_ratio: previousAmount > 0 ? roundMoney(((totalAmount - previousAmount) / previousAmount) * 100) : null,
        last_seen_at: [...bucket].sort((left, right) => new Date(right.occurred_at).getTime() - new Date(left.occurred_at).getTime())[0]?.occurred_at ?? new Date().toISOString(),
      } satisfies MerchantInsight;
    })
    .sort((left, right) => right.total_amount - left.total_amount)
    .slice(0, limit);
}
