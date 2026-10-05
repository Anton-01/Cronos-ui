/**
 * Identity & Access Management contracts — `/api/v1/iam/**`.
 *
 * Mirrors `docs/api/iam-and-finance.md` §2–§8. **Change the two together.**
 *
 * Every endpoint here answers with the V8 envelope (`ApiEnvelope<T>` /
 * `CatalogPage<T>` from `unit-catalog.models.ts`), not the legacy
 * `ApiResponse<T>` / `Page<T>` pair.
 *
 * Permissions are addressed by their stable string `code`
 * (`IAM.USER.CREATE`), never by numeric id: codes are seeded by the backend
 * from source, identical in every environment, and are what the JWT carries.
 */

import { FieldChange } from './unit-catalog.models';

// ─── Shared references ───

export type AppLocale = 'es-MX' | 'en';

export interface RoleRef {
  id: number;
  code: string;
  name: string;
  /** Hex `#RRGGBB` the UI paints the role chip with; `null` = neutral. */
  color: string | null;
}

export interface PermissionGroupRef {
  id: number;
  code: string;
  name: string;
}

export interface UserRef {
  id: string;
  username: string;
  displayName: string;
  avatarUrl: string | null;
}

// ─── Users ───

/**
 * Lifecycle (server-enforced, see doc §3.3):
 *
 * PENDING_ACTIVATION → ACTIVE | DEACTIVATED
 * ACTIVE             → SUSPENDED | LOCKED | DEACTIVATED
 * SUSPENDED          → ACTIVE | DEACTIVATED
 * LOCKED             → ACTIVE | DEACTIVATED
 * DEACTIVATED        → ACTIVE
 */
export type UserStatus = 'PENDING_ACTIVATION' | 'ACTIVE' | 'SUSPENDED' | 'LOCKED' | 'DEACTIVATED';

export const USER_STATUS_TRANSITIONS: Readonly<Record<UserStatus, readonly UserStatus[]>> = {
  PENDING_ACTIVATION: ['ACTIVE', 'DEACTIVATED'],
  ACTIVE: ['SUSPENDED', 'LOCKED', 'DEACTIVATED'],
  SUSPENDED: ['ACTIVE', 'DEACTIVATED'],
  LOCKED: ['ACTIVE', 'DEACTIVATED'],
  DEACTIVATED: ['ACTIVE'],
};

/** Statuses that accept an optional `until` (auto-revert to ACTIVE). */
export const TIME_BOUND_STATUSES: readonly UserStatus[] = ['SUSPENDED', 'LOCKED'];

export type StatusChangeReason =
  | 'SECURITY_INCIDENT'
  | 'POLICY_VIOLATION'
  | 'OFFBOARDING'
  | 'LEAVE_OF_ABSENCE'
  | 'ROLE_CHANGE'
  | 'ADMIN_REQUEST'
  | 'OTHER';

export interface IamUserSummary {
  id: string;
  username: string;
  email: string;
  firstName: string | null;
  lastName: string | null;
  /** `firstName lastName`, or `username` when both are empty. */
  displayName: string;
  avatarUrl: string | null;
  jobTitle: string | null;
  department: string | null;
  status: UserStatus;
  roles: RoleRef[];
  twoFactorEnabled: boolean;
  mustChangePassword: boolean;
  lastLoginAt: string | null;
  /** Only set while `status` is LOCKED/SUSPENDED with a time bound. */
  statusUntil: string | null;
  accessExpiresAt: string | null;
  createdAt: string;
}

export interface IamUserDetail extends IamUserSummary {
  phoneNumber: string | null;
  employeeNumber: string | null;
  locale: AppLocale;
  emailVerified: boolean;
  failedLoginAttempts: number;
  passwordChangedAt: string | null;
  statusReason: StatusChangeReason | null;
  statusComment: string | null;
  statusChangedAt: string | null;
  statusChangedBy: UserRef | null;
  invitationExpiresAt: string | null;
  createdBy: UserRef | null;
  updatedAt: string | null;
  updatedBy: UserRef | null;
  /** Optimistic-lock token. Echo it on every write; a stale value → 409 CONCURRENT_MODIFICATION. */
  version: number;
}

export interface UserQuery {
  page: number;
  size: number;
  /** `field,asc|desc` — sortable: displayName, username, email, status, lastLoginAt, createdAt. */
  sort?: string;
  search?: string;
  statuses?: UserStatus[];
  roleIds?: number[];
  twoFactorEnabled?: boolean;
}

export interface UserStats {
  total: number;
  byStatus: Record<UserStatus, number>;
  twoFactorEnabled: number;
  neverLoggedIn: number;
  /** ACTIVE users with no login in the last 90 days. */
  dormant: number;
  /** `accessExpiresAt` within the next 30 days. */
  expiringSoon: number;
}

export type ActivationMode = 'INVITATION' | 'TEMPORARY_PASSWORD';

