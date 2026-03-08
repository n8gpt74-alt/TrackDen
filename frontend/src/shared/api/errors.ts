export type ApiErrorPayload = {
  code: string;
  message: string;
  details?: unknown;
  request_id?: string;
};

export class ApiError extends Error {
  readonly code: string;
  readonly details?: unknown;
  readonly requestId?: string;

  constructor(payload: ApiErrorPayload) {
    super(payload.message);
    this.name = 'ApiError';
    this.code = payload.code;
    this.details = payload.details;
    this.requestId = payload.request_id;
  }
}

