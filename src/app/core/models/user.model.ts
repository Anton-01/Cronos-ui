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
  createdAt: string;
  lastAccessedAt: string;
  current: boolean;
}

export interface LoginHistoryEntry {
  id: string;
  ipAddress: string;
  userAgent: string;
  loginAt: string;
  success: boolean;
  failureReason: string | null;
}
