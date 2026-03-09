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
import { UI_TEXT } from '../../shared/i18n/ui';

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
      eyebrow={UI_TEXT.common.automation}
      title="\u041f\u0440\u0430\u0432\u0438\u043b\u0430 \u0438 \u0448\u0430\u0431\u043b\u043e\u043d\u044b"
      description="\u041f\u0443\u0441\u0442\u044c TrackDen \u0431\u0435\u0440\u0451\u0442 \u0440\u0443\u0442\u0438\u043d\u0443 \u043d\u0430 \u0441\u0435\u0431\u044f: \u0430\u0432\u0442\u043e\u043f\u0440\u0430\u0432\u0438\u043b\u0430, \u043f\u043e\u0432\u0442\u043e\u0440\u044f\u0435\u043c\u044b\u0435 \u0448\u0430\u0431\u043b\u043e\u043d\u044b \u0438 \u0443\u043c\u043d\u044b\u0435 \u043f\u043e\u0434\u0441\u043a\u0430\u0437\u043a\u0438 \u0438\u0437 \u0438\u0441\u0442\u043e\u0440\u0438\u0438."
      onClose={closeSheet}
      footer={<div className="flex gap-3"><button className="sheet-secondary-button" onClick={closeSheet} type="button">{UI_TEXT.common.close}</button></div>}
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
            <PremiumStatTile hint="\u0410\u043a\u0442\u0438\u0432\u043d\u044b\u0435 \u043f\u0440\u0430\u0432\u0438\u043b\u0430 \u043a\u0430\u0442\u0435\u0433\u043e\u0440\u0438\u0437\u0430\u0446\u0438\u0438" label={UI_TEXT.common.rules} tone="accent" value={overview?.active_rule_count ?? 0} />
            <PremiumStatTile hint="\u0421\u043e\u0445\u0440\u0430\u043d\u0451\u043d\u043d\u044b\u0435 \u0431\u044b\u0441\u0442\u0440\u044b\u0435 \u0448\u0430\u0431\u043b\u043e\u043d\u044b" label={UI_TEXT.common.templates} tone="success" value={overview?.manual_template_count ?? 0} />
            <PremiumStatTile hint="\u041f\u043e\u0434\u0441\u043a\u0430\u0437\u043a\u0438 \u0438\u0437 \u0438\u0441\u0442\u043e\u0440\u0438\u0438" label={UI_TEXT.common.suggestions} tone="warning" value={overview?.suggested_template_count ?? 0} />
            <PremiumStatTile hint="\u0413\u043e\u0442\u043e\u0432\u043d\u043e\u0441\u0442\u044c \u0441\u0438\u0441\u0442\u0435\u043c\u044b" label="\u0421\u0438\u0441\u0442\u0435\u043c\u0430" tone="neutral" value={overview && (overview.active_rule_count + overview.manual_template_count) > 0 ? '\u0413\u043e\u0442\u043e\u0432\u043e' : '\u041f\u0443\u0441\u0442\u043e'} />
          </div>

          <section className="space-y-3">
            <SectionHeader
              eyebrow="\u0410\u0432\u0442\u043e\u043f\u0440\u0430\u0432\u0438\u043b\u0430"
              title="\u041a\u0430\u0442\u0435\u0433\u043e\u0440\u0438\u0437\u0430\u0446\u0438\u044f, \u043a\u043e\u0442\u043e\u0440\u0430\u044f \u0437\u043d\u0430\u0435\u0442 \u0442\u0432\u043e\u0439 \u0440\u0438\u0442\u043c"
              description="\u041d\u0430\u043f\u0440\u0438\u043c\u0435\u0440: \u0435\u0441\u043b\u0438 \u0432 \u043e\u043f\u0435\u0440\u0430\u0446\u0438\u0438 \u0432\u0441\u0442\u0440\u0435\u0447\u0430\u0435\u0442\u0441\u044f Netflix, \u043f\u0435\u0440\u0435\u043d\u043e\u0441\u0438 \u0435\u0451 \u043f\u0440\u044f\u043c\u043e \u0432 \u043f\u043e\u0434\u043f\u0438\u0441\u043a\u0438."
              action={<ActionPill onClick={() => setRuleOpen((current) => !current)} variant="ghost">{ruleOpen ? '\u0421\u043a\u0440\u044b\u0442\u044c \u0444\u043e\u0440\u043c\u0443' : '\u041d\u043e\u0432\u043e\u0435 \u043f\u0440\u0430\u0432\u0438\u043b\u043e'}</ActionPill>}
            />

            {ruleOpen ? (
              <SurfaceCard>
                <div className="space-y-3">
                  <input className="sheet-input" placeholder="\u041d\u0430\u0437\u0432\u0430\u043d\u0438\u0435 \u043f\u0440\u0430\u0432\u0438\u043b\u0430" value={ruleForm.label} onChange={(event) => setRuleForm((current) => ({ ...current, label: event.target.value }))} />
                  <input className="sheet-input" placeholder="\u0424\u0440\u0430\u0437\u0430 \u0434\u043b\u044f \u0441\u043e\u0432\u043f\u0430\u0434\u0435\u043d\u0438\u044f" value={ruleForm.pattern} onChange={(event) => setRuleForm((current) => ({ ...current, pattern: event.target.value }))} />
                  <div className="grid grid-cols-2 gap-3">
                    <select className="sheet-input" value={ruleForm.field} onChange={(event) => setRuleForm((current) => ({ ...current, field: event.target.value as SmartRuleField }))}>
                      <option value="either">\u041f\u0440\u043e\u0434\u0430\u0432\u0435\u0446 \u0438\u043b\u0438 \u043e\u043f\u0438\u0441\u0430\u043d\u0438\u0435</option>
                      <option value="merchant">\u0422\u043e\u043b\u044c\u043a\u043e \u043f\u0440\u043e\u0434\u0430\u0432\u0435\u0446</option>
                      <option value="description">\u0422\u043e\u043b\u044c\u043a\u043e \u043e\u043f\u0438\u0441\u0430\u043d\u0438\u0435</option>
                    </select>
                    <select className="sheet-input" value={ruleForm.transaction_type} onChange={(event) => setRuleForm((current) => ({ ...current, transaction_type: event.target.value as SmartRuleTransactionType }))}>
                      <option value="expense">{UI_TEXT.common.expense}</option>
                      <option value="income">{UI_TEXT.common.income}</option>
                      <option value="any">\u041b\u044e\u0431\u043e\u0439 \u0442\u0438\u043f</option>
                    </select>
                  </div>
                  <select className="sheet-input" value={ruleForm.category_id} onChange={(event) => setRuleForm((current) => ({ ...current, category_id: event.target.value }))}>
                    <option value="">\u0412\u044b\u0431\u0435\u0440\u0438 \u043a\u0430\u0442\u0435\u0433\u043e\u0440\u0438\u044e</option>
                    {categories.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}
                  </select>
                  <button className="sheet-primary-button w-full" disabled={!canSaveRule || saveRuleMutation.isPending} onClick={() => void handleSaveRule()} type="button">{saveRuleMutation.isPending ? '\u0421\u043e\u0445\u0440\u0430\u043d\u044f\u0435\u043c\u2026' : '\u0421\u043e\u0445\u0440\u0430\u043d\u0438\u0442\u044c \u043f\u0440\u0430\u0432\u0438\u043b\u043e'}</button>
                </div>
              </SurfaceCard>
            ) : null}

            {overview?.rules.length ? overview.rules.map((rule) => {
              const category = categories.find((item) => item.id === rule.category_id);
              const fieldLabel = rule.field === 'merchant' ? '\u043f\u0440\u043e\u0434\u0430\u0432\u0435\u0446' : rule.field === 'description' ? '\u043e\u043f\u0438\u0441\u0430\u043d\u0438\u0435' : '\u043f\u0440\u043e\u0434\u0430\u0432\u0435\u0446 \u0438\u043b\u0438 \u043e\u043f\u0438\u0441\u0430\u043d\u0438\u0435';
              return (
                <ListCard key={rule.id}>
                  <ListRow
                    title={rule.label}
                    subtitle={`\u0415\u0441\u043b\u0438 \u0432 \u043f\u043e\u043b\u0435 \u00ab${fieldLabel}\u00bb \u0432\u0441\u0442\u0440\u0435\u0447\u0430\u0435\u0442\u0441\u044f \u00ab${rule.pattern}\u00bb, \u0441\u0442\u0430\u0432\u0438\u043c ${category?.name ?? UI_TEXT.common.uncategorized}.`}
                    trailing={<div className="flex items-center gap-2"><StatusBadge tone={rule.active ? 'success' : 'neutral'}>{rule.active ? '\u0410\u043a\u0442\u0438\u0432\u043d\u043e' : '\u041d\u0430 \u043f\u0430\u0443\u0437\u0435'}</StatusBadge><ActionPill onClick={() => void (async () => { await toggleRuleMutation.mutateAsync({ id: rule.id, active: !rule.active }); await invalidate(); })()} variant="ghost">{rule.active ? '\u0412\u044b\u043a\u043b\u044e\u0447\u0438\u0442\u044c' : '\u0412\u043a\u043b\u044e\u0447\u0438\u0442\u044c'}</ActionPill><ActionPill onClick={() => void (async () => { await deleteRuleMutation.mutateAsync(rule.id); await invalidate(); })()} variant="danger"><TrashIcon size={14} /></ActionPill></div>}
                  />
                </ListCard>
              );
            }) : <EmptyStateCard title="\u041f\u0440\u0430\u0432\u0438\u043b \u043f\u043e\u043a\u0430 \u043d\u0435\u0442" description="\u0414\u043e\u0431\u0430\u0432\u044c 2\u20133 \u043f\u043e\u043d\u044f\u0442\u043d\u044b\u0445 \u043f\u0440\u0430\u0432\u0438\u043b\u0430 \u0434\u043b\u044f \u0447\u0430\u0441\u0442\u044b\u0445 \u0442\u0440\u0430\u0442, \u0438 TrackDen \u043d\u0430\u0447\u043d\u0451\u0442 \u043f\u043e\u0434\u0441\u043a\u0430\u0437\u044b\u0432\u0430\u0442\u044c \u043a\u0430\u0442\u0435\u0433\u043e\u0440\u0438\u0438 \u0441\u0430\u043c." />}
          </section>

          <section className="space-y-3">
            <SectionHeader eyebrow={UI_TEXT.common.templates} title="\u0411\u044b\u0441\u0442\u0440\u044b\u0435 \u0434\u0435\u0439\u0441\u0442\u0432\u0438\u044f \u043d\u0430 \u043a\u0430\u0436\u0434\u044b\u0439 \u0434\u0435\u043d\u044c" description="\u0421\u043e\u0445\u0440\u0430\u043d\u0438 \u0447\u0430\u0441\u0442\u044b\u0435 \u0442\u0440\u0430\u0442\u044b \u0438\u043b\u0438 \u0434\u043e\u0445\u043e\u0434\u044b, \u0447\u0442\u043e\u0431\u044b \u0434\u043e\u0431\u0430\u0432\u043b\u044f\u0442\u044c \u0438\u0445 \u0432 \u043f\u0430\u0440\u0443 \u0442\u0430\u043f\u043e\u0432." action={<ActionPill onClick={() => setTemplateOpen((current) => !current)} variant="ghost">{templateOpen ? '\u0421\u043a\u0440\u044b\u0442\u044c \u0444\u043e\u0440\u043c\u0443' : '\u041d\u043e\u0432\u044b\u0439 \u0448\u0430\u0431\u043b\u043e\u043d'}</ActionPill>} />

            {templateOpen ? <SurfaceCard><div className="space-y-3"><SegmentedControl options={[{ label: UI_TEXT.common.expense, value: 'expense' }, { label: UI_TEXT.common.income, value: 'income' }]} value={templateForm.type} onChange={(value) => setTemplateForm((current) => ({ ...current, type: value }))} /><input className="sheet-input" placeholder="\u041d\u0430\u0437\u0432\u0430\u043d\u0438\u0435 \u0448\u0430\u0431\u043b\u043e\u043d\u0430" value={templateForm.label} onChange={(event) => setTemplateForm((current) => ({ ...current, label: event.target.value }))} /><div className="grid grid-cols-[minmax(0,1fr)_88px] gap-3"><input className="sheet-input" type="number" inputMode="decimal" placeholder="\u0421\u0443\u043c\u043c\u0430 (\u043d\u0435\u043e\u0431\u044f\u0437\u0430\u0442\u0435\u043b\u044c\u043d\u043e)" value={templateForm.amount} onChange={(event) => setTemplateForm((current) => ({ ...current, amount: event.target.value }))} /><input className="sheet-input text-center uppercase" maxLength={3} value={templateForm.currency} onChange={(event) => setTemplateForm((current) => ({ ...current, currency: event.target.value.toUpperCase() }))} /></div><select className="sheet-input" value={templateForm.category_id} onChange={(event) => setTemplateForm((current) => ({ ...current, category_id: event.target.value }))}><option value="">{UI_TEXT.common.uncategorized}</option>{categories.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}</select><input className="sheet-input" placeholder="\u041f\u0440\u043e\u0434\u0430\u0432\u0435\u0446 \u0438\u043b\u0438 \u043c\u0430\u0433\u0430\u0437\u0438\u043d" value={templateForm.merchant} onChange={(event) => setTemplateForm((current) => ({ ...current, merchant: event.target.value }))} /><textarea className="sheet-input min-h-24 resize-none" placeholder="\u0417\u0430\u043c\u0435\u0442\u043a\u0430 \u043a \u043e\u043f\u0435\u0440\u0430\u0446\u0438\u0438" value={templateForm.description} onChange={(event) => setTemplateForm((current) => ({ ...current, description: event.target.value }))} /><button className="sheet-primary-button w-full" disabled={!canSaveTemplate || saveTemplateMutation.isPending} onClick={() => void handleSaveTemplate()} type="button">{saveTemplateMutation.isPending ? '\u0421\u043e\u0445\u0440\u0430\u043d\u044f\u0435\u043c\u2026' : '\u0421\u043e\u0445\u0440\u0430\u043d\u0438\u0442\u044c \u0448\u0430\u0431\u043b\u043e\u043d'}</button></div></SurfaceCard> : null}

            {overview?.quick_templates.length ? overview.quick_templates.map((template) => <ListCard key={template.id}><ListRow onClick={() => openSheet('add', { templateId: template.id })} title={template.label} subtitle={template.merchant || template.description || '\u041f\u0435\u0440\u0435\u0438\u0441\u043f\u043e\u043b\u044c\u0437\u0443\u0435\u043c\u044b\u0439 \u0447\u0435\u0440\u043d\u043e\u0432\u0438\u043a \u0434\u043b\u044f \u0431\u044b\u0441\u0442\u0440\u043e\u0433\u043e \u0432\u0432\u043e\u0434\u0430.'} trailing={<div className="flex items-center gap-2"><StatusBadge tone="accent">{template.amount ? `${template.amount.toLocaleString('ru-RU')} \u20bd` : UI_TEXT.common.noAmount}</StatusBadge><ActionPill onClick={() => void (async () => { await deleteTemplateMutation.mutateAsync(template.id); await invalidate(); })()} variant="danger"><TrashIcon size={14} /></ActionPill></div>} /></ListCard>) : <EmptyStateCard title="\u0428\u0430\u0431\u043b\u043e\u043d\u043e\u0432 \u043f\u043e\u043a\u0430 \u043d\u0435\u0442" description="\u0421\u043e\u0445\u0440\u0430\u043d\u0438 2\u20133 \u043f\u043e\u0432\u0442\u043e\u0440\u044f\u044e\u0449\u0438\u0445\u0441\u044f \u043e\u043f\u0435\u0440\u0430\u0446\u0438\u0438, \u0438 \u043e\u043d\u0438 \u0431\u0443\u0434\u0443\u0442 \u0434\u043e\u0431\u0430\u0432\u043b\u044f\u0442\u044c\u0441\u044f \u0432 \u043e\u0434\u0438\u043d \u0442\u0430\u043f." />}
          </section>

          <section className="space-y-3">
            <SectionHeader eyebrow="\u0418\u0437 \u0438\u0441\u0442\u043e\u0440\u0438\u0438" title="\u041f\u043e\u0434\u0441\u043a\u0430\u0437\u043a\u0438 TrackDen" description="\u042d\u0442\u0438 \u0448\u0430\u0431\u043b\u043e\u043d\u044b \u0441\u043e\u0431\u0438\u0440\u0430\u044e\u0442\u0441\u044f \u0430\u0432\u0442\u043e\u043c\u0430\u0442\u0438\u0447\u0435\u0441\u043a\u0438 \u0438\u0437 \u043f\u043e\u0445\u043e\u0436\u0438\u0445 \u043e\u043f\u0435\u0440\u0430\u0446\u0438\u0439 \u0432 \u0438\u0441\u0442\u043e\u0440\u0438\u0438." />
            {overview?.suggested_templates.length ? overview.suggested_templates.map((template) => <ListCard key={template.id}><ListRow onClick={() => openSheet('add', { templateId: template.id })} title={template.label} subtitle={`${template.use_count} \u0438\u0441\u043f\u043e\u043b\u044c\u0437. \u2022 ${template.merchant || template.description || '\u0447\u0430\u0441\u0442\u0430\u044f \u043e\u043f\u0435\u0440\u0430\u0446\u0438\u044f \u0431\u0435\u0437 \u0437\u0430\u043c\u0435\u0442\u043a\u0438'}`} trailing={<StatusBadge tone="warning">\u041f\u043e\u0434\u0441\u043a\u0430\u0437\u043a\u0430</StatusBadge>} /></ListCard>) : <EmptyStateCard title="\u041f\u043e\u0434\u0441\u043a\u0430\u0437\u043e\u043a \u043f\u043e\u043a\u0430 \u043d\u0435\u0442" description="\u041a\u043e\u0433\u0434\u0430 \u0438\u0441\u0442\u043e\u0440\u0438\u044f \u043f\u043e\u0434\u0440\u0430\u0441\u0442\u0451\u0442, TrackDen \u043d\u0430\u0447\u043d\u0451\u0442 \u043f\u0440\u0435\u0434\u043b\u0430\u0433\u0430\u0442\u044c \u0431\u044b\u0441\u0442\u0440\u044b\u0435 \u0448\u0430\u0431\u043b\u043e\u043d\u044b \u0438\u0437 \u043f\u043e\u0432\u0442\u043e\u0440\u044f\u044e\u0449\u0438\u0445\u0441\u044f \u043e\u043f\u0435\u0440\u0430\u0446\u0438\u0439." />}
          </section>
        </>
      )}
    </BottomSheetScaffold>
  );
}
