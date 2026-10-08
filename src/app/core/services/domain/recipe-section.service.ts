import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';

import { environment } from 'src/environments/environment';
import { RecipeSection, RecipeSectionRequest } from '../../models/kitchen.models';
import { ApiEnvelope } from '../../models/unit-catalog.models';

/** `/recipe-sections` — the user's own ingredient-group labels (doc baking-studio §3). Always fetched whole. */
@Injectable({ providedIn: 'root' })
export class RecipeSectionService {
  private readonly API = `${environment.apiUrl}/recipe-sections`;
  private readonly http = inject(HttpClient);

  list(): Observable<ApiEnvelope<RecipeSection[]>> {
    return this.http.get<ApiEnvelope<RecipeSection[]>>(this.API);
  }

  create(request: RecipeSectionRequest): Observable<ApiEnvelope<RecipeSection>> {
    return this.http.post<ApiEnvelope<RecipeSection>>(this.API, request);
  }

  update(id: string, request: RecipeSectionRequest): Observable<ApiEnvelope<RecipeSection>> {
    return this.http.put<ApiEnvelope<RecipeSection>>(`${this.API}/${id}`, request);
  }

  delete(id: string): Observable<ApiEnvelope<null>> {
    return this.http.delete<ApiEnvelope<null>>(`${this.API}/${id}`);
  }

  /** Full new order; ids not listed keep their relative order after the listed ones. */
  reorder(ids: string[]): Observable<ApiEnvelope<RecipeSection[]>> {
    return this.http.put<ApiEnvelope<RecipeSection[]>>(`${this.API}/order`, { ids });
  }

  /** Re-adds any missing default label; never removes or renames the user's own. */
  restoreDefaults(): Observable<ApiEnvelope<RecipeSection[]>> {
    return this.http.post<ApiEnvelope<RecipeSection[]>>(`${this.API}/restore-defaults`, {});
  }
}
