import { useQueryClient } from '@tanstack/react-query';
import { useMemo, useState } from 'react';

import { useSessionQuery } from '../auth/api';
import { useFinanceSheet } from '../finance-sheet/useFinanceSheet';
import {
  useAutomationOverviewQuery,
  useDeleteQuickTemplateMutation,
  useDeleteSmartRuleMutation,
  useSaveQuickTemplateMutation,
  useSaveSmartRuleMutation,
  useToggleSmartRuleMutation,
} from './api';
import type { QuickTemplateInput, SmartRuleField, SmartRuleTransactionType } from './model';
import {
  ActionPill,
  BottomSheetScaffold,
  EmptyStateCard,
  ListCard,
  ListRow,
  PremiumStatTile,
  SectionHeader,
  StatusBadge,
  SurfaceCard,
} from '../../shared/ui/premium-kit';
import { SegmentedControl, TrashIcon } from '../../shared/ui/premium';
import { Skeleton } from '../../shared/ui/Skeleton';

type RuleFormState = {
  label: string;
  pattern: string;
  field: SmartRuleField;
  transaction_type: SmartRuleTransactionType;
  category_id: string;
};

type TemplateFormState = {
  label: string;
  type: 'expense' | 'income';
  amount: string;
  currency: string;
  category_id: string;
  merchant: string;
  description: string;
};

const DEFAULT_RULE: RuleFormState = {
  label: '',
  pattern: '',
  field: 'either',
  transaction_type: 'expense',
  category_id: '',
};

const DEFAULT_TEMPLATE: TemplateFormState = {
  label: '',
  type: 'expense',
  amount: '',
  currency: 'RUB',
  category_id: '',
  merchant: '',
  description: '',
};

