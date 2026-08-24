import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from 'src/environments/environment';
import { ApiResponse, Page } from '../../models';
import {
  CategoryQuery,
  CategoryResponse,
  CreateCategoryRequest,
  CsvImportResponse,
  UpdateCategoryRequest,
} from '../../models/category.model';

const DEFAULT_SORT = 'name,asc';

/**
 * The six `/category` endpoints.
 *
 * `getAll` returns every SYSTEM category plus the caller's own USER ones;
 * `getSystem` narrows that to the SYSTEM catalog. Both accept an optional
 * `type` so PRODUCT and INGREDIENT can be fetched as separate lists instead
 * of being split client-side.
 */
@Injectable({ providedIn: 'root' })
export class CategoryService {
  private readonly API = environment.apiUrl + '/category';
  private readonly http = inject(HttpClient);

  /** GET /category — SYSTEM ∪ the current user's USER categories. */
  getAll(query: CategoryQuery): Observable<ApiResponse<Page<CategoryResponse>>> {
    return this.http.get<ApiResponse<Page<CategoryResponse>>>(this.API, {
      params: this.toHttpParams(query),
    });
  }

  /** GET /category/system — the SYSTEM catalog only. */
  getSystem(query: CategoryQuery): Observable<ApiResponse<Page<CategoryResponse>>> {
    return this.http.get<ApiResponse<Page<CategoryResponse>>>(`${this.API}/system`, {
      params: this.toHttpParams(query),
    });
  }

  /** GET /category/{id} */
  getById(id: number): Observable<ApiResponse<CategoryResponse>> {
    return this.http.get<ApiResponse<CategoryResponse>>(`${this.API}/${id}`);
  }

  /** POST /category — `type` is fixed here and can never be changed again. */
  create(req: CreateCategoryRequest): Observable<ApiResponse<CategoryResponse>> {
    return this.http.post<ApiResponse<CategoryResponse>>(this.API, req);
  }

  /** PUT /category/{id} — name and description only; `type` is immutable. */
  update(id: number, req: UpdateCategoryRequest): Observable<ApiResponse<CategoryResponse>> {
    return this.http.put<ApiResponse<CategoryResponse>>(`${this.API}/${id}`, req);
  }

  /** DELETE /category/{id} — soft delete, no restore endpoint exists. */
  delete(id: number): Observable<ApiResponse<void>> {
    return this.http.delete<ApiResponse<void>>(`${this.API}/${id}`);
  }

  /** POST /category/import — CSV columns: name, description, type. */
  importCsv(file: File): Observable<ApiResponse<CsvImportResponse>> {
    const formData = new FormData();
    formData.append('file', file);
    return this.http.post<ApiResponse<CsvImportResponse>>(`${this.API}/import`, formData);
  }

  private toHttpParams(query: CategoryQuery): HttpParams {
    let params = new HttpParams()
      .set('page', query.page.toString())
      .set('size', query.size.toString())
      .set('sort', query.sort ?? DEFAULT_SORT);
    if (query.type) {
      params = params.set('type', query.type);
    }
    return params;
  }
}
