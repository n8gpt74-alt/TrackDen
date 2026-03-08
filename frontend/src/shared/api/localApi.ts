import { ApiError } from './errors';

import type { AnalyticsOverviewResponse, CategorySpendPoint, DailySpendPoint } from '../../features/analytics/api';
import type { Category, SessionResponse, UserSession } from '../../features/auth/api';
import type { Receipt } from '../../features/receipts/api';
import type { Transaction, TransactionPayload, TransactionType } from '../../features/transactions/api';

type RequestOptions = {
  body?: BodyInit | FormData | Record<string, unknown> | null;
  initDataRaw?: string;
  method?: string;
};

export type StoredTransaction = Omit<Transaction, 'category'> & {
  category_id?: string | null;
};

export type WorkspaceState = {
  version: number;
  categories: Category[];
  receipts: Receipt[];
  transactions: StoredTransaction[];
};

export type LocalPrincipal = {
  authSource: string;
  scopeId: string;
  user: UserSession;
};

const STORAGE_PREFIX = 'trackden-local-v2';
const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;
const LOCAL_ORIGIN = 'https://trackden.local';
const memoryFallback = new Map<string, string>();

const SEEDED_CATEGORIES: Category[] = [
  { id: 'system-products', name: 'Продукты', icon: 'cart', color: '#22c55e', is_system: true },
  { id: 'system-transport', name: 'Транспорт', icon: 'car', color: '#3b82f6', is_system: true },
  { id: 'system-cafe', name: 'Кафе', icon: 'cup', color: '#f59e0b', is_system: true },
  { id: 'system-home', name: 'Дом', icon: 'house', color: '#8b5cf6', is_system: true },
  { id: 'system-health', name: 'Здоровье', icon: 'heart', color: '#ef4444', is_system: true },
  { id: 'system-fun', name: 'Развлечения', icon: 'game', color: '#ec4899', is_system: true },
  { id: 'system-subscriptions', name: 'Подписки', icon: 'sparkles', color: '#06b6d4', is_system: true },
  { id: 'system-salary', name: 'Зарплата', icon: 'wallet', color: '#10b981', is_system: true },
  { id: 'system-other', name: 'Другое', icon: 'tray', color: '#64748b', is_system: true },
];

const CATEGORY_RULES: Array<{ confidence: number; name: string; type: TransactionType; keywords: string[] }> = [
  { name: 'Продукты', type: 'expense', confidence: 0.93, keywords: ['food', 'grocery', 'market', 'supermarket', 'продукт', 'еда', 'магазин', 'ферма', 'вкусвилл', 'магнит', 'пятерочка'] },
  { name: 'Транспорт', type: 'expense', confidence: 0.91, keywords: ['uber', 'taxi', 'metro', 'bus', 'transport', 'fuel', 'бензин', 'такси', 'метро', 'автобус', 'поезд', 'yandex go'] },
  { name: 'Кафе', type: 'expense', confidence: 0.94, keywords: ['coffee', 'cafe', 'restaurant', 'bar', 'pizza', 'burger', 'starbucks', 'кафе', 'кофе', 'ресторан', 'пицца', 'бургер'] },
  { name: 'Дом', type: 'expense', confidence: 0.88, keywords: ['rent', 'ikea', 'home', 'furniture', 'house', 'аренда', 'дом', 'квартира', 'ремонт', 'мебель'] },
  { name: 'Здоровье', type: 'expense', confidence: 0.89, keywords: ['pharmacy', 'doctor', 'health', 'medicine', 'аптека', 'врач', 'лекар', 'здоров'] },
  { name: 'Развлечения', type: 'expense', confidence: 0.87, keywords: ['movie', 'cinema', 'game', 'games', 'concert', 'кино', 'игр', 'концерт', 'playstation', 'steam'] },
  { name: 'Подписки', type: 'expense', confidence: 0.95, keywords: ['subscription', 'netflix', 'spotify', 'figma', 'notion', 'saas', 'подпис', 'icloud', 'youtube premium'] },
  { name: 'Зарплата', type: 'income', confidence: 0.96, keywords: ['salary', 'payroll', 'bonus', 'income', 'freelance', 'invoice', 'зарплата', 'премия', 'аванс', 'гонорар'] },
];

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

