import clsx from 'clsx';
import { useQueryClient } from '@tanstack/react-query';
import { useEffect, useMemo, useState } from 'react';

import { useSessionQuery } from '../auth/api';
import { useFinanceSheet } from '../finance-sheet/useFinanceSheet';
import { useBudgetConfigQuery, useSaveBudgetConfigMutation } from './api';
import { type BudgetConfig, createEmptyBudgetConfig, listBudgetableCategories } from './model';
import { CloseIcon } from '../../shared/ui/premium';
import { Skeleton } from '../../shared/ui/Skeleton';

type CategoryBudgetFormState = {
  category_id: string;
  name: string;
  color?: string | null;
  enabled: boolean;
  amount: string;
};

type BudgetFormState = {
  overall_enabled: boolean;
  overall_amount: string;
  categories: CategoryBudgetFormState[];
};

function buildBudgetForm(categories: ReturnType<typeof listBudgetableCategories>, config: BudgetConfig): BudgetFormState {
  const configMap = new Map(config.categories.map((item) => [item.category_id, item]));

  return {
    overall_enabled: config.overall_enabled,
    overall_amount: config.overall_amount ? String(config.overall_amount) : '',
    categories: categories.map((category) => {
      const saved = configMap.get(category.id);
      return {
        category_id: category.id,
        name: category.name,
        color: category.color ?? null,
        enabled: saved?.enabled ?? false,
        amount: saved?.amount ? String(saved.amount) : '',
      };
    }),
  };
}

function serializeBudgetForm(form: BudgetFormState): BudgetConfig {
  const overallAmount = Number(form.overall_amount);

  return {
    overall_enabled: form.overall_enabled && Number.isFinite(overallAmount) && overallAmount > 0,
    overall_amount: form.overall_enabled && Number.isFinite(overallAmount) && overallAmount > 0 ? overallAmount : null,
    updated_at: null,
    categories: form.categories.map((category) => {
      const amount = Number(category.amount);
      return {
        category_id: category.category_id,
        enabled: category.enabled && Number.isFinite(amount) && amount > 0,
        amount: Number.isFinite(amount) && amount > 0 ? amount : 0,
      };
    }),
  };
}

