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

  return '\u0412\u043d\u0435 Telegram \u0438\u043b\u0438 \u0431\u0435\u0437 \u0441\u0435\u0441\u0441\u0438\u0438. \u0418\u043c\u043f\u043e\u0440\u0442 \u0438\u0437 \u0444\u0430\u0439\u043b\u0430 \u0432\u0441\u0451 \u0440\u0430\u0432\u043d\u043e \u0434\u043e\u0441\u0442\u0443\u043f\u0435\u043d.';
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
        message: `\u0420\u0435\u0437\u0435\u0440\u0432\u043d\u0430\u044f \u043a\u043e\u043f\u0438\u044f \u0441\u043e\u0437\u0434\u0430\u043d\u0430. \u0412\u0440\u0435\u043c\u044f \u044d\u043a\u0441\u043f\u043e\u0440\u0442\u0430: ${formatDateTimeLabel(result.backup.exported_at)}.`,
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
        message: '\u042d\u0442\u0430 \u043a\u043e\u043f\u0438\u044f \u043f\u0440\u0438\u043d\u0430\u0434\u043b\u0435\u0436\u0438\u0442 \u0434\u0440\u0443\u0433\u043e\u043c\u0443 Telegram-\u043f\u0440\u043e\u0444\u0438\u043b\u044e. \u0415\u0449\u0451 \u0440\u0430\u0437 \u043f\u0440\u043e\u0432\u0435\u0440\u044c, \u0447\u0442\u043e \u0445\u043e\u0447\u0435\u0448\u044c \u0438\u043c\u043f\u043e\u0440\u0442\u0438\u0440\u043e\u0432\u0430\u0442\u044c \u0438\u043c\u0435\u043d\u043d\u043e \u0435\u0451.',
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
      setNotice({ tone: 'success', message: '\u0414\u0430\u043d\u043d\u044b\u0435 \u0432\u043e\u0441\u0441\u0442\u0430\u043d\u043e\u0432\u043b\u0435\u043d\u044b: \u043e\u043f\u0435\u0440\u0430\u0446\u0438\u0438, \u0447\u0435\u043a\u0438, \u043b\u0438\u043c\u0438\u0442\u044b, \u043f\u043e\u0434\u043f\u0438\u0441\u043a\u0438 \u0438 \u0430\u0432\u0442\u043e\u043c\u0430\u0442\u0438\u0437\u0430\u0446\u0438\u044f \u0441\u043d\u043e\u0432\u0430 \u043d\u0430 \u043c\u0435\u0441\u0442\u0435.' });
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
        message: `\u041b\u043e\u043a\u0430\u043b\u044c\u043d\u044b\u0435 \u0434\u0430\u043d\u043d\u044b\u0435 \u043e\u0447\u0438\u0449\u0435\u043d\u044b: \u0443\u0434\u0430\u043b\u0435\u043d\u043e ${result.deletedSummary.transactions} \u043e\u043f\u0435\u0440\u0430\u0446\u0438\u0439, ${result.deletedSummary.receipts} \u0447\u0435\u043a\u043e\u0432, ${result.deletedSummary.budget_limits} \u043b\u0438\u043c\u0438\u0442\u043e\u0432, ${result.deletedSummary.subscriptions} \u043f\u043e\u0434\u043f\u0438\u0441\u043e\u043a \u0438 ${result.deletedSummary.smart_rules + result.deletedSummary.quick_templates} \u044d\u043b\u0435\u043c\u0435\u043d\u0442\u043e\u0432 \u0430\u0432\u0442\u043e\u043c\u0430\u0442\u0438\u0437\u0430\u0446\u0438\u0438.`,
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
        title="\u041b\u043e\u043a\u0430\u043b\u044c\u043d\u044b\u0439 \u043f\u0440\u043e\u0444\u0438\u043b\u044c"
        description="\u0423\u043f\u0440\u0430\u0432\u043b\u044f\u0439 \u0434\u0430\u043d\u043d\u044b\u043c\u0438, \u0440\u0435\u0437\u0435\u0440\u0432\u043d\u044b\u043c\u0438 \u043a\u043e\u043f\u0438\u044f\u043c\u0438 \u0438 \u0432\u0441\u0435\u043c, \u0447\u0442\u043e \u0445\u0440\u0430\u043d\u0438\u0442\u0441\u044f \u043d\u0430 \u044d\u0442\u043e\u043c \u0443\u0441\u0442\u0440\u043e\u0439\u0441\u0442\u0432\u0435."
        leading={(
          <IconCircleButton onClick={() => navigate('/dashboard')}>
            <ChevronLeftIcon size={18} />
          </IconCircleButton>
        )}
      />

      <SurfaceCard tone="hero">
        <SectionHeader
          eyebrow="\u0421\u043d\u0438\u043c\u043e\u043a \u043f\u0440\u043e\u0444\u0438\u043b\u044f"
          title="\u0427\u0442\u043e \u0441\u0435\u0439\u0447\u0430\u0441 \u0435\u0441\u0442\u044c \u043d\u0430 \u044d\u0442\u043e\u043c \u0443\u0441\u0442\u0440\u043e\u0439\u0441\u0442\u0432\u0435"
          description="TrackDen \u0445\u0440\u0430\u043d\u0438\u0442 \u0434\u0430\u043d\u043d\u044b\u0435 \u043b\u043e\u043a\u0430\u043b\u044c\u043d\u043e. \u0417\u0434\u0435\u0441\u044c \u0432\u0438\u0434\u043d\u043e, \u0432 \u043a\u0430\u043a\u0438\u0445 \u043c\u043e\u0434\u0443\u043b\u044f\u0445 \u0443\u0436\u0435 \u0435\u0441\u0442\u044c \u0438\u0441\u0442\u043e\u0440\u0438\u044f."
          action={storageSnapshot?.lastExportAt ? <StatusBadge tone="success">\u041a\u043e\u043f\u0438\u044f \u0435\u0441\u0442\u044c</StatusBadge> : <StatusBadge tone="neutral">\u041a\u043e\u043f\u0438\u0438 \u043d\u0435\u0442</StatusBadge>}
        />

        {!localMode ? (
          <div className="mt-4">
            <ConfirmStateCard
              title="\u041b\u043e\u043a\u0430\u043b\u044c\u043d\u044b\u0439 \u0440\u0435\u0436\u0438\u043c \u0431\u0435\u0440\u0435\u0436\u0451\u0442 \u043f\u0440\u0438\u0432\u0430\u0442\u043d\u043e\u0441\u0442\u044c"
              description="\u041f\u043e\u043a\u0430 \u0432\u043a\u043b\u044e\u0447\u0451\u043d \u043b\u043e\u043a\u0430\u043b\u044c\u043d\u044b\u0439 \u0440\u0435\u0436\u0438\u043c, \u0433\u043b\u0430\u0432\u043d\u044b\u0435 \u0444\u0438\u043d\u0430\u043d\u0441\u043e\u0432\u044b\u0435 \u0434\u0430\u043d\u043d\u044b\u0435 \u043e\u0441\u0442\u0430\u044e\u0442\u0441\u044f \u043d\u0430 \u0443\u0441\u0442\u0440\u043e\u0439\u0441\u0442\u0432\u0435."
              tone="warning"
            />
          </div>
        ) : (
          <>
            <div className="stat-grid mt-4">
              <PremiumStatTile hint="\u0412\u0441\u0435\u0433\u043e \u043e\u043f\u0435\u0440\u0430\u0446\u0438\u0439" label={UI_TEXT.common.transactions} tone="neutral" value={String(summary?.transactions ?? 0)} />
              <PremiumStatTile hint="\u0420\u0430\u0441\u043f\u043e\u0437\u043d\u0430\u043d\u043d\u044b\u0435 \u0447\u0435\u043a\u0438" label={UI_TEXT.common.receipts} tone="accent" value={String(summary?.receipts ?? 0)} />
              <PremiumStatTile hint="\u0410\u043a\u0442\u0438\u0432\u043d\u044b\u0435 \u043b\u0438\u043c\u0438\u0442\u044b" label={UI_TEXT.common.budgets} tone="warning" value={String(summary?.budget_limits ?? 0)} />
              <PremiumStatTile hint="\u0421\u0432\u044f\u0437\u0438 \u0438 \u0440\u0435\u0433\u0443\u043b\u044f\u0440\u043d\u044b\u0435 \u0441\u043f\u0438\u0441\u0430\u043d\u0438\u044f" label={UI_TEXT.common.subscriptions} tone="success" value={String(summary?.subscriptions ?? 0)} />
            </div>

            <ReviewCard className="mt-4">
              <p className="text-sm text-[var(--app-muted)]">\u041f\u043e\u0441\u043b\u0435\u0434\u043d\u0438\u0439 \u044d\u043a\u0441\u043f\u043e\u0440\u0442</p>
              <p className="mt-2 text-base font-semibold text-white">
                {storageSnapshot?.lastExportAt ? formatDateTimeLabel(storageSnapshot.lastExportAt) : '\u041d\u0430 \u044d\u0442\u043e\u043c \u0443\u0441\u0442\u0440\u043e\u0439\u0441\u0442\u0432\u0435 \u0435\u0449\u0451 \u043d\u0435\u0442 \u0440\u0435\u0437\u0435\u0440\u0432\u043d\u043e\u0439 \u043a\u043e\u043f\u0438\u0438.'}
              </p>
            </ReviewCard>
          </>
        )}
      </SurfaceCard>

      {localMode ? (
        <SurfaceCard>
          <SectionHeader
            eyebrow={UI_TEXT.common.automation}
            title="\u041f\u0440\u0430\u0432\u0438\u043b\u0430, \u0448\u0430\u0431\u043b\u043e\u043d\u044b \u0438 \u0443\u043c\u043d\u044b\u0439 \u0441\u043b\u043e\u0439"
            description="\u0417\u0434\u0435\u0441\u044c \u0436\u0438\u0432\u0443\u0442 \u0430\u0432\u0442\u043e\u043f\u0440\u0430\u0432\u0438\u043b\u0430, \u0431\u044b\u0441\u0442\u0440\u044b\u0435 \u0448\u0430\u0431\u043b\u043e\u043d\u044b \u0438 \u043f\u043e\u0434\u0441\u043a\u0430\u0437\u043a\u0438, \u043a\u043e\u0442\u043e\u0440\u044b\u0435 \u0440\u043e\u0436\u0434\u0430\u044e\u0442\u0441\u044f \u0438\u0437 \u0438\u0441\u0442\u043e\u0440\u0438\u0438."
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
              <PremiumStatTile hint="\u0410\u043a\u0442\u0438\u0432\u043d\u044b\u0435 \u043f\u0440\u0430\u0432\u0438\u043b\u0430" label={UI_TEXT.common.rules} tone="accent" value={String(automationQuery.data?.active_rule_count ?? 0)} />
              <PremiumStatTile hint="\u0421\u043e\u0445\u0440\u0430\u043d\u0451\u043d\u043d\u044b\u0435 \u0448\u0430\u0431\u043b\u043e\u043d\u044b" label={UI_TEXT.common.templates} tone="success" value={String(automationQuery.data?.manual_template_count ?? 0)} />
              <PremiumStatTile hint="\u041f\u043e\u0434\u0441\u043a\u0430\u0437\u043a\u0438 \u0438\u0437 \u0438\u0441\u0442\u043e\u0440\u0438\u0438" label={UI_TEXT.common.suggestions} tone="warning" value={String(automationQuery.data?.suggested_template_count ?? 0)} />
              <PremiumStatTile hint="\u041f\u043e\u043f\u0430\u0434\u0451\u0442 \u0432 \u0440\u0435\u0437\u0435\u0440\u0432\u043d\u0443\u044e \u043a\u043e\u043f\u0438\u044e" label="\u0421\u043b\u043e\u0439" tone="neutral" value={String((summary?.smart_rules ?? 0) + (summary?.quick_templates ?? 0))} />
            </div>
          )}
        </SurfaceCard>
      ) : null}

      {notice ? (
        <ConfirmStateCard
          description={notice.message}
          title={notice.tone === 'success' ? '\u0413\u043e\u0442\u043e\u0432\u043e' : '\u041d\u0443\u0436\u043d\u043e \u0432\u043d\u0438\u043c\u0430\u043d\u0438\u0435'}
          tone={notice.tone === 'success' ? 'success' : 'danger'}
        />
      ) : null}

      <SurfaceCard>
        <SectionHeader
          eyebrow={UI_TEXT.common.backup}
          title="\u042d\u043a\u0441\u043f\u043e\u0440\u0442 JSON"
          description="\u0424\u0430\u0439\u043b \u0441\u043e\u0434\u0435\u0440\u0436\u0438\u0442 \u043b\u043e\u043a\u0430\u043b\u044c\u043d\u044b\u0435 \u0444\u0438\u043d\u0430\u043d\u0441\u043e\u0432\u044b\u0435 \u0434\u0430\u043d\u043d\u044b\u0435: \u043e\u043f\u0435\u0440\u0430\u0446\u0438\u0438, \u043a\u0430\u0442\u0435\u0433\u043e\u0440\u0438\u0438, \u0447\u0435\u043a\u0438, \u043b\u0438\u043c\u0438\u0442\u044b, \u043f\u043e\u0434\u043f\u0438\u0441\u043a\u0438 \u0438 \u0430\u0432\u0442\u043e\u043c\u0430\u0442\u0438\u0437\u0430\u0446\u0438\u044e."
          action={(
            <IconCircleButton onClick={handleExport} disabled={!localMode}>
              <DownloadIcon size={18} />
            </IconCircleButton>
          )}
        />
        <div className="mt-4">
          <button className="sheet-primary-button w-full" disabled={!localMode} onClick={handleExport} type="button">
            \u042d\u043a\u0441\u043f\u043e\u0440\u0442\u0438\u0440\u043e\u0432\u0430\u0442\u044c JSON
          </button>
        </div>
      </SurfaceCard>

      <SurfaceCard>
        <SectionHeader
          eyebrow={UI_TEXT.common.restore}
          title="\u0418\u043c\u043f\u043e\u0440\u0442 \u0438\u0437 \u043a\u043e\u043f\u0438\u0438"
          description="\u041c\u043e\u0436\u043d\u043e \u043f\u043e\u043b\u043d\u043e\u0441\u0442\u044c\u044e \u0437\u0430\u043c\u0435\u043d\u0438\u0442\u044c \u0442\u0435\u043a\u0443\u0449\u0438\u0439 \u043f\u0440\u043e\u0444\u0438\u043b\u044c \u0434\u0430\u043d\u043d\u044b\u043c\u0438 \u0438\u0437 \u0434\u0440\u0443\u0433\u043e\u0433\u043e \u0444\u0430\u0439\u043b\u0430, \u0435\u0441\u043b\u0438 \u0442\u044b \u0434\u043e\u0432\u0435\u0440\u044f\u0435\u0448\u044c \u0438\u0441\u0442\u043e\u0447\u043d\u0438\u043a\u0443."
          action={(
            <IconCircleButton onClick={() => fileInputRef.current?.click()} disabled={!localMode || isRestoring}>
              <UploadIcon size={18} />
            </IconCircleButton>
          )}
        />

        <input accept=".json,application/json" className="hidden" onChange={handleFilePick} ref={fileInputRef} type="file" />

        <div className="mt-4">
          <button className="sheet-secondary-button w-full" disabled={!localMode || isRestoring} onClick={() => fileInputRef.current?.click()} type="button">
            \u0412\u044b\u0431\u0440\u0430\u0442\u044c JSON-\u0444\u0430\u0439\u043b
          </button>
        </div>

        {preview ? (
          <div className="mt-4 space-y-4">
            <ReviewCard>
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-sm font-medium text-white">{preview.fileName}</p>
                  <p className="mt-1 text-sm text-[var(--app-muted)]">\u042d\u043a\u0441\u043f\u043e\u0440\u0442: {formatDateTimeLabel(preview.backup.exported_at)}</p>
                </div>
                <StatusBadge tone="neutral">v{preview.backup.version}</StatusBadge>
              </div>
            </ReviewCard>

            <ReviewCard>
              <p className="text-sm text-[var(--app-muted)]">\u0412\u043b\u0430\u0434\u0435\u043b\u0435\u0446 \u043a\u043e\u043f\u0438\u0438</p>
              <p className="mt-2 text-base font-semibold text-white">{preview.backup.owner.first_name || preview.backup.owner.username || '\u041f\u0440\u043e\u0444\u0438\u043b\u044c TrackDen'}</p>
              <p className="mt-1 text-sm text-[var(--app-muted)]">{preview.backup.owner.username ? `@${preview.backup.owner.username}` : preview.backup.owner.scope_id}</p>
            </ReviewCard>

            <div className="stat-grid">
              <PremiumStatTile hint="\u0412\u0441\u0435\u0433\u043e \u043e\u043f\u0435\u0440\u0430\u0446\u0438\u0439" label={UI_TEXT.common.transactions} tone="neutral" value={String(previewSummary?.transactions ?? 0)} />
              <PremiumStatTile hint="\u041c\u0435\u0442\u0430\u0434\u0430\u043d\u043d\u044b\u0435 \u0447\u0435\u043a\u043e\u0432" label={UI_TEXT.common.receipts} tone="accent" value={String(previewSummary?.receipts ?? 0)} />
              <PremiumStatTile hint="\u041d\u0430\u0441\u0442\u0440\u043e\u0439\u043a\u0438 \u043b\u0438\u043c\u0438\u0442\u043e\u0432" label={UI_TEXT.common.budgets} tone="warning" value={String(previewSummary?.budget_limits ?? 0)} />
              <PremiumStatTile hint="\u0410\u0432\u0442\u043e\u043c\u0430\u0442\u0438\u0437\u0430\u0446\u0438\u044f \u0432 \u044d\u0442\u043e\u043c \u043f\u0440\u043e\u0444\u0438\u043b\u0435" label={UI_TEXT.common.automation} tone="success" value={String((previewSummary?.smart_rules ?? 0) + (previewSummary?.quick_templates ?? 0))} />
            </div>

            {ownerMismatch ? (
              <ConfirmStateCard
                title="\u042d\u0442\u0430 \u043a\u043e\u043f\u0438\u044f \u043f\u0440\u0438\u043d\u0430\u0434\u043b\u0435\u0436\u0438\u0442 \u0434\u0440\u0443\u0433\u043e\u043c\u0443 Telegram-\u043f\u0440\u043e\u0444\u0438\u043b\u044e"
                description="\u0418\u043c\u043f\u043e\u0440\u0442 \u0440\u0430\u0437\u0440\u0435\u0448\u0451\u043d, \u043d\u043e \u0441\u043d\u0430\u0447\u0430\u043b\u0430 \u0443\u0431\u0435\u0434\u0438\u0441\u044c, \u0447\u0442\u043e \u0442\u044b \u0442\u043e\u0447\u043d\u043e \u0445\u043e\u0447\u0435\u0448\u044c \u0437\u0430\u043c\u0435\u043d\u0438\u0442\u044c \u0442\u0435\u043a\u0443\u0449\u0438\u0439 \u043b\u043e\u043a\u0430\u043b\u044c\u043d\u044b\u0439 \u043f\u0440\u043e\u0444\u0438\u043b\u044c \u0438\u043c\u0435\u043d\u043d\u043e \u044d\u0442\u043e\u0439 \u043a\u043e\u043f\u0438\u0435\u0439."
                tone="warning"
                action={(
                  <label className="mt-3 flex items-start gap-3 rounded-[18px] border border-amber-300/15 bg-black/10 px-4 py-3 text-sm text-amber-50">
                    <input checked={ownerConfirmed} className="mt-1" onChange={(event) => setOwnerConfirmed(event.target.checked)} type="checkbox" />
                    <span>\u041f\u043e\u043d\u0438\u043c\u0430\u044e, \u0447\u0442\u043e \u044d\u0442\u043e \u0437\u0430\u043c\u0435\u043d\u0438\u0442 \u0442\u0435\u043a\u0443\u0449\u0438\u0439 \u043b\u043e\u043a\u0430\u043b\u044c\u043d\u044b\u0439 \u043f\u0440\u043e\u0444\u0438\u043b\u044c.</span>
                  </label>
                )}
              />
            ) : null}

            <div className="flex gap-3">
              <button className="sheet-secondary-button" onClick={() => setPreview(null)} type="button">
                {UI_TEXT.common.cancel}
              </button>
              <button className="sheet-primary-button" disabled={isRestoring || (ownerMismatch && !ownerConfirmed)} onClick={() => void handleRestore()} type="button">
                {isRestoring ? '\u0412\u043e\u0441\u0441\u0442\u0430\u043d\u0430\u0432\u043b\u0438\u0432\u0430\u0435\u043c\u2026' : '\u0412\u043e\u0441\u0441\u0442\u0430\u043d\u043e\u0432\u0438\u0442\u044c \u043f\u0440\u043e\u0444\u0438\u043b\u044c'}
              </button>
            </div>
          </div>
        ) : null}
      </SurfaceCard>

      <SurfaceCard tone="danger">
        <SectionHeader
          eyebrow="\u041e\u043f\u0430\u0441\u043d\u0430\u044f \u0437\u043e\u043d\u0430"
          title="\u041e\u0447\u0438\u0441\u0442\u0438\u0442\u044c \u043b\u043e\u043a\u0430\u043b\u044c\u043d\u044b\u0435 \u0434\u0430\u043d\u043d\u044b\u0435"
          description="\u041e\u0442\u043c\u0435\u043d\u0438\u0442\u044c \u044d\u0442\u043e \u043d\u0435\u043b\u044c\u0437\u044f: \u043e\u043f\u0435\u0440\u0430\u0446\u0438\u0438, \u0441\u0432\u044f\u0437\u0438 \u0432 \u0438\u0441\u0442\u043e\u0440\u0438\u0438, \u0448\u0430\u0431\u043b\u043e\u043d\u044b \u0438 \u0432\u0441\u0435 \u0434\u0430\u043d\u043d\u044b\u0435 \u043d\u0430 \u0443\u0441\u0442\u0440\u043e\u0439\u0441\u0442\u0432\u0435 \u0431\u0443\u0434\u0443\u0442 \u0443\u0434\u0430\u043b\u0435\u043d\u044b."
          action={<IconCircleButton className="text-[var(--app-danger)]"><TrashIcon size={18} /></IconCircleButton>}
        />

        <div className="mt-4">
          <ReviewCard>
            <p className="text-sm leading-6 text-[var(--app-muted)]">
              {`\u0411\u0443\u0434\u0443\u0442 \u0443\u0434\u0430\u043b\u0435\u043d\u044b ${summary?.transactions ?? 0} \u043e\u043f\u0435\u0440\u0430\u0446\u0438\u0439, ${summary?.receipts ?? 0} \u0447\u0435\u043a\u043e\u0432, ${summary?.budget_limits ?? 0} \u043b\u0438\u043c\u0438\u0442\u043e\u0432, ${summary?.subscriptions ?? 0} \u043f\u043e\u0434\u043f\u0438\u0441\u043e\u043a, ${summary?.smart_rules ?? 0} \u043f\u0440\u0430\u0432\u0438\u043b \u0438 ${summary?.quick_templates ?? 0} \u0448\u0430\u0431\u043b\u043e\u043d\u043e\u0432.`}
            </p>
          </ReviewCard>
        </div>

        <div className="mt-4">
          {clearArmed ? (
            <ConfirmStateCard
              title="\u041f\u043e\u0434\u0442\u0432\u0435\u0440\u0436\u0434\u0435\u043d\u0438\u0435 \u043e\u0447\u0438\u0441\u0442\u043a\u0438"
              description="TrackDen \u043f\u043e\u0441\u043b\u0435 \u043e\u0447\u0438\u0441\u0442\u043a\u0438 \u0432\u043e\u0441\u0441\u043e\u0437\u0434\u0430\u0441\u0442 \u0431\u0430\u0437\u043e\u0432\u044b\u0435 \u043a\u0430\u0442\u0435\u0433\u043e\u0440\u0438\u0438, \u043d\u043e \u0432\u0441\u0435 \u043b\u0438\u0447\u043d\u044b\u0435 \u0434\u0430\u043d\u043d\u044b\u0435 \u043d\u0430 \u0443\u0441\u0442\u0440\u043e\u0439\u0441\u0442\u0432\u0435 \u0438\u0441\u0447\u0435\u0437\u043d\u0443\u0442."
              tone="danger"
              action={(
                <div className="mt-4 flex gap-3">
                  <button className="sheet-secondary-button" onClick={() => setClearArmed(false)} type="button">
                    {UI_TEXT.common.cancel}
                  </button>
                  <button className="sheet-primary-button" disabled={isClearing} onClick={() => void handleClear()} type="button">
                    {isClearing ? '\u041e\u0447\u0438\u0449\u0430\u0435\u043c\u2026' : '\u041e\u0447\u0438\u0441\u0442\u0438\u0442\u044c \u0434\u0430\u043d\u043d\u044b\u0435'}
                  </button>
                </div>
              )}
            />
          ) : (
            <button className="sheet-secondary-button w-full border-[var(--app-danger)]/25 text-[var(--app-danger)]" disabled={!localMode} onClick={() => void handleClear()} type="button">
              \u041e\u0447\u0438\u0441\u0442\u0438\u0442\u044c \u043f\u0440\u043e\u0444\u0438\u043b\u044c
            </button>
          )}
        </div>
      </SurfaceCard>
    </div>
  );
}
