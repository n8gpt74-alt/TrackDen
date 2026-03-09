import { useQueryClient } from '@tanstack/react-query';
import { type ChangeEvent, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';

import { useInitData } from '../features/auth/useInitData';
import { useFinanceSheet } from '../features/finance-sheet/useFinanceSheet';
import { useAutomationOverviewQuery } from '../features/intelligence/api';
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
import { UI_TEXT } from '../shared/i18n/ui';
import { Skeleton } from '../shared/ui/Skeleton';
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

  return 'Вне Telegram или без сессии. Импорт из файла всё равно доступен.';
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
  const { openSheet } = useFinanceSheet();
  const automationQuery = useAutomationOverviewQuery();
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
      queryClient.invalidateQueries({ queryKey: ['intelligence'] }),
    ]);
  };

  const handleExport = () => {
    try {
      const result = exportWorkspace(initDataRaw);
      downloadBlob(result.fileName, result.blob);
      setSummaryVersion((current) => current + 1);
      setNotice({
        tone: 'success',
        message: `Резервная копия создана. Время экспорта: ${formatDateTimeLabel(result.backup.exported_at)}.`,
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
      setNotice({
        tone: 'danger',
        message: 'Эта копия принадлежит другому Telegram-профилю. Ещё раз проверь, что хочешь импортировать именно её.',
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
      setNotice({ tone: 'success', message: 'Данные восстановлены: операции, чеки, лимиты, подписки и автоматизация снова на месте.' });
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
        message: `Локальные данные очищены: удалено ${result.deletedSummary.transactions} операций, ${result.deletedSummary.receipts} чеков, ${result.deletedSummary.budget_limits} лимитов, ${result.deletedSummary.subscriptions} подписок и ${result.deletedSummary.smart_rules + result.deletedSummary.quick_templates} элементов автоматизации.`,
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
        eyebrow={UI_TEXT.common.settings}
        title="Локальный профиль"
        description="Управляй данными, резервными копиями и всем, что хранится на этом устройстве."
        leading={(
          <IconCircleButton onClick={() => navigate('/dashboard')}>
            <ChevronLeftIcon size={18} />
          </IconCircleButton>
        )}
      />

      <SurfaceCard tone="hero">
        <SectionHeader
          eyebrow="Снимок профиля"
          title="Что сейчас есть на этом устройстве"
          description="TrackDen хранит данные локально. Здесь видно, в каких модулях уже есть история."
          action={storageSnapshot?.lastExportAt ? <StatusBadge tone="success">Копия есть</StatusBadge> : <StatusBadge tone="neutral">Копии нет</StatusBadge>}
        />

        {!localMode ? (
          <div className="mt-4">
            <ConfirmStateCard
              title="Локальный режим бережёт приватность"
              description="Пока включён локальный режим, главные финансовые данные остаются на устройстве."
              tone="warning"
            />
          </div>
        ) : (
          <>
            <div className="stat-grid mt-4">
              <PremiumStatTile hint="Всего операций" label={UI_TEXT.common.transactions} tone="neutral" value={String(summary?.transactions ?? 0)} />
              <PremiumStatTile hint="Распознанные чеки" label={UI_TEXT.common.receipts} tone="accent" value={String(summary?.receipts ?? 0)} />
              <PremiumStatTile hint="Активные лимиты" label={UI_TEXT.common.budgets} tone="warning" value={String(summary?.budget_limits ?? 0)} />
              <PremiumStatTile hint="Связи и регулярные списания" label={UI_TEXT.common.subscriptions} tone="success" value={String(summary?.subscriptions ?? 0)} />
            </div>

            <ReviewCard className="mt-4">
              <p className="text-sm text-[var(--app-muted)]">Последний экспорт</p>
              <p className="mt-2 text-base font-semibold text-white">
                {storageSnapshot?.lastExportAt ? formatDateTimeLabel(storageSnapshot.lastExportAt) : 'На этом устройстве ещё нет резервной копии.'}
              </p>
            </ReviewCard>
          </>
        )}
      </SurfaceCard>

      {localMode ? (
        <SurfaceCard>
          <SectionHeader
            eyebrow={UI_TEXT.common.automation}
            title="Правила, шаблоны и умный слой"
            description="Здесь живут автоправила, быстрые шаблоны и подсказки, которые рождаются из истории."
            action={<button className="pill-button pill-button--ghost" onClick={() => openSheet('automation')} type="button">{UI_TEXT.common.open}</button>}
          />

          {automationQuery.isLoading ? (
            <div className="mt-4 grid grid-cols-3 gap-3">
              <Skeleton className="h-24 w-full rounded-[22px]" />
              <Skeleton className="h-24 w-full rounded-[22px]" />
              <Skeleton className="h-24 w-full rounded-[22px]" />
            </div>
          ) : (
            <div className="stat-grid mt-4">
              <PremiumStatTile hint="Активные правила" label={UI_TEXT.common.rules} tone="accent" value={String(automationQuery.data?.active_rule_count ?? 0)} />
              <PremiumStatTile hint="Сохранённые шаблоны" label={UI_TEXT.common.templates} tone="success" value={String(automationQuery.data?.manual_template_count ?? 0)} />
              <PremiumStatTile hint="Подсказки из истории" label={UI_TEXT.common.suggestions} tone="warning" value={String(automationQuery.data?.suggested_template_count ?? 0)} />
              <PremiumStatTile hint="Попадёт в резервную копию" label="Слой" tone="neutral" value={String((summary?.smart_rules ?? 0) + (summary?.quick_templates ?? 0))} />
            </div>
          )}
        </SurfaceCard>
      ) : null}

      {notice ? (
        <ConfirmStateCard
          description={notice.message}
          title={notice.tone === 'success' ? 'Готово' : 'Нужно внимание'}
          tone={notice.tone === 'success' ? 'success' : 'danger'}
        />
      ) : null}

      <SurfaceCard>
        <SectionHeader
          eyebrow={UI_TEXT.common.backup}
          title="Экспорт JSON"
          description="Файл содержит локальные финансовые данные: операции, категории, чеки, лимиты, подписки и автоматизацию."
          action={(
            <IconCircleButton onClick={handleExport} disabled={!localMode}>
              <DownloadIcon size={18} />
            </IconCircleButton>
          )}
        />
        <div className="mt-4">
          <button className="sheet-primary-button w-full" disabled={!localMode} onClick={handleExport} type="button">
            Экспортировать JSON
          </button>
        </div>
      </SurfaceCard>

      <SurfaceCard>
        <SectionHeader
          eyebrow={UI_TEXT.common.restore}
          title="Импорт из копии"
          description="Можно полностью заменить текущий профиль данными из другого файла, если ты доверяешь источнику."
          action={(
            <IconCircleButton onClick={() => fileInputRef.current?.click()} disabled={!localMode || isRestoring}>
              <UploadIcon size={18} />
            </IconCircleButton>
          )}
        />

        <input accept=".json,application/json" className="hidden" onChange={handleFilePick} ref={fileInputRef} type="file" />

        <div className="mt-4">
          <button className="sheet-secondary-button w-full" disabled={!localMode || isRestoring} onClick={() => fileInputRef.current?.click()} type="button">
            Выбрать JSON-файл
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
              <p className="text-sm text-[var(--app-muted)]">Владелец копии</p>
              <p className="mt-2 text-base font-semibold text-white">{preview.backup.owner.first_name || preview.backup.owner.username || 'Профиль TrackDen'}</p>
              <p className="mt-1 text-sm text-[var(--app-muted)]">{preview.backup.owner.username ? `@${preview.backup.owner.username}` : preview.backup.owner.scope_id}</p>
            </ReviewCard>

            <div className="stat-grid">
              <PremiumStatTile hint="Всего операций" label={UI_TEXT.common.transactions} tone="neutral" value={String(previewSummary?.transactions ?? 0)} />
              <PremiumStatTile hint="Метаданные чеков" label={UI_TEXT.common.receipts} tone="accent" value={String(previewSummary?.receipts ?? 0)} />
              <PremiumStatTile hint="Настройки лимитов" label={UI_TEXT.common.budgets} tone="warning" value={String(previewSummary?.budget_limits ?? 0)} />
              <PremiumStatTile hint="Автоматизация в этом профиле" label={UI_TEXT.common.automation} tone="success" value={String((previewSummary?.smart_rules ?? 0) + (previewSummary?.quick_templates ?? 0))} />
            </div>

            {ownerMismatch ? (
              <ConfirmStateCard
                title="Эта копия принадлежит другому Telegram-профилю"
                description="Импорт разрешён, но сначала убедись, что ты точно хочешь заменить текущий локальный профиль именно этой копией."
                tone="warning"
                action={(
                  <label className="mt-3 flex items-start gap-3 rounded-[18px] border border-amber-300/15 bg-black/10 px-4 py-3 text-sm text-amber-50">
                    <input checked={ownerConfirmed} className="mt-1" onChange={(event) => setOwnerConfirmed(event.target.checked)} type="checkbox" />
                    <span>Понимаю, что это заменит текущий локальный профиль.</span>
                  </label>
                )}
              />
            ) : null}

            <div className="flex gap-3">
              <button className="sheet-secondary-button" onClick={() => setPreview(null)} type="button">
                {UI_TEXT.common.cancel}
              </button>
              <button className="sheet-primary-button" disabled={isRestoring || (ownerMismatch && !ownerConfirmed)} onClick={() => void handleRestore()} type="button">
                {isRestoring ? 'Восстанавливаем…' : 'Восстановить профиль'}
              </button>
            </div>
          </div>
        ) : null}
      </SurfaceCard>

      <SurfaceCard tone="danger">
        <SectionHeader
          eyebrow="Опасная зона"
          title="Очистить локальные данные"
          description="Отменить это нельзя: операции, связи в истории, шаблоны и все данные на устройстве будут удалены."
          action={<IconCircleButton className="text-[var(--app-danger)]"><TrashIcon size={18} /></IconCircleButton>}
        />

        <div className="mt-4">
          <ReviewCard>
            <p className="text-sm leading-6 text-[var(--app-muted)]">
              {`Будут удалены ${summary?.transactions ?? 0} операций, ${summary?.receipts ?? 0} чеков, ${summary?.budget_limits ?? 0} лимитов, ${summary?.subscriptions ?? 0} подписок, ${summary?.smart_rules ?? 0} правил и ${summary?.quick_templates ?? 0} шаблонов.`}
            </p>
          </ReviewCard>
        </div>

        <div className="mt-4">
          {clearArmed ? (
            <ConfirmStateCard
              title="Подтверждение очистки"
              description="TrackDen после очистки воссоздаст базовые категории, но все личные данные на устройстве исчезнут."
              tone="danger"
              action={(
                <div className="mt-4 flex gap-3">
                  <button className="sheet-secondary-button" onClick={() => setClearArmed(false)} type="button">
                    {UI_TEXT.common.cancel}
                  </button>
                  <button className="sheet-primary-button" disabled={isClearing} onClick={() => void handleClear()} type="button">
                    {isClearing ? 'Очищаем…' : 'Очистить данные'}
                  </button>
                </div>
              )}
            />
          ) : (
            <button className="sheet-secondary-button w-full border-[var(--app-danger)]/25 text-[var(--app-danger)]" disabled={!localMode} onClick={() => void handleClear()} type="button">
              Очистить профиль
            </button>
          )}
        </div>
      </SurfaceCard>
    </div>
  );
}
