import clsx from 'clsx';
import { useQueryClient } from '@tanstack/react-query';
import { type ChangeEvent, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';

import { useInitData } from '../features/auth/useInitData';
import { ApiError } from '../shared/api/errors';
import {
  clearWorkspace,
  exportWorkspace,
  getWorkspaceSummary,
  parseBackupFile,
  restoreWorkspace,
  summarizeWorkspace,
  type LocalBackupFileV1,
} from '../shared/api/localBackup';
import { getLocalWorkspaceContext } from '../shared/api/localApi';
import { isLocalDataMode } from '../shared/api/mode';
import { formatDateTimeLabel } from '../shared/lib/date';
import { AlertTriangleIcon, ChevronLeftIcon, DownloadIcon, IconCircleButton, SettingsIcon, TrashIcon, UploadIcon } from '../shared/ui/premium';

type NoticeState = {
  tone: 'success' | 'danger';
  message: string;
};

type BackupPreviewState = {
  backup: LocalBackupFileV1;
  fileName: string;
};

function MetricCard({ label, value, hint }: { label: string; value: string; hint: string }) {
  return (
    <div className="rounded-[22px] border border-[var(--app-stroke)] bg-white/[0.03] p-4">
      <p className="text-xs uppercase tracking-[0.18em] text-[var(--app-muted)]">{label}</p>
      <p className="mt-2 text-2xl font-semibold tracking-[-0.04em] text-white">{value}</p>
      <p className="mt-2 text-xs leading-5 text-[var(--app-muted)]">{hint}</p>
    </div>
  );
}

function getErrorMessage(error: unknown) {
  if (error instanceof ApiError) {
    return error.message;
  }

  if (error instanceof Error) {
    return error.message;
  }

  return 'Что-то пошло не так. Попробуй ещё раз.';
}

function downloadBlob(fileName: string, blob: Blob) {
  const objectUrl = window.URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = objectUrl;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => window.URL.revokeObjectURL(objectUrl), 1000);
}

