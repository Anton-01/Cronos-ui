import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from 'src/environments/environment';
import { ApiResponse } from '../../models/api-response.model';
import { Page, PageRequest } from '../../models/pagination.model';
import { AllergenResponse, CreateAllergenRequest, UpdateAllergenRequest } from '../../models/domain.model';

@Injectable({ providedIn: 'root' })
export class AllergenService {
  private readonly API = environment.apiUrl + '/allergens';
  private http = inject(HttpClient);

  getAll(params: PageRequest): Observable<ApiResponse<Page<AllergenResponse>>> {
    const httpParams = new HttpParams()
      .set('page', params.page.toString())
      .set('size', params.size.toString())
      .set('sort', params.sort ?? 'name,asc');
    return this.http.get<ApiResponse<Page<AllergenResponse>>>(this.API, { params: httpParams });
  }

  getById(id: number): Observable<ApiResponse<AllergenResponse>> {
    return this.http.get<ApiResponse<AllergenResponse>>(`${this.API}/${id}`);
  }

  create(req: CreateAllergenRequest): Observable<ApiResponse<AllergenResponse>> {
    return this.http.post<ApiResponse<AllergenResponse>>(this.API, req);
  }

  update(req: UpdateAllergenRequest): Observable<ApiResponse<AllergenResponse>> {
    return this.http.put<ApiResponse<AllergenResponse>>(`${this.API}/${req.id}`, req);
  }

  delete(id: number): Observable<ApiResponse<void>> {
    return this.http.delete<ApiResponse<void>>(`${this.API}/${id}`);
  }
}