export interface CreateUserRequest {
  username: string;
  email: string;
  firstName: string;
  lastName: string;
  phoneNumber: string | null;
  jobTitle: string | null;
  department: string | null;
  employeeNumber: string | null;
  locale: AppLocale;
  roleIds: number[];
  permissionGroupIds: number[];
  /** ISO date (`YYYY-MM-DD`), end of day in the tenant timezone. `null` = never expires. */
  accessExpiresAt: string | null;
  activationMode: ActivationMode;
  requireTwoFactor: boolean;
}

export interface UpdateUserRequest {
  username: string;
  email: string;
  firstName: string;
  lastName: string;
  phoneNumber: string | null;
  jobTitle: string | null;
  department: string | null;
  employeeNumber: string | null;
  locale: AppLocale;
  accessExpiresAt: string | null;
  version: number;
}

export interface ChangeUserStatusRequest {
  status: UserStatus;
  reason: StatusChangeReason;
  /** Required (≥ 10 chars) when `reason === 'OTHER'`; optional otherwise. */
  comment: string | null;
  /** ISO-8601 instant; only for SUSPENDED/LOCKED. `null` = indefinite. */
  until: string | null;
  /** DEACTIVATED/SUSPENDED/LOCKED always revoke; this flag is ignored for them. */
  revokeSessions: boolean;
  version: number;
}

export interface UserAvailability {
  usernameAvailable: boolean | null;
  emailAvailable: boolean | null;
}

export type PasswordResetMode = 'EMAIL_LINK' | 'TEMPORARY_PASSWORD';

export interface PasswordResetRequest {
  mode: PasswordResetMode;
  revokeSessions: boolean;
}

export interface PasswordResetResponse {
  mode: PasswordResetMode;
  /** Masked destination, e.g. `j***@cronos.com`. The secret itself is never returned. */
  deliveredTo: string;
  expiresAt: string;
}

export interface ReasonRequest {
  reason: string;
}

export interface UserAvatarResponse {
  avatarUrl: string;
  updatedAt: string;
}

// ─── Access (roles + groups + direct grants/denials) ───

export type PermissionSourceType = 'ROLE' | 'ROLE_GROUP' | 'USER_GROUP' | 'DIRECT_GRANT';

export interface PermissionSource {
  type: PermissionSourceType;
  /** Role id, group id, or `null` for a direct grant. */
  id: number | null;
  name: string | null;
  /** For ROLE_GROUP: the role that carries the group. */
  viaName: string | null;
}

export interface EffectivePermission {
  code: string;
  /** `false` when every source was overridden by an explicit denial. */
  granted: boolean;
  deniedExplicitly: boolean;
  sources: PermissionSource[];
}

export type SodSeverity = 'WARNING' | 'BLOCKING';

export interface SodConflict {
  ruleCode: string;
  ruleName: string;
  severity: SodSeverity;
  description: string;
  /** The conflicting permission codes the subject now holds. */
  permissions: string[];
}

export interface UserAccess {
  roles: RoleRef[];
  permissionGroups: PermissionGroupRef[];
  grants: string[];
  denials: string[];
  effective: EffectivePermission[];
  sodConflicts: SodConflict[];
  version: number;
}

export interface UpdateUserAccessRequest {
  roleIds: number[];
  permissionGroupIds: number[];
  grants: string[];
  denials: string[];
  /** Required: access changes are always justified in the audit trail. */
  reason: string;
  version: number;
}

/** `POST …/access/preview` — same body minus reason/version, nothing persisted. */
export interface PreviewUserAccessRequest {
  roleIds: number[];
  permissionGroupIds: number[];
  grants: string[];
  denials: string[];
}

export interface AccessPreview {
  effective: EffectivePermission[];
  sodConflicts: SodConflict[];
  added: string[];
  removed: string[];
}

// ─── Bulk ───

export interface BulkStatusRequest {
  userIds: string[];
  status: UserStatus;
  reason: StatusChangeReason;
  comment: string | null;
}

export interface BulkRolesRequest {
  userIds: string[];
  addRoleIds: number[];
  removeRoleIds: number[];
  reason: string;
}

export interface BulkFailure {
  id: string;
  code: string;
  message: string;
}

export interface BulkResult {
  succeeded: string[];
  failed: BulkFailure[];
}

// ─── Sessions & sign-in history ───

export interface UserSession {
  id: string;
  ipAddress: string;
  browser: string;
  os: string;
  device: string;
  location: string | null;
  createdAt: string;
  lastActivityAt: string;
  expiresAt: string;
}

export type LoginOutcome = 'SUCCESS' | 'FAILURE' | 'LOCKED' | 'TWO_FACTOR_FAILED';

export interface LoginAttempt {
  id: string;
  occurredAt: string;
  outcome: LoginOutcome;
  failureReason: string | null;
  ipAddress: string;
  browser: string | null;
  os: string | null;
  location: string | null;
}

// ─── Roles ───

