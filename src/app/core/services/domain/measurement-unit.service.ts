import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from 'src/environments/environment';
import { ApiResponse } from '../../models/api-response.model';
import { Page, PageRequest } from '../../models/pagination.model';
import { MeasurementUnitResponse, CreateMeasurementUnitRequest, UpdateMeasurementUnitRequest } from '../../models/domain.model';

@Injectable({ providedIn: 'root' })
export class MeasurementUnitService {
  private readonly API = environment.apiUrl + '/measurement-units';
  private http = inject(HttpClient);

  getAll(params: PageRequest): Observable<ApiResponse<Page<MeasurementUnitResponse>>> {
    const httpParams = new HttpParams()
      .set('page', params.page.toString())
      .set('size', params.size.toString())
      .set('sort', params.sort ?? 'name,asc');
    return this.http.get<ApiResponse<Page<MeasurementUnitResponse>>>(this.API, { params: httpParams });
  }

  getById(id: number): Observable<ApiResponse<MeasurementUnitResponse>> {
    return this.http.get<ApiResponse<MeasurementUnitResponse>>(`${this.API}/${id}`);
  }

  create(req: CreateMeasurementUnitRequest): Observable<ApiResponse<MeasurementUnitResponse>> {
    return this.http.post<ApiResponse<MeasurementUnitResponse>>(this.API, req);
  }

  update(req: UpdateMeasurementUnitRequest): Observable<ApiResponse<MeasurementUnitResponse>> {
    return this.http.put<ApiResponse<MeasurementUnitResponse>>(`${this.API}/${req.id}`, req);
  }

  delete(id: number): Observable<ApiResponse<void>> {
    return this.http.delete<ApiResponse<void>>(`${this.API}/${id}`);
  }
}
