import { Button, Card } from 'konsta/react';
import { type FormEvent, useEffect, useState } from 'react';

import type { Category } from '../auth/api';
import type { Transaction, TransactionPayload, TransactionType } from './api';

export type TransactionDraft = {
  amount?: number;
  merchant?: string | null;
  description?: string | null;
  category_id?: string | null;
  source?: 'manual' | 'ocr';
  receipt_id?: string | null;
};

type TransactionFormProps = {
  categories: Category[];
  initialTransaction?: Transaction | null;
  initialDraft?: TransactionDraft | null;
  isSubmitting: boolean;
  onCancelEdit: () => void;
  onSubmit: (payload: TransactionPayload) => Promise<void>;
};

type FormState = {
  amount: string;
  type: TransactionType;
  currency: string;
  category_id: string;
  merchant: string;
  description: string;
  source: 'manual' | 'ocr';
  receipt_id: string;
};

function buildState(initialTransaction?: Transaction | null, initialDraft?: TransactionDraft | null): FormState {
  if (initialTransaction) {
    return {
      amount: String(initialTransaction.amount),
      type: initialTransaction.type,
      currency: initialTransaction.currency,
      category_id: initialTransaction.category?.id ?? '',
      merchant: initialTransaction.merchant ?? '',
      description: initialTransaction.description ?? '',
      source: initialTransaction.source,
      receipt_id: initialTransaction.receipt_id ?? '',
    };
  }

  return {
    amount: initialDraft?.amount ? String(initialDraft.amount) : '',
    type: 'expense',
    currency: 'RUB',
    category_id: initialDraft?.category_id ?? '',
    merchant: initialDraft?.merchant ?? '',
    description: initialDraft?.description ?? '',
    source: initialDraft?.source ?? 'manual',
    receipt_id: initialDraft?.receipt_id ?? '',
  };
}

