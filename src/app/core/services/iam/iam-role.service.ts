import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';

import { environment } from 'src/environments/environment';
import {
  CloneRoleRequest,
  IamRecordStatus,
  IamRoleDetail,
  IamRoleSummary,
  IamUserSummary,
  RoleMembersRequest,
  RoleQuery,
  RoleRequest,
} from '../../models/iam.models';
import { ApiEnvelope, CatalogPage } from '../../models/unit-catalog.models';
import { toHttpParams } from '../../utils/http-params.util';

/** `/iam/roles` — doc §4. */
@Injectable({ providedIn: 'root' })
export class IamRoleService {
  private readonly API = `${environment.apiUrl}/iam/roles`;
  private readonly http = inject(HttpClient);

  /** Unpaged: a tenant has tens of roles, not thousands. */
  list(query: RoleQuery = {}): Observable<ApiEnvelope<IamRoleSummary[]>> {
    return this.http.get<ApiEnvelope<IamRoleSummary[]>>(this.API, { params: toHttpParams(query) });
  }

  getById(id: number): Observable<ApiEnvelope<IamRoleDetail>> {
    return this.http.get<ApiEnvelope<IamRoleDetail>>(`${this.API}/${id}`);
  }

  create(request: RoleRequest): Observable<ApiEnvelope<IamRoleDetail>> {
    return this.http.post<ApiEnvelope<IamRoleDetail>>(this.API, request);
  }

  update(id: number, request: RoleRequest): Observable<ApiEnvelope<IamRoleDetail>> {
    return this.http.put<ApiEnvelope<IamRoleDetail>>(`${this.API}/${id}`, request);
  }

  changeStatus(id: number, status: IamRecordStatus, version: number): Observable<ApiEnvelope<IamRoleDetail>> {
    return this.http.patch<ApiEnvelope<IamRoleDetail>>(`${this.API}/${id}/status`, { status, version });
  }

  clone(id: number, request: CloneRoleRequest): Observable<ApiEnvelope<IamRoleDetail>> {
    return this.http.post<ApiEnvelope<IamRoleDetail>>(`${this.API}/${id}/clone`, request);
  }

  delete(id: number): Observable<ApiEnvelope<null>> {
    return this.http.delete<ApiEnvelope<null>>(`${this.API}/${id}`);
  }

  members(id: number, page: number, size: number, search?: string): Observable<ApiEnvelope<CatalogPage<IamUserSummary>>> {
    return this.http.get<ApiEnvelope<CatalogPage<IamUserSummary>>>(`${this.API}/${id}/members`, {
      params: toHttpParams({ page, size, search }),
    });
  }

  addMembers(id: number, request: RoleMembersRequest): Observable<ApiEnvelope<{ added: number }>> {
    return this.http.post<ApiEnvelope<{ added: number }>>(`${this.API}/${id}/members`, request);
  }

  removeMembers(id: number, request: RoleMembersRequest): Observable<ApiEnvelope<{ removed: number }>> {
    return this.http.post<ApiEnvelope<{ removed: number }>>(`${this.API}/${id}/members/remove`, request);
  }
}
