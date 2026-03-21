import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Router } from '@angular/router';
import { Observable, finalize } from 'rxjs';
import { environment } from 'src/environments/environment';
import { ApiResponse } from '../models/api-response.model';
import {
  LoginRequest,
  LoginResponse,
  RegisterRequest,
  TokenResponse,
  TwoFactorSetupResponse,
  VerifyTwoFactorRequest,
  ChangePasswordRequest,
} from '../models/auth.model';
import { ActiveSession, LoginHistoryEntry, UserResponse } from '../models/user.model';
import { TokenService } from './token.service';

@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly API = environment.apiUrl + '/auth';
  private http = inject(HttpClient);
  private router = inject(Router);
  private tokenService = inject(TokenService);

  login(request: LoginRequest): Observable<ApiResponse<LoginResponse>> {
    return this.http.post<ApiResponse<LoginResponse>>(`${this.API}/login`, request);
  }

  refreshToken(refreshToken: string): Observable<ApiResponse<TokenResponse>> {
    return this.http.post<ApiResponse<TokenResponse>>(`${this.API}/refresh`, { refreshToken });
  }

  register(request: RegisterRequest): Observable<ApiResponse<UserResponse>> {
    return this.http.post<ApiResponse<UserResponse>>(`${this.API}/register`, request);
  }

  logout(refreshToken: string): Observable<ApiResponse<void>> {
    return this.http.post<ApiResponse<void>>(`${this.API}/logout`, { refreshToken });
  }

  performLogout(): void {
    const rt = this.tokenService.getRefreshToken();
    if (!rt) {
      this.clearAndRedirect();
      return;
    }
    this.http
      .post<ApiResponse<void>>(`${this.API}/logout`, { refreshToken: rt })
      .pipe(finalize(() => this.clearAndRedirect()))
      .subscribe();
  }

  setup2FA(): Observable<ApiResponse<TwoFactorSetupResponse>> {
    return this.http.post<ApiResponse<TwoFactorSetupResponse>>(`${this.API}/2fa/setup`, {});
  }

  verify2FA(req: VerifyTwoFactorRequest): Observable<ApiResponse<void>> {
    return this.http.post<ApiResponse<void>>(`${this.API}/2fa/verify`, req);
  }

  disable2FA(req: VerifyTwoFactorRequest): Observable<ApiResponse<void>> {
    return this.http.post<ApiResponse<void>>(`${this.API}/2fa/disable`, req);
  }

  changePassword(req: ChangePasswordRequest): Observable<ApiResponse<void>> {
    return this.http.post<ApiResponse<void>>(`${this.API}/change-password`, req);
  }

  getActiveSessions(): Observable<ApiResponse<ActiveSession[]>> {
    return this.http.get<ApiResponse<ActiveSession[]>>(`${this.API}/sessions`);
  }

  revokeSession(refreshToken: string): Observable<ApiResponse<void>> {
    return this.http.post<ApiResponse<void>>(`${this.API}/logout`, { refreshToken });
  }

  getLoginHistory(): Observable<ApiResponse<LoginHistoryEntry[]>> {
    return this.http.get<ApiResponse<LoginHistoryEntry[]>>(`${this.API}/login-history`);
  }

  private clearAndRedirect(): void {
    this.tokenService.clearTokens();
    this.router.navigate(['/auth/login']);
  }
}
