import type { Category } from '../auth/api';
import type { TransactionType } from '../transactions/api';

export type SmartRuleField = 'merchant' | 'description' | 'either';
export type SmartRuleTransactionType = TransactionType | 'any';
export type ForecastStatus = 'safe' | 'attention' | 'risk';
export type QuickTemplateSource = 'manual' | 'learned';

export type SmartRule = {
  id: string;
  label: string;
  pattern: string;
  field: SmartRuleField;
  transaction_type: SmartRuleTransactionType;
  category_id: string;
  active: boolean;
  use_count: number;
  last_applied_at: string | null;
  created_at: string;
  updated_at: string;
};

export type SmartRuleInput = {
  id?: string | null;
  label: string;
  pattern: string;
  field: SmartRuleField;
  transaction_type: SmartRuleTransactionType;
  category_id: string;
  active?: boolean;
};

export type QuickTemplate = {
  id: string;
  label: string;
  type: TransactionType;
  amount: number | null;
  currency: string;
  category_id: string | null;
  merchant: string | null;
  description: string | null;
  source: QuickTemplateSource;
  pinned: boolean;
  use_count: number;
  last_used_at: string | null;
  created_at: string;
  updated_at: string;
};

export type QuickTemplateInput = {
  id?: string | null;
  label: string;
  type: TransactionType;
  amount?: number | null;
  currency?: string | null;
  category_id?: string | null;
  merchant?: string | null;
  description?: string | null;
  pinned?: boolean;
};

export type IntelligenceWorkspaceState = {
  smart_rules: SmartRule[];
  quick_templates: QuickTemplate[];
};

export type ForecastOverview = {
  month: string;
  actual_income: number;
  actual_expense: number;
  projected_income: number;
  projected_expense: number;
  projected_balance: number;
  flexible_pace_per_day: number;
  fixed_upcoming: number;
  days_elapsed: number;
  days_in_month: number;
  remaining_days: number;
  budget_limit: number | null;
  budget_gap: number | null;
  status: ForecastStatus;
  summary: string;
};

export type WeeklyReview = {
  period_start: string;
  period_end: string;
  total_expense: number;
  previous_expense: number;
  delta_ratio: number;
  transaction_count: number;
  top_category_name: string | null;
  top_category_amount: number;
  top_merchant_name: string | null;
  top_merchant_amount: number;
  summary: string;
};

export type MerchantInsight = {
  merchant_label: string;
  total_amount: number;
  average_amount: number;
  transaction_count: number;
  category_name: string | null;
  previous_month_amount: number;
  delta_ratio: number | null;
  last_seen_at: string;
};

export type AutomationOverview = {
  rules: SmartRule[];
  quick_templates: QuickTemplate[];
  suggested_templates: QuickTemplate[];
  active_rule_count: number;
  manual_template_count: number;
  suggested_template_count: number;
};

function normalizePositiveNumber(value: unknown) {
  const normalized = Number(value);
  return Number.isFinite(normalized) && normalized > 0 ? Math.round(normalized * 100) / 100 : null;
}

function normalizeOptionalString(value: unknown) {
  if (typeof value !== 'string') {
    return null;
  }

  const trimmed = value.trim();
  return trimmed || null;
}

function normalizeLabel(value: unknown, fallback: string) {
  if (typeof value !== 'string') {
    return fallback;
  }

  const trimmed = value.trim();
  return trimmed || fallback;
}

function normalizeCurrency(value: unknown) {
  if (typeof value !== 'string') {
    return 'RUB';
  }

  const trimmed = value.trim().toUpperCase();
  return trimmed || 'RUB';
}

function normalizeRuleField(value: unknown): SmartRuleField {
  return value === 'merchant' || value === 'description' ? value : 'either';
}

function normalizeRuleTransactionType(value: unknown): SmartRuleTransactionType {
  return value === 'expense' || value === 'income' ? value : 'any';
}

