import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from 'src/environments/environment';
import { ApiResponse } from '../models';
import { PermissionResponse } from '../models';

@Injectable({ providedIn: 'root' })
export class PermissionService {
  private readonly API = environment.apiUrl;
  private http = inject(HttpClient);

  getAll(): Observable<ApiResponse<PermissionResponse[]>> {
    return this.http.get<ApiResponse<PermissionResponse[]>>(`${this.API}/admin/permissions`);
  }

  getById(id: number): Observable<ApiResponse<PermissionResponse>> {
    return this.http.get<ApiResponse<PermissionResponse>>(`${this.API}/admin/permissions/${id}`);
  }
}
