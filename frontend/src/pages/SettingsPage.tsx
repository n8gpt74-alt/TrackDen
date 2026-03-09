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

  return 'Outside Telegram or without a session. Import still works.';
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
        message: `Backup exported successfully. Export time: ${formatDateTimeLabel(result.backup.exported_at)}.`,
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
      setNotice({ tone: 'danger', message: 'This backup belongs to another Telegram profile, so please review the import carefully.' });
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
      setNotice({ tone: 'success', message: 'Data restored: transactions, receipts, budgets, subscriptions, and automation are back in place.' });
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
        message: `Local data cleared: removed ${result.deletedSummary.transactions} transactions, ${result.deletedSummary.receipts} receipts, ${result.deletedSummary.budget_limits} budgets, ${result.deletedSummary.subscriptions} subscriptions, and ${result.deletedSummary.smart_rules + result.deletedSummary.quick_templates} automation entities.`,
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
        eyebrow="Settings"
        title="Local storage"
        description="Manage data, backups, and everything that belongs to this device profile."
        leading={(
          <IconCircleButton onClick={() => navigate('/dashboard')}>
            <ChevronLeftIcon size={18} />
          </IconCircleButton>
        )}
      />

      <SurfaceCard tone="hero">
        <SectionHeader
          eyebrow="Profile snapshot"
          title="What lives on this device now"
          description="TrackDen stores data locally. You can see which modules already have history."
          action={storageSnapshot?.lastExportAt ? <StatusBadge tone="success">Backup exists</StatusBadge> : <StatusBadge tone="neutral">No backup</StatusBadge>}
        />

        {!localMode ? (
          <div className="mt-4">
            <ConfirmStateCard
               title="Local-first keeps data private"
               description="Core financial data stays on the device while `VITE_DATA_MODE=local` is enabled."
              tone="warning"
            />
          </div>
        ) : (
          <>
            <div className="stat-grid mt-4">
              <PremiumStatTile hint="Total transactions" label="Transactions" tone="neutral" value={String(summary?.transactions ?? 0)} />
              <PremiumStatTile hint="Recognized receipts" label="Receipts" tone="accent" value={String(summary?.receipts ?? 0)} />
              <PremiumStatTile hint="Active budget limits" label="Budgets" tone="warning" value={String(summary?.budget_limits ?? 0)} />
              <PremiumStatTile hint="Links and recurring charges" label="Subscriptions" tone="success" value={String(summary?.subscriptions ?? 0)} />
            </div>

            <ReviewCard className="mt-4">
              <p className="text-sm text-[var(--app-muted)]">Last export</p>
              <p className="mt-2 text-base font-semibold text-white">
                {storageSnapshot?.lastExportAt ? formatDateTimeLabel(storageSnapshot.lastExportAt) : 'A backup has not been created on this device yet.'}
              </p>
            </ReviewCard>
          </>
        )}
      </SurfaceCard>

      {localMode ? (
        <SurfaceCard>
          <SectionHeader
            eyebrow="Automation"
            title="Rules, templates, and smart layer"
            description="This block holds profile automation: auto-rules, quick templates, and history-driven suggestions."
            action={<button className="pill-button pill-button--ghost" onClick={() => openSheet('automation')} type="button">Open</button>}
          />

          {automationQuery.isLoading ? (
            <div className="mt-4 grid grid-cols-3 gap-3">
              <Skeleton className="h-24 w-full rounded-[22px]" />
              <Skeleton className="h-24 w-full rounded-[22px]" />
              <Skeleton className="h-24 w-full rounded-[22px]" />
            </div>
          ) : (
            <div className="stat-grid mt-4">
              <PremiumStatTile hint="Active rules" label="Rules" tone="accent" value={String(automationQuery.data?.active_rule_count ?? 0)} />
              <PremiumStatTile hint="Saved templates" label="Templates" tone="success" value={String(automationQuery.data?.manual_template_count ?? 0)} />
              <PremiumStatTile hint="Suggestions from history" label="Suggestions" tone="warning" value={String(automationQuery.data?.suggested_template_count ?? 0)} />
              <PremiumStatTile hint="Saved in backup" label="Layer" tone="neutral" value={String((summary?.smart_rules ?? 0) + (summary?.quick_templates ?? 0))} />
            </div>
          )}
        </SurfaceCard>
      ) : null}

      {notice ? (
        <ConfirmStateCard
          description={notice.message}
          title={notice.tone === 'success' ? 'Done' : 'Needs attention'}
          tone={notice.tone === 'success' ? 'success' : 'danger'}
        />
      ) : null}

      <SurfaceCard>
        <SectionHeader
          eyebrow="Backup"
          title="Export JSON"
          description="The file contains local financial data: transactions, categories, receipts, budgets, subscriptions, and automation."
          action={(
            <IconCircleButton onClick={handleExport} disabled={!localMode}>
              <DownloadIcon size={18} />
            </IconCircleButton>
          )}
        />
        <div className="mt-4">
          <button className="sheet-primary-button w-full" disabled={!localMode} onClick={handleExport} type="button">
            Export backup
          </button>
        </div>
      </SurfaceCard>

      <SurfaceCard>
        <SectionHeader
          eyebrow="Restore"
          title="Import from backup"
          description="You can fully replace the current profile with data from another file if you trust the source."
          action={(
            <IconCircleButton onClick={() => fileInputRef.current?.click()} disabled={!localMode || isRestoring}>
              <UploadIcon size={18} />
            </IconCircleButton>
          )}
        />

        <input accept=".json,application/json" className="hidden" onChange={handleFilePick} ref={fileInputRef} type="file" />

        <div className="mt-4">
          <button className="sheet-secondary-button w-full" disabled={!localMode || isRestoring} onClick={() => fileInputRef.current?.click()} type="button">
            Choose JSON file
          </button>
        </div>

        {preview ? (
          <div className="mt-4 space-y-4">
            <ReviewCard>
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-sm font-medium text-white">{preview.fileName}</p>
                  <p className="mt-1 text-sm text-[var(--app-muted)]">Exported: {formatDateTimeLabel(preview.backup.exported_at)}</p>
                </div>
                <StatusBadge tone="neutral">v{preview.backup.version}</StatusBadge>
              </div>
            </ReviewCard>

            <ReviewCard>
              <p className="text-sm text-[var(--app-muted)]">Backup owner</p>
              <p className="mt-2 text-base font-semibold text-white">{preview.backup.owner.first_name || preview.backup.owner.username || 'TrackDen profile'}</p>
              <p className="mt-1 text-sm text-[var(--app-muted)]">{preview.backup.owner.username ? `@${preview.backup.owner.username}` : preview.backup.owner.scope_id}</p>
            </ReviewCard>

            <div className="stat-grid">
              <PremiumStatTile hint="Total transactions" label="Transactions" tone="neutral" value={String(previewSummary?.transactions ?? 0)} />
              <PremiumStatTile hint="Receipt metadata" label="Receipts" tone="accent" value={String(previewSummary?.receipts ?? 0)} />
              <PremiumStatTile hint="Budget settings" label="Budgets" tone="warning" value={String(previewSummary?.budget_limits ?? 0)} />
              <PremiumStatTile hint="Automation in this profile" label="Automation" tone="success" value={String((previewSummary?.smart_rules ?? 0) + (previewSummary?.quick_templates ?? 0))} />
            </div>

            {ownerMismatch ? (
              <ConfirmStateCard
                title="This backup belongs to another Telegram profile"
                description="Import is still allowed, but make sure you really want to replace the current local profile with this backup."
                tone="warning"
                action={(
                  <label className="mt-3 flex items-start gap-3 rounded-[18px] border border-amber-300/15 bg-black/10 px-4 py-3 text-sm text-amber-50">
                    <input checked={ownerConfirmed} className="mt-1" onChange={(event) => setOwnerConfirmed(event.target.checked)} type="checkbox" />
                    <span>I understand that this will replace the current local profile.</span>
                  </label>
                )}
              />
            ) : null}

            <div className="flex gap-3">
              <button className="sheet-secondary-button" onClick={() => setPreview(null)} type="button">
                Cancel
              </button>
              <button className="sheet-primary-button" disabled={isRestoring || (ownerMismatch && !ownerConfirmed)} onClick={() => void handleRestore()} type="button">
                {isRestoring ? 'Restoring' : 'Restore profile'}
              </button>
            </div>
          </div>
        ) : null}
      </SurfaceCard>

      <SurfaceCard tone="danger">
        <SectionHeader
          eyebrow="Danger zone"
          title="Clear local data"
          description="This cannot be undone: transactions, history links, templates, and all local device data will be removed."
          action={<IconCircleButton className="text-[var(--app-danger)]"><TrashIcon size={18} /></IconCircleButton>}
        />

        <div className="mt-4">
          <ReviewCard>
            <p className="text-sm leading-6 text-[var(--app-muted)]">
              This will remove {summary?.transactions ?? 0} transactions, {summary?.receipts ?? 0} receipts, {summary?.budget_limits ?? 0} budgets, {summary?.subscriptions ?? 0} subscriptions, {summary?.smart_rules ?? 0} rules, and {summary?.quick_templates ?? 0} templates.
            </p>
          </ReviewCard>
        </div>

        <div className="mt-4">
          {clearArmed ? (
            <ConfirmStateCard
              title="Clear confirmed"
              description="TrackDen will recreate base categories after clearing, but all personal device data will be gone."
              tone="danger"
              action={(
                <div className="mt-4 flex gap-3">
                  <button className="sheet-secondary-button" onClick={() => setClearArmed(false)} type="button">
                    Cancel
                  </button>
                  <button className="sheet-primary-button" disabled={isClearing} onClick={() => void handleClear()} type="button">
                    {isClearing ? 'Clearing' : 'Clear data'}
                  </button>
                </div>
              )}
            />
          ) : (
            <button className="sheet-secondary-button w-full border-[var(--app-danger)]/25 text-[var(--app-danger)]" disabled={!localMode} onClick={() => void handleClear()} type="button">
              Clear profile
            </button>
          )}
        </div>
      </SurfaceCard>
    </div>
  );
}