export function BudgetActionSheet() {
  const queryClient = useQueryClient();
  const { closeSheet, isOpen, mode } = useFinanceSheet();
  const sessionQuery = useSessionQuery();
  const budgetConfigQuery = useBudgetConfigQuery();
  const saveBudgetMutation = useSaveBudgetConfigMutation();
  const [form, setForm] = useState<BudgetFormState>({
    overall_enabled: false,
    overall_amount: '',
    categories: [],
  });

  const categories = useMemo(() => listBudgetableCategories(sessionQuery.data?.categories ?? []), [sessionQuery.data?.categories]);

  useEffect(() => {
    if (!isOpen || mode !== 'budget') {
      return;
    }

    setForm(buildBudgetForm(categories, budgetConfigQuery.data ?? createEmptyBudgetConfig()));
  }, [budgetConfigQuery.data, categories, isOpen, mode]);

  const invalidEnabledValue = useMemo(() => {
    if (form.overall_enabled && Number(form.overall_amount) <= 0) {
      return true;
    }

    return form.categories.some((category) => category.enabled && Number(category.amount) <= 0);
  }, [form]);

  const enabledCategoryCount = useMemo(
    () => form.categories.filter((category) => category.enabled && Number(category.amount) > 0).length,
    [form.categories],
  );

  const handleCategoryChange = (categoryId: string, patch: Partial<CategoryBudgetFormState>) => {
    setForm((current) => ({
      ...current,
      categories: current.categories.map((category) => (category.category_id === categoryId ? { ...category, ...patch } : category)),
    }));
  };

  const handleReset = () => {
    setForm(buildBudgetForm(categories, createEmptyBudgetConfig()));
  };

  const handleSave = async () => {
    const nextConfig = serializeBudgetForm(form);
    await saveBudgetMutation.mutateAsync(nextConfig);
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['budgets'] }),
      queryClient.invalidateQueries({ queryKey: ['analytics'] }),
      queryClient.invalidateQueries({ queryKey: ['transactions'] }),
    ]);
    closeSheet();
  };

  if (!isOpen || mode !== 'budget') {
    return null;
  }

  const isLoading = sessionQuery.isLoading || budgetConfigQuery.isLoading;

  return (
    <div className="sheet-backdrop" onClick={closeSheet} role="presentation">
      <div className="premium-sheet" onClick={(event) => event.stopPropagation()} role="dialog" aria-modal="true">
        <div className="sheet-handle" />
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-xs uppercase tracking-[0.28em] text-[var(--app-muted)]">Budget control</p>
            <h2 className="mt-2 text-[26px] font-semibold leading-tight text-[var(--app-text)]">Месячные лимиты</h2>
            <p className="mt-2 max-w-[280px] text-sm leading-6 text-[var(--app-muted)]">Настрой общий лимит и бюджеты по системным категориям. Предупреждения появятся прямо на главной и в аналитике.</p>
          </div>
          <button className="icon-circle-button" onClick={closeSheet} type="button">
            <CloseIcon size={18} />
          </button>
        </div>

        {isLoading ? (
          <div className="mt-6 space-y-3">
            <Skeleton className="h-24 w-full rounded-[22px]" />
            <Skeleton className="h-24 w-full rounded-[22px]" />
            <Skeleton className="h-24 w-full rounded-[22px]" />
          </div>
        ) : (
          <>
            <section className="premium-card mt-6 rounded-[24px] p-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-sm font-medium text-white">Общий лимит месяца</p>
                  <p className="mt-1 text-sm leading-6 text-[var(--app-muted)]">Следим за общим расходом, независимо от категорий.</p>
                </div>
                <button
                  className={clsx(
                    'rounded-full border px-3 py-2 text-xs font-semibold uppercase tracking-[0.18em] transition',
                    form.overall_enabled
                      ? 'border-transparent bg-white text-[#070b12]'
                      : 'border-[var(--app-stroke)] bg-white/[0.03] text-[var(--app-muted-strong)]',
                  )}
                  onClick={() => setForm((current) => ({ ...current, overall_enabled: !current.overall_enabled }))}
                  type="button"
                >
                  {form.overall_enabled ? 'On' : 'Off'}
                </button>
              </div>

              <div className="mt-4 flex items-center gap-3">
                <input
                  className="sheet-input flex-1"
                  disabled={!form.overall_enabled}
                  inputMode="decimal"
                  min="0"
                  onChange={(event) => setForm((current) => ({ ...current, overall_amount: event.target.value }))}
                  placeholder="0.00"
                  step="0.01"
                  type="number"
                  value={form.overall_amount}
                />
                <span className="text-xs uppercase tracking-[0.18em] text-[var(--app-muted)]">RUB / month</span>
              </div>
            </section>

            <section className="mt-5 space-y-3">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="soft-kicker">Categories</p>
                  <h3 className="mt-1 text-lg font-semibold text-white">Лимиты по категориям</h3>
                  <p className="mt-1 text-sm text-[var(--app-muted)]">Активно {enabledCategoryCount} из {categories.length}</p>
                </div>
                <button className="text-sm text-[var(--app-accent)]" onClick={handleReset} type="button">
                  Сбросить всё
                </button>
              </div>

              {form.categories.map((category) => (
                <div key={category.category_id} className="premium-card rounded-[22px] p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-center gap-3">
                      <div className="transaction-avatar h-11 w-11 rounded-[16px] text-sm" style={{ background: `${category.color ?? '#6f6bff'}22`, color: category.color ?? '#6f6bff' }}>
                        {category.name.slice(0, 1).toUpperCase()}
                      </div>
                      <div>
                        <p className="font-medium text-white">{category.name}</p>
                        <p className="mt-1 text-sm text-[var(--app-muted)]">Месячный потолок по этой категории</p>
                      </div>
                    </div>
                    <button
                      className={clsx(
                        'rounded-full border px-3 py-2 text-xs font-semibold uppercase tracking-[0.18em] transition',
                        category.enabled
                          ? 'border-transparent bg-white text-[#070b12]'
                          : 'border-[var(--app-stroke)] bg-white/[0.03] text-[var(--app-muted-strong)]',
                      )}
                      onClick={() => handleCategoryChange(category.category_id, { enabled: !category.enabled })}
                      type="button"
                    >
                      {category.enabled ? 'On' : 'Off'}
                    </button>
                  </div>

                  <div className="mt-4 flex items-center gap-3">
                    <input
                      className="sheet-input flex-1"
                      disabled={!category.enabled}
                      inputMode="decimal"
                      min="0"
                      onChange={(event) => handleCategoryChange(category.category_id, { amount: event.target.value })}
                      placeholder="0.00"
                      step="0.01"
                      type="number"
                      value={category.amount}
                    />
                    <span className="text-xs uppercase tracking-[0.18em] text-[var(--app-muted)]">RUB</span>
                  </div>
                </div>
              ))}
            </section>

            {invalidEnabledValue ? (
              <div className="mt-4 rounded-[20px] border border-amber-400/20 bg-amber-400/10 px-4 py-3 text-sm leading-6 text-amber-100">
                Для включённых лимитов нужно указать сумму больше нуля.
              </div>
            ) : null}
          </>
        )}

        <div className="mt-6 flex gap-3">
          <button className="sheet-secondary-button" onClick={closeSheet} type="button">
            Отмена
          </button>
          <button className="sheet-secondary-button" onClick={handleReset} type="button">
            Очистить
          </button>
          <button className="sheet-primary-button" disabled={isLoading || invalidEnabledValue || saveBudgetMutation.isPending} onClick={() => void handleSave()} type="button">
            {saveBudgetMutation.isPending ? 'Сохраняем…' : 'Сохранить лимиты'}
          </button>
        </div>
      </div>
    </div>
  );
}
