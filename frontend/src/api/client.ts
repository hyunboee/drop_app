import { log } from '../lib/log';
import { queryClient } from '../queryClient';
import { useSession } from '../stores/session';

export type ServerErrorCode =
  | 'AUTH_REQUIRED' | 'INVALID_CREDENTIALS' | 'ACCOUNT_LOCKED' | 'EMAIL_TAKEN' | 'VALIDATION_FAILED'
  | 'GRADE_NOT_ALLOWED' | 'LOW_ACCURACY' | 'DROP_TOO_FAR' | 'OUT_OF_RANGE' | 'MODERATION_REJECTED'
  | 'MODERATION_UNAVAILABLE' | 'MEDIA_ALREADY_USED' | 'NOT_OWNER' | 'MEDIA_FORBIDDEN'
  | 'CAPSULE_NOT_FOUND' | 'INTERNAL_ERROR';
export type ApiErrorCode = ServerErrorCode | 'NETWORK_ERROR' | 'UPLOAD_FAILED' | 'UNKNOWN_ERROR';

const DEFAULT_MESSAGE = '잠시 후 다시 시도해 주세요';

export class ApiError extends Error {
  readonly code: ApiErrorCode;
  readonly status: number;
  readonly extra: Record<string, unknown>;

  constructor(code: ApiErrorCode, message: string, status: number, extra: Record<string, unknown> = {}) {
    super(message);
    this.name = 'ApiError';
    this.code = code;
    this.status = status;
    this.extra = extra;
  }
}

export function messageOf(error: unknown): string {
  return error instanceof ApiError ? error.message : DEFAULT_MESSAGE;
}

export function handleUnauthorized(): void {
  useSession.getState().logout();
  queryClient.removeQueries({ queryKey: ['nearby'] });
}

function fail(path: string, code: ApiErrorCode, message: string, status: number, extra?: Record<string, unknown>) {
  const error = new ApiError(code, message, status, extra);
  // /api/me의 401은 정상 분기(부팅 시 비로그인)
  if (path === '/api/me' && code === 'AUTH_REQUIRED') log.warn('api', error, { path, status });
  else log.error('api', error, { path, status });
  return error;
}

export async function api<T = void>(
  path: string,
  options: { method?: 'GET' | 'POST' | 'DELETE'; body?: unknown } = {},
): Promise<T> {
  const { method = 'GET', body } = options;
  let res: Response;
  try {
    res = await fetch(path, {
      method,
      credentials: 'same-origin',
      headers: body !== undefined ? { 'Content-Type': 'application/json' } : undefined,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  } catch {
    throw fail(path, 'NETWORK_ERROR', '네트워크 연결을 확인해 주세요', 0);
  }

  if (res.status === 204) return undefined as T;

  let data: unknown;
  try {
    data = await res.json();
  } catch {
    data = undefined;
  }

  if (res.ok) {
    if (data === undefined) throw fail(path, 'UNKNOWN_ERROR', DEFAULT_MESSAGE, res.status);
    return data as T;
  }

  const err = (data as { error?: Record<string, unknown> } | undefined)?.error;
  if (!err || typeof err.code !== 'string' || typeof err.message !== 'string') {
    throw fail(path, 'UNKNOWN_ERROR', DEFAULT_MESSAGE, res.status);
  }
  const { code, message, ...extra } = err;
  const error = fail(path, code as ApiErrorCode, message as string, res.status, extra);
  if (code === 'AUTH_REQUIRED') handleUnauthorized();
  throw error;
}
