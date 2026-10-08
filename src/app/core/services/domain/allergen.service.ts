import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, map, shareReplay } from 'rxjs';

import { environment } from 'src/environments/environment';
import { AllergenRequest, AllergenResponse } from '../../models/kitchen.models';
import { ApiEnvelope, RecordStatus } from '../../models/unit-catalog.models';
import { toHttpParams } from '../../utils/http-params.util';

/** `/allergens` — doc §3. A short, closed list: always fetched whole. */
@Injectable({ providedIn: 'root' })
export class AllergenService {
  private readonly API = `${environment.apiUrl}/allergens`;
  private readonly http = inject(HttpClient);

  private active$: Observable<AllergenResponse[]> | null = null;

  list(status?: RecordStatus): Observable<ApiEnvelope<AllergenResponse[]>> {
    return this.http.get<ApiEnvelope<AllergenResponse[]>>(this.API, { params: toHttpParams({ status }) });
  }

  /**
   * ACTIVE allergens shared by every screen that detects or displays them
   * (ingredient editor, recipe studio, quote configurator). Cached for the
   * session; `invalidate()` after editing the catalog.
   */
  active(): Observable<AllergenResponse[]> {
    this.active$ ??= this.list('ACTIVE').pipe(
      map((response) => response.data ?? []),
      shareReplay({ bufferSize: 1, refCount: false }),
    );
    return this.active$;
  }

  invalidate(): void {
    this.active$ = null;
  }

  create(request: AllergenRequest): Observable<ApiEnvelope<AllergenResponse>> {
    return this.http.post<ApiEnvelope<AllergenResponse>>(this.API, request);
  }

  update(id: number, request: AllergenRequest): Observable<ApiEnvelope<AllergenResponse>> {
    return this.http.put<ApiEnvelope<AllergenResponse>>(`${this.API}/${id}`, request);
  }

  changeStatus(id: number, status: RecordStatus, version: number): Observable<ApiEnvelope<AllergenResponse>> {
    return this.http.patch<ApiEnvelope<AllergenResponse>>(`${this.API}/${id}/status`, { status, version });
  }

  delete(id: number): Observable<ApiEnvelope<null>> {
    return this.http.delete<ApiEnvelope<null>>(`${this.API}/${id}`);
  }
}