function normalizeTemplateSource(value: unknown): QuickTemplateSource {
  return value === 'learned' ? 'learned' : 'manual';
}

function isAllowedCategoryId(categoryId: string | null, categories: Category[]) {
  if (!categoryId) {
    return false;
  }

  return categories.some((category) => category.id === categoryId);
}

export function createEmptyIntelligenceState(): IntelligenceWorkspaceState {
  return {
    smart_rules: [],
    quick_templates: [],
  };
}

export function normalizeIntelligenceState(
  state: Partial<IntelligenceWorkspaceState> | IntelligenceWorkspaceState | null | undefined,
  categories: Category[] = [],
): IntelligenceWorkspaceState {
  if (!state) {
    return createEmptyIntelligenceState();
  }

  const rulesSeen = new Set<string>();
  const templatesSeen = new Set<string>();
  const smartRules: SmartRule[] = [];
  const quickTemplates: QuickTemplate[] = [];

  for (const rawRule of Array.isArray(state.smart_rules) ? state.smart_rules : []) {
    if (!rawRule || typeof rawRule !== 'object') {
      continue;
    }

    const id = normalizeOptionalString(rawRule.id);
    const pattern = normalizeOptionalString(rawRule.pattern);
    const categoryId = normalizeOptionalString(rawRule.category_id);
    if (!id || !pattern || !categoryId || rulesSeen.has(id) || !isAllowedCategoryId(categoryId, categories)) {
      continue;
    }

    rulesSeen.add(id);
    smartRules.push({
      id,
      label: normalizeLabel(rawRule.label, pattern),
      pattern,
      field: normalizeRuleField(rawRule.field),
      transaction_type: normalizeRuleTransactionType(rawRule.transaction_type),
      category_id: categoryId,
      active: rawRule.active !== false,
      use_count: Math.max(0, Math.round(Number(rawRule.use_count) || 0)),
      last_applied_at: normalizeOptionalString(rawRule.last_applied_at),
      created_at: normalizeOptionalString(rawRule.created_at) ?? new Date().toISOString(),
      updated_at: normalizeOptionalString(rawRule.updated_at) ?? new Date().toISOString(),
    });
  }

  for (const rawTemplate of Array.isArray(state.quick_templates) ? state.quick_templates : []) {
    if (!rawTemplate || typeof rawTemplate !== 'object') {
      continue;
    }

    const id = normalizeOptionalString(rawTemplate.id);
    if (!id || templatesSeen.has(id)) {
      continue;
    }

    templatesSeen.add(id);
    const categoryId = normalizeOptionalString(rawTemplate.category_id);
    quickTemplates.push({
      id,
      label: normalizeLabel(rawTemplate.label, '??????? ??????'),
      type: rawTemplate.type === 'income' ? 'income' : 'expense',
      amount: normalizePositiveNumber(rawTemplate.amount),
      currency: normalizeCurrency(rawTemplate.currency),
      category_id: categoryId && isAllowedCategoryId(categoryId, categories) ? categoryId : null,
      merchant: normalizeOptionalString(rawTemplate.merchant),
      description: normalizeOptionalString(rawTemplate.description),
      source: normalizeTemplateSource(rawTemplate.source),
      pinned: rawTemplate.pinned !== false,
      use_count: Math.max(0, Math.round(Number(rawTemplate.use_count) || 0)),
      last_used_at: normalizeOptionalString(rawTemplate.last_used_at),
      created_at: normalizeOptionalString(rawTemplate.created_at) ?? new Date().toISOString(),
      updated_at: normalizeOptionalString(rawTemplate.updated_at) ?? new Date().toISOString(),
    });
  }

  return {
    smart_rules: smartRules.sort((left, right) => Number(right.active) - Number(left.active) || right.use_count - left.use_count),
    quick_templates: quickTemplates
      .filter((template) => template.source === 'manual')
      .sort((left, right) => Number(right.pinned) - Number(left.pinned) || right.use_count - left.use_count),
  };
}
