import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from 'src/environments/environment';
import { ApiResponse } from '../../models/api-response.model';
import { Page, PageRequest } from '../../models/pagination.model';
import {
  InternalQuoteResponse,
  CreateQuoteRequest,
  RecipeSimpleResponse,
} from '../../models/domain.model';

@Injectable({ providedIn: 'root' })
export class QuoteService {
  private readonly API = environment.apiUrl + '/quotes';
  private http = inject(HttpClient);

  getAll(params: PageRequest, search?: string): Observable<ApiResponse<Page<InternalQuoteResponse>>> {
    let httpParams = new HttpParams()
      .set('page', params.page.toString())
      .set('size', params.size.toString())
      .set('sort', params.sort ?? 'createdAt,desc');
    if (search) {
      httpParams = httpParams.set('search', search);
    }
    return this.http.get<ApiResponse<Page<InternalQuoteResponse>>>(this.API, { params: httpParams });
  }

  getById(id: string): Observable<ApiResponse<InternalQuoteResponse>> {
    return this.http.get<ApiResponse<InternalQuoteResponse>>(`${this.API}/${id}`);
  }

  create(req: CreateQuoteRequest): Observable<ApiResponse<InternalQuoteResponse>> {
    return this.http.post<ApiResponse<InternalQuoteResponse>>(this.API, req);
  }

  update(id: string, req: CreateQuoteRequest): Observable<ApiResponse<InternalQuoteResponse>> {
    return this.http.put<ApiResponse<InternalQuoteResponse>>(`${this.API}/${id}`, req);
  }

  delete(id: string): Observable<ApiResponse<void>> {
    return this.http.delete<ApiResponse<void>>(`${this.API}/${id}`);
  }

  sendEmail(id: string): Observable<ApiResponse<void>> {
    return this.http.post<ApiResponse<void>>(`${this.API}/${id}/send-email`, {});
  }

  revoke(id: string): Observable<ApiResponse<void>> {
    return this.http.post<ApiResponse<void>>(`${this.API}/${id}/revoke`, {});
  }

  // Búsqueda de recetas simplificada para el typeahead
  searchRecipes(term: string): Observable<ApiResponse<RecipeSimpleResponse[]>> {
    const params = new HttpParams().set('search', term);
    return this.http.get<ApiResponse<RecipeSimpleResponse[]>>(
      environment.apiUrl + '/recipes/simple',
      { params }
    );
  }
}
