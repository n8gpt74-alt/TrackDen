import clsx from 'clsx';
import { useQueryClient } from '@tanstack/react-query';
import { type ChangeEvent, useEffect, useMemo, useRef, useState } from 'react';

import { useSessionQuery } from '../auth/api';
import { useReceiptQuery, useUploadReceiptMutation } from '../receipts/api';
import {
  type Transaction,
  type TransactionPayload,
  type TransactionSource,
  type TransactionType,
  useCreateTransactionMutation,
  useTransactionQuery,
  useUpdateTransactionMutation,
} from '../transactions/api';
import { FINANCE_SHEET_DRAFT_STORAGE_KEY } from './constants';
import { useFinanceSheet } from './useFinanceSheet';
import { formatMoney } from '../../shared/lib/money';
import { CloseIcon, ReceiptIcon, SegmentedControl, SparklesIcon, UploadIcon } from '../../shared/ui/premium';
import { Skeleton } from '../../shared/ui/Skeleton';

type ComposerState = {
  amount: string;
  type: TransactionType;
  currency: string;
  category_id: string;
  merchant: string;
  description: string;
  source: TransactionSource;
  receipt_id: string;
};

type PersistedDraft = {
  form: ComposerState;
  detailsOpen: boolean;
  receiptId: string | null;
};

const DEFAULT_FORM: ComposerState = {
  amount: '',
  type: 'expense',
  currency: 'RUB',
  category_id: '',
  merchant: '',
  description: '',
  source: 'manual',
  receipt_id: '',
};

function readDraft() {
  try {
    const raw = window.sessionStorage.getItem(FINANCE_SHEET_DRAFT_STORAGE_KEY);
    if (!raw) {
      return null;
    }

    return JSON.parse(raw) as PersistedDraft;
  } catch {
    return null;
  }
}

function writeDraft(draft: PersistedDraft) {
  try {
    window.sessionStorage.setItem(FINANCE_SHEET_DRAFT_STORAGE_KEY, JSON.stringify(draft));
  } catch {
    window.sessionStorage.removeItem(FINANCE_SHEET_DRAFT_STORAGE_KEY);
  }
}

function clearDraft() {
  try {
    window.sessionStorage.removeItem(FINANCE_SHEET_DRAFT_STORAGE_KEY);
  } catch {
    // noop
  }
}

function buildEditForm(payload: Transaction): ComposerState {
  return {
    amount: String(payload.amount),
    type: payload.type,
    currency: payload.currency,
    category_id: payload.category?.id ?? '',
    merchant: payload.merchant ?? '',
    description: payload.description ?? '',
    source: payload.source,
    receipt_id: payload.receipt_id ?? '',
  };
}

