export interface UserResponse {
  id: string;
  username: string;
  email: string;
  firstName: string | null;
  lastName: string | null;
  phoneNumber: string | null;
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

export interface UpdateProfileRequest {
  firstName?: string;
  lastName?: string;
  phoneNumber?: string;
  username?: string;
}

export interface AssignRolesRequest {
  roles: string[];
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
