import {
  AuditCategory,
  AuditOutcome,
  AuditSeverity,
  LoginOutcome,
  PermissionRisk,
  StatusChangeReason,
  UserStatus,
} from 'src/app/core/models/iam.models';
import { SelectOption, Translator } from 'src/app/shared/i18n/catalog-options';

/**
 * Presentation vocabulary for the IAM screens: API enum → translation key /
 * visual severity. Kept in one file so the user list, the detail page and
 * the audit log can never drift to different words for the same status.
 */

export type TagSeverity = 'success' | 'info' | 'warn' | 'danger' | 'secondary' | 'contrast';

/** `.status-pill-*` modifier per status (styles.scss, per context.md §10). */
export const USER_STATUS_PILL: Readonly<Record<UserStatus, string>> = {
  PENDING_ACTIVATION: 'status-pill-info',
  ACTIVE: 'status-pill-active',
  SUSPENDED: 'status-pill-warn',
  LOCKED: 'status-pill-danger',
  DEACTIVATED: 'status-pill-inactive',
};

export const USER_STATUS_ICON: Readonly<Record<UserStatus, string>> = {
  PENDING_ACTIVATION: 'pi pi-envelope',
  ACTIVE: 'pi pi-check-circle',
  SUSPENDED: 'pi pi-pause-circle',
  LOCKED: 'pi pi-lock',
  DEACTIVATED: 'pi pi-ban',
};

export const USER_STATUSES: readonly UserStatus[] = [
  'ACTIVE',
  'PENDING_ACTIVATION',
  'SUSPENDED',
  'LOCKED',
  'DEACTIVATED',
];

export function userStatusOptions(t: Translator): SelectOption<UserStatus>[] {
  return USER_STATUSES.map((value) => ({ value, label: t(`IAM.USER_STATUS.${value}`) }));
}

export const STATUS_REASONS: readonly StatusChangeReason[] = [
  'SECURITY_INCIDENT',
  'POLICY_VIOLATION',
  'OFFBOARDING',
  'LEAVE_OF_ABSENCE',
  'ROLE_CHANGE',
  'ADMIN_REQUEST',
  'OTHER',
];

export function statusReasonOptions(t: Translator): SelectOption<StatusChangeReason>[] {
  return STATUS_REASONS.map((value) => ({ value, label: t(`IAM.STATUS_REASON.${value}`) }));
}

export const RISK_SEVERITY: Readonly<Record<PermissionRisk, TagSeverity>> = {
  LOW: 'secondary',
  MEDIUM: 'info',
  HIGH: 'warn',
  CRITICAL: 'danger',
};

export const RISK_ORDER: Readonly<Record<PermissionRisk, number>> = { LOW: 0, MEDIUM: 1, HIGH: 2, CRITICAL: 3 };

export const AUDIT_CATEGORIES: readonly AuditCategory[] = [
  'AUTHENTICATION',
  'USER_ADMINISTRATION',
  'ACCESS_CONTROL',
  'SECURITY',
  'CONFIGURATION',
  'DATA',
];

export const AUDIT_CATEGORY_ICON: Readonly<Record<AuditCategory, string>> = {
  AUTHENTICATION: 'pi pi-sign-in',
  USER_ADMINISTRATION: 'pi pi-user-edit',
  ACCESS_CONTROL: 'pi pi-shield',
  SECURITY: 'pi pi-lock',
  CONFIGURATION: 'pi pi-cog',
  DATA: 'pi pi-database',
};

export const AUDIT_OUTCOME_SEVERITY: Readonly<Record<AuditOutcome, TagSeverity>> = {
  SUCCESS: 'success',
  FAILURE: 'danger',
  DENIED: 'warn',
};

export const AUDIT_SEVERITY_SEVERITY: Readonly<Record<AuditSeverity, TagSeverity>> = {
  INFO: 'secondary',
  NOTICE: 'info',
  WARNING: 'warn',
  CRITICAL: 'danger',
};

export const LOGIN_OUTCOME_SEVERITY: Readonly<Record<LoginOutcome, TagSeverity>> = {
  SUCCESS: 'success',
  FAILURE: 'danger',
  LOCKED: 'danger',
  TWO_FACTOR_FAILED: 'warn',
};

export function auditCategoryOptions(t: Translator): SelectOption<AuditCategory>[] {
  return AUDIT_CATEGORIES.map((value) => ({ value, label: t(`IAM.AUDIT.CATEGORY.${value}`) }));
}

export function auditOutcomeOptions(t: Translator): SelectOption<AuditOutcome>[] {
  return (['SUCCESS', 'FAILURE', 'DENIED'] as const).map((value) => ({ value, label: t(`IAM.AUDIT.OUTCOME.${value}`) }));
}

export function auditSeverityOptions(t: Translator): SelectOption<AuditSeverity>[] {
  return (['INFO', 'NOTICE', 'WARNING', 'CRITICAL'] as const).map((value) => ({
    value,
    label: t(`IAM.AUDIT.SEVERITY.${value}`),
  }));
}

/** Two-letter initials for an avatar placeholder. */
export function initialsOf(firstName: string | null, lastName: string | null, fallback: string): string {
  const first = firstName?.trim().charAt(0) ?? '';
  const last = lastName?.trim().charAt(0) ?? '';
  const initials = `${first}${last}` || fallback.trim().slice(0, 2);
  return initials.toUpperCase();
}

/** Readable text colour (black/white) for a `#RRGGBB` background — WCAG relative luminance. */
export function contrastTextFor(hex: string | null): string {
  if (!hex || !/^#[0-9a-f]{6}$/i.test(hex)) {
    return 'inherit';
  }
  const channel = (offset: number): number => {
    const value = parseInt(hex.slice(offset, offset + 2), 16) / 255;
    return value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  };
  const luminance = 0.2126 * channel(1) + 0.7152 * channel(3) + 0.0722 * channel(5);
  return luminance > 0.4 ? '#0f172a' : '#ffffff';
}

/** Curated role colours — readable chips in both themes. */
export const ROLE_COLOR_PALETTE: readonly string[] = [
  '#0f766e',
  '#2563eb',
  '#7c3aed',
  '#db2777',
  '#dc2626',
  '#ea580c',
  '#ca8a04',
  '#16a34a',
  '#475569',
  '#0e7490',
];
