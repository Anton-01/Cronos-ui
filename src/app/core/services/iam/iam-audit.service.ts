import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, map } from 'rxjs';

import { environment } from 'src/environments/environment';
import { AuditEvent, AuditQuery, SecurityPolicy, SecurityPolicyRequest } from '../../models/iam.models';
import { ApiEnvelope, CatalogPage } from '../../models/unit-catalog.models';
import { toHttpParams } from '../../utils/http-params.util';
import { DownloadedFile, toDownloadedFile } from '../domain/import-file.util';

/** `/iam/audit-events` and `/iam/security-policy` — doc §7–§8. */
@Injectable({ providedIn: 'root' })
export class IamAuditService {
  private readonly API = `${environment.apiUrl}/iam`;
  private readonly http = inject(HttpClient);

  events(query: AuditQuery): Observable<ApiEnvelope<CatalogPage<AuditEvent>>> {
    return this.http.get<ApiEnvelope<CatalogPage<AuditEvent>>>(`${this.API}/audit-events`, {
      params: toHttpParams(query),
    });
  }

  export(query: Omit<AuditQuery, 'page' | 'size'>): Observable<DownloadedFile> {
    return this.http
      .get(`${this.API}/audit-events/export`, { params: toHttpParams(query), observe: 'response', responseType: 'blob' })
      .pipe(map((response) => toDownloadedFile(response, 'audit-log.csv')));
  }

  securityPolicy(): Observable<ApiEnvelope<SecurityPolicy>> {
    return this.http.get<ApiEnvelope<SecurityPolicy>>(`${this.API}/security-policy`);
  }

  updateSecurityPolicy(request: SecurityPolicyRequest): Observable<ApiEnvelope<SecurityPolicy>> {
    return this.http.put<ApiEnvelope<SecurityPolicy>>(`${this.API}/security-policy`, request);
  }
}