export function TransactionForm({
  categories,
  initialTransaction,
  initialDraft,
  isSubmitting,
  onCancelEdit,
  onSubmit,
}: TransactionFormProps) {
  const [formState, setFormState] = useState<FormState>(() => buildState(initialTransaction, initialDraft));

  useEffect(() => {
    setFormState(buildState(initialTransaction, initialDraft));
  }, [initialDraft, initialTransaction]);

  const isEditing = Boolean(initialTransaction);

  const updateField = <K extends keyof FormState>(field: K, value: FormState[K]) => {
    setFormState((current) => ({ ...current, [field]: value }));
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    await onSubmit({
      amount: Number(formState.amount),
      type: formState.type,
      currency: formState.currency,
      category_id: formState.category_id || null,
      merchant: formState.merchant || null,
      description: formState.description || null,
      source: formState.source,
      receipt_id: formState.receipt_id || null,
    });

    if (!isEditing) {
      setFormState(buildState(undefined, null));
    }
  };

  return (
    <Card className="overflow-hidden rounded-[28px] border border-[var(--app-border)] bg-[var(--app-surface-strong)] p-5 shadow-[0_24px_60px_rgba(15,23,42,0.12)]">
      <div className="mb-4 flex items-center justify-between">
        <div>
          <p className="text-sm font-medium text-[var(--app-muted)]">\u0411\u044b\u0441\u0442\u0440\u043e\u0435 \u0434\u043e\u0431\u0430\u0432\u043b\u0435\u043d\u0438\u0435</p>
          <h2 className="text-xl font-semibold">{isEditing ? '\u0420\u0435\u0434\u0430\u043a\u0442\u0438\u0440\u043e\u0432\u0430\u043d\u0438\u0435 \u043e\u043f\u0435\u0440\u0430\u0446\u0438\u0438' : '\u041d\u043e\u0432\u0430\u044f \u043e\u043f\u0435\u0440\u0430\u0446\u0438\u044f'}</h2>
        </div>
        {initialDraft?.receipt_id ? <span className="rounded-full bg-[var(--app-accent)]/10 px-3 py-1 text-xs font-semibold text-[var(--app-accent)]">OCR \u0447\u0435\u0440\u043d\u043e\u0432\u0438\u043a</span> : null}
      </div>

      <form className="space-y-4" onSubmit={handleSubmit}>
        <div className="grid grid-cols-2 gap-3">
          <button className={`rounded-2xl px-4 py-3 text-sm font-semibold transition ${formState.type === 'expense' ? 'bg-[var(--app-accent)] text-[var(--app-accent-text)]' : 'bg-black/5 text-[var(--app-text)] dark:bg-white/5'}`} onClick={() => updateField('type', 'expense')} type="button">\u0420\u0430\u0441\u0445\u043e\u0434</button>
          <button className={`rounded-2xl px-4 py-3 text-sm font-semibold transition ${formState.type === 'income' ? 'bg-[var(--app-accent)] text-[var(--app-accent-text)]' : 'bg-black/5 text-[var(--app-text)] dark:bg-white/5'}`} onClick={() => updateField('type', 'income')} type="button">\u0414\u043e\u0445\u043e\u0434</button>
        </div>

        <div className="grid grid-cols-[1fr_96px] gap-3">
          <input className="rounded-2xl border border-[var(--app-border)] bg-transparent px-4 py-3 text-lg font-semibold outline-none focus:border-[var(--app-accent)]" inputMode="decimal" min="0" onChange={(event) => updateField('amount', event.target.value)} placeholder="0.00" required step="0.01" type="number" value={formState.amount} />
          <input className="rounded-2xl border border-[var(--app-border)] bg-transparent px-4 py-3 text-center font-semibold uppercase outline-none focus:border-[var(--app-accent)]" maxLength={3} onChange={(event) => updateField('currency', event.target.value.toUpperCase())} value={formState.currency} />
        </div>

        <select className="w-full rounded-2xl border border-[var(--app-border)] bg-transparent px-4 py-3 outline-none focus:border-[var(--app-accent)]" onChange={(event) => updateField('category_id', event.target.value)} value={formState.category_id}>
          <option value="">\u0410\u0432\u0442\u043e\u043a\u0430\u0442\u0435\u0433\u043e\u0440\u0438\u044f</option>
          {categories.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}
        </select>

        <input className="w-full rounded-2xl border border-[var(--app-border)] bg-transparent px-4 py-3 outline-none focus:border-[var(--app-accent)]" onChange={(event) => updateField('merchant', event.target.value)} placeholder="\u041c\u0430\u0433\u0430\u0437\u0438\u043d \u0438\u043b\u0438 \u043a\u043e\u043d\u0442\u0440\u0430\u0433\u0435\u043d\u0442" value={formState.merchant} />

        <textarea className="min-h-24 w-full rounded-2xl border border-[var(--app-border)] bg-transparent px-4 py-3 outline-none focus:border-[var(--app-accent)]" onChange={(event) => updateField('description', event.target.value)} placeholder="\u041e\u043f\u0438\u0441\u0430\u043d\u0438\u0435 \u0438\u043b\u0438 \u0437\u0430\u043c\u0435\u0442\u043a\u0430" value={formState.description} />

        <div className="flex gap-3">
          <Button className="flex-1 rounded-2xl" disabled={isSubmitting} large type="submit">{isSubmitting ? '\u0421\u043e\u0445\u0440\u0430\u043d\u044f\u0435\u043c...' : isEditing ? '\u041e\u0431\u043d\u043e\u0432\u0438\u0442\u044c' : '\u0414\u043e\u0431\u0430\u0432\u0438\u0442\u044c'}</Button>
          {isEditing ? <Button className="rounded-2xl" clear large onClick={onCancelEdit} type="button">\u041e\u0442\u043c\u0435\u043d\u0430</Button> : null}
        </div>
      </form>
    </Card>
  );
}
