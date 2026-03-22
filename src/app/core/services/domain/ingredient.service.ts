import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from 'src/environments/environment';
import { ApiResponse } from '../../models/api-response.model';
import { Page, PageRequest } from '../../models/pagination.model';
import { IngredientResponse, CreateIngredientRequest, UpdateIngredientRequest } from '../../models/domain.model';

@Injectable({ providedIn: 'root' })
export class IngredientService {
  private readonly API = environment.apiUrl + '/raw-material';
  private http = inject(HttpClient);

  getAll(params: PageRequest): Observable<ApiResponse<Page<IngredientResponse>>> {
    const httpParams = new HttpParams()
      .set('page', params.page.toString())
      .set('size', params.size.toString())
      .set('sort', params.sort ?? 'name,asc');
    return this.http.get<ApiResponse<Page<IngredientResponse>>>(this.API, { params: httpParams });
  }

  getById(id: number): Observable<ApiResponse<IngredientResponse>> {
    return this.http.get<ApiResponse<IngredientResponse>>(`${this.API}/${id}`);
  }

  create(req: CreateIngredientRequest): Observable<ApiResponse<IngredientResponse>> {
    return this.http.post<ApiResponse<IngredientResponse>>(this.API, req);
  }

  update(req: UpdateIngredientRequest): Observable<ApiResponse<IngredientResponse>> {
    return this.http.put<ApiResponse<IngredientResponse>>(`${this.API}/${req.id}`, req);
  }

  delete(id: number): Observable<ApiResponse<void>> {
    return this.http.delete<ApiResponse<void>>(`${this.API}/${id}`);
  }
}
