import { Injectable } from '@angular/core';
import { JwtPayload } from '../models/auth.model';

const ACCESS_TOKEN_KEY = 'access_token';
const REFRESH_TOKEN_KEY = 'refresh_token';
const USER_NAME_KEY = 'user_name';
const USER_EMAIL_KEY = 'user_email';

const ROLE_PRIORITY: Record<string, number> = {
  SUPER_ADMIN: 4,
  ADMIN: 3,
  MANAGER: 2,
  USER: 1,
};

@Injectable({ providedIn: 'root' })
export class TokenService {

  saveTokens(accessToken: string, refreshToken: string): void {
    localStorage.setItem(ACCESS_TOKEN_KEY, accessToken);
    localStorage.setItem(REFRESH_TOKEN_KEY, refreshToken);
  }

  getAccessToken(): string | null {
    return localStorage.getItem(ACCESS_TOKEN_KEY);
  }

  getRefreshToken(): string | null {
    return localStorage.getItem(REFRESH_TOKEN_KEY);
  }

  saveUserInfo(username: string, email: string): void {
    localStorage.setItem(USER_NAME_KEY, username);
    localStorage.setItem(USER_EMAIL_KEY, email);
  }

  getUsername(): string {
    return localStorage.getItem(USER_NAME_KEY) ?? '';
  }

  getEmail(): string {
    return localStorage.getItem(USER_EMAIL_KEY) ?? '';
  }

  clearTokens(): void {
    localStorage.removeItem(ACCESS_TOKEN_KEY);
    localStorage.removeItem(REFRESH_TOKEN_KEY);
    localStorage.removeItem(USER_NAME_KEY);
    localStorage.removeItem(USER_EMAIL_KEY);
  }

  parseJwt(token: string): JwtPayload | null {
    try {
      const base64Url = token.split('.')[1];
      const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
      const jsonPayload = decodeURIComponent(
        atob(base64)
          .split('')
          .map(c => '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2))
          .join('')
      );
      return JSON.parse(jsonPayload) as JwtPayload;
    } catch {
      return null;
    }
  }

  getUserId(): string | null {
    const token = this.getAccessToken();
    if (!token) return null;
    const payload = this.parseJwt(token);
    return payload?.sub ?? null;
  }

  getRoles(): string[] {
    const token = this.getAccessToken();
    if (!token) return [];
    const payload = this.parseJwt(token);
    if (!payload?.roles) return [];
    return payload.roles.map(r => r.replace(/^ROLE_/, ''));
  }

  getExpirationDate(): Date | null {
    const token = this.getAccessToken();
    if (!token) return null;
    const payload = this.parseJwt(token);
    if (!payload?.exp) return null;
    return new Date(payload.exp * 1000);
  }

  isTokenExpired(): boolean {
    const expDate = this.getExpirationDate();
    if (!expDate) return true;
    return expDate.getTime() <= Date.now();
  }

  isLoggedIn(): boolean {
    return !!this.getAccessToken() && !this.isTokenExpired();
  }

  hasRole(role: string): boolean {
    const normalizedRole = role.replace(/^ROLE_/, '');
    return this.getRoles().some(r => r === normalizedRole);
  }

  getPrimaryRole(): string {
    const roles = this.getRoles();
    let highest = 'USER';
    let highestLevel = 0;
    for (const role of roles) {
      const level = ROLE_PRIORITY[role] ?? 0;
      if (level > highestLevel) {
        highestLevel = level;
        highest = role;
      }
    }
    return highest;
  }
}
