export interface UserResponse {
  id: string;
  username: string;
  email: string;
  firstName: string | null;
  lastName: string | null;
  /** E.164 (`+525512345678`). Legacy rows may still hold national digits. */
  phoneNumber: string | null;
  /** Null until the user uploads a picture — the UI falls back to initials. */
  avatarUrl: string | null;
  enabled: boolean;
  accountNonLocked: boolean;
  twoFactorEnabled: boolean;
  failedLoginAttempts: number;
  lockedUntil: string | null;
  lastLoginAt: string | null;
  passwordChangedAt: string | null;
  roles: string[];
  createdAt: string;
  updatedAt: string;
}

export interface CreateUserRequest {
  username: string;
  email: string;
  password: string;
  firstName?: string;
  lastName?: string;
  phoneNumber?: string;
  roles: string[];
}

export interface UpdateUserRequest {
  username?: string;
  email?: string;
  firstName?: string;
  lastName?: string;
  phoneNumber?: string;
  roles?: string[];
  enabled?: boolean;
}

/**
 * `PUT /users/me`. Every field is sent on every save: `null` clears a value,
 * so a user can remove their phone number (an omitted field could not).
 */
export interface UpdateProfileRequest {
  username: string;
  firstName: string | null;
  lastName: string | null;
  /** E.164 (`+525512345678`) or null. */
  phoneNumber: string | null;
}

export interface AssignRolesRequest {
  roles: string[];
}

/** Payload sent as the 'userData' @RequestPart when registering a new user.
 *  Password is intentionally absent — the backend auto-generates a temporary one. */
export interface RegisterUserRequest {
  username: string;
  email: string;
  firstName?: string | null;
  lastName?: string | null;
  phoneNumber?: string | null;
  roleIds: number[];
}

export interface ActiveSession {
  id: string;
  ipAddress: string;
  userAgent: string;
  browser: string;
  os: string;
  device: string;
  location: string;
  lastActivityAt: Date;
  isActive: boolean;
  isCurrentSession: boolean;
}

export interface LoginHistoryEntry {
  ipAddress: string;
  userAgent: string;
  status: string;
  failureReason: string | null;
  createdAt: Date;
}
