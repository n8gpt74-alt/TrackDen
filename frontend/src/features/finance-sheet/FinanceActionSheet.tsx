import clsx from 'clsx';
import { useQueryClient } from '@tanstack/react-query';
import { type ChangeEvent, useEffect, useMemo, useRef, useState } from 'react';

import { useSessionQuery } from '../auth/api';
import { useMarkQuickTemplateUsedMutation, useQuickTemplateQuery } from '../intelligence/api';
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
import { ReceiptIcon, SegmentedControl, SparklesIcon, UploadIcon } from '../../shared/ui/premium';
import { BottomSheetScaffold, EmptyStateCard, SurfaceCard } from '../../shared/ui/premium-kit';
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
  const { closeSheet, isOpen, mode, templateId, transactionId } = useFinanceSheet();
  const queryClient = useQueryClient();
  const inputRef = useRef<HTMLInputElement | null>(null);
  const sessionQuery = useSessionQuery();
  const transactionQuery = useTransactionQuery(mode === 'edit' ? transactionId : null);
  const templateQuery = useQuickTemplateQuery(mode === 'add' ? templateId : null);
  const createMutation = useCreateTransactionMutation();
  const updateMutation = useUpdateTransactionMutation();
  const uploadMutation = useUploadReceiptMutation();
  const markTemplateUsedMutation = useMarkQuickTemplateUsedMutation();
  const isTransactionMode = mode === 'add' || mode === 'ocr' || mode === 'edit';

  const [form, setForm] = useState<ComposerState>(DEFAULT_FORM);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [receiptId, setReceiptId] = useState<string | null>(null);
  const [ocrHydrated, setOcrHydrated] = useState(false);

  const receipt = useReceiptQuery(receiptId).data;
  const categories = sessionQuery.data?.categories ?? [];

  useEffect(() => {
    if (!isOpen || !isTransactionMode || mode === 'edit') {
      return;
    }

    if (mode === 'add' && templateId) {
      setForm(DEFAULT_FORM);
      setDetailsOpen(false);
      setReceiptId(null);
      setOcrHydrated(false);
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
  }, [isOpen, isTransactionMode, mode, templateId]);

  useEffect(() => {
    if (!isOpen || mode !== 'add' || !templateId || !templateQuery.data) {
      return;
    }

    setForm({
      amount: templateQuery.data.amount ? String(templateQuery.data.amount) : '',
      type: templateQuery.data.type,
      currency: templateQuery.data.currency,
      category_id: templateQuery.data.category_id ?? '',
      merchant: templateQuery.data.merchant ?? '',
      description: templateQuery.data.description ?? '',
      source: 'manual',
      receipt_id: '',
    });
    setDetailsOpen(Boolean(templateQuery.data.category_id || templateQuery.data.merchant || templateQuery.data.description));
    setReceiptId(null);
    setOcrHydrated(false);
  }, [isOpen, mode, templateId, templateQuery.data]);

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
    if (!isOpen || !isTransactionMode || mode === 'edit' || (mode === 'add' && templateId)) {
      return;
    }

    writeDraft({ form, detailsOpen, receiptId });
  }, [detailsOpen, form, isOpen, isTransactionMode, mode, receiptId, templateId]);

  useEffect(() => {
    if (!isTransactionMode || mode !== 'ocr' || !receipt || receipt.status !== 'processed' || ocrHydrated) {
      return;
    }

    setForm((current) => ({
      ...current,
      amount: receipt.extracted_total ? String(receipt.extracted_total) : current.amount,
      merchant: receipt.extracted_merchant ?? current.merchant,
      description: current.description || 'Saved in one tap',
      source: 'ocr',
      receipt_id: receipt.id,
    }));
    setDetailsOpen(true);
    setOcrHydrated(true);
  }, [isTransactionMode, mode, ocrHydrated, receipt]);

  const isBusy = createMutation.isPending || updateMutation.isPending || markTemplateUsedMutation.isPending;
  const canSubmit = Number(form.amount) > 0 && isTransactionMode;
  const headerTitle = mode === 'edit' ? 'Edit transaction' : mode === 'ocr' ? 'Add from receipt' : 'Quick add';
  const headerSubtitle = mode === 'edit'
    ? 'Check the amount and category, then save the updated transaction.'
    : mode === 'ocr'
      ? 'Upload a receipt photo to prefill the main fields automatically.'
      : templateQuery.data
        ? `Template selected: ${templateQuery.data.label} will prefill the form for you.`
        : 'Enter the amount, choose a category, and save in seconds.';

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
      queryClient.invalidateQueries({ queryKey: ['subscriptions'] }),
      queryClient.invalidateQueries({ queryKey: ['intelligence'] }),
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
      if (templateId) {
        await markTemplateUsedMutation.mutateAsync(templateId);
      }
      clearDraft();
    }

    await invalidateFinanceData();
    closeSheet();
  };

  const handleClose = () => {
    if (isTransactionMode && mode !== 'edit' && !(mode === 'add' && templateId)) {
      writeDraft({ form, detailsOpen, receiptId });
    }
    closeSheet();
  };

  if (!isOpen || !mode || !isTransactionMode) {
    return null;
  }

  return (
    <BottomSheetScaffold
      description={headerSubtitle}
      eyebrow="Transaction"
      footer={(
        <div className="flex gap-3">
          <button className="sheet-secondary-button" onClick={handleClose} type="button">
            Save
          </button>
          <button className="sheet-primary-button" disabled={!canSubmit || isBusy} onClick={() => void handleSubmit()} type="button">
            {isBusy ? 'Saving' : mode === 'edit' ? 'Update' : 'Add'}
          </button>
        </div>
      )}
      onClose={handleClose}
      title={headerTitle}
    >
      {mode === 'ocr' ? (
        <SurfaceCard>
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-sm font-medium text-white">Scan receipt</p>
              <p className="mt-1 text-sm text-[var(--app-muted)]">One photo is enough to pull in the amount, merchant, and draft transaction details.</p>
            </div>
            <button className="pill-button pill-button--ghost" onClick={() => inputRef.current?.click()} type="button">
              <UploadIcon size={16} />
              Upload photo
            </button>
          </div>
          <input ref={inputRef} accept="image/*" className="hidden" onChange={handleFilePick} type="file" />
          {uploadMutation.isPending ? <Skeleton className="mt-4 h-28 w-full rounded-[22px]" /> : null}
          {receipt?.status === 'pending' ? (
            <div className="mt-4 rounded-[24px] border border-[var(--app-stroke)] bg-white/[0.03] p-4 text-sm text-[var(--app-muted)]">
              OCR filled the draft. Review the amount and category before saving.
            </div>
          ) : null}
          {receipt?.status === 'processed' ? (
            <div className="mt-4 rounded-[24px] border border-emerald-400/20 bg-emerald-400/5 p-4">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-sm text-[var(--app-muted)]">Merchant</p>
                  <p className="mt-1 text-lg font-semibold text-white">{receipt.extracted_merchant || 'Unknown merchant'}</p>
                </div>
                <div className="text-right">
                  <p className="text-sm text-[var(--app-muted)]">Amount</p>
                  <p className="mt-1 text-lg font-semibold text-white">{formatMoney(receipt.extracted_total ?? 0)}</p>
                </div>
              </div>
            </div>
          ) : null}
          {receipt?.status === 'failed' ? (
            <div className="mt-4 rounded-[24px] border border-[var(--app-danger)]/20 bg-[var(--app-danger)]/10 p-4 text-sm text-[var(--app-danger)]">
               {receipt.error || 'Could not recognize the receipt.'}
            </div>
          ) : null}
        </SurfaceCard>
      ) : null}

      {mode === 'edit' && transactionQuery.isLoading ? (
        <div className="space-y-3">
          <Skeleton className="h-24 w-full rounded-[22px]" />
          <Skeleton className="h-24 w-full rounded-[22px]" />
        </div>
      ) : (
        <>
          <SegmentedControl
            onChange={(value) => handleChange('type', value)}
            options={[
               { label: 'Income', value: 'income' },
               { label: 'Expense', value: 'expense' },
            ]}
            value={form.type}
          />

          <SurfaceCard>
             <p className="soft-kicker">Amount</p>
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
          </SurfaceCard>

          {templateQuery.data ? (
            <SurfaceCard>
               <p className="text-sm text-[var(--app-muted)]">Details</p>
              <p className="mt-2 text-base font-semibold text-white">{templateQuery.data.label}</p>
               <p className="mt-1 text-sm text-[var(--app-muted)]">Add merchant, note, category override, or attach the receipt draft.</p>
            </SurfaceCard>
          ) : null}

          <div className="flex flex-wrap gap-2.5">
            {topCategories.map((category) => (
              <button
                key={category.id}
                className={clsx(
                  'pill-button',
                  form.category_id === category.id ? 'pill-button--primary' : 'pill-button--ghost',
                )}
                onClick={() => handleChange('category_id', form.category_id === category.id ? '' : category.id)}
                type="button"
              >
                {category.name}
              </button>
            ))}
          </div>

          <button className="pill-button pill-button--ghost w-fit" onClick={() => setDetailsOpen((current) => !current)} type="button">
            <SparklesIcon size={16} />
             {detailsOpen ? 'Hide details' : 'Show details'}
          </button>

          {detailsOpen ? (
            <SurfaceCard>
              <div className="space-y-3">
                <input
                  className="sheet-input"
                  onChange={(event) => handleChange('merchant', event.target.value)}
                   placeholder="Merchant or seller"
                  value={form.merchant}
                />
                <textarea
                  className="sheet-input min-h-24 resize-none"
                  onChange={(event) => handleChange('description', event.target.value)}
                   placeholder="Short transaction note"
                  value={form.description}
                />
                <select
                  className="sheet-input"
                  onChange={(event) => handleChange('category_id', event.target.value)}
                  value={form.category_id}
                >
                   <option value="">Uncategorized</option>
                  {categories.map((category) => (
                    <option key={category.id} value={category.id}>
                      {category.name}
                    </option>
                  ))}
                </select>
                {form.receipt_id ? (
                  <div className="flex items-center gap-2 rounded-[18px] border border-[var(--app-stroke)] bg-white/[0.03] px-4 py-3 text-sm text-[var(--app-muted)]">
                    <ReceiptIcon size={16} />
                     ??? #{form.receipt_id.slice(0, 8)}
                  </div>
                ) : null}
              </div>
            </SurfaceCard>
          ) : null}

          {!detailsOpen && mode !== 'ocr' && !receipt ? (
             <EmptyStateCard title="Receipt will appear here" description="Upload or scan a receipt and the OCR preview will show up in this sheet." />
          ) : null}
        </>
      )}
    </BottomSheetScaffold>
  );
}