export function FinanceActionSheet() {
  const { closeSheet, isOpen, mode, transactionId } = useFinanceSheet();
  const queryClient = useQueryClient();
  const inputRef = useRef<HTMLInputElement | null>(null);
  const sessionQuery = useSessionQuery();
  const transactionQuery = useTransactionQuery(mode === 'edit' ? transactionId : null);
  const createMutation = useCreateTransactionMutation();
  const updateMutation = useUpdateTransactionMutation();
  const uploadMutation = useUploadReceiptMutation();
  const isTransactionMode = mode === 'add' || mode === 'ocr' || mode === 'edit';

  const [form, setForm] = useState<ComposerState>(DEFAULT_FORM);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [receiptId, setReceiptId] = useState<string | null>(null);
  const [ocrHydrated, setOcrHydrated] = useState(false);

  const receiptQuery = useReceiptQuery(receiptId);
  const receipt = receiptQuery.data;
  const categories = sessionQuery.data?.categories ?? [];

  useEffect(() => {
    if (!isOpen || !isTransactionMode || mode === 'edit') {
      return;
    }

    const draft = readDraft();
    if (draft) {
      setForm(draft.form);
      setDetailsOpen(draft.detailsOpen);
      setReceiptId(draft.receiptId);
      setOcrHydrated(Boolean(draft.form.receipt_id));
      return;
    }

    setForm(mode === 'ocr' ? { ...DEFAULT_FORM, source: 'ocr' } : DEFAULT_FORM);
    setDetailsOpen(false);
    setReceiptId(null);
    setOcrHydrated(false);
  }, [isOpen, isTransactionMode, mode]);

  useEffect(() => {
    if (!isTransactionMode || mode !== 'edit' || !transactionQuery.data) {
      return;
    }

    setForm(buildEditForm(transactionQuery.data));
    setDetailsOpen(Boolean(transactionQuery.data.description || transactionQuery.data.merchant || transactionQuery.data.receipt_id));
    setReceiptId(transactionQuery.data.receipt_id ?? null);
    setOcrHydrated(Boolean(transactionQuery.data.receipt_id));
  }, [isTransactionMode, mode, transactionQuery.data]);

  useEffect(() => {
    if (!isOpen || !isTransactionMode || mode === 'edit') {
      return;
    }

    writeDraft({
      form,
      detailsOpen,
      receiptId,
    });
  }, [detailsOpen, form, isOpen, isTransactionMode, mode, receiptId]);

  useEffect(() => {
    if (!isTransactionMode || mode !== 'ocr' || !receipt || receipt.status !== 'processed' || ocrHydrated) {
      return;
    }

    setForm((current) => ({
      ...current,
      amount: receipt.extracted_total ? String(receipt.extracted_total) : current.amount,
      merchant: receipt.extracted_merchant ?? current.merchant,
      description: current.description || 'Добавлено из OCR чека',
      source: 'ocr',
      receipt_id: receipt.id,
    }));
    setDetailsOpen(true);
    setOcrHydrated(true);
  }, [isTransactionMode, mode, ocrHydrated, receipt]);

  const isBusy = createMutation.isPending || updateMutation.isPending;
  const canSubmit = Number(form.amount) > 0 && isTransactionMode;
  const headerTitle = mode === 'edit' ? 'Редактировать операцию' : mode === 'ocr' ? 'Добавить по чеку' : 'Быстрое добавление';
  const headerSubtitle = mode === 'edit' ? 'Измените сумму, категорию и детали' : mode === 'ocr' ? 'Сначала загрузите чек, потом подтвердите данные' : 'Сумма, категория и одно нажатие на сохранение';

  const topCategories = useMemo(() => categories.slice(0, 6), [categories]);

  const handleChange = <K extends keyof ComposerState>(field: K, value: ComposerState[K]) => {
    setForm((current) => ({ ...current, [field]: value }));
  };

  const invalidateFinanceData = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['transactions'] }),
      queryClient.invalidateQueries({ queryKey: ['analytics'] }),
      queryClient.invalidateQueries({ queryKey: ['transaction'] }),
      queryClient.invalidateQueries({ queryKey: ['budgets'] }),
    ]);
  };

  const handleFilePick = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }

    const uploaded = await uploadMutation.mutateAsync(file);
    setReceiptId(uploaded.id);
    setOcrHydrated(false);
    setForm((current) => ({
      ...current,
      source: 'ocr',
      receipt_id: uploaded.id,
    }));
    event.target.value = '';
  };

  const handleSubmit = async () => {
    if (!canSubmit || !mode || !isTransactionMode) {
      return;
    }

    const payload: TransactionPayload = {
      amount: Number(form.amount),
      type: form.type,
      currency: form.currency,
      category_id: form.category_id || null,
      merchant: form.merchant || null,
      description: form.description || null,
      source: form.source,
      receipt_id: form.receipt_id || null,
    };

    if (mode === 'edit' && transactionId) {
      await updateMutation.mutateAsync({ id: transactionId, payload });
    } else {
      await createMutation.mutateAsync(payload);
      clearDraft();
    }

    await invalidateFinanceData();
    closeSheet();
  };

  const handleClose = () => {
    if (isTransactionMode && mode !== 'edit') {
      writeDraft({ form, detailsOpen, receiptId });
    }
    closeSheet();
  };

  if (!isOpen || !mode || !isTransactionMode) {
    return null;
  }

  return (
    <div className="sheet-backdrop" onClick={handleClose} role="presentation">
      <div className="premium-sheet" onClick={(event) => event.stopPropagation()} role="dialog" aria-modal="true">
        <div className="sheet-handle" />
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-xs uppercase tracking-[0.28em] text-[var(--app-muted)]">Premium flow</p>
            <h2 className="mt-2 text-[26px] font-semibold leading-tight text-[var(--app-text)]">{headerTitle}</h2>
            <p className="mt-2 max-w-[280px] text-sm leading-6 text-[var(--app-muted)]">{headerSubtitle}</p>
          </div>
          <button className="icon-circle-button" onClick={handleClose} type="button">
            <CloseIcon size={18} />
          </button>
        </div>

        {mode === 'ocr' ? (
          <div className="premium-card mt-6 space-y-4 p-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-sm font-medium text-white">OCR receipt</p>
                <p className="mt-1 text-sm text-[var(--app-muted)]">Фото чека подтянет сумму и мерчанта в форму ниже.</p>
              </div>
              <button className="icon-circle-button" onClick={() => inputRef.current?.click()} type="button">
                <UploadIcon size={18} />
              </button>
            </div>
            <input ref={inputRef} accept="image/*" className="hidden" onChange={handleFilePick} type="file" />
            {uploadMutation.isPending ? <Skeleton className="h-28 w-full rounded-[22px]" /> : null}
            {receipt?.status === 'pending' ? (
              <div className="rounded-[24px] border border-[var(--app-stroke)] bg-white/[0.03] p-4 text-sm text-[var(--app-muted)]">
                Обрабатываем чек через OCR-воркер…
              </div>
            ) : null}
            {receipt?.status === 'processed' ? (
              <div className="rounded-[24px] border border-emerald-400/20 bg-emerald-400/5 p-4">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-sm text-[var(--app-muted)]">Распознано</p>
                    <p className="mt-1 text-lg font-semibold text-white">{receipt.extracted_merchant || 'Без названия'}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm text-[var(--app-muted)]">Сумма</p>
                    <p className="mt-1 text-lg font-semibold text-white">{formatMoney(receipt.extracted_total ?? 0)}</p>
                  </div>
                </div>
              </div>
            ) : null}
            {receipt?.status === 'failed' ? (
              <div className="rounded-[24px] border border-[var(--app-danger)]/20 bg-[var(--app-danger)]/10 p-4 text-sm text-[var(--app-danger)]">
                {receipt.error || 'Не удалось обработать чек.'}
              </div>
            ) : null}
          </div>
        ) : null}

        {mode === 'edit' && transactionQuery.isLoading ? (
          <div className="mt-6 space-y-3">
            <Skeleton className="h-24 w-full rounded-[22px]" />
            <Skeleton className="h-24 w-full rounded-[22px]" />
          </div>
        ) : (
          <>
            <SegmentedControl
              className="mt-6"
              onChange={(value) => handleChange('type', value)}
              options={[
                { label: 'Income', value: 'income' },
                { label: 'Expenses', value: 'expense' },
              ]}
              value={form.type}
            />

            <div className="mt-5 premium-card p-4">
              <p className="text-xs uppercase tracking-[0.24em] text-[var(--app-muted)]">Amount</p>
              <div className="mt-3 flex items-end justify-between gap-3">
                <input
                  className="min-w-0 flex-1 bg-transparent text-[40px] font-semibold tracking-tight text-white outline-none"
                  inputMode="decimal"
                  min="0"
                  onChange={(event) => handleChange('amount', event.target.value)}
                  placeholder="0.00"
                  step="0.01"
                  type="number"
                  value={form.amount}
                />
                <input
                  className="w-20 rounded-[18px] border border-[var(--app-stroke)] bg-white/[0.04] px-3 py-3 text-center text-sm font-semibold uppercase text-white outline-none"
                  maxLength={3}
                  onChange={(event) => handleChange('currency', event.target.value.toUpperCase())}
                  value={form.currency}
                />
              </div>
            </div>

            <div className="mt-4 flex flex-wrap gap-2.5">
              {topCategories.map((category) => (
                <button
                  key={category.id}
                  className={clsx(
                    'rounded-[18px] border px-4 py-2.5 text-sm font-medium transition',
                    form.category_id === category.id
                      ? 'border-transparent bg-white text-[#070b12]'
                      : 'border-[var(--app-stroke)] bg-white/[0.03] text-[var(--app-muted-strong)]',
                  )}
                  onClick={() => handleChange('category_id', form.category_id === category.id ? '' : category.id)}
                  type="button"
                >
                  {category.name}
                </button>
              ))}
            </div>

            <button
              className="mt-4 inline-flex items-center gap-2 text-sm font-medium text-[var(--app-accent)]"
              onClick={() => setDetailsOpen((current) => !current)}
              type="button"
            >
              <SparklesIcon size={16} />
              {detailsOpen ? 'Скрыть детали' : 'Добавить детали'}
            </button>

            {detailsOpen ? (
              <div className="mt-4 space-y-3 premium-card p-4">
                <input
                  className="sheet-input"
                  onChange={(event) => handleChange('merchant', event.target.value)}
                  placeholder="Магазин или контрагент"
                  value={form.merchant}
                />
                <textarea
                  className="sheet-input min-h-24 resize-none"
                  onChange={(event) => handleChange('description', event.target.value)}
                  placeholder="Описание операции"
                  value={form.description}
                />
                <select
                  className="sheet-input"
                  onChange={(event) => handleChange('category_id', event.target.value)}
                  value={form.category_id}
                >
                  <option value="">Автокатегория</option>
                  {categories.map((category) => (
                    <option key={category.id} value={category.id}>
                      {category.name}
                    </option>
                  ))}
                </select>
                {form.receipt_id ? (
                  <div className="flex items-center gap-2 rounded-[18px] border border-[var(--app-stroke)] bg-white/[0.03] px-4 py-3 text-sm text-[var(--app-muted)]">
                    <ReceiptIcon size={16} />
                    Связан чек {form.receipt_id.slice(0, 8)}…
                  </div>
                ) : null}
              </div>
            ) : null}
          </>
        )}

        <div className="mt-6 flex gap-3">
          <button className="sheet-secondary-button" onClick={handleClose} type="button">
            Отмена
          </button>
          <button className="sheet-primary-button" disabled={!canSubmit || isBusy} onClick={() => void handleSubmit()} type="button">
            {isBusy ? 'Сохраняем…' : mode === 'edit' ? 'Обновить' : 'Сохранить'}
          </button>
        </div>
      </div>
    </div>
  );
}
