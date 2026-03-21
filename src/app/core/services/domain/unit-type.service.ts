import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from 'src/environments/environment';
import { ApiResponse } from '../../models/api-response.model';
import { Page, PageRequest } from '../../models/pagination.model';
import { UnitTypeResponse, CreateUnitTypeRequest, UpdateUnitTypeRequest } from '../../models/domain.model';

@Injectable({ providedIn: 'root' })
export class UnitTypeService {
  private readonly API = environment.apiUrl + '/unit-types';
  private http = inject(HttpClient);

  getAll(params: PageRequest): Observable<ApiResponse<Page<UnitTypeResponse>>> {
    const httpParams = new HttpParams()
      .set('page', params.page.toString())
      .set('size', params.size.toString())
      .set('sort', params.sort ?? 'name,asc');
    return this.http.get<ApiResponse<Page<UnitTypeResponse>>>(this.API, { params: httpParams });
  }

  getById(id: number): Observable<ApiResponse<UnitTypeResponse>> {
    return this.http.get<ApiResponse<UnitTypeResponse>>(`${this.API}/${id}`);
  }

  create(req: CreateUnitTypeRequest): Observable<ApiResponse<UnitTypeResponse>> {
    return this.http.post<ApiResponse<UnitTypeResponse>>(this.API, req);
  }

  update(req: UpdateUnitTypeRequest): Observable<ApiResponse<UnitTypeResponse>> {
    return this.http.put<ApiResponse<UnitTypeResponse>>(`${this.API}/${req.id}`, req);
  }

  delete(id: number): Observable<ApiResponse<void>> {
    return this.http.delete<ApiResponse<void>>(`${this.API}/${id}`);
  }
}