export function AutomationActionSheet() {
  const queryClient = useQueryClient();
  const { closeSheet, isOpen, mode, openSheet } = useFinanceSheet();
  const sessionQuery = useSessionQuery();
  const overviewQuery = useAutomationOverviewQuery();
  const saveRuleMutation = useSaveSmartRuleMutation();
  const deleteRuleMutation = useDeleteSmartRuleMutation();
  const toggleRuleMutation = useToggleSmartRuleMutation();
  const saveTemplateMutation = useSaveQuickTemplateMutation();
  const deleteTemplateMutation = useDeleteQuickTemplateMutation();
  const [ruleForm, setRuleForm] = useState<RuleFormState>(DEFAULT_RULE);
  const [templateForm, setTemplateForm] = useState<TemplateFormState>(DEFAULT_TEMPLATE);
  const [ruleOpen, setRuleOpen] = useState(false);
  const [templateOpen, setTemplateOpen] = useState(false);

  const categories = useMemo(
    () => (sessionQuery.data?.categories ?? []).filter((category) => category.is_system),
    [sessionQuery.data?.categories],
  );

  const invalidate = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['intelligence'] }),
      queryClient.invalidateQueries({ queryKey: ['transactions'] }),
      queryClient.invalidateQueries({ queryKey: ['analytics'] }),
      queryClient.invalidateQueries({ queryKey: ['budgets'] }),
    ]);
  };

  const handleSaveRule = async () => {
    await saveRuleMutation.mutateAsync(ruleForm);
    await invalidate();
    setRuleForm(DEFAULT_RULE);
    setRuleOpen(false);
  };

  const handleSaveTemplate = async () => {
    const payload: QuickTemplateInput = {
      label: templateForm.label,
      type: templateForm.type,
      amount: templateForm.amount ? Number(templateForm.amount) : null,
      currency: templateForm.currency,
      category_id: templateForm.category_id || null,
      merchant: templateForm.merchant || null,
      description: templateForm.description || null,
    };

    await saveTemplateMutation.mutateAsync(payload);
    await invalidate();
    setTemplateForm(DEFAULT_TEMPLATE);
    setTemplateOpen(false);
  };

  if (!isOpen || mode !== 'automation') {
    return null;
  }

  const overview = overviewQuery.data;
  const isLoading = overviewQuery.isLoading || sessionQuery.isLoading;
  const canSaveRule = ruleForm.label.trim() && ruleForm.pattern.trim() && ruleForm.category_id;
  const canSaveTemplate = templateForm.label.trim();

  return (
    <BottomSheetScaffold
      eyebrow="Automation"
      title="Rules and templates"
      description="Let TrackDen handle the routine with auto-rules, reusable templates, and smart suggestions from history."
      onClose={closeSheet}
      footer={(
        <div className="flex gap-3">
          <button className="sheet-secondary-button" onClick={closeSheet} type="button">
            Automation
          </button>
        </div>
      )}
    >
      {isLoading ? (
        <div className="space-y-3">
          <Skeleton className="h-24 w-full rounded-[22px]" />
          <Skeleton className="h-24 w-full rounded-[22px]" />
          <Skeleton className="h-24 w-full rounded-[22px]" />
        </div>
      ) : (
        <>
          <div className="stat-grid">
            <PremiumStatTile hint="Active categorization rules" label="Rules" tone="accent" value={overview?.active_rule_count ?? 0} />
            <PremiumStatTile hint="Saved quick templates" label="Templates" tone="success" value={overview?.manual_template_count ?? 0} />
            <PremiumStatTile hint="Suggestions from history" label="Suggestions" tone="warning" value={overview?.suggested_template_count ?? 0} />
            <PremiumStatTile hint="Automation readiness" label="System" tone="neutral" value={overview && (overview.active_rule_count + overview.manual_template_count) > 0 ? 'Ready' : 'Empty'} />
          </div>

          <section className="space-y-3">
            <SectionHeader
               eyebrow="Auto-rules"
               title="Categorization that learns your flow"
               description="Example: whenever Netflix appears, move the purchase straight into subscriptions."
               action={<ActionPill onClick={() => setRuleOpen((current) => !current)} variant="ghost">{ruleOpen ? 'Hide form' : 'New rule'}</ActionPill>}
            />

            {ruleOpen ? (
              <SurfaceCard>
                <div className="space-y-3">
                  <input className="sheet-input" placeholder="Rule name" value={ruleForm.label} onChange={(event) => setRuleForm((current) => ({ ...current, label: event.target.value }))} />
                  <input className="sheet-input" placeholder="Phrase to match" value={ruleForm.pattern} onChange={(event) => setRuleForm((current) => ({ ...current, pattern: event.target.value }))} />
                  <div className="grid grid-cols-2 gap-3">
                    <select className="sheet-input" value={ruleForm.field} onChange={(event) => setRuleForm((current) => ({ ...current, field: event.target.value as SmartRuleField }))}>
                      <option value="either">Merchant or description</option>
                      <option value="merchant">Merchant only</option>
                      <option value="description">Description only</option>
                    </select>
                    <select className="sheet-input" value={ruleForm.transaction_type} onChange={(event) => setRuleForm((current) => ({ ...current, transaction_type: event.target.value as SmartRuleTransactionType }))}>
                      <option value="expense">Expense</option>
                      <option value="income">Income</option>
                      <option value="any">Any type</option>
                    </select>
                  </div>
                  <select className="sheet-input" value={ruleForm.category_id} onChange={(event) => setRuleForm((current) => ({ ...current, category_id: event.target.value }))}>
                    <option value="">Choose category</option>
                    {categories.map((category) => (
                      <option key={category.id} value={category.id}>{category.name}</option>
                    ))}
                  </select>
                  <button className="sheet-primary-button w-full" disabled={!canSaveRule || saveRuleMutation.isPending} onClick={() => void handleSaveRule()} type="button">
                    {saveRuleMutation.isPending ? 'Saving' : 'Save rule'}
                  </button>
                </div>
              </SurfaceCard>
            ) : null}

            {overview?.rules.length ? (
              overview.rules.map((rule) => {
                const category = categories.find((item) => item.id === rule.category_id);
                return (
                  <ListCard key={rule.id}>
                    <ListRow
                      title={rule.label}
                      subtitle={`Match ${rule.field === 'merchant' ? 'merchant' : rule.field === 'description' ? 'description' : 'merchant and description'} for "${rule.pattern}" ? ${category?.name ?? 'Uncategorized'}`}
                      trailing={(
                        <div className="flex items-center gap-2">
                          <StatusBadge tone={rule.active ? 'success' : 'neutral'}>{rule.active ? 'Active' : 'Paused'}</StatusBadge>
                          <ActionPill onClick={() => void (async () => { await toggleRuleMutation.mutateAsync({ id: rule.id, active: !rule.active }); await invalidate(); })()} variant="ghost">
                            {rule.active ? 'Disable' : 'Enable'}
                          </ActionPill>
                          <ActionPill onClick={() => void (async () => { await deleteRuleMutation.mutateAsync(rule.id); await invalidate(); })()} variant="danger">
                            <TrashIcon size={14} />
                          </ActionPill>
                        </div>
                      )}
                    />
                  </ListCard>
                );
              })
            ) : (
               <EmptyStateCard title="No rules yet" description="Add 2?3 clear rules for frequent expenses and TrackDen will start suggesting categories automatically." />
            )}
          </section>

          <section className="space-y-3">
            <SectionHeader
               eyebrow="Templates"
               title="Quick actions for the day"
               description="Save common expenses or income items so you can add them in a couple of taps."
               action={<ActionPill onClick={() => setTemplateOpen((current) => !current)} variant="ghost">{templateOpen ? 'Hide form' : 'New template'}</ActionPill>}
            />

            {templateOpen ? (
              <SurfaceCard>
                <div className="space-y-3">
                  <SegmentedControl
                    options={[{ label: 'Expense', value: 'expense' }, { label: 'Income', value: 'income' }]}
                    value={templateForm.type}
                    onChange={(value) => setTemplateForm((current) => ({ ...current, type: value }))}
                  />
                  <input className="sheet-input" placeholder="Template name" value={templateForm.label} onChange={(event) => setTemplateForm((current) => ({ ...current, label: event.target.value }))} />
                  <div className="grid grid-cols-[minmax(0,1fr)_88px] gap-3">
                    <input className="sheet-input" type="number" inputMode="decimal" placeholder="Amount (optional)" value={templateForm.amount} onChange={(event) => setTemplateForm((current) => ({ ...current, amount: event.target.value }))} />
                    <input className="sheet-input text-center uppercase" maxLength={3} value={templateForm.currency} onChange={(event) => setTemplateForm((current) => ({ ...current, currency: event.target.value.toUpperCase() }))} />
                  </div>
                  <select className="sheet-input" value={templateForm.category_id} onChange={(event) => setTemplateForm((current) => ({ ...current, category_id: event.target.value }))}>
                    <option value="">Uncategorized</option>
                    {categories.map((category) => (
                      <option key={category.id} value={category.id}>{category.name}</option>
                    ))}
                  </select>
                  <input className="sheet-input" placeholder="Merchant or seller" value={templateForm.merchant} onChange={(event) => setTemplateForm((current) => ({ ...current, merchant: event.target.value }))} />
                  <textarea className="sheet-input min-h-24 resize-none" placeholder="Transaction note" value={templateForm.description} onChange={(event) => setTemplateForm((current) => ({ ...current, description: event.target.value }))} />
                  <button className="sheet-primary-button w-full" disabled={!canSaveTemplate || saveTemplateMutation.isPending} onClick={() => void handleSaveTemplate()} type="button">
                    {saveTemplateMutation.isPending ? 'Saving' : 'Save template'}
                  </button>
                </div>
              </SurfaceCard>
            ) : null}

            {overview?.quick_templates.length ? (
              overview.quick_templates.map((template) => (
                <ListCard key={template.id}>
                  <ListRow
                    onClick={() => openSheet('add', { templateId: template.id })}
                    title={template.label}
                     subtitle={template.merchant || template.description || 'A reusable draft for quick entry.'}
                    trailing={(
                      <div className="flex items-center gap-2">
                         <StatusBadge tone="accent">{template.amount ? `${template.amount.toLocaleString('ru-RU')} ?` : 'No amount'}</StatusBadge>
                        <ActionPill onClick={() => void (async () => { await deleteTemplateMutation.mutateAsync(template.id); await invalidate(); })()} variant="danger">
                          <TrashIcon size={14} />
                        </ActionPill>
                      </div>
                    )}
                  />
                </ListCard>
              ))
            ) : (
               <EmptyStateCard title="No templates yet" description="Save 2?3 repeat operations and you will be able to re-add them in a single tap." />
            )}
          </section>

          <section className="space-y-3">
            <SectionHeader
               eyebrow="From history"
               title="TrackDen suggestions"
               description="These templates are generated automatically from similar operations in your history."
            />

            {overview?.suggested_templates.length ? (
              overview.suggested_templates.map((template) => (
                <ListCard key={template.id}>
                  <ListRow
                    onClick={() => openSheet('add', { templateId: template.id })}
                    title={template.label}
                    subtitle={`${template.use_count} uses ? ${template.merchant || template.description || 'frequent operation without a note'}`}
                    trailing={<StatusBadge tone="warning">Suggested</StatusBadge>}
                  />
                </ListCard>
              ))
            ) : (
               <EmptyStateCard title="No suggestions yet" description="As your history grows, TrackDen will start proposing quick templates from repeating operations." />
            )}
          </section>
        </>
      )}
    </BottomSheetScaffold>
  );
}
