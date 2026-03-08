import { useMutation, useQuery } from '@tanstack/react-query';

import { useTelegram } from '../../app/providers/TelegramProvider';
import { apiRequest } from '../../shared/api/http';
import { isLocalDataMode } from '../../shared/api/mode';
import { useInitData } from '../auth/useInitData';

export type TransactionType = 'expense' | 'income';
export type TransactionSource = 'manual' | 'ocr';

export type Transaction = {
  id: string;
  amount: number;
  type: TransactionType;
  currency: string;
  description?: string | null;
  merchant?: string | null;
  occurred_at: string;
  source: TransactionSource;
  receipt_id?: string | null;
  ai_confidence?: number | null;
  category?: {
    id: string;
    name: string;
    color?: string | null;
  } | null;
  created_at: string;
  updated_at: string;
};

export type TransactionsResponse = {
  items: Transaction[];
  total: number;
};

export type TransactionPayload = {
  amount: number;
  type: TransactionType;
  currency: string;
  category_id?: string | null;
  description?: string | null;
  merchant?: string | null;
  occurred_at?: string | null;
  source?: TransactionSource;
  receipt_id?: string | null;
};

export function useTransactionsQuery(month: string, limit = 30, type?: TransactionType) {
  const initDataRaw = useInitData();
  const { isReady, isTelegram } = useTelegram();
  const enabled = isReady && (isLocalDataMode() || !isTelegram || Boolean(initDataRaw));
  const search = new URLSearchParams({
    month,
    limit: String(limit),
  });

  if (type) {
    search.set('type', type);
  }

  return useQuery({
    enabled,
    queryKey: ['transactions', month, limit, type],
    queryFn: () =>
      apiRequest<TransactionsResponse>(`/transactions?${search.toString()}`, {
        initDataRaw,
      }),
  });
}

export function useTransactionQuery(id: string | null) {
  const initDataRaw = useInitData();
  const { isReady, isTelegram } = useTelegram();
  const enabled = Boolean(id) && isReady && (isLocalDataMode() || !isTelegram || Boolean(initDataRaw));

  return useQuery({
    enabled,
    queryKey: ['transaction', id],
    queryFn: () =>
      apiRequest<Transaction>(`/transactions/${id}`, {
        initDataRaw,
      }),
  });
}

export function useCreateTransactionMutation() {
  const initDataRaw = useInitData();

  return useMutation({
    mutationFn: (payload: TransactionPayload) =>
      apiRequest<Transaction>('/transactions', {
        method: 'POST',
        initDataRaw,
        body: payload,
      }),
  });
}

export function useUpdateTransactionMutation() {
  const initDataRaw = useInitData();

  return useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: Partial<TransactionPayload> }) =>
      apiRequest<Transaction>(`/transactions/${id}`, {
        method: 'PATCH',
        initDataRaw,
        body: payload,
      }),
  });
}

export function useDeleteTransactionMutation() {
  const initDataRaw = useInitData();

  return useMutation({
    mutationFn: (id: string) =>
      apiRequest<void>(`/transactions/${id}`, {
        method: 'DELETE',
        initDataRaw,
      }),
  });
}
