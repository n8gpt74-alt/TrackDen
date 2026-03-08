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
        <h1 className="mt-2 text-2xl font-bold">Распознать чек</h1>
        <p className="mt-3 text-sm leading-6 text-[var(--app-muted)]">Загрузите фото, а воркер через Redis обработает его и вернёт сумму с магазином. Для демо используется mock OCR-провайдер с реальным контрактом сервиса.</p>

        <input
          ref={inputRef}
          accept="image/*"
          className="hidden"
          onChange={handlePickFile}
          type="file"
        />

        <div className="mt-5 flex gap-3">
          <Button className="flex-1 rounded-2xl" large onClick={() => inputRef.current?.click()} type="button">
            {uploadMutation.isPending ? 'Загружаем...' : 'Выбрать фото'}
          </Button>
          <Button clear large onClick={() => setReceiptId(null)} type="button">
            Сбросить
          </Button>
        </div>
      </Card>

      {receiptId ? (
        <Card className="rounded-[30px] border border-[var(--app-border)] bg-[var(--app-surface-strong)] p-5">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-[var(--app-muted)]">Статус обработки</p>
              <h2 className="text-xl font-semibold capitalize">{receipt?.status ?? 'pending'}</h2>
            </div>
            {receipt?.status === 'pending' ? <Preloader /> : null}
          </div>

          {receipt?.status === 'processed' ? (
            <div className="mt-5 space-y-4">
              <div className="rounded-[24px] border border-[var(--app-border)] bg-[var(--app-surface)] p-4">
                <p className="text-sm text-[var(--app-muted)]">Магазин</p>
                <p className="mt-1 text-lg font-semibold">{receipt.extracted_merchant || 'Не определён'}</p>
              </div>
              <div className="rounded-[24px] border border-[var(--app-border)] bg-[var(--app-surface)] p-4">
                <p className="text-sm text-[var(--app-muted)]">Сумма</p>
                <p className="mt-1 text-lg font-semibold">{formatMoney(receipt.extracted_total ?? 0)}</p>
              </div>
              <Button
                className="w-full rounded-2xl"
                large
                onClick={() =>
                  navigate('/transactions', {
                    state: {
                      draft: {
                        amount: receipt.extracted_total ?? undefined,
                        merchant: receipt.extracted_merchant,
                        description: 'Добавлено из OCR чека',
                        receipt_id: receipt.id,
                        source: 'ocr',
                      },
                    },
                  })
                }
                type="button"
              >
                Использовать в транзакции
              </Button>
            </div>
          ) : null}

          {receipt?.status === 'failed' ? (
            <div className="mt-5 rounded-[24px] border border-[var(--app-danger)]/20 bg-[var(--app-danger)]/5 p-4 text-sm text-[var(--app-danger)]">
              {receipt.error || 'Не удалось обработать чек.'}
            </div>
          ) : null}

          {!receipt ? (
            <div className="mt-5 rounded-[24px] border border-dashed border-[var(--app-border)] p-4 text-sm text-[var(--app-muted)]">Ожидаем ответ воркера...</div>
          ) : null}
        </Card>
      ) : null}
    </div>
  );
}
