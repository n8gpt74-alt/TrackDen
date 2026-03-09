import { ApiError } from './errors';
import { getLocalWorkspaceContext, type WorkspaceState, writeWorkspace } from './localApi';
import {
  buildAutomationOverview,
  buildForecastOverview,
  buildMerchantInsights,
  buildWeeklyReview,
} from '../../features/intelligence/engine';
import {
  normalizeIntelligenceState,
  type QuickTemplate,
  type QuickTemplateInput,
  type SmartRuleInput,
} from '../../features/intelligence/model';

function createId() {
  return globalThis.crypto?.randomUUID?.() ?? `local-${Math.random().toString(36).slice(2)}-${Date.now()}`;
}

function roundMoney(value: number | null | undefined) {
  if (value == null) {
    return null;
  }

  return Math.round(value * 100) / 100;
}

function ensureCategoryExists(workspace: WorkspaceState, categoryId: string | null | undefined) {
  if (!categoryId || !workspace.categories.some((category) => category.id === categoryId)) {
    throw new ApiError({
      code: 'category_not_found',
      message: '\u0412 \u044d\u0442\u043e\u043c \u043f\u0440\u043e\u0444\u0438\u043b\u0435 \u043d\u0435\u0442 \u0442\u0430\u043a\u043e\u0439 \u043a\u0430\u0442\u0435\u0433\u043e\u0440\u0438\u0438.',
    });
  }
}

function ensurePattern(value: string, message: string) {
  const trimmed = value.trim();
  if (!trimmed) {
    throw new ApiError({
      code: 'invalid_payload',
      message,
    });
  }

  return trimmed;
}

function normalizeWorkspaceIntelligence(workspace: WorkspaceState) {
  const state = normalizeIntelligenceState(workspace, workspace.categories);
  workspace.smart_rules = state.smart_rules;
  workspace.quick_templates = state.quick_templates;
}

export function getAutomationOverview(initDataRaw?: string) {
  const { workspace } = getLocalWorkspaceContext(initDataRaw);
  normalizeWorkspaceIntelligence(workspace);
  return buildAutomationOverview(workspace);
}

export function getForecastOverview(month: string, initDataRaw?: string) {
  const { workspace } = getLocalWorkspaceContext(initDataRaw);
  normalizeWorkspaceIntelligence(workspace);
  return buildForecastOverview(workspace, month);
}

export function getWeeklyReview(initDataRaw?: string) {
  const { workspace } = getLocalWorkspaceContext(initDataRaw);
  normalizeWorkspaceIntelligence(workspace);
  return buildWeeklyReview(workspace);
}

export function getMerchantInsights(month: string, initDataRaw?: string) {
  const { workspace } = getLocalWorkspaceContext(initDataRaw);
  normalizeWorkspaceIntelligence(workspace);
  return buildMerchantInsights(workspace, month);
}

export function getQuickTemplateById(id: string, initDataRaw?: string): QuickTemplate | null {
  const { workspace } = getLocalWorkspaceContext(initDataRaw);
  normalizeWorkspaceIntelligence(workspace);
  const automation = buildAutomationOverview(workspace);
  return automation.quick_templates.find((template) => template.id === id)
    ?? automation.suggested_templates.find((template) => template.id === id)
    ?? null;
}

export async function saveSmartRule(input: SmartRuleInput, initDataRaw?: string) {
  const { principal, workspace } = getLocalWorkspaceContext(initDataRaw);
  normalizeWorkspaceIntelligence(workspace);
  ensureCategoryExists(workspace, input.category_id);

  const now = new Date().toISOString();
  const nextRecord = {
    id: input.id ?? createId(),
    label: ensurePattern(input.label, '\u0412\u0432\u0435\u0434\u0438 \u043d\u0430\u0437\u0432\u0430\u043d\u0438\u0435 \u043f\u0440\u0430\u0432\u0438\u043b\u0430.'),
    pattern: ensurePattern(input.pattern, '\u0412\u0432\u0435\u0434\u0438 \u0444\u0440\u0430\u0437\u0443 \u0434\u043b\u044f \u0441\u043e\u0432\u043f\u0430\u0434\u0435\u043d\u0438\u044f.'),
    field: input.field,
    transaction_type: input.transaction_type,
    category_id: input.category_id,
    active: input.active !== false,
    use_count: workspace.smart_rules.find((rule) => rule.id === input.id)?.use_count ?? 0,
    last_applied_at: workspace.smart_rules.find((rule) => rule.id === input.id)?.last_applied_at ?? null,
    created_at: workspace.smart_rules.find((rule) => rule.id === input.id)?.created_at ?? now,
    updated_at: now,
  };

  workspace.smart_rules = [
    ...workspace.smart_rules.filter((rule) => rule.id !== nextRecord.id),
    nextRecord,
  ];

  const saved = writeWorkspace(principal.scopeId, workspace);
  return saved.smart_rules.find((rule) => rule.id === nextRecord.id) ?? nextRecord;
}

