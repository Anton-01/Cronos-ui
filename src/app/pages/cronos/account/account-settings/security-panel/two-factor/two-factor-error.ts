import { catalogErrors, catalogTraceId } from 'src/app/core/utils/catalog-error.util';

/** What the dialogs show inline when a 2FA call fails. */
export interface TwoFactorFailure {
  /** Translation key for the headline. */
  titleKey: string;
  /** Server message when it sent one, else `null` (the headline is enough). */
  detail: string | null;
  traceId: string | null;
  /** The failure is about the typed code — keep the user on the code step. */
  codeRejected: boolean;
}

const CODE_ERRORS = new Set(['INVALID_TOTP_CODE', 'INVALID_RECOVERY_CODE', 'INVALID_PASSWORD']);

/**
 * Turns an HTTP failure into something a user can act on. A 404 means the
 * backend has not deployed the endpoint (the bug that motivated this), which
 * the user cannot fix — say so plainly and give support the trace id.
 */
export function describeTwoFactorFailure(error: unknown): TwoFactorFailure {
  const details = catalogErrors(error);
  const codes = new Set(details.map((detail) => detail.code));
  const traceId = catalogTraceId(error);
  const detail = details.find((entry) => entry.message.length > 0)?.message ?? null;

  if (codes.has('ROUTE_NOT_FOUND')) {
    return { titleKey: 'ACCOUNT.TWO_FACTOR.ERRORS.UNAVAILABLE', detail: null, traceId, codeRejected: false };
  }
  if (codes.has('ENROLLMENT_EXPIRED')) {
    return { titleKey: 'ACCOUNT.TWO_FACTOR.ERRORS.EXPIRED', detail: null, traceId, codeRejected: false };
  }
  if ([...codes].some((code) => CODE_ERRORS.has(code))) {
    return { titleKey: 'ACCOUNT.TWO_FACTOR.ERRORS.CODE_REJECTED', detail, traceId, codeRejected: true };
  }
  if (codes.has('RATE_LIMITED')) {
    return { titleKey: 'ACCOUNT.TWO_FACTOR.ERRORS.RATE_LIMITED', detail, traceId, codeRejected: false };
  }
  return { titleKey: 'ACCOUNT.TWO_FACTOR.ERRORS.GENERIC', detail, traceId, codeRejected: false };
}

/** `JBSWY3DPEHPK3PXP` → `JBSW Y3DP EHPK 3PXP` for manual entry. */
export function groupSecret(secret: string): string {
  return secret.replace(/\s+/g, '').replace(/(.{4})/g, '$1 ').trim();
}

/** Recovery codes as a downloadable text file the user can store offline. */
export function recoveryCodesFile(codes: string[], account: string, header: string): Blob {
  const lines = [header, account, new Date().toISOString(), '', ...codes.map((code, index) => `${String(index + 1).padStart(2, '0')}. ${code}`), ''];
  return new Blob([lines.join('\n')], { type: 'text/plain;charset=utf-8' });
}
