import type { Category } from '../../features/auth/api';
import { createEmptyBudgetConfig, getBudgetStatus, listBudgetableCategories, normalizeBudgetConfig, type BudgetConfig, type BudgetOverview, type BudgetProgress, type CategoryBudgetOverview } from '../../features/budgets/model';
import { getLocalWorkspaceContext, writeWorkspace } from './localApi';

function monthKeyFromIso(value: string) {
  return value.slice(0, 7);
}

function buildBudgetProgress(spent: number, enabled: boolean, limit: number | null): BudgetProgress {
  if (!enabled || limit == null || limit <= 0) {
    return {
      enabled: false,
      limit: null,
      spent,
      remaining: null,
      ratio: 0,
      status: 'inactive',
    };
  }

  const ratio = spent / limit;
  return {
    enabled: true,
    limit,
    spent,
    remaining: limit - spent,
    ratio,
    status: getBudgetStatus(ratio, true),
  };
}

function buildSpentByCategory(month: string, transactions: Array<{ amount: number; category_id?: string | null; occurred_at: string; type: string }>) {
  const totals = new Map<string, number>();

  for (const transaction of transactions) {
    if (transaction.type !== 'expense' || monthKeyFromIso(transaction.occurred_at) !== month) {
      continue;
    }

    if (!transaction.category_id) {
      continue;
    }

    totals.set(transaction.category_id, (totals.get(transaction.category_id) ?? 0) + transaction.amount);
  }

  return totals;
}

function countConfiguredBudgets(config: BudgetConfig) {
  const categoryCount = config.categories.filter((category) => category.enabled && category.amount > 0).length;
  return categoryCount + (config.overall_enabled && config.overall_amount ? 1 : 0);
}

function buildCategoryOverview(category: Category, spent: number, config: { amount: number; enabled: boolean }): CategoryBudgetOverview {
  const progress = buildBudgetProgress(spent, config.enabled, config.amount || null);

  return {
    category_id: category.id,
    category_name: category.name,
    color: category.color ?? null,
    ...progress,
  };
}

export function getBudgetConfig(initDataRaw?: string) {
  const { workspace } = getLocalWorkspaceContext(initDataRaw);
  return normalizeBudgetConfig(workspace.budgets, workspace.categories);
}

export function saveBudgetConfig(config: BudgetConfig, initDataRaw?: string) {
  const { principal, workspace } = getLocalWorkspaceContext(initDataRaw);
  const normalized = {
    ...normalizeBudgetConfig(config, workspace.categories),
    updated_at: new Date().toISOString(),
  } satisfies BudgetConfig;

  writeWorkspace(principal.scopeId, {
    ...workspace,
    budgets: normalized,
  });

  return normalized;
}

export function getBudgetOverview(month: string, initDataRaw?: string): BudgetOverview {
  const { workspace } = getLocalWorkspaceContext(initDataRaw);
  const config = normalizeBudgetConfig(workspace.budgets, workspace.categories);
  const budgetableCategories = listBudgetableCategories(workspace.categories);
  const configuredCategories = config.categories.filter((category) => category.enabled && category.amount > 0);
  const spentByCategory = buildSpentByCategory(month, workspace.transactions);
  const totalSpent = workspace.transactions
    .filter((transaction) => transaction.type === 'expense' && monthKeyFromIso(transaction.occurred_at) === month)
    .reduce((sum, transaction) => sum + transaction.amount, 0);

  const categoryOverview = configuredCategories
    .map((categoryConfig) => {
      const category = budgetableCategories.find((item) => item.id === categoryConfig.category_id);
      if (!category) {
        return null;
      }

      return buildCategoryOverview(category, spentByCategory.get(category.id) ?? 0, categoryConfig);
    })
    .filter((item): item is CategoryBudgetOverview => item !== null)
    .sort((left, right) => {
      if (right.ratio !== left.ratio) {
        return right.ratio - left.ratio;
      }

      return right.spent - left.spent;
    });

  const overall = buildBudgetProgress(totalSpent, config.overall_enabled, config.overall_amount);
  const warningCount = categoryOverview.filter((item) => item.status === 'warning').length + (overall.status === 'warning' ? 1 : 0);
  const exceededCount = categoryOverview.filter((item) => item.status === 'exceeded').length + (overall.status === 'exceeded' ? 1 : 0);

  return {
    month,
    overall,
    categories: categoryOverview,
    highlighted: categoryOverview.slice(0, 3),
    configured_count: countConfiguredBudgets(config),
    warning_count: warningCount,
    exceeded_count: exceededCount,
  };
}

export function getEmptyBudgetConfig() {
  return createEmptyBudgetConfig();
}