function readRawValue(key: string) {
  const storage = getStorage();
  if (!storage) {
    return memoryFallback.get(key) ?? null;
  }

  try {
    return storage.getItem(key);
  } catch {
    return memoryFallback.get(key) ?? null;
  }
}

function writeRawValue(key: string, value: string) {
  const storage = getStorage();
  if (!storage) {
    memoryFallback.set(key, value);
    return;
  }

  try {
    storage.setItem(key, value);
  } catch {
    memoryFallback.set(key, value);
  }
}

function createId() {
  return globalThis.crypto?.randomUUID?.() ?? `local-${Math.random().toString(36).slice(2)}-${Date.now()}`;
}

function titleCase(value: string) {
  return value
    .split(' ')
    .filter(Boolean)
    .map((part) => part.slice(0, 1).toUpperCase() + part.slice(1).toLowerCase())
    .join(' ');
}

function monthKeyFromIso(value: string) {
  const date = new Date(value);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  return `${year}-${month}`;
}

function isoDateKey(value: string) {
  const date = new Date(value);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function normalizeCategories(categories: Category[] | undefined) {
  const existing = new Map((categories ?? []).map((category) => [category.id, category]));

  for (const seeded of SEEDED_CATEGORIES) {
    if (!existing.has(seeded.id)) {
      existing.set(seeded.id, seeded);
    }
  }

  return [...existing.values()];
}

function defaultWorkspace(): WorkspaceState {
  return {
    version: 2,
    categories: normalizeCategories(undefined),
    receipts: [],
    transactions: [],
  };
}

function workspaceKey(scopeId: string) {
  return `${STORAGE_PREFIX}:${scopeId}`;
}

function sanitizeWorkspace(workspace: Partial<WorkspaceState> | WorkspaceState): WorkspaceState {
  return {
    version: 2,
    categories: normalizeCategories(workspace.categories),
    receipts: Array.isArray(workspace.receipts) ? workspace.receipts : [],
    transactions: Array.isArray(workspace.transactions) ? workspace.transactions : [],
  };
}

function readWorkspace(scopeId: string) {
  const raw = readRawValue(workspaceKey(scopeId));
  if (!raw) {
    const initial = defaultWorkspace();
    writeWorkspace(scopeId, initial);
    return initial;
  }

  try {
    const parsed = JSON.parse(raw) as Partial<WorkspaceState>;
    return sanitizeWorkspace(parsed);
  } catch {
    const initial = defaultWorkspace();
    writeWorkspace(scopeId, initial);
    return initial;
  }
}

export function writeWorkspace(scopeId: string, workspace: Partial<WorkspaceState> | WorkspaceState) {
  const normalized = sanitizeWorkspace(workspace);
  writeRawValue(workspaceKey(scopeId), JSON.stringify(normalized));
  return normalized;
}

function buildDemoUser(): LocalPrincipal {
  const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  const now = new Date().toISOString();

  return {
    authSource: 'browser_local',
    scopeId: 'browser-demo',
    user: {
      telegram_id: 777000,
      username: 'trackden_local',
      first_name: 'TrackDen',
      last_name: 'Local',
      photo_url: null,
      language_code: 'ru',
      is_premium: true,
      default_currency: 'RUB',
      timezone,
      last_auth_at: now,
    },
  };
}

export function resolveLocalPrincipal(initDataRaw?: string): LocalPrincipal {
  if (!initDataRaw) {
    return buildDemoUser();
  }

  try {
    const params = new URLSearchParams(initDataRaw);
    const rawUser = params.get('user');
    if (!rawUser) {
      return buildDemoUser();
    }

    const parsed = JSON.parse(rawUser) as {
      first_name?: string;
      id?: number;
      is_premium?: boolean;
      language_code?: string;
      last_name?: string;
      photo_url?: string;
      username?: string;
    };

    if (!parsed.id) {
      return buildDemoUser();
    }

    return {
      authSource: 'telegram_local',
      scopeId: `telegram-${parsed.id}`,
      user: {
        telegram_id: parsed.id,
        username: parsed.username ?? null,
        first_name: parsed.first_name ?? 'Telegram',
        last_name: parsed.last_name ?? null,
        photo_url: parsed.photo_url ?? null,
        language_code: parsed.language_code ?? 'ru',
        is_premium: Boolean(parsed.is_premium),
        default_currency: 'RUB',
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC',
        last_auth_at: new Date().toISOString(),
      },
    };
  } catch {
    return buildDemoUser();
  }
}

export function getLocalWorkspaceContext(initDataRaw?: string) {
  const principal = resolveLocalPrincipal(initDataRaw);
  return {
    principal,
    workspace: readWorkspace(principal.scopeId),
  };
}

export function resetLocalWorkspace(scopeId: string) {
  const initial = defaultWorkspace();
  return writeWorkspace(scopeId, initial);
}

function findCategoryById(categories: Category[], categoryId: string | null | undefined) {
  if (!categoryId) {
    return null;
  }

  return categories.find((category) => category.id === categoryId) ?? null;
}

function fallbackCategory(categories: Category[], type: TransactionType) {
  const fallbackName = type === 'income' ? 'Зарплата' : 'Другое';
  return categories.find((category) => category.name === fallbackName) ?? categories[0] ?? null;
}

function resolveCategory(
  workspace: WorkspaceState,
  payload: Partial<TransactionPayload>,
  currentTransaction?: StoredTransaction,
) {
  const explicitCategory = payload.category_id !== undefined
    ? findCategoryById(workspace.categories, payload.category_id)
    : findCategoryById(workspace.categories, currentTransaction?.category_id);

  if (explicitCategory) {
    return {
      aiConfidence: payload.category_id === undefined ? currentTransaction?.ai_confidence ?? null : null,
      category: explicitCategory,
    };
  }

  const receiptMerchant = payload.receipt_id
    ? workspace.receipts.find((receipt) => receipt.id === payload.receipt_id)?.extracted_merchant ?? ''
    : '';
  const type = payload.type ?? currentTransaction?.type ?? 'expense';
  const sourceText = [payload.merchant, payload.description, receiptMerchant, currentTransaction?.merchant, currentTransaction?.description]
    .filter((value): value is string => Boolean(value))
    .join(' ')
    .toLowerCase();

  for (const rule of CATEGORY_RULES) {
    if (rule.type !== type) {
      continue;
    }

    if (rule.keywords.some((keyword) => sourceText.includes(keyword))) {
      const category = workspace.categories.find((item) => item.name === rule.name);
      if (category) {
        return {
          aiConfidence: rule.confidence,
          category,
        };
      }
    }
  }

  return {
    aiConfidence: type === 'income' ? 0.72 : 0.56,
    category: fallbackCategory(workspace.categories, type),
  };
}

function materializeTransaction(workspace: WorkspaceState, transaction: StoredTransaction): Transaction {
  const category = findCategoryById(workspace.categories, transaction.category_id);
  return {
    ...transaction,
    category: category
      ? {
          id: category.id,
          name: category.name,
          color: category.color ?? null,
        }
      : null,
  };
}

function sortTransactions(items: StoredTransaction[]) {
  return [...items].sort((left, right) => new Date(right.occurred_at).getTime() - new Date(left.occurred_at).getTime());
}

function ensureTransactionPayload(body: RequestOptions['body']): TransactionPayload {
  if (!body || body instanceof FormData || typeof body !== 'object') {
    throw new ApiError({
      code: 'invalid_payload',
      message: 'Некорректные данные операции.',
    });
  }

  return body as TransactionPayload;
}

function createTransaction(workspace: WorkspaceState, payload: TransactionPayload) {
  if (!Number.isFinite(Number(payload.amount)) || Number(payload.amount) <= 0) {
    throw new ApiError({
      code: 'invalid_amount',
      message: 'Сумма должна быть больше нуля.',
    });
  }

  const now = new Date().toISOString();
  const resolved = resolveCategory(workspace, payload);
  const transaction: StoredTransaction = {
    id: createId(),
    amount: Number(payload.amount),
    type: payload.type,
    currency: payload.currency || 'RUB',
    description: payload.description ?? null,
    merchant: payload.merchant ?? null,
    occurred_at: payload.occurred_at ?? now,
    source: payload.source ?? 'manual',
    receipt_id: payload.receipt_id ?? null,
    ai_confidence: resolved.aiConfidence,
    category_id: resolved.category?.id ?? null,
    created_at: now,
    updated_at: now,
  };

  workspace.transactions = sortTransactions([...workspace.transactions, transaction]);
  return materializeTransaction(workspace, transaction);
}

function updateTransaction(workspace: WorkspaceState, id: string, payload: Partial<TransactionPayload>) {
  const index = workspace.transactions.findIndex((transaction) => transaction.id === id);
  if (index < 0) {
    throw new ApiError({
      code: 'transaction_not_found',
      message: 'Операция не найдена.',
    });
  }

  const current = workspace.transactions[index];
  if (!current) {
    throw new ApiError({
      code: 'transaction_not_found',
      message: '???????? ?? ???????.',
    });
  }

  const nextAmount = payload.amount !== undefined ? Number(payload.amount) : current.amount;
  if (!Number.isFinite(nextAmount) || nextAmount <= 0) {
    throw new ApiError({
      code: 'invalid_amount',
      message: 'Сумма должна быть больше нуля.',
    });
  }

  const resolved = resolveCategory(workspace, payload, current);
  const updated: StoredTransaction = {
    ...current,
    amount: nextAmount,
    type: payload.type ?? current.type,
    currency: payload.currency ?? current.currency,
    description: payload.description !== undefined ? payload.description ?? null : current.description ?? null,
    merchant: payload.merchant !== undefined ? payload.merchant ?? null : current.merchant ?? null,
    occurred_at: payload.occurred_at ?? current.occurred_at,
    source: payload.source ?? current.source,
    receipt_id: payload.receipt_id !== undefined ? payload.receipt_id ?? null : current.receipt_id ?? null,
    category_id: resolved.category?.id ?? null,
    ai_confidence: resolved.aiConfidence,
    updated_at: new Date().toISOString(),
    created_at: current.created_at,
  };

  workspace.transactions = sortTransactions(workspace.transactions.map((transaction) => (transaction.id === id ? updated : transaction)));
  return materializeTransaction(workspace, updated);
}

function deleteTransaction(workspace: WorkspaceState, id: string) {
  const exists = workspace.transactions.some((transaction) => transaction.id === id);
  if (!exists) {
    throw new ApiError({
      code: 'transaction_not_found',
      message: 'Операция не найдена.',
    });
  }

  workspace.transactions = workspace.transactions.filter((transaction) => transaction.id !== id);
}

function deriveMerchant(fileName: string) {
  const stem = fileName.replace(/\.[^.]+$/, '');
  const cleaned = stem
    .replace(/(чек|receipt|check|invoice)/gi, ' ')
    .replace(/\d+[.,]?\d*/g, ' ')
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  return titleCase(cleaned || 'Demo Store');
}

function deriveTotal(file: File) {
  const match = file.name.match(/(\d+[.,]\d{1,2}|\d+)/);
  if (match) {
    return Number((match[1] ?? '0').replace(',', '.'));
  }

  return Math.round((((file.size % 250_00) / 100) + 50) * 100) / 100;
}

function uploadReceipt(workspace: WorkspaceState, body: FormData | null) {
  const file = body?.get('file');
  if (!(file instanceof File)) {
    throw new ApiError({
      code: 'file_required',
      message: 'Нужно выбрать файл чека.',
    });
  }

  if (!file.type.startsWith('image/')) {
    throw new ApiError({
      code: 'unsupported_file_type',
      message: 'Поддерживаются только изображения.',
    });
  }

  if (file.size > MAX_UPLOAD_BYTES) {
    throw new ApiError({
      code: 'file_too_large',
      message: 'Файл слишком большой.',
      details: { max_upload_bytes: MAX_UPLOAD_BYTES },
    });
  }

  const now = new Date().toISOString();
  const total = deriveTotal(file);
  const merchant = deriveMerchant(file.name);
  const receipt: Receipt = {
    id: createId(),
    original_filename: file.name,
    mime_type: file.type,
    size_bytes: file.size,
    status: 'processed',
    ocr_provider: 'mock',
    extracted_total: total,
    extracted_merchant: merchant,
    ocr_raw: {
      confidence: 0.91,
      filename: file.name,
      merchant,
      provider: 'mock',
      total: total.toFixed(2),
    },
    error: null,
    uploaded_at: now,
    processed_at: now,
    created_at: now,
    updated_at: now,
  };

  workspace.receipts = [receipt, ...workspace.receipts];
  return receipt;
}

function buildByDayPoints(month: string, transactions: Transaction[]): DailySpendPoint[] {
  const [yearPart, monthPart] = month.split('-');
  const year = Number(yearPart);
  const monthIndex = Number(monthPart) - 1;
  const daysInMonth = new Date(year, monthIndex + 1, 0).getDate();
  const totals = new Map<string, { expense: number; income: number }>();

  for (const transaction of transactions) {
    const key = isoDateKey(transaction.occurred_at);
    const current = totals.get(key) ?? { expense: 0, income: 0 };
    current[transaction.type] += transaction.amount;
    totals.set(key, current);
  }

  return Array.from({ length: daysInMonth }, (_, index) => {
    const day = String(index + 1).padStart(2, '0');
    const key = `${month}-${day}`;
    const totalsForDay = totals.get(key) ?? { expense: 0, income: 0 };

    return {
      date: key,
      expense: totalsForDay.expense,
      income: totalsForDay.income,
    };
  });
}

function buildCategoryBreakdown(transactions: Transaction[]): CategorySpendPoint[] {
  const totals = new Map<string, CategorySpendPoint>();

  for (const transaction of transactions) {
    if (transaction.type !== 'expense') {
      continue;
    }

    const categoryName = transaction.category?.name ?? 'Другое';
    const key = transaction.category?.id ?? categoryName;
    const current = totals.get(key) ?? {
      category_id: transaction.category?.id ?? null,
      category_name: categoryName,
      amount: 0,
      color: transaction.category?.color ?? '#64748b',
    };
    current.amount += transaction.amount;
    totals.set(key, current);
  }

  return [...totals.values()].sort((left, right) => right.amount - left.amount);
}

function buildOverview(workspace: WorkspaceState, month: string): AnalyticsOverviewResponse {
  const filtered = sortTransactions(workspace.transactions)
    .filter((transaction) => monthKeyFromIso(transaction.occurred_at) === month)
    .map((transaction) => materializeTransaction(workspace, transaction));

  const totalExpense = filtered
    .filter((transaction) => transaction.type === 'expense')
    .reduce((sum, transaction) => sum + transaction.amount, 0);
  const totalIncome = filtered
    .filter((transaction) => transaction.type === 'income')
    .reduce((sum, transaction) => sum + transaction.amount, 0);

  return {
    month,
    total_expense: totalExpense,
    total_income: totalIncome,
    balance: totalIncome - totalExpense,
    by_category: buildCategoryBreakdown(filtered),
    by_day: buildByDayPoints(month, filtered),
  };
}

async function handleSession(principal: LocalPrincipal) {
  const workspace = readWorkspace(principal.scopeId);
  writeWorkspace(principal.scopeId, workspace);

  return {
    auth_source: principal.authSource,
    user: principal.user,
    categories: workspace.categories,
  } satisfies SessionResponse;
}

async function handleTransactions(pathname: string, searchParams: URLSearchParams, principal: LocalPrincipal, options: RequestOptions) {
  const workspace = readWorkspace(principal.scopeId);
  const method = (options.method ?? 'GET').toUpperCase();

  if (pathname === '/transactions' && method === 'GET') {
    const month = searchParams.get('month') ?? '';
    const limit = Number(searchParams.get('limit') ?? '30');
    const type = searchParams.get('type') as TransactionType | null;
    const items = sortTransactions(workspace.transactions)
      .filter((transaction) => !month || monthKeyFromIso(transaction.occurred_at) === month)
      .filter((transaction) => !type || transaction.type === type)
      .slice(0, limit)
      .map((transaction) => materializeTransaction(workspace, transaction));

    return {
      items,
      total: items.length,
    };
  }

  if (pathname === '/transactions' && method === 'POST') {
    const created = createTransaction(workspace, ensureTransactionPayload(options.body));
    writeWorkspace(principal.scopeId, workspace);
    return created;
  }

  const match = pathname.match(/^\/transactions\/([^/]+)$/);
  if (!match) {
    throw new ApiError({
      code: 'not_found',
      message: 'Маршрут не найден.',
    });
  }

  const transactionId = decodeURIComponent(match[1] ?? '');
  if (method === 'GET') {
    const transaction = workspace.transactions.find((item) => item.id === transactionId);
    if (!transaction) {
      throw new ApiError({
        code: 'transaction_not_found',
        message: 'Операция не найдена.',
      });
    }

    return materializeTransaction(workspace, transaction);
  }

  if (method === 'PATCH') {
    const updated = updateTransaction(workspace, transactionId, ensureTransactionPayload(options.body) as Partial<TransactionPayload>);
    writeWorkspace(principal.scopeId, workspace);
    return updated;
  }

  if (method === 'DELETE') {
    deleteTransaction(workspace, transactionId);
    writeWorkspace(principal.scopeId, workspace);
    return undefined;
  }

  throw new ApiError({
    code: 'method_not_allowed',
    message: 'Метод не поддерживается.',
  });
}

async function handleReceipts(pathname: string, principal: LocalPrincipal, options: RequestOptions) {
  const workspace = readWorkspace(principal.scopeId);
  const method = (options.method ?? 'GET').toUpperCase();

  if (pathname === '/receipts' && method === 'POST') {
    const receipt = uploadReceipt(workspace, options.body instanceof FormData ? options.body : null);
    writeWorkspace(principal.scopeId, workspace);
    return receipt;
  }

  const match = pathname.match(/^\/receipts\/([^/]+)$/);
  if (!match || method !== 'GET') {
    throw new ApiError({
      code: 'not_found',
      message: 'Маршрут не найден.',
    });
  }

  const receiptId = decodeURIComponent(match[1] ?? '');
  const receipt = workspace.receipts.find((item) => item.id === receiptId);
  if (!receipt) {
    throw new ApiError({
      code: 'receipt_not_found',
      message: 'Чек не найден.',
    });
  }

  return receipt;
}

async function handleAnalytics(searchParams: URLSearchParams, principal: LocalPrincipal) {
  const month = searchParams.get('month');
  if (!month) {
    throw new ApiError({
      code: 'missing_month',
      message: 'Нужно передать параметр month.',
    });
  }

  const workspace = readWorkspace(principal.scopeId);
  return buildOverview(workspace, month);
}

export async function localApiRequest<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const principal = resolveLocalPrincipal(options.initDataRaw);
  const method = (options.method ?? 'GET').toUpperCase();
  const url = new URL(path, LOCAL_ORIGIN);

  if (url.pathname === '/auth/session' && method === 'GET') {
    return (await handleSession(principal)) as T;
  }

  if (url.pathname.startsWith('/transactions')) {
    return (await handleTransactions(url.pathname, url.searchParams, principal, options)) as T;
  }

  if (url.pathname.startsWith('/receipts')) {
    return (await handleReceipts(url.pathname, principal, options)) as T;
  }

  if (url.pathname === '/analytics/overview' && method === 'GET') {
    return (await handleAnalytics(url.searchParams, principal)) as T;
  }

  throw new ApiError({
    code: 'not_found',
    message: 'Маршрут не найден.',
  });
}



