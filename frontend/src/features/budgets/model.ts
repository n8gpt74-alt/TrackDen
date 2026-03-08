import type { Category } from '../auth/api';

export const BUDGET_WARNING_RATIO = 0.8;
export const BUDGET_WORKSPACE_VERSION = 3;

const EXCLUDED_CATEGORY_IDS = new Set(['system-salary']);

export type BudgetStatus = 'inactive' | 'normal' | 'warning' | 'exceeded';

export type CategoryBudgetConfig = {
  category_id: string;
  amount: number;
  enabled: boolean;
};

export type BudgetConfig = {
  overall_enabled: boolean;
  overall_amount: number | null;
  categories: CategoryBudgetConfig[];
  updated_at: string | null;
};

export type BudgetProgress = {
  enabled: boolean;
  limit: number | null;
  spent: number;
  remaining: number | null;
  ratio: number;
  status: BudgetStatus;
};

export type CategoryBudgetOverview = BudgetProgress & {
  category_id: string;
  category_name: string;
  color?: string | null;
};

export type BudgetOverview = {
  month: string;
  overall: BudgetProgress;
  categories: CategoryBudgetOverview[];
  highlighted: CategoryBudgetOverview[];
  configured_count: number;
  warning_count: number;
  exceeded_count: number;
};

function toPositiveNumber(value: unknown) {
  const normalized = Number(value);
  return Number.isFinite(normalized) && normalized > 0 ? normalized : null;
}

export function isBudgetableCategory(category: Category) {
  return category.is_system && !EXCLUDED_CATEGORY_IDS.has(category.id);
}

export function listBudgetableCategories(categories: Category[]) {
  return categories.filter(isBudgetableCategory);
}

export function createEmptyBudgetConfig(): BudgetConfig {
  return {
    overall_enabled: false,
    overall_amount: null,
    categories: [],
    updated_at: null,
  };
}

export function getBudgetStatus(ratio: number, enabled: boolean): BudgetStatus {
  if (!enabled) {
    return 'inactive';
  }

  if (ratio >= 1) {
    return 'exceeded';
  }

  if (ratio >= BUDGET_WARNING_RATIO) {
    return 'warning';
  }

  return 'normal';
}

export function normalizeBudgetConfig(config: Partial<BudgetConfig> | BudgetConfig | null | undefined, categories: Category[] = []): BudgetConfig {
  const base = createEmptyBudgetConfig();
  if (!config) {
    return base;
  }

  const allowedIds = new Set(listBudgetableCategories(categories).map((category) => category.id));
  const seen = new Set<string>();
  const normalizedCategories: CategoryBudgetConfig[] = [];

  for (const rawCategory of Array.isArray(config.categories) ? config.categories : []) {
    if (!rawCategory || typeof rawCategory !== 'object') {
      continue;
    }

    const categoryId = typeof rawCategory.category_id === 'string' ? rawCategory.category_id : null;
    if (!categoryId || (allowedIds.size > 0 && !allowedIds.has(categoryId)) || seen.has(categoryId)) {
      continue;
    }

    seen.add(categoryId);
    normalizedCategories.push({
      category_id: categoryId,
      amount: toPositiveNumber(rawCategory.amount) ?? 0,
      enabled: Boolean(rawCategory.enabled),
    });
  }

  const overallAmount = toPositiveNumber(config.overall_amount);

  return {
    overall_enabled: Boolean(config.overall_enabled) && overallAmount !== null,
    overall_amount: overallAmount,
    categories: normalizedCategories,
    updated_at: typeof config.updated_at === 'string' ? config.updated_at : null,
  };
}