export function SettingsPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const initDataRaw = useInitData();
  const [notice, setNotice] = useState<NoticeState | null>(null);
  const [summaryVersion, setSummaryVersion] = useState(0);
  const [preview, setPreview] = useState<BackupPreviewState | null>(null);
  const [ownerConfirmed, setOwnerConfirmed] = useState(false);
  const [clearArmed, setClearArmed] = useState(false);
  const [isRestoring, setIsRestoring] = useState(false);
  const [isClearing, setIsClearing] = useState(false);

  const localMode = isLocalDataMode();
  const storageSnapshot = useMemo(() => (localMode ? getWorkspaceSummary(initDataRaw) : null), [initDataRaw, localMode, summaryVersion]);
  const summary = storageSnapshot?.summary;
  const previewSummary = preview ? summarizeWorkspace(preview.backup.workspace) : null;
  const currentTelegramId = useMemo(
    () => (localMode ? getLocalWorkspaceContext(initDataRaw).principal.user.telegram_id ?? null : null),
    [initDataRaw, localMode],
  );
  const ownerMismatch = Boolean(
    preview && preview.backup.owner.telegram_id != null && currentTelegramId != null && preview.backup.owner.telegram_id !== currentTelegramId,
  );

  const invalidateFinanceQueries = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['session'] }),
      queryClient.invalidateQueries({ queryKey: ['transactions'] }),
      queryClient.invalidateQueries({ queryKey: ['transaction'] }),
      queryClient.invalidateQueries({ queryKey: ['receipt'] }),
      queryClient.invalidateQueries({ queryKey: ['analytics'] }),
      queryClient.invalidateQueries({ queryKey: ['budgets'] }),
    ]);
  };

  const handleExport = () => {
    try {
      const result = exportWorkspace(initDataRaw);
      downloadBlob(result.fileName, result.blob);
      setSummaryVersion((current) => current + 1);
      setNotice({
        tone: 'success',
        message: `JSON backup сохранён. Последний экспорт: ${formatDateTimeLabel(result.backup.exported_at)}.`,
      });
    } catch (error) {
      setNotice({
        tone: 'danger',
        message: getErrorMessage(error),
      });
    }
  };

  const handleFilePick = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';

    if (!file) {
      return;
    }

    try {
      const backup = await parseBackupFile(file);
      setPreview({ backup, fileName: file.name });
      setOwnerConfirmed(false);
      setNotice(null);
    } catch (error) {
      setPreview(null);
      setOwnerConfirmed(false);
      setNotice({
        tone: 'danger',
        message: getErrorMessage(error),
      });
    }
  };

  const handleRestore = async () => {
    if (!preview) {
      return;
    }

    if (ownerMismatch && !ownerConfirmed) {
      setNotice({
        tone: 'danger',
        message: 'Подтверди импорт backup от другого аккаунта, чтобы продолжить.',
      });
      return;
    }

    setIsRestoring(true);
    try {
      restoreWorkspace(preview.backup, initDataRaw);
      await invalidateFinanceQueries();
      setSummaryVersion((current) => current + 1);
      setPreview(null);
      setOwnerConfirmed(false);
      setClearArmed(false);
      setNotice({
        tone: 'success',
        message: 'Локальные данные, OCR metadata и лимиты полностью восстановлены из backup.',
      });
    } catch (error) {
      setNotice({
        tone: 'danger',
        message: getErrorMessage(error),
      });
    } finally {
      setIsRestoring(false);
    }
  };

  const handleClear = async () => {
    if (!clearArmed) {
      setClearArmed(true);
      setNotice(null);
      return;
    }

    setIsClearing(true);
    try {
      const result = clearWorkspace(initDataRaw);
      await invalidateFinanceQueries();
      setSummaryVersion((current) => current + 1);
      setPreview(null);
      setOwnerConfirmed(false);
      setClearArmed(false);
      setNotice({
        tone: 'success',
        message: `Локальные данные очищены: ${result.deletedSummary.transactions} операций, ${result.deletedSummary.receipts} чеков и ${result.deletedSummary.budget_limits} лимитов удалено.`,
      });
    } catch (error) {
      setNotice({
        tone: 'danger',
        message: getErrorMessage(error),
      });
    } finally {
      setIsClearing(false);
    }
  };

  return (
    <div className="space-y-5">
      <header className="page-topbar">
        <button className="icon-circle-button" onClick={() => navigate('/dashboard')} type="button">
          <ChevronLeftIcon size={18} />
        </button>
        <IconCircleButton>
          <SettingsIcon size={18} />
        </IconCircleButton>
      </header>

      <section className="premium-card rounded-[30px] p-5">
        <p className="soft-kicker">Local vault</p>
        <h1 className="mt-2 text-[32px] font-semibold leading-[1.04] tracking-[-0.05em] text-white">Резервные копии и восстановление</h1>
        <p className="mt-3 max-w-[310px] text-sm leading-6 text-[var(--app-muted)]">
          TrackDen хранит данные локально на устройстве. Здесь можно экспортировать JSON backup, восстановить его или полностью очистить локальный профиль вместе с лимитами месяца.
        </p>

        {!localMode ? (
          <div className="mt-5 rounded-[24px] border border-[var(--app-danger)]/20 bg-[var(--app-danger)]/10 p-4 text-sm leading-6 text-[var(--app-danger)]">
            Сейчас включён remote mode. Local backup доступен только при `VITE_DATA_MODE=local`.
          </div>
        ) : (
          <>
            <div className="mt-5 grid grid-cols-3 gap-3">
              <MetricCard hint="Всего локально" label="Операции" value={String(summary?.transactions ?? 0)} />
              <MetricCard hint="OCR и metadata" label="Чеки" value={String(summary?.receipts ?? 0)} />
              <MetricCard hint="Активные лимиты" label="Бюджеты" value={String(summary?.budget_limits ?? 0)} />
            </div>

            <div className="mt-4 rounded-[24px] border border-[var(--app-stroke)] bg-white/[0.03] p-4">
              <p className="text-sm font-medium text-white">Последний экспорт</p>
              <p className="mt-2 text-sm leading-6 text-[var(--app-muted)]">
                {storageSnapshot?.lastExportAt ? formatDateTimeLabel(storageSnapshot.lastExportAt) : 'Backup ещё не создавался на этом устройстве.'}
              </p>
            </div>
          </>
        )}
      </section>

      {notice ? (
        <div
          className={clsx(
            'rounded-[24px] border p-4 text-sm leading-6',
            notice.tone === 'success'
              ? 'border-emerald-400/20 bg-emerald-400/10 text-emerald-100'
              : 'border-[var(--app-danger)]/20 bg-[var(--app-danger)]/10 text-[var(--app-danger)]',
          )}
        >
          {notice.message}
        </div>
      ) : null}

      <section className="premium-card rounded-[28px] p-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="soft-kicker">Backup</p>
            <h2 className="mt-1 text-xl font-semibold text-white">Экспорт JSON</h2>
          </div>
          <div className="icon-circle-button">
            <DownloadIcon size={18} />
          </div>
        </div>
        <p className="mt-3 text-sm leading-6 text-[var(--app-muted)]">
          Файл содержит чувствительные финансовые данные: операции, категории, OCR metadata чеков и шаблоны месячных лимитов. Храни его там, где тебе комфортно.
        </p>
        <button className="sheet-primary-button mt-5 w-full" disabled={!localMode} onClick={handleExport} type="button">
          Экспортировать JSON
        </button>
      </section>

      <section className="premium-card rounded-[28px] p-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="soft-kicker">Restore</p>
            <h2 className="mt-1 text-xl font-semibold text-white">Восстановить backup</h2>
          </div>
          <div className="icon-circle-button">
            <UploadIcon size={18} />
          </div>
        </div>
        <p className="mt-3 text-sm leading-6 text-[var(--app-muted)]">
          Импорт полностью заменит текущие локальные данные этого профиля. Перед подтверждением покажем владельца backup, объём данных и проверим совпадение Telegram-аккаунта.
        </p>

        <input accept=".json,application/json" className="hidden" onChange={handleFilePick} ref={fileInputRef} type="file" />

        <button className="sheet-secondary-button mt-5 w-full" disabled={!localMode || isRestoring} onClick={() => fileInputRef.current?.click()} type="button">
          Выбрать JSON-файл
        </button>

        {preview ? (
          <div className="mt-5 space-y-4 rounded-[24px] border border-[var(--app-stroke)] bg-white/[0.03] p-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-sm font-medium text-white">{preview.fileName}</p>
                <p className="mt-1 text-sm text-[var(--app-muted)]">Экспорт: {formatDateTimeLabel(preview.backup.exported_at)}</p>
              </div>
              <div className="rounded-full border border-[var(--app-stroke)] bg-white/[0.03] px-3 py-2 text-xs uppercase tracking-[0.18em] text-[var(--app-muted)]">
                v{preview.backup.version}
              </div>
            </div>

            <div className="rounded-[22px] border border-[var(--app-stroke)] bg-[#0c1018] p-4">
              <p className="text-sm text-[var(--app-muted)]">Владелец backup</p>
              <p className="mt-2 text-base font-semibold text-white">
                {preview.backup.owner.first_name || preview.backup.owner.username || 'TrackDen user'}
              </p>
              <p className="mt-1 text-sm text-[var(--app-muted)]">
                {preview.backup.owner.username ? `@${preview.backup.owner.username}` : preview.backup.owner.scope_id}
              </p>
            </div>

            <div className="grid grid-cols-3 gap-3">
              <MetricCard hint="Будут заменены" label="Операции" value={String(previewSummary?.transactions ?? 0)} />
              <MetricCard hint="OCR metadata" label="Чеки" value={String(previewSummary?.receipts ?? 0)} />
              <MetricCard hint="Лимиты внутри backup" label="Бюджеты" value={String(previewSummary?.budget_limits ?? 0)} />
            </div>

            {ownerMismatch ? (
              <div className="rounded-[22px] border border-amber-400/25 bg-amber-400/10 p-4">
                <div className="flex items-start gap-3">
                  <AlertTriangleIcon className="mt-0.5 text-amber-300" size={18} />
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-amber-100">Backup создан для другого Telegram-профиля</p>
                    <p className="mt-1 text-sm leading-6 text-amber-100/80">
                      Можно продолжить, но текущие локальные данные будут полностью заменены данными из другого аккаунта.
                    </p>
                  </div>
                </div>
                <label className="mt-4 flex items-start gap-3 rounded-[18px] border border-amber-300/15 bg-black/10 px-4 py-3 text-sm text-amber-50">
                  <input checked={ownerConfirmed} className="mt-1" onChange={(event) => setOwnerConfirmed(event.target.checked)} type="checkbox" />
                  <span>Понимаю, что импортирую backup другого профиля, и подтверждаю полную замену локальных данных.</span>
                </label>
              </div>
            ) : null}

            <div className="flex gap-3">
              <button className="sheet-secondary-button" onClick={() => setPreview(null)} type="button">
                Отменить
              </button>
              <button
                className="sheet-primary-button"
                disabled={isRestoring || (ownerMismatch && !ownerConfirmed)}
                onClick={() => void handleRestore()}
                type="button"
              >
                {isRestoring ? 'Восстанавливаем…' : 'Полностью заменить данные'}
              </button>
            </div>
          </div>
        ) : null}
      </section>

      <section className="premium-card rounded-[28px] border-[var(--app-danger)]/20 p-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="soft-kicker">Danger zone</p>
            <h2 className="mt-1 text-xl font-semibold text-white">Очистить локальные данные</h2>
          </div>
          <div className="icon-circle-button text-[var(--app-danger)]">
            <TrashIcon size={18} />
          </div>
        </div>
        <>
          <p className="mt-3 text-sm leading-6 text-[var(--app-muted)]">
            Будут удалены {summary?.transactions ?? 0} операций, {summary?.receipts ?? 0} чеков, {summary?.budget_limits ?? 0} лимитов и {summary?.custom_categories ?? 0} пользовательских категорий. Системные категории останутся и создадутся заново.
          </p>

          {clearArmed ? (
            <div className="mt-4 rounded-[22px] border border-[var(--app-danger)]/20 bg-[var(--app-danger)]/10 p-4">
              <div className="flex items-start gap-3">
                <AlertTriangleIcon className="mt-0.5 text-[var(--app-danger)]" size={18} />
                <div>
                  <p className="text-sm font-medium text-white">Подтверди очистку</p>
                  <p className="mt-1 text-sm leading-6 text-[var(--app-muted)]">
                    После очистки данные этого локального профиля исчезнут, пока ты не восстановишь их из backup.
                  </p>
                </div>
              </div>

              <div className="mt-4 flex gap-3">
                <button className="sheet-secondary-button" onClick={() => setClearArmed(false)} type="button">
                  Отмена
                </button>
                <button className="sheet-primary-button" disabled={isClearing} onClick={() => void handleClear()} type="button">
                  {isClearing ? 'Очищаем…' : 'Удалить навсегда'}
                </button>
              </div>
            </div>
          ) : (
            <button className="sheet-secondary-button mt-5 w-full border-[var(--app-danger)]/25 text-[var(--app-danger)]" disabled={!localMode} onClick={() => void handleClear()} type="button">
              Начать очистку
            </button>
          )}
        </>
      </section>
    </div>
  );
}
