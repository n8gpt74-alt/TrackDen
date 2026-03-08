import { useMutation, useQuery } from '@tanstack/react-query';

import { useInitData } from '../auth/useInitData';
import { apiRequest } from '../../shared/api/http';

export type Receipt = {
  id: string;
  original_filename?: string | null;
  mime_type?: string | null;
  size_bytes?: number | null;
  status: 'pending' | 'processed' | 'failed';
  ocr_provider: 'mock' | 'google_vision';
  extracted_total?: number | null;
  extracted_merchant?: string | null;
  ocr_raw?: Record<string, unknown> | null;
  error?: string | null;
  uploaded_at: string;
  processed_at?: string | null;
  created_at: string;
  updated_at: string;
};

export function useUploadReceiptMutation() {
  const initDataRaw = useInitData();

  return useMutation({
    mutationFn: async (file: File) => {
      const formData = new FormData();
      formData.append('file', file);

      return apiRequest<Receipt>('/receipts', {
        method: 'POST',
        initDataRaw,
        body: formData,
      });
    },
  });
}

export function useReceiptQuery(receiptId: string | null) {
  const initDataRaw = useInitData();

  return useQuery({
    enabled: Boolean(receiptId),
    queryKey: ['receipt', receiptId],
    queryFn: () =>
      apiRequest<Receipt>(`/receipts/${receiptId}`, {
        initDataRaw,
      }),
    refetchInterval: (query) => {
      const receipt = query.state.data;
      return receipt?.status === 'pending' ? 2000 : false;
    },
  });
}
