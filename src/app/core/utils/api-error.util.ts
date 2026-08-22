import { ApiErrorCode, ApiErrorDetail } from '../models';

/**
 * Error normalisation for the shape `errorInterceptor` rethrows.
 *
 * The interceptor unwraps `HttpErrorResponse` and rethrows `error.error` —
 * the raw API envelope — so callers receive `unknown`, never a typed object.
 * These helpers narrow it without a single `any`.
 */

interface ErrorEnvelope {
  message?: unknown;
  errors?: unknown;
}

function asRecord(value: unknown): ErrorEnvelope | null {
  return typeof value === 'object' && value !== null ? (value as ErrorEnvelope) : null;
}

function isErrorDetail(value: unknown): value is ApiErrorDetail {
  const record = asRecord(value) as { code?: unknown } | null;
  return record !== null && typeof record.code === 'string';
}

/** Every `errors[]` entry carried by the failure, or `[]` when there are none. */
export function apiErrors(error: unknown): ApiErrorDetail[] {
  const envelope = asRecord(error);
  if (!envelope || !Array.isArray(envelope.errors)) {
    return [];
  }
  return envelope.errors.filter(isErrorDetail);
}

/** The first entry matching `code`, or `undefined`. */
export function findApiError(error: unknown, code: ApiErrorCode): ApiErrorDetail | undefined {
  return apiErrors(error).find((detail) => detail.code === code);
}

/** True when the failure carries `code` at all. */
export function hasApiError(error: unknown, code: ApiErrorCode): boolean {
  return findApiError(error, code) !== undefined;
}

/**
 * Human-readable text for a toast: the first error detail's message, then the
 * envelope's own message, then the caller's fallback.
 */
export function apiErrorMessage(error: unknown, fallback: string): string {
  const detail = apiErrors(error).find((entry) => typeof entry.message === 'string' && entry.message.length > 0);
  if (detail?.message) {
    return detail.message;
  }
  const envelope = asRecord(error);
  return typeof envelope?.message === 'string' && envelope.message.length > 0 ? envelope.message : fallback;
}
