import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';

import { environment } from 'src/environments/environment';
import {
  IngredientDetail,
  IngredientPriceHistoryEntry,
  IngredientPriceRequest,
  IngredientQuery,
  IngredientRequest,
  IngredientStats,
  IngredientSubstitute,
  IngredientSummary,
  PriceImpact,
} from '../../models/kitchen.models';
import { ApiEnvelope, CatalogPage, RecordStatus } from '../../models/unit-catalog.models';
import { toHttpParams } from '../../utils/http-params.util';

/** `/ingredients` — the master catalog (SYSTEM) plus the caller's own (USER). Doc §4. */
@Injectable({ providedIn: 'root' })
export class IngredientService {
  private readonly API = `${environment.apiUrl}/ingredients`;
  private readonly http = inject(HttpClient);

  search(query: IngredientQuery): Observable<ApiEnvelope<CatalogPage<IngredientSummary>>> {
    return this.http.get<ApiEnvelope<CatalogPage<IngredientSummary>>>(this.API, { params: toHttpParams(query) });
  }

  stats(): Observable<ApiEnvelope<IngredientStats>> {
    return this.http.get<ApiEnvelope<IngredientStats>>(`${this.API}/stats`);
  }

  getById(id: string): Observable<ApiEnvelope<IngredientDetail>> {
    return this.http.get<ApiEnvelope<IngredientDetail>>(`${this.API}/${id}`);
  }

  create(request: IngredientRequest): Observable<ApiEnvelope<IngredientDetail>> {
    return this.http.post<ApiEnvelope<IngredientDetail>>(this.API, request);
  }

  update(id: string, request: IngredientRequest): Observable<ApiEnvelope<IngredientDetail>> {
    return this.http.put<ApiEnvelope<IngredientDetail>>(`${this.API}/${id}`, request);
  }

  changeStatus(id: string, status: RecordStatus, version: number): Observable<ApiEnvelope<IngredientDetail>> {
    return this.http.patch<ApiEnvelope<IngredientDetail>>(`${this.API}/${id}/status`, { status, version });
  }

  delete(id: string): Observable<ApiEnvelope<null>> {
    return this.http.delete<ApiEnvelope<null>>(`${this.API}/${id}`);
  }

  /** Registers the caller's purchase price; the server recalculates every affected recipe. */
  registerPrice(id: string, request: IngredientPriceRequest): Observable<ApiEnvelope<PriceImpact>> {
    return this.http.post<ApiEnvelope<PriceImpact>>(`${this.API}/${id}/prices`, request);
  }

  priceHistory(id: string, page: number, size: number): Observable<ApiEnvelope<CatalogPage<IngredientPriceHistoryEntry>>> {
    return this.http.get<ApiEnvelope<CatalogPage<IngredientPriceHistoryEntry>>>(`${this.API}/${id}/prices`, {
      params: toHttpParams({ page, size }),
    });
  }

  /** Substitutes for `id`, optionally only those free of the given allergens. */
  substitutes(id: string, freeOfAllergenIds: number[] = []): Observable<ApiEnvelope<IngredientSubstitute[]>> {
    return this.http.get<ApiEnvelope<IngredientSubstitute[]>>(`${this.API}/${id}/substitutes`, {
      params: toHttpParams({ freeOfAllergenIds }),
    });
  }

  /** Recipes that use the ingredient (for "where used" before editing a price). */
  usage(id: string): Observable<ApiEnvelope<{ id: string; name: string; quantity: number; unitCode: string }[]>> {
    return this.http.get<ApiEnvelope<{ id: string; name: string; quantity: number; unitCode: string }[]>>(`${this.API}/${id}/usage`);
  }
}
