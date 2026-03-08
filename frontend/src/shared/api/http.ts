import { ApiError, type ApiErrorPayload } from './errors';
import { localApiRequest } from './localApi';
import { isLocalDataMode } from './mode';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:8000/api/v1';

type RequestOptions = Omit<RequestInit, 'body'> & {
  body?: BodyInit | FormData | Record<string, unknown> | null;
  initDataRaw?: string;
};

export async function apiRequest<T>(path: string, options: RequestOptions = {}): Promise<T> {
  if (isLocalDataMode()) {
    return localApiRequest<T>(path, options);
  }

  const headers = new Headers(options.headers);
  const isFormData = options.body instanceof FormData;

  if (options.initDataRaw) {
    headers.set('X-Telegram-Init-Data', options.initDataRaw);
  }

  let body: BodyInit | undefined;
  if (isFormData) {
    body = options.body as FormData;
  } else if (options.body != null) {
    headers.set('Content-Type', 'application/json');
    body = JSON.stringify(options.body);
  }

  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...options,
    headers,
    body,
  });

  if (!response.ok) {
    let payload: ApiErrorPayload = {
      code: 'unknown_error',
      message: 'Request failed.',
    };

    try {
      const parsed = (await response.json()) as { error?: ApiErrorPayload };
      if (parsed.error) {
        payload = parsed.error;
      }
    } catch {
      payload = {
        code: 'unknown_error',
        message: response.statusText || 'Request failed.',
      };
    }

    throw new ApiError(payload);
  }

  if (response.status === 204) {
    return undefined as T;
  }

  return (await response.json()) as T;
}
