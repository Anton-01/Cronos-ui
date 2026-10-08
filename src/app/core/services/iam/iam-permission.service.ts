import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, map, shareReplay } from 'rxjs';

import { environment } from 'src/environments/environment';
import {
  IamRecordStatus,
  PermissionDefinition,
  PermissionGroupDetail,
  PermissionGroupRequest,
  PermissionGroupSummary,
} from '../../models/iam.models';
import { ApiEnvelope } from '../../models/unit-catalog.models';
import { LanguageService } from '../language.service';

/** `/iam/permissions` (read-only catalog) and `/iam/permission-groups` — doc §5–§6. */
@Injectable({ providedIn: 'root' })
export class IamPermissionService {
  private readonly API = `${environment.apiUrl}/iam`;
  private readonly http = inject(HttpClient);
  private readonly language = inject(LanguageService);

  private catalogCache: { locale: string; catalog$: Observable<PermissionDefinition[]> } | null = null;

  /**
   * The permission catalog changes only on deploy, so it is fetched once per
   * locale (names/descriptions come back localised) and shared by every
   * matrix on screen.
   */
  catalog(): Observable<PermissionDefinition[]> {
    const locale = this.language.current();
    if (this.catalogCache?.locale !== locale) {
      const catalog$ = this.http.get<ApiEnvelope<PermissionDefinition[]>>(`${this.API}/permissions`).pipe(
        map((response) => response.data ?? []),
        shareReplay({ bufferSize: 1, refCount: false }),
      );
      this.catalogCache = { locale, catalog$ };
    }
    return this.catalogCache.catalog$;
  }

  /** Drops the cached catalog so a failed load can be retried. */
  invalidateCatalog(): void {
    this.catalogCache = null;
  }

  // ─── Groups ───

  listGroups(): Observable<ApiEnvelope<PermissionGroupSummary[]>> {
    return this.http.get<ApiEnvelope<PermissionGroupSummary[]>>(`${this.API}/permission-groups`);
  }

  getGroup(id: number): Observable<ApiEnvelope<PermissionGroupDetail>> {
    return this.http.get<ApiEnvelope<PermissionGroupDetail>>(`${this.API}/permission-groups/${id}`);
  }

  createGroup(request: PermissionGroupRequest): Observable<ApiEnvelope<PermissionGroupDetail>> {
    return this.http.post<ApiEnvelope<PermissionGroupDetail>>(`${this.API}/permission-groups`, request);
  }

  updateGroup(id: number, request: PermissionGroupRequest): Observable<ApiEnvelope<PermissionGroupDetail>> {
    return this.http.put<ApiEnvelope<PermissionGroupDetail>>(`${this.API}/permission-groups/${id}`, request);
  }

  changeGroupStatus(id: number, status: IamRecordStatus, version: number): Observable<ApiEnvelope<PermissionGroupDetail>> {
    return this.http.patch<ApiEnvelope<PermissionGroupDetail>>(`${this.API}/permission-groups/${id}/status`, {
      status,
      version,
    });
  }

  deleteGroup(id: number): Observable<ApiEnvelope<null>> {
    return this.http.delete<ApiEnvelope<null>>(`${this.API}/permission-groups/${id}`);
  }
}
