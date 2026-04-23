import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from 'src/environments/environment';
import { ApiResponse } from '../models';
import { RoleResponse, RoleRequest } from '../models';

@Injectable({ providedIn: 'root' })
export class RoleService {
  private readonly API = environment.apiUrl;
  private http = inject(HttpClient);

  getAll(): Observable<ApiResponse<RoleResponse[]>> {
    return this.http.get<ApiResponse<RoleResponse[]>>(`${this.API}/admin/roles`);
  }

  getById(id: number): Observable<ApiResponse<RoleResponse>> {
    return this.http.get<ApiResponse<RoleResponse>>(`${this.API}/admin/roles/${id}`);
  }

  create(req: RoleRequest): Observable<ApiResponse<RoleResponse>> {
    return this.http.post<ApiResponse<RoleResponse>>(`${this.API}/admin/roles`, req);
  }

  update(id: number, req: RoleRequest): Observable<ApiResponse<RoleResponse>> {
    return this.http.put<ApiResponse<RoleResponse>>(`${this.API}/admin/roles/${id}`, req);
  }

  delete(id: number): Observable<ApiResponse<void>> {
    return this.http.delete<ApiResponse<void>>(`${this.API}/admin/roles/${id}`);
  }
}
