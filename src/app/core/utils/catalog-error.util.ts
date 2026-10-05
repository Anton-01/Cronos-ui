import { ApiError } from '../models/unit-catalog.models';

/**
 * Error normalisation for the unit-catalog `ApiEnvelope` shape.
 *
 * Mirrors `api-error.util.ts`, but for this feature's own envelope: `code`
 * here is a free-form, dotted i18n key (`"catalog.conversion.incompatible"`,
 * `"import.cell.decimalComma"`), not the fixed `ApiErrorCode` union the rest
 * of the app rethrows — so it cannot reuse those helpers without widening
 * that union for codes nothing else needs.
 */

interface ErrorEnvelope {
  message?: unknown;
  errors?: unknown;
}

function asRecord(value: unknown): ErrorEnvelope | null {
  return typeof value === 'object' && value !== null ? (value as ErrorEnvelope) : null;
}

function isApiError(value: unknown): value is ApiError {
  const record = value as { code?: unknown; message?: unknown } | null;
  return (
    typeof record === 'object' &&
    record !== null &&
    typeof record.code === 'string' &&
    typeof record.message === 'string'
  );
}

/** Every `errors[]` entry carried by the failure, or `[]` when there are none. */
export function catalogErrors(error: unknown): ApiError[] {
  const envelope = asRecord(error);
  if (!envelope || !Array.isArray(envelope.errors)) {
    return [];
  }
  return envelope.errors.filter(isApiError);
}

/** The first entry matching `code`, or `undefined`. */
export function findCatalogError(error: unknown, code: string): ApiError | undefined {
  return catalogErrors(error).find((detail) => detail.code === code);
}

/** True when the failure carries `code` at all. */
export function hasCatalogError(error: unknown, code: string): boolean {
  return findCatalogError(error, code) !== undefined;
}

/** Human-readable text for a toast: first detail message, then the envelope's own, then the fallback. */
export function catalogErrorMessage(error: unknown, fallback: string): string {
  const detail = catalogErrors(error).find((entry) => entry.message.length > 0);
  if (detail) {
    return detail.message;
  }
  const envelope = asRecord(error);
  return typeof envelope?.message === 'string' && envelope.message.length > 0 ? envelope.message : fallback;
}

/** The envelope's own `message`, ignoring every per-detail message. */
export function catalogRootMessage(error: unknown, fallback: string): string {
  const envelope = asRecord(error);
  return typeof envelope?.message === 'string' && envelope.message.length > 0 ? envelope.message : fallback;
}

/** `meta.traceId`, for a 5xx toast ("Referencia: …") — `null` when the envelope carries none. */
export function catalogTraceId(error: unknown): string | null {
  const envelope = error as { meta?: { traceId?: unknown } } | null;
  const traceId = envelope?.meta?.traceId;
  return typeof traceId === 'string' && traceId.length > 0 ? traceId : null;
}