export type IamRecordStatus = 'ACTIVE' | 'INACTIVE';

export interface IamRoleSummary {
  id: number;
  code: string;
  name: string;
  description: string | null;
  color: string | null;
  /** Seeded by the platform: code is immutable and the role cannot be deleted. */
  system: boolean;
  status: IamRecordStatus;
  userCount: number;
  permissionCount: number;
  permissionGroupCount: number;
  updatedAt: string | null;
}

export interface IamRoleDetail extends IamRoleSummary {
  /** Permissions granted directly on the role. */
  permissions: string[];
  permissionGroups: PermissionGroupRef[];
  /** Direct ∪ every group's permissions — what a member actually receives. */
  effectivePermissions: string[];
  sodConflicts: SodConflict[];
  createdAt: string;
  createdBy: UserRef | null;
  updatedBy: UserRef | null;
  version: number;
}

export interface RoleRequest {
  code: string;
  name: string;
  description: string | null;
  color: string | null;
  permissions: string[];
  permissionGroupIds: number[];
  /** Omitted on create. */
  version?: number;
}

export interface CloneRoleRequest {
  code: string;
  name: string;
}

export interface RoleMembersRequest {
  userIds: string[];
  reason: string;
}

export interface RoleQuery {
  search?: string;
  status?: IamRecordStatus;
}

// ─── Permissions catalog ───

export type PermissionRisk = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';

export interface PermissionDefinition {
  /** `MODULE.RESOURCE.ACTION`, e.g. `IAM.USER.RESET_PASSWORD`. */
  code: string;
  module: string;
  resource: string;
  action: string;
  /** Localised per `Accept-Language`. */
  moduleName: string;
  resourceName: string;
  name: string;
  description: string;
  risk: PermissionRisk;
  /** Codes that must also be held — the UI auto-selects them. */
  dependsOn: string[];
}

// ─── Permission groups ───

export interface PermissionGroupSummary {
  id: number;
  code: string;
  name: string;
  description: string | null;
  system: boolean;
  status: IamRecordStatus;
  permissionCount: number;
  roleCount: number;
  userCount: number;
  updatedAt: string | null;
}

export interface PermissionGroupDetail extends PermissionGroupSummary {
  permissions: string[];
  roles: RoleRef[];
  version: number;
}

export interface PermissionGroupRequest {
  code: string;
  name: string;
  description: string | null;
  permissions: string[];
  version?: number;
}

// ─── Audit ───

export type AuditCategory =
  | 'AUTHENTICATION'
  | 'USER_ADMINISTRATION'
  | 'ACCESS_CONTROL'
  | 'SECURITY'
  | 'CONFIGURATION'
  | 'DATA';

export type AuditOutcome = 'SUCCESS' | 'FAILURE' | 'DENIED';
export type AuditSeverity = 'INFO' | 'NOTICE' | 'WARNING' | 'CRITICAL';

export interface AuditTarget {
  type: string;
  id: string;
  label: string;
}

export interface AuditEvent {
  id: string;
  occurredAt: string;
  category: AuditCategory;
  /** Stable code, e.g. `USER_LOCKED`, `ROLE_PERMISSIONS_CHANGED`. */
  action: string;
  outcome: AuditOutcome;
  severity: AuditSeverity;
  /** `null` = performed by the system (scheduler, auto-unlock…). */
  actor: UserRef | null;
  target: AuditTarget | null;
  /** One localised sentence. */
  summary: string;
  reason: string | null;
  changes: Record<string, FieldChange>;
  ipAddress: string | null;
  userAgent: string | null;
  traceId: string | null;
}

export type AuditPerspective = 'ACTOR' | 'TARGET';

export interface AuditQuery {
  page: number;
  size: number;
  search?: string;
  categories?: AuditCategory[];
  outcomes?: AuditOutcome[];
  severities?: AuditSeverity[];
  actorId?: string;
  targetType?: string;
  targetId?: string;
  /** ISO-8601 instants, inclusive. */
  from?: string;
  to?: string;
}

// ─── Security policy ───

export interface SecurityPolicy {
  passwordMinLength: number;
  passwordRequireUppercase: boolean;
  passwordRequireLowercase: boolean;
  passwordRequireDigit: boolean;
  passwordRequireSymbol: boolean;
  /** Last N passwords that cannot be reused. 0 = disabled. */
  passwordHistory: number;
  /** 0 = never expires. */
  passwordMaxAgeDays: number;
  maxFailedAttempts: number;
  lockoutMinutes: number;
  sessionIdleMinutes: number;
  sessionAbsoluteHours: number;
  maxConcurrentSessions: number;
  invitationTtlHours: number;
  /** Members of these roles must enrol 2FA before they can use the app. */
  twoFactorRequiredRoleIds: number[];
  updatedAt: string | null;
  updatedBy: UserRef | null;
  version: number;
}

export type SecurityPolicyRequest = Omit<SecurityPolicy, 'updatedAt' | 'updatedBy'>;
