import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';

import { environment } from 'src/environments/environment';
import {
  ApiResponse,
  AvatarResponse,
  FiscalDataResponse,
  UpdateFiscalDataRequest,
  UpdateProfileRequest,
  UserResponse,
} from '../models';

/**
 * Self-service endpoints for the signed-in user (`/users/me/**`).
 * Contract: `docs/api/account-settings.md`.
 */
@Injectable({ providedIn: 'root' })
export class AccountService {
  private readonly http = inject(HttpClient);
  private readonly base = `${environment.apiUrl}/users/me`;

  getProfile(): Observable<ApiResponse<UserResponse>> {
    return this.http.get<ApiResponse<UserResponse>>(this.base);
  }

  updateProfile(request: UpdateProfileRequest): Observable<ApiResponse<UserResponse>> {
    return this.http.put<ApiResponse<UserResponse>>(this.base, request);
  }

  /** Multipart: a single `file` part (image/jpeg, 512×512, produced by the cropper). */
  uploadAvatar(file: File): Observable<ApiResponse<AvatarResponse>> {
    const body = new FormData();
    body.append('file', file, file.name);
    return this.http.put<ApiResponse<AvatarResponse>>(`${this.base}/avatar`, body);
  }

  deleteAvatar(): Observable<ApiResponse<null>> {
    return this.http.delete<ApiResponse<null>>(`${this.base}/avatar`);
  }

  /** `data` is `null` until the user registers fiscal data for the first time. */
  getFiscalData(): Observable<ApiResponse<FiscalDataResponse | null>> {
    return this.http.get<ApiResponse<FiscalDataResponse | null>>(`${this.base}/fiscal`);
  }

  /** Upsert — creates on first save, replaces afterwards. */
  updateFiscalData(request: UpdateFiscalDataRequest): Observable<ApiResponse<FiscalDataResponse>> {
    return this.http.put<ApiResponse<FiscalDataResponse>>(`${this.base}/fiscal`, request);
  }
}
