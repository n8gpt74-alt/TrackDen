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
import {
  ConfirmStateCard,
  PremiumStatTile,
  ReviewCard,
  ScreenHeader,
  SectionHeader,
  StatusBadge,
  SurfaceCard,
} from '../shared/ui/premium-kit';
import { ChevronLeftIcon, DownloadIcon, IconCircleButton, TrashIcon, UploadIcon } from '../shared/ui/premium';

type NoticeState = {
  tone: 'success' | 'danger';
  message: string;
};

type BackupPreviewState = {
  backup: LocalBackupFileV1;
  fileName: string;
};

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
      queryClient.invalidateQueries({ queryKey: ['subscriptions'] }),
    ]);
  };

  const handleExport = () => {
    try {
      const result = exportWorkspace(initDataRaw);
      downloadBlob(result.fileName, result.blob);
      setSummaryVersion((current) => current + 1);
      setNotice({
        tone: 'success',
        message: `Резервная копия сохранена. Последний экспорт: ${formatDateTimeLabel(result.backup.exported_at)}.`,
      });
    } catch (error) {
      setNotice({ tone: 'danger', message: getErrorMessage(error) });
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
      setNotice({ tone: 'danger', message: getErrorMessage(error) });
    }
  };

  const handleRestore = async () => {
    if (!preview) {
      return;
    }

    if (ownerMismatch && !ownerConfirmed) {
      setNotice({ tone: 'danger', message: 'Подтверди импорт резервной копии другого аккаунта, чтобы продолжить.' });
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
      setNotice({ tone: 'success', message: 'Локальные данные, данные чеков, бюджеты и подписки полностью восстановлены.' });
    } catch (error) {
      setNotice({ tone: 'danger', message: getErrorMessage(error) });
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
        message: `Локальный профиль очищен: удалено ${result.deletedSummary.transactions} операций, ${result.deletedSummary.receipts} чеков, ${result.deletedSummary.budget_limits} лимитов и ${result.deletedSummary.subscriptions} подписок.`,
      });
    } catch (error) {
      setNotice({ tone: 'danger', message: getErrorMessage(error) });
    } finally {
      setIsClearing(false);
    }
  };

  return (
    <div className="space-y-6">
      <ScreenHeader
        eyebrow="Настройки"
        title="Локальное хранилище"
        description="Резервные копии, восстановление и контроль над данными профиля без визуальной перегрузки."
        leading={(
          <IconCircleButton onClick={() => navigate('/dashboard')}>
            <ChevronLeftIcon size={18} />
          </IconCircleButton>
        )}
      />

      <SurfaceCard tone="hero">
        <SectionHeader
          eyebrow="Состояние профиля"
          title="Всё важное по локальным данным"
          description="TrackDen хранит историю на устройстве. Здесь видно объём данных и можно быстро сделать резервную копию."
          action={storageSnapshot?.lastExportAt ? <StatusBadge tone="success">Есть копия</StatusBadge> : <StatusBadge tone="neutral">Без копии</StatusBadge>}
        />

        {!localMode ? (
          <div className="mt-4">
            <ConfirmStateCard
              title="Сейчас включён удалённый режим"
              description="Локальные резервные копии доступны только при `VITE_DATA_MODE=local`."
              tone="warning"
            />
          </div>
        ) : (
          <>
            <div className="stat-grid mt-4">
              <PremiumStatTile hint="Всего локально" label="Операции" tone="neutral" value={String(summary?.transactions ?? 0)} />
              <PremiumStatTile hint="Распознанные данные" label="Чеки" tone="accent" value={String(summary?.receipts ?? 0)} />
              <PremiumStatTile hint="Активные лимиты" label="Бюджеты" tone="warning" value={String(summary?.budget_limits ?? 0)} />
              <PremiumStatTile hint="Ручные и автоматические" label="Подписки" tone="success" value={String(summary?.subscriptions ?? 0)} />
            </div>

            <ReviewCard className="mt-4">
              <p className="text-sm text-[var(--app-muted)]">Последний экспорт</p>
              <p className="mt-2 text-base font-semibold text-white">
                {storageSnapshot?.lastExportAt ? formatDateTimeLabel(storageSnapshot.lastExportAt) : 'Резервная копия ещё не создавалась на этом устройстве.'}
              </p>
            </ReviewCard>
          </>
        )}
      </SurfaceCard>

      {notice ? (
        <ConfirmStateCard
          description={notice.message}
          title={notice.tone === 'success' ? 'Готово' : 'Нужно внимание'}
          tone={notice.tone === 'success' ? 'success' : 'danger'}
        />
      ) : null}

      <SurfaceCard>
        <SectionHeader
          eyebrow="Резервная копия"
          title="Экспорт JSON"
          description="Файл содержит чувствительные финансовые данные: операции, категории, данные чеков, бюджеты и подписки."
          action={(
            <IconCircleButton onClick={handleExport} disabled={!localMode}>
              <DownloadIcon size={18} />
            </IconCircleButton>
          )}
        />
        <div className="mt-4">
          <button className="sheet-primary-button w-full" disabled={!localMode} onClick={handleExport} type="button">
            Экспортировать резервную копию
          </button>
        </div>
      </SurfaceCard>

      <SurfaceCard>
        <SectionHeader
          eyebrow="Восстановление"
          title="Импорт из резервной копии"
          description="Перед восстановлением покажем владельца файла и объём данных, которые будут заменены."
          action={(
            <IconCircleButton onClick={() => fileInputRef.current?.click()} disabled={!localMode || isRestoring}>
              <UploadIcon size={18} />
            </IconCircleButton>
          )}
        />

        <input accept=".json,application/json" className="hidden" onChange={handleFilePick} ref={fileInputRef} type="file" />

        <div className="mt-4">
          <button className="sheet-secondary-button w-full" disabled={!localMode || isRestoring} onClick={() => fileInputRef.current?.click()} type="button">
            Выбрать файл JSON
          </button>
        </div>

        {preview ? (
          <div className="mt-4 space-y-4">
            <ReviewCard>
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-sm font-medium text-white">{preview.fileName}</p>
                  <p className="mt-1 text-sm text-[var(--app-muted)]">Экспорт: {formatDateTimeLabel(preview.backup.exported_at)}</p>
                </div>
                <StatusBadge tone="neutral">v{preview.backup.version}</StatusBadge>
              </div>
            </ReviewCard>

            <ReviewCard>
              <p className="text-sm text-[var(--app-muted)]">Владелец резервной копии</p>
              <p className="mt-2 text-base font-semibold text-white">{preview.backup.owner.first_name || preview.backup.owner.username || 'Пользователь TrackDen'}</p>
              <p className="mt-1 text-sm text-[var(--app-muted)]">{preview.backup.owner.username ? `@${preview.backup.owner.username}` : preview.backup.owner.scope_id}</p>
            </ReviewCard>

            <div className="stat-grid">
              <PremiumStatTile hint="Будут заменены" label="Операции" tone="neutral" value={String(previewSummary?.transactions ?? 0)} />
              <PremiumStatTile hint="Данные чека" label="Чеки" tone="accent" value={String(previewSummary?.receipts ?? 0)} />
              <PremiumStatTile hint="Шаблоны лимитов" label="Бюджеты" tone="warning" value={String(previewSummary?.budget_limits ?? 0)} />
              <PremiumStatTile hint="Менеджер подписок" label="Подписки" tone="success" value={String(previewSummary?.subscriptions ?? 0)} />
            </div>

            {ownerMismatch ? (
              <ConfirmStateCard
                title="Файл создан для другого Telegram-профиля"
                description="Можно продолжить, но текущие локальные данные будут полностью заменены содержимым другого профиля."
                tone="warning"
                action={(
                  <label className="mt-3 flex items-start gap-3 rounded-[18px] border border-amber-300/15 bg-black/10 px-4 py-3 text-sm text-amber-50">
                    <input checked={ownerConfirmed} className="mt-1" onChange={(event) => setOwnerConfirmed(event.target.checked)} type="checkbox" />
                    <span>Понимаю риск и подтверждаю полную замену локальных данных.</span>
                  </label>
                )}
              />
            ) : null}

            <div className="flex gap-3">
              <button className="sheet-secondary-button" onClick={() => setPreview(null)} type="button">
                Отменить
              </button>
              <button className="sheet-primary-button" disabled={isRestoring || (ownerMismatch && !ownerConfirmed)} onClick={() => void handleRestore()} type="button">
                {isRestoring ? 'Восстанавливаем…' : 'Восстановить данные'}
              </button>
            </div>
          </div>
        ) : null}
      </SurfaceCard>

      <SurfaceCard tone="danger">
        <SectionHeader
          eyebrow="Опасная зона"
          title="Очистить локальные данные"
          description="Спокойный, но необратимый сценарий: удалится только текущий локальный профиль, системные категории восстановятся автоматически."
          action={<IconCircleButton className="text-[var(--app-danger)]"><TrashIcon size={18} /></IconCircleButton>}
        />

        <div className="mt-4">
          <ReviewCard>
            <p className="text-sm leading-6 text-[var(--app-muted)]">
              Будут удалены {summary?.transactions ?? 0} операций, {summary?.receipts ?? 0} чеков, {summary?.budget_limits ?? 0} лимитов, {summary?.subscriptions ?? 0} подписок и {summary?.custom_categories ?? 0} пользовательских категорий.
            </p>
          </ReviewCard>
        </div>

        <div className="mt-4">
          {clearArmed ? (
            <ConfirmStateCard
              title="Подтверди очистку"
              description="После очистки данные этого локального профиля исчезнут, пока ты не восстановишь их из резервной копии."
              tone="danger"
              action={(
                <div className="mt-4 flex gap-3">
                  <button className="sheet-secondary-button" onClick={() => setClearArmed(false)} type="button">
                    Отмена
                  </button>
                  <button className="sheet-primary-button" disabled={isClearing} onClick={() => void handleClear()} type="button">
                    {isClearing ? 'Очищаем…' : 'Удалить навсегда'}
                  </button>
                </div>
              )}
            />
          ) : (
            <button className="sheet-secondary-button w-full border-[var(--app-danger)]/25 text-[var(--app-danger)]" disabled={!localMode} onClick={() => void handleClear()} type="button">
              Начать очистку
            </button>
          )}
        </div>
      </SurfaceCard>
    </div>
  );
}