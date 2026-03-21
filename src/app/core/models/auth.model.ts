export interface LoginRequest {
  username: string;
  password: string;
  twoFactorCode?: number;
}

export interface RegisterRequest {
  username: string;
  email: string;
  password: string;
  firstName?: string;
  lastName?: string;
  phoneNumber?: string;
}

export interface ChangePasswordRequest {
  currentPassword: string;
  newPassword: string;
  confirmPassword: string;
}

export interface VerifyTwoFactorRequest {
  code: number;
}

export interface LoginResponse {
  accessToken: string;
  refreshToken: string;
  tokenType: string;
  expiresIn: number;
  username: string;
  email: string;
  roles: string[];
  requiresTwoFactor: boolean;
  message: string;
}

export interface TokenResponse {
  accessToken: string;
  refreshToken: string;
  tokenType: string;
  expiresIn: number;
}

export interface TwoFactorSetupResponse {
  secret: string;
  qrCodeUrl: string;
  message: string;
}

export interface JwtPayload {
  sub: string;
  roles?: string[];
  exp: number;
  iat: number;
}
