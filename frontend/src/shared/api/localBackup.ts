import type { Category } from '../../features/auth/api';
import { FINANCE_SHEET_DRAFT_STORAGE_KEY } from '../../features/finance-sheet/constants';
import type { Receipt } from '../../features/receipts/api';
import { ApiError } from './errors';
import { getLocalWorkspaceContext, resetLocalWorkspace, type LocalPrincipal, type StoredTransaction, type WorkspaceState, writeWorkspace } from './localApi';

const BACKUP_FORMAT = 'trackden-backup';
const BACKUP_VERSION = 1;
const BACKUP_META_PREFIX = 'trackden-local-meta-v1';

type BackupMeta = {
  last_export_at?: string | null;
};

export type LocalBackupOwner = {
  telegram_id: number | null;
  username: string | null;
  first_name: string | null;
  auth_source: string;
  scope_id: string;
};

export type LocalBackupFileV1 = {
  format: typeof BACKUP_FORMAT;
  version: typeof BACKUP_VERSION;
  exported_at: string;
  owner: LocalBackupOwner;
  workspace: WorkspaceState;
};

export type LocalWorkspaceSummary = {
  transactions: number;
  receipts: number;
  categories: number;
  custom_categories: number;
};

function getStorage() {
  if (typeof window === 'undefined') {
    return null;
  }

  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

function metaKey(scopeId: string) {
  return `${BACKUP_META_PREFIX}:${scopeId}`;
}

function readMeta(scopeId: string): BackupMeta {
  const storage = getStorage();
  const raw = storage?.getItem(metaKey(scopeId));
  if (!raw) {
    return {};
  }

  try {
    return JSON.parse(raw) as BackupMeta;
  } catch {
    return {};
  }
}

function writeMeta(scopeId: string, meta: BackupMeta) {
  const storage = getStorage();
  if (!storage) {
    return;
  }

  try {
    storage.setItem(metaKey(scopeId), JSON.stringify(meta));
  } catch {
    // noop
  }
}

function clearTransientState() {
  if (typeof window === 'undefined') {
    return;
  }

  try {
    window.sessionStorage.removeItem(FINANCE_SHEET_DRAFT_STORAGE_KEY);
  } catch {
    // noop
  }
}

function invalidBackup(message: string, details?: unknown): never {
  throw new ApiError({
    code: 'invalid_backup_file',
    message,
    details,
  });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function readString(value: unknown, field: string) {
  if (typeof value !== 'string') {
    invalidBackup(`Поле ${field} имеет неверный формат.`);
  }

  return value;
}

function readOptionalString(value: unknown, field: string) {
  if (value == null) {
    return null;
  }

  if (typeof value !== 'string') {
    invalidBackup(`Поле ${field} имеет неверный формат.`);
  }

  return value;
}

function readOptionalNumber(value: unknown, field: string) {
  if (value == null) {
    return null;
  }

  if (typeof value !== 'number' || !Number.isFinite(value)) {
    invalidBackup(`Поле ${field} имеет неверный формат.`);
  }

  return value;
}

function readBoolean(value: unknown, field: string) {
  if (typeof value !== 'boolean') {
    invalidBackup(`Поле ${field} имеет неверный формат.`);
  }

  return value;
}

function readEnum<T extends string>(value: unknown, field: string, allowed: readonly T[]) {
  if (typeof value !== 'string' || !allowed.includes(value as T)) {
    invalidBackup(`Поле ${field} имеет неподдерживаемое значение.`);
  }

  return value as T;
}

function readObject(value: unknown, field: string) {
  if (!isRecord(value)) {
    invalidBackup(`Поле ${field} имеет неверный формат.`);
  }

  return value;
}

function readArray(value: unknown, field: string) {
  if (!Array.isArray(value)) {
    invalidBackup(`Поле ${field} имеет неверный формат.`);
  }

  return value;
}

function validateCategory(value: unknown): Category {
  const record = readObject(value, 'workspace.categories[]');

  return {
    id: readString(record.id, 'workspace.categories[].id'),
    name: readString(record.name, 'workspace.categories[].name'),
    icon: readOptionalString(record.icon, 'workspace.categories[].icon'),
    color: readOptionalString(record.color, 'workspace.categories[].color'),
    is_system: readBoolean(record.is_system, 'workspace.categories[].is_system'),
  };
}

function validateReceipt(value: unknown): Receipt {
  const record = readObject(value, 'workspace.receipts[]');
  const rawOcr = record.ocr_raw;

  if (!(rawOcr == null || isRecord(rawOcr))) {
    invalidBackup('Поле workspace.receipts[].ocr_raw имеет неверный формат.');
  }

  return {
    id: readString(record.id, 'workspace.receipts[].id'),
    original_filename: readOptionalString(record.original_filename, 'workspace.receipts[].original_filename'),
    mime_type: readOptionalString(record.mime_type, 'workspace.receipts[].mime_type'),
    size_bytes: readOptionalNumber(record.size_bytes, 'workspace.receipts[].size_bytes'),
    status: readEnum(record.status, 'workspace.receipts[].status', ['pending', 'processed', 'failed'] as const),
    ocr_provider: readEnum(record.ocr_provider, 'workspace.receipts[].ocr_provider', ['mock', 'google_vision'] as const),
    extracted_total: readOptionalNumber(record.extracted_total, 'workspace.receipts[].extracted_total'),
    extracted_merchant: readOptionalString(record.extracted_merchant, 'workspace.receipts[].extracted_merchant'),
    ocr_raw: rawOcr ?? null,
    error: readOptionalString(record.error, 'workspace.receipts[].error'),
    uploaded_at: readString(record.uploaded_at, 'workspace.receipts[].uploaded_at'),
    processed_at: readOptionalString(record.processed_at, 'workspace.receipts[].processed_at'),
    created_at: readString(record.created_at, 'workspace.receipts[].created_at'),
    updated_at: readString(record.updated_at, 'workspace.receipts[].updated_at'),
  };
}

function validateStoredTransaction(value: unknown): StoredTransaction {
  const record = readObject(value, 'workspace.transactions[]');
  const amount = readOptionalNumber(record.amount, 'workspace.transactions[].amount');

  if (amount == null || amount < 0) {
    invalidBackup('Поле workspace.transactions[].amount имеет неверный формат.');
  }

  return {
    id: readString(record.id, 'workspace.transactions[].id'),
    amount,
    type: readEnum(record.type, 'workspace.transactions[].type', ['expense', 'income'] as const),
    currency: readString(record.currency, 'workspace.transactions[].currency'),
    description: readOptionalString(record.description, 'workspace.transactions[].description'),
    merchant: readOptionalString(record.merchant, 'workspace.transactions[].merchant'),
    occurred_at: readString(record.occurred_at, 'workspace.transactions[].occurred_at'),
    source: readEnum(record.source, 'workspace.transactions[].source', ['manual', 'ocr'] as const),
    receipt_id: readOptionalString(record.receipt_id, 'workspace.transactions[].receipt_id'),
    ai_confidence: readOptionalNumber(record.ai_confidence, 'workspace.transactions[].ai_confidence'),
    category_id: readOptionalString(record.category_id, 'workspace.transactions[].category_id'),
    created_at: readString(record.created_at, 'workspace.transactions[].created_at'),
    updated_at: readString(record.updated_at, 'workspace.transactions[].updated_at'),
  };
}

function validateWorkspace(value: unknown): WorkspaceState {
  const record = readObject(value, 'workspace');

  if (typeof record.version !== 'number' || !Number.isFinite(record.version)) {
    invalidBackup('Поле workspace.version имеет неверный формат.');
  }

  return {
    version: record.version,
    categories: readArray(record.categories, 'workspace.categories').map(validateCategory),
    receipts: readArray(record.receipts, 'workspace.receipts').map(validateReceipt),
    transactions: readArray(record.transactions, 'workspace.transactions').map(validateStoredTransaction),
  };
}

function buildOwner(principal: LocalPrincipal): LocalBackupOwner {
  return {
    telegram_id: principal.user.telegram_id ?? null,
    username: principal.user.username ?? null,
    first_name: principal.user.first_name ?? null,
    auth_source: principal.authSource,
    scope_id: principal.scopeId,
  };
}

function buildFileName(exportedAt: string) {
  const stamp = exportedAt.replaceAll(':', '-').replace(/\.\d+Z?$/, '').replace('T', '_');
  return `trackden-backup-${stamp}.json`;
}

export function summarizeWorkspace(workspace: WorkspaceState): LocalWorkspaceSummary {
  return {
    transactions: workspace.transactions.length,
    receipts: workspace.receipts.length,
    categories: workspace.categories.length,
    custom_categories: workspace.categories.filter((category) => !category.is_system).length,
  };
}

export function getWorkspaceSummary(initDataRaw?: string) {
  const { principal, workspace } = getLocalWorkspaceContext(initDataRaw);
  const meta = readMeta(principal.scopeId);

  return {
    scopeId: principal.scopeId,
    lastExportAt: meta.last_export_at ?? null,
    summary: summarizeWorkspace(workspace),
  };
}

export function exportWorkspace(initDataRaw?: string) {
  const { principal, workspace } = getLocalWorkspaceContext(initDataRaw);
  const exportedAt = new Date().toISOString();
  const backup: LocalBackupFileV1 = {
    format: BACKUP_FORMAT,
    version: BACKUP_VERSION,
    exported_at: exportedAt,
    owner: buildOwner(principal),
    workspace,
  };

  writeMeta(principal.scopeId, {
    ...readMeta(principal.scopeId),
    last_export_at: exportedAt,
  });

  return {
    backup,
    fileName: buildFileName(exportedAt),
    blob: new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json;charset=utf-8' }),
  };
}

export async function parseBackupFile(file: File) {
  if (!file.name.toLowerCase().endsWith('.json')) {
    invalidBackup('Нужен файл резервной копии в формате .json.');
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(await file.text());
  } catch {
    invalidBackup('Не удалось прочитать JSON-файл резервной копии.');
  }

  return validateBackup(parsed);
}

export function validateBackup(value: unknown): LocalBackupFileV1 {
  const record = readObject(value, 'backup');
  const owner = readObject(record.owner, 'owner');
  const version = record.version;

  if (record.format !== BACKUP_FORMAT) {
    invalidBackup('Этот файл не похож на резервную копию TrackDen.');
  }

  if (version !== BACKUP_VERSION) {
    invalidBackup(`Версия backup ${String(version)} не поддерживается этой сборкой.`);
  }

  return {
    format: BACKUP_FORMAT,
    version: BACKUP_VERSION,
    exported_at: readString(record.exported_at, 'exported_at'),
    owner: {
      telegram_id: owner.telegram_id == null ? null : readOptionalNumber(owner.telegram_id, 'owner.telegram_id'),
      username: readOptionalString(owner.username, 'owner.username'),
      first_name: readOptionalString(owner.first_name, 'owner.first_name'),
      auth_source: readString(owner.auth_source, 'owner.auth_source'),
      scope_id: readString(owner.scope_id, 'owner.scope_id'),
    },
    workspace: validateWorkspace(record.workspace),
  };
}

export function restoreWorkspace(backup: LocalBackupFileV1, initDataRaw?: string) {
  const { principal } = getLocalWorkspaceContext(initDataRaw);
  const restored = writeWorkspace(principal.scopeId, backup.workspace);
  clearTransientState();

  return {
    principal,
    summary: summarizeWorkspace(restored),
  };
}

export function clearWorkspace(initDataRaw?: string) {
  const { principal, workspace } = getLocalWorkspaceContext(initDataRaw);
  const deletedSummary = summarizeWorkspace(workspace);
  const currentWorkspace = resetLocalWorkspace(principal.scopeId);
  clearTransientState();

  return {
    principal,
    deletedSummary,
    currentSummary: summarizeWorkspace(currentWorkspace),
  };
}
