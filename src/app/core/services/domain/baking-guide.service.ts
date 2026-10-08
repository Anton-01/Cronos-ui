import { HttpBackend, HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, catchError, map, shareReplay } from 'rxjs';

import { environment } from 'src/environments/environment';
import { BakingGuide, PanSize, PanSizeRequest } from '../../models/baking-guide.models';
import { ApiEnvelope } from '../../models/unit-catalog.models';

/** Bundled copy of the SYSTEM seed (doc baking-studio §6.4) — the page still works before the API ships. */
const SEED_URL = './assets/baking-guide/seed.es-MX.json';

export interface BakingGuideResult {
  guide: BakingGuide;
  /** `true` when the API was unreachable and the bundled seed is shown (custom pans cannot be saved). */
  offline: boolean;
}

/** `/baking-guide` — articles, pan sizes and volume conversions (doc baking-studio §6). */
@Injectable({ providedIn: 'root' })
export class BakingGuideService {
  private readonly API = `${environment.apiUrl}/baking-guide`;
  private readonly http = inject(HttpClient);
  /** The seed is a static asset: no auth header, no 401-refresh flow. */
  private readonly assets = new HttpClient(inject(HttpBackend));

  private guide$: Observable<BakingGuideResult> | null = null;

  /** Cached for the session; `invalidate()` after adding or removing a custom pan. */
  load(): Observable<BakingGuideResult> {
    this.guide$ ??= this.http.get<ApiEnvelope<BakingGuide>>(this.API).pipe(
      map((response) => {
        if (!response.data) {
          throw new Error('empty baking guide');
        }
        return { guide: response.data, offline: false };
      }),
      catchError(() => this.assets.get<BakingGuide>(SEED_URL).pipe(map((guide) => ({ guide, offline: true })))),
      shareReplay({ bufferSize: 1, refCount: false }),
    );
    return this.guide$;
  }

  invalidate(): void {
    this.guide$ = null;
  }

  createPan(request: PanSizeRequest): Observable<ApiEnvelope<PanSize>> {
    return this.http.post<ApiEnvelope<PanSize>>(`${this.API}/pan-sizes`, request);
  }

  updatePan(id: string, request: PanSizeRequest): Observable<ApiEnvelope<PanSize>> {
    return this.http.put<ApiEnvelope<PanSize>>(`${this.API}/pan-sizes/${id}`, request);
  }

  deletePan(id: string): Observable<ApiEnvelope<null>> {
    return this.http.delete<ApiEnvelope<null>>(`${this.API}/pan-sizes/${id}`);
  }
}
