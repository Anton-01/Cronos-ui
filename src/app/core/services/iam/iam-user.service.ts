import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, map } from 'rxjs';

import { environment } from 'src/environments/environment';
import {
  AccessPreview,
  BulkResult,
  BulkRolesRequest,
  BulkStatusRequest,
  ChangeUserStatusRequest,
  CreateUserRequest,
  IamUserDetail,
  IamUserSummary,
  LoginAttempt,
  PasswordResetRequest,
  PasswordResetResponse,
  PreviewUserAccessRequest,
  ReasonRequest,
  UpdateUserAccessRequest,
  UpdateUserRequest,
  UserAccess,
  UserAvailability,
  UserAvatarResponse,
  UserQuery,
  UserSession,
  UserStats,
} from '../../models/iam.models';
import { ApiEnvelope, CatalogPage } from '../../models/unit-catalog.models';
import { toHttpParams } from '../../utils/http-params.util';
import { DownloadedFile, toDownloadedFile } from '../domain/import-file.util';

/** `/iam/users` — doc §3. */
@Injectable({ providedIn: 'root' })
export class IamUserService {
  private readonly API = `${environment.apiUrl}/iam/users`;
  private readonly http = inject(HttpClient);

  search(query: UserQuery): Observable<ApiEnvelope<CatalogPage<IamUserSummary>>> {
    return this.http.get<ApiEnvelope<CatalogPage<IamUserSummary>>>(this.API, { params: toHttpParams(query) });
  }

  stats(): Observable<ApiEnvelope<UserStats>> {
    return this.http.get<ApiEnvelope<UserStats>>(`${this.API}/stats`);
  }

  getById(id: string): Observable<ApiEnvelope<IamUserDetail>> {
    return this.http.get<ApiEnvelope<IamUserDetail>>(`${this.API}/${id}`);
  }

  /** Async-validator probe. `excludeId` skips the user being edited. */
  checkAvailability(username: string | null, email: string | null, excludeId?: string): Observable<ApiEnvelope<UserAvailability>> {
    return this.http.get<ApiEnvelope<UserAvailability>>(`${this.API}/availability`, {
      params: toHttpParams({ username, email, excludeId }),
    });
  }

  /** Multipart: `user` (application/json) + optional `avatar` (image/jpeg). */
  create(request: CreateUserRequest, avatar: File | null): Observable<ApiEnvelope<IamUserDetail>> {
    const body = new FormData();
    body.append('user', new Blob([JSON.stringify(request)], { type: 'application/json' }));
    if (avatar) {
      body.append('avatar', avatar, avatar.name);
    }
    return this.http.post<ApiEnvelope<IamUserDetail>>(this.API, body);
  }

  update(id: string, request: UpdateUserRequest): Observable<ApiEnvelope<IamUserDetail>> {
    return this.http.put<ApiEnvelope<IamUserDetail>>(`${this.API}/${id}`, request);
  }

  changeStatus(id: string, request: ChangeUserStatusRequest): Observable<ApiEnvelope<IamUserDetail>> {
    return this.http.post<ApiEnvelope<IamUserDetail>>(`${this.API}/${id}/status`, request);
  }

  uploadAvatar(id: string, file: File): Observable<ApiEnvelope<UserAvatarResponse>> {
    const body = new FormData();
    body.append('file', file, file.name);
    return this.http.put<ApiEnvelope<UserAvatarResponse>>(`${this.API}/${id}/avatar`, body);
  }

  removeAvatar(id: string): Observable<ApiEnvelope<null>> {
    return this.http.delete<ApiEnvelope<null>>(`${this.API}/${id}/avatar`);
  }

  // ─── Credentials ───

  resetPassword(id: string, request: PasswordResetRequest): Observable<ApiEnvelope<PasswordResetResponse>> {
    return this.http.post<ApiEnvelope<PasswordResetResponse>>(`${this.API}/${id}/password-reset`, request);
  }

  requirePasswordChange(id: string): Observable<ApiEnvelope<IamUserDetail>> {
    return this.http.post<ApiEnvelope<IamUserDetail>>(`${this.API}/${id}/require-password-change`, {});
  }

  resetTwoFactor(id: string, request: ReasonRequest): Observable<ApiEnvelope<IamUserDetail>> {
    return this.http.post<ApiEnvelope<IamUserDetail>>(`${this.API}/${id}/two-factor/reset`, request);
  }

  resendInvitation(id: string): Observable<ApiEnvelope<IamUserDetail>> {
    return this.http.post<ApiEnvelope<IamUserDetail>>(`${this.API}/${id}/invitation/resend`, {});
  }

  // ─── Access ───

  getAccess(id: string): Observable<ApiEnvelope<UserAccess>> {
    return this.http.get<ApiEnvelope<UserAccess>>(`${this.API}/${id}/access`);
  }

  previewAccess(id: string, request: PreviewUserAccessRequest): Observable<ApiEnvelope<AccessPreview>> {
    return this.http.post<ApiEnvelope<AccessPreview>>(`${this.API}/${id}/access/preview`, request);
  }

  updateAccess(id: string, request: UpdateUserAccessRequest): Observable<ApiEnvelope<UserAccess>> {
    return this.http.put<ApiEnvelope<UserAccess>>(`${this.API}/${id}/access`, request);
  }

  // ─── Sessions & history ───

  sessions(id: string): Observable<ApiEnvelope<UserSession[]>> {
    return this.http.get<ApiEnvelope<UserSession[]>>(`${this.API}/${id}/sessions`);
  }

  revokeSession(id: string, sessionId: string): Observable<ApiEnvelope<null>> {
    return this.http.delete<ApiEnvelope<null>>(`${this.API}/${id}/sessions/${sessionId}`);
  }

  revokeAllSessions(id: string): Observable<ApiEnvelope<{ revoked: number }>> {
    return this.http.delete<ApiEnvelope<{ revoked: number }>>(`${this.API}/${id}/sessions`);
  }

  loginHistory(id: string, page: number, size: number): Observable<ApiEnvelope<CatalogPage<LoginAttempt>>> {
    return this.http.get<ApiEnvelope<CatalogPage<LoginAttempt>>>(`${this.API}/${id}/login-history`, {
      params: toHttpParams({ page, size }),
    });
  }

  // ─── Bulk & export ───

  bulkStatus(request: BulkStatusRequest): Observable<ApiEnvelope<BulkResult>> {
    return this.http.post<ApiEnvelope<BulkResult>>(`${this.API}/bulk/status`, request);
  }

  bulkRoles(request: BulkRolesRequest): Observable<ApiEnvelope<BulkResult>> {
    return this.http.post<ApiEnvelope<BulkResult>>(`${this.API}/bulk/roles`, request);
  }

  /** Same filters as `search`, minus paging. Server streams CSV (UTF-8 + BOM). */
  export(query: Omit<UserQuery, 'page' | 'size'>): Observable<DownloadedFile> {
    return this.http
      .get(`${this.API}/export`, { params: toHttpParams(query), observe: 'response', responseType: 'blob' })
      .pipe(map((response) => toDownloadedFile(response, 'users.csv')));
  }
}
