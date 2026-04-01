import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from 'src/environments/environment';
import { ApiResponse } from '../models';
import { Page } from '../models';
import {
  UserResponse,
  CreateUserRequest,
  UpdateUserRequest,
  UpdateProfileRequest,
  AssignRolesRequest,
} from '../models';

export interface UserFilterRequest {
  page: number;
  size: number;
  sort?: string;
  role?: string;
  enabled?: boolean;
}

@Injectable({ providedIn: 'root' })
export class UserService {
  private readonly API = environment.apiUrl;
  private http = inject(HttpClient);

  getProfile(): Observable<ApiResponse<UserResponse>> {
    return this.http.get<ApiResponse<UserResponse>>(`${this.API}/users/me`);
  }

  updateProfile(req: UpdateProfileRequest): Observable<ApiResponse<UserResponse>> {
    return this.http.put<ApiResponse<UserResponse>>(`${this.API}/users/me`, req);
  }

  getAllUsers(params: UserFilterRequest): Observable<ApiResponse<Page<UserResponse>>> {
    let httpParams = new HttpParams()
      .set('page', params.page.toString())
      .set('size', params.size.toString());
    if (params.sort) httpParams = httpParams.set('sort', params.sort);
    if (params.role) httpParams = httpParams.set('role', params.role);
    if (params.enabled !== undefined) httpParams = httpParams.set('enabled', params.enabled.toString());
    return this.http.get<ApiResponse<Page<UserResponse>>>(`${this.API}/admin/users`, { params: httpParams });
  }

  getUserById(id: string): Observable<ApiResponse<UserResponse>> {
    return this.http.get<ApiResponse<UserResponse>>(`${this.API}/admin/users/${id}`);
  }

  createUser(req: CreateUserRequest): Observable<ApiResponse<UserResponse>> {
    return this.http.post<ApiResponse<UserResponse>>(`${this.API}/admin/users`, req);
  }

  updateUser(id: string, req: UpdateUserRequest): Observable<ApiResponse<UserResponse>> {
    return this.http.put<ApiResponse<UserResponse>>(`${this.API}/admin/users/${id}`, req);
  }

  blockUser(id: string): Observable<ApiResponse<UserResponse>> {
    return this.http.post<ApiResponse<UserResponse>>(`${this.API}/admin/users/${id}/block`, {});
  }

  unblockUser(id: string): Observable<ApiResponse<UserResponse>> {
    return this.http.post<ApiResponse<UserResponse>>(`${this.API}/admin/users/${id}/unblock`, {});
  }

  assignRoles(id: string, req: AssignRolesRequest): Observable<ApiResponse<UserResponse>> {
    return this.http.put<ApiResponse<UserResponse>>(`${this.API}/admin/users/${id}/roles`, req);
  }
}
