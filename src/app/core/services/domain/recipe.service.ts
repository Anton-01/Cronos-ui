import { HttpClient, HttpEvent, HttpRequest } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';

import { environment } from 'src/environments/environment';
import { ApiResponse } from '../../models/api-response.model';
import {
  CreateRecipeShareRequest,
  RecipeShareAccessLogResponse,
  RecipeShareResponse,
} from '../../models/domain.model';
import {
  RecipeCostPreview,
  RecipeCostPreviewRequest,
  RecipeDetail,
  RecipeFile,
  RecipeFileUpdateRequest,
  RecipeQuery,
  RecipeRequest,
  RecipeRevision,
  RecipeStats,
  RecipeStatus,
  RecipeSummary,
} from '../../models/kitchen.models';
import { ApiEnvelope, CatalogPage } from '../../models/unit-catalog.models';
import { toHttpParams } from '../../utils/http-params.util';

/** `/recipes` — whole-aggregate recipe API (doc §5). Shares keep their legacy envelope. */
@Injectable({ providedIn: 'root' })
export class RecipeService {
  private readonly API = `${environment.apiUrl}/recipes`;
  private readonly http = inject(HttpClient);

  search(query: RecipeQuery): Observable<ApiEnvelope<CatalogPage<RecipeSummary>>> {
    return this.http.get<ApiEnvelope<CatalogPage<RecipeSummary>>>(this.API, { params: toHttpParams(query) });
  }

  stats(): Observable<ApiEnvelope<RecipeStats>> {
    return this.http.get<ApiEnvelope<RecipeStats>>(`${this.API}/stats`);
  }

  getById(id: string): Observable<ApiEnvelope<RecipeDetail>> {
    return this.http.get<ApiEnvelope<RecipeDetail>>(`${this.API}/${id}`);
  }

  create(request: RecipeRequest): Observable<ApiEnvelope<RecipeDetail>> {
    return this.http.post<ApiEnvelope<RecipeDetail>>(this.API, request);
  }

  update(id: string, request: RecipeRequest): Observable<ApiEnvelope<RecipeDetail>> {
    return this.http.put<ApiEnvelope<RecipeDetail>>(`${this.API}/${id}`, request);
  }

  changeStatus(id: string, status: RecipeStatus, version: number): Observable<ApiEnvelope<RecipeDetail>> {
    return this.http.patch<ApiEnvelope<RecipeDetail>>(`${this.API}/${id}/status`, { status, version });
  }

  duplicate(id: string, name: string): Observable<ApiEnvelope<RecipeDetail>> {
    return this.http.post<ApiEnvelope<RecipeDetail>>(`${this.API}/${id}/duplicate`, { name });
  }

  delete(id: string): Observable<ApiEnvelope<null>> {
    return this.http.delete<ApiEnvelope<null>>(`${this.API}/${id}`);
  }

  /** Live cost of an unsaved draft or of a saved recipe under a quote configuration. Nothing is persisted. */
  costPreview(request: RecipeCostPreviewRequest): Observable<ApiEnvelope<RecipeCostPreview>> {
    return this.http.post<ApiEnvelope<RecipeCostPreview>>(`${this.API}/cost-preview`, request);
  }

  /** Forces a server recalculation with today's ingredient prices. */
  recalculate(id: string): Observable<ApiEnvelope<RecipeDetail>> {
    return this.http.post<ApiEnvelope<RecipeDetail>>(`${this.API}/${id}/recalculate`, {});
  }

  history(id: string, page: number, size: number): Observable<ApiEnvelope<CatalogPage<RecipeRevision>>> {
    return this.http.get<ApiEnvelope<CatalogPage<RecipeRevision>>>(`${this.API}/${id}/history`, {
      params: toHttpParams({ page, size }),
    });
  }

  // --- Files ---

  /** One file per request so each upload reports its own progress and can be retried alone. */
  uploadFile(recipeId: string, file: File, description: string | null): Observable<HttpEvent<ApiEnvelope<RecipeFile>>> {
    const body = new FormData();
    body.append('file', file, file.name);
    if (description) {
      body.append('description', description);
    }
    const request = new HttpRequest('POST', `${this.API}/${recipeId}/files`, body, { reportProgress: true });
    return this.http.request<ApiEnvelope<RecipeFile>>(request);
  }

  updateFile(recipeId: string, fileId: string, request: RecipeFileUpdateRequest): Observable<ApiEnvelope<RecipeFile>> {
    return this.http.patch<ApiEnvelope<RecipeFile>>(`${this.API}/${recipeId}/files/${fileId}`, request);
  }

  deleteFile(recipeId: string, fileId: string): Observable<ApiEnvelope<null>> {
    return this.http.delete<ApiEnvelope<null>>(`${this.API}/${recipeId}/files/${fileId}`);
  }

  // --- Cover ---

  /** Uploads a new (already cropped) cover image; it is also listed among the recipe files. */
  uploadCover(recipeId: string, file: File): Observable<HttpEvent<ApiEnvelope<RecipeFile>>> {
    const body = new FormData();
    body.append('file', file, file.name);
    const request = new HttpRequest('PUT', `${this.API}/${recipeId}/cover`, body, { reportProgress: true });
    return this.http.request<ApiEnvelope<RecipeFile>>(request);
  }

  /** Clears the cover. The image stays in the recipe files. */
  clearCover(recipeId: string): Observable<ApiEnvelope<null>> {
    return this.http.delete<ApiEnvelope<null>>(`${this.API}/${recipeId}/cover`);
  }

  // --- Shares ---
  getShares(recipeId: string): Observable<ApiResponse<RecipeShareResponse[]>> {
    return this.http.get<ApiResponse<RecipeShareResponse[]>>(`${this.API}/${recipeId}/shares`);
  }

  createShare(recipeId: string, req: CreateRecipeShareRequest): Observable<ApiResponse<RecipeShareResponse>> {
    return this.http.post<ApiResponse<RecipeShareResponse>>(`${this.API}/${recipeId}/shares`, req);
  }

  revokeShare(recipeId: string, shareId: string): Observable<ApiResponse<void>> {
    return this.http.delete<ApiResponse<void>>(`${this.API}/${recipeId}/shares/${shareId}/revoke`);
  }

  getShareAnalytics(recipeId: string, shareId: string): Observable<ApiResponse<RecipeShareAccessLogResponse[]>> {
    return this.http.get<ApiResponse<RecipeShareAccessLogResponse[]>>(
      `${this.API}/${recipeId}/shares/${shareId}/analytics`
    );
  }
}
