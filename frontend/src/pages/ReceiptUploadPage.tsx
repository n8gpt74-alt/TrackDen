import { Button, Card, Preloader } from 'konsta/react';
import { startTransition, type ChangeEvent, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';

import { useReceiptQuery, useUploadReceiptMutation } from '../features/receipts/api';
import { formatMoney } from '../shared/lib/money';

export function ReceiptUploadPage() {
  const navigate = useNavigate();
  const inputRef = useRef<HTMLInputElement | null>(null);
  const uploadMutation = useUploadReceiptMutation();
  const [receiptId, setReceiptId] = useState<string | null>(null);
  const receiptQuery = useReceiptQuery(receiptId);
  const receipt = receiptQuery.data;

  const handlePickFile = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }

    const uploaded = await uploadMutation.mutateAsync(file);
    startTransition(() => {
      setReceiptId(uploaded.id);
    });
    event.target.value = '';
  };

  return (
    <div className="space-y-4">
      <Card className="glass-card rounded-[32px] border border-white/20 p-6 shadow-[0_24px_70px_rgba(15,23,42,0.12)]">
        <p className="text-sm font-medium uppercase tracking-[0.22em] text-[var(--app-muted)]">OCR mock</p>
        <h1 className="mt-2 text-2xl font-bold">\u0420\u0430\u0441\u043f\u043e\u0437\u043d\u0430\u0442\u044c \u0447\u0435\u043a</h1>
        <p className="mt-3 text-sm leading-6 text-[var(--app-muted)]">\u0417\u0430\u0433\u0440\u0443\u0437\u0438 \u0444\u043e\u0442\u043e, \u0438 \u0432\u043e\u0440\u043a\u0435\u0440 \u0432\u0435\u0440\u043d\u0451\u0442 \u0441\u0443\u043c\u043c\u0443 \u0438 \u043f\u0440\u043e\u0434\u0430\u0432\u0446\u0430. \u0414\u043b\u044f \u0434\u0435\u043c\u043e \u0438\u0441\u043f\u043e\u043b\u044c\u0437\u0443\u0435\u0442\u0441\u044f mock OCR-\u043f\u0440\u043e\u0432\u0430\u0439\u0434\u0435\u0440 \u0441 \u0440\u0435\u0430\u043b\u044c\u043d\u044b\u043c \u043a\u043e\u043d\u0442\u0440\u0430\u043a\u0442\u043e\u043c \u0441\u0435\u0440\u0432\u0438\u0441\u0430.</p>

        <input ref={inputRef} accept="image/*" className="hidden" onChange={handlePickFile} type="file" />

        <div className="mt-5 flex gap-3">
          <Button className="flex-1 rounded-2xl" large onClick={() => inputRef.current?.click()} type="button">{uploadMutation.isPending ? '\u0417\u0430\u0433\u0440\u0443\u0436\u0430\u0435\u043c...' : '\u0412\u044b\u0431\u0440\u0430\u0442\u044c \u0444\u043e\u0442\u043e'}</Button>
          <Button clear large onClick={() => setReceiptId(null)} type="button">\u0421\u0431\u0440\u043e\u0441\u0438\u0442\u044c</Button>
        </div>
      </Card>

      {receiptId ? (
        <Card className="rounded-[30px] border border-[var(--app-border)] bg-[var(--app-surface-strong)] p-5">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-[var(--app-muted)]">\u0421\u0442\u0430\u0442\u0443\u0441 \u043e\u0431\u0440\u0430\u0431\u043e\u0442\u043a\u0438</p>
              <h2 className="text-xl font-semibold capitalize">{receipt?.status ?? 'pending'}</h2>
            </div>
            {receipt?.status === 'pending' ? <Preloader /> : null}
          </div>

          {receipt?.status === 'processed' ? (
            <div className="mt-5 space-y-4">
              <div className="rounded-[24px] border border-[var(--app-border)] bg-[var(--app-surface)] p-4">
                <p className="text-sm text-[var(--app-muted)]">\u041f\u0440\u043e\u0434\u0430\u0432\u0435\u0446</p>
                <p className="mt-1 text-lg font-semibold">{receipt.extracted_merchant || '\u041d\u0435 \u043e\u043f\u0440\u0435\u0434\u0435\u043b\u0451\u043d'}</p>
              </div>
              <div className="rounded-[24px] border border-[var(--app-border)] bg-[var(--app-surface)] p-4">
                <p className="text-sm text-[var(--app-muted)]">\u0421\u0443\u043c\u043c\u0430</p>
                <p className="mt-1 text-lg font-semibold">{formatMoney(receipt.extracted_total ?? 0)}</p>
              </div>
              <Button className="w-full rounded-2xl" large onClick={() => navigate('/transactions', { state: { draft: { amount: receipt.extracted_total ?? undefined, merchant: receipt.extracted_merchant, description: '\u0414\u043e\u0431\u0430\u0432\u043b\u0435\u043d\u043e \u0438\u0437 OCR \u0447\u0435\u043a\u0430', receipt_id: receipt.id, source: 'ocr' } } })} type="button">\u0418\u0441\u043f\u043e\u043b\u044c\u0437\u043e\u0432\u0430\u0442\u044c \u0432 \u043e\u043f\u0435\u0440\u0430\u0446\u0438\u0438</Button>
            </div>
          ) : null}

          {receipt?.status === 'failed' ? <div className="mt-5 rounded-[24px] border border-[var(--app-danger)]/20 bg-[var(--app-danger)]/5 p-4 text-sm text-[var(--app-danger)]">{receipt.error || '\u041d\u0435 \u0443\u0434\u0430\u043b\u043e\u0441\u044c \u043e\u0431\u0440\u0430\u0431\u043e\u0442\u0430\u0442\u044c \u0447\u0435\u043a.'}</div> : null}
          {!receipt ? <div className="mt-5 rounded-[24px] border border-dashed border-[var(--app-border)] p-4 text-sm text-[var(--app-muted)]">\u0416\u0434\u0451\u043c \u043e\u0442\u0432\u0435\u0442 \u0432\u043e\u0440\u043a\u0435\u0440\u0430...</div> : null}
        </Card>
      ) : null}
    </div>
  );
}
