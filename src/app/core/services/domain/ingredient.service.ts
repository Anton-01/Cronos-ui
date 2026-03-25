import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from 'src/environments/environment';
import { ApiResponse } from '../../models/api-response.model';
import { Page, PageRequest } from '../../models/pagination.model';
import {
  IngredientResponse,
  IngredientDetailResponse,
  CreateIngredientRequest,
  UpdateIngredientRequest,
} from '../../models/domain.model';

@Injectable({ providedIn: 'root' })
export class IngredientService {
  private readonly API = environment.apiUrl + '/raw-material';
  private http = inject(HttpClient);

  getAll(params: PageRequest, search?: string): Observable<ApiResponse<Page<IngredientResponse>>> {
    let httpParams = new HttpParams()
      .set('page', params.page.toString())
      .set('size', params.size.toString())
      .set('sort', params.sort ?? 'name,asc');
    if (search) {
      httpParams = httpParams.set('search', search);
    }
    return this.http.get<ApiResponse<Page<IngredientResponse>>>(this.API, { params: httpParams });
  }

  getById(id: string): Observable<ApiResponse<IngredientDetailResponse>> {
    return this.http.get<ApiResponse<IngredientDetailResponse>>(`${this.API}/${id}`);
  }

  create(req: CreateIngredientRequest): Observable<ApiResponse<IngredientDetailResponse>> {
    return this.http.post<ApiResponse<IngredientDetailResponse>>(this.API, req);
  }

  update(req: UpdateIngredientRequest): Observable<ApiResponse<IngredientDetailResponse>> {
    return this.http.put<ApiResponse<IngredientDetailResponse>>(`${this.API}/${req.id}`, req);
  }

  delete(id: string): Observable<ApiResponse<void>> {
    return this.http.delete<ApiResponse<void>>(`${this.API}/${id}`);
  }
}
