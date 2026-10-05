/**
 * Self-service two-factor authentication (TOTP) — `/api/v1/users/me/two-factor`.
 *
 * Mirrors `docs/api/iam-and-finance.md` §8.2. **Change the two together.**
 * V8 envelope (`ApiEnvelope<T>`).
 */

export type TwoFactorMethod = 'TOTP';

export interface TwoFactorStatus {
  enabled: boolean;
  /** One of the user's roles (or an admin flag) makes 2FA mandatory: disabling is refused. */
  required: boolean;
  /** Display names of the roles that make it mandatory — empty when `required` comes from the user flag. */
  requiredBy: string[];
  method: TwoFactorMethod | null;
  enrolledAt: string | null;
  /** Unused recovery codes left. 0 when disabled. */
  recoveryCodesRemaining: number;
}

/** `POST …/enrollment` — a pending secret, valid until `expiresAt`; nothing is active yet. */
export interface TwoFactorEnrollment {
  enrollmentId: string;
  /** Base32, unformatted. Shown in groups of 4 for manual entry. */
  secret: string;
  /** `otpauth://totp/Cronos:user?secret=…&issuer=Cronos&digits=6&period=30` */
  otpauthUri: string;
  /** `data:image/png;base64,…` — rendered server-side so the secret never reaches a third-party QR service. */
  qrCodeDataUri: string;
  issuer: string;
  accountName: string;
  digits: number;
  periodSeconds: number;
  expiresAt: string;
}

export interface ConfirmTwoFactorRequest {
  enrollmentId: string;
  code: string;
}

export interface TwoFactorRecoveryCodes {
  /** Shown exactly once. 10 codes, `XXXX-XXXX`. */
  recoveryCodes: string[];
  status: TwoFactorStatus;
}

export interface DisableTwoFactorRequest {
  password: string;
  /** A current 6-digit TOTP code, or one unused recovery code. */
  code: string;
}

export interface RegenerateRecoveryCodesRequest {
  code: string;
}