export async function toggleSmartRule(id: string, active: boolean, initDataRaw?: string) {
  const { principal, workspace } = getLocalWorkspaceContext(initDataRaw);
  normalizeWorkspaceIntelligence(workspace);
  const current = workspace.smart_rules.find((rule) => rule.id === id);
  if (!current) {
    throw new ApiError({
      code: 'rule_not_found',
      message: '\u041f\u0440\u0430\u0432\u0438\u043b\u043e \u043d\u0435 \u043d\u0430\u0439\u0434\u0435\u043d\u043e.',
    });
  }

  workspace.smart_rules = workspace.smart_rules.map((rule) => (
    rule.id === id
      ? { ...rule, active, updated_at: new Date().toISOString() }
      : rule
  ));

  const saved = writeWorkspace(principal.scopeId, workspace);
  return saved.smart_rules.find((rule) => rule.id === id) ?? null;
}

export async function deleteSmartRule(id: string, initDataRaw?: string) {
  const { principal, workspace } = getLocalWorkspaceContext(initDataRaw);
  normalizeWorkspaceIntelligence(workspace);
  workspace.smart_rules = workspace.smart_rules.filter((rule) => rule.id !== id);
  writeWorkspace(principal.scopeId, workspace);
}

export async function saveQuickTemplate(input: QuickTemplateInput, initDataRaw?: string) {
  const { principal, workspace } = getLocalWorkspaceContext(initDataRaw);
  normalizeWorkspaceIntelligence(workspace);
  const now = new Date().toISOString();
  if (input.category_id) {
    ensureCategoryExists(workspace, input.category_id);
  }

  const current = workspace.quick_templates.find((template) => template.id === input.id) ?? null;
  const nextRecord: QuickTemplate = {
    id: input.id ?? createId(),
    label: ensurePattern(input.label, '\u0412\u0432\u0435\u0434\u0438 \u043d\u0430\u0437\u0432\u0430\u043d\u0438\u0435 \u0448\u0430\u0431\u043b\u043e\u043d\u0430.'),
    type: input.type,
    amount: roundMoney(input.amount),
    currency: (input.currency ?? current?.currency ?? 'RUB').trim().toUpperCase() || 'RUB',
    category_id: input.category_id ?? null,
    merchant: input.merchant?.trim() || null,
    description: input.description?.trim() || null,
    source: 'manual',
    pinned: input.pinned !== false,
    use_count: current?.use_count ?? 0,
    last_used_at: current?.last_used_at ?? null,
    created_at: current?.created_at ?? now,
    updated_at: now,
  };

  workspace.quick_templates = [
    ...workspace.quick_templates.filter((template) => template.id !== nextRecord.id),
    nextRecord,
  ];

  const saved = writeWorkspace(principal.scopeId, workspace);
  return saved.quick_templates.find((template) => template.id === nextRecord.id) ?? nextRecord;
}

export async function deleteQuickTemplate(id: string, initDataRaw?: string) {
  const { principal, workspace } = getLocalWorkspaceContext(initDataRaw);
  normalizeWorkspaceIntelligence(workspace);
  workspace.quick_templates = workspace.quick_templates.filter((template) => template.id !== id);
  writeWorkspace(principal.scopeId, workspace);
}

export async function markQuickTemplateUsed(id: string, initDataRaw?: string) {
  const { principal, workspace } = getLocalWorkspaceContext(initDataRaw);
  normalizeWorkspaceIntelligence(workspace);
  const now = new Date().toISOString();
  workspace.quick_templates = workspace.quick_templates.map((template) => (
    template.id === id
      ? { ...template, use_count: template.use_count + 1, last_used_at: now, updated_at: now }
      : template
  ));
  const saved = writeWorkspace(principal.scopeId, workspace);
  return saved.quick_templates.find((template) => template.id === id) ?? null;
}
