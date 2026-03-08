import { Button, Card } from 'konsta/react';

import type { Transaction } from './api';
import { formatMoney } from '../../shared/lib/money';

type TransactionsListProps = {
  items: Transaction[];
  deletingId?: string | null;
  onDelete: (transaction: Transaction) => void;
  onEdit: (transaction: Transaction) => void;
};

export function TransactionsList({ items, deletingId, onDelete, onEdit }: TransactionsListProps) {
  if (items.length === 0) {
    return <div className="rounded-[28px] border border-dashed border-[var(--app-border)] p-6 text-sm text-[var(--app-muted)]">Операций за этот месяц пока нет.</div>;
  }

  return (
    <div className="space-y-3">
      {items.map((transaction) => {
        const isExpense = transaction.type === 'expense';
        return (
          <Card key={transaction.id} className="rounded-[24px] border border-[var(--app-border)] bg-[var(--app-surface)] p-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="flex items-center gap-2">
                  <span
                    className="inline-flex h-10 w-10 items-center justify-center rounded-2xl text-sm font-semibold"
                    style={{
                      background: `${transaction.category?.color ?? (isExpense ? '#ef4444' : '#16a34a')}15`,
                      color: transaction.category?.color ?? (isExpense ? '#ef4444' : '#16a34a'),
                    }}
                  >
                    {transaction.category?.name.slice(0, 1) ?? '•'}
                  </span>
                  <div>
                    <p className="font-semibold">{transaction.merchant || transaction.description || 'Без названия'}</p>
                    <p className="text-sm text-[var(--app-muted)]">
                      {transaction.category?.name ?? 'Автокатегория'} · {new Date(transaction.occurred_at).toLocaleDateString('ru-RU')}
                    </p>
                  </div>
                </div>
                {transaction.description ? <p className="mt-3 text-sm text-[var(--app-muted)]">{transaction.description}</p> : null}
              </div>
              <div className="text-right">
                <p className={`text-lg font-semibold ${isExpense ? 'text-[var(--app-danger)]' : 'text-[var(--app-success)]'}`}>
                  {isExpense ? '-' : '+'}
                  {formatMoney(transaction.amount, transaction.currency)}
                </p>
                {transaction.ai_confidence ? <p className="mt-1 text-xs text-[var(--app-muted)]">AI {Math.round(transaction.ai_confidence * 100)}%</p> : null}
              </div>
            </div>
            <div className="mt-4 flex gap-2">
              <Button clear small onClick={() => onEdit(transaction)} type="button">
                Изменить
              </Button>
              <Button
                className="text-[var(--app-danger)]"
                clear
                disabled={deletingId === transaction.id}
                small
                onClick={() => onDelete(transaction)}
                type="button"
              >
                {deletingId === transaction.id ? 'Удаляем...' : 'Удалить'}
              </Button>
            </div>
          </Card>
        );
      })}
    </div>
  );
}

