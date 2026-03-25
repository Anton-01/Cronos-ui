import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from 'src/environments/environment';
import { ApiResponse } from '../../models/api-response.model';
import { Page, PageRequest } from '../../models/pagination.model';
import { UserFixedCostRequest, UserFixedCostResponse } from '../../models/domain.model';

@Injectable({ providedIn: 'root' })
export class UserFixedCostService {
  private readonly API = environment.apiUrl + '/user-fixed-cost';
  private http = inject(HttpClient);

  getAll(params: PageRequest, search?: string): Observable<ApiResponse<Page<UserFixedCostResponse>>> {
    let httpParams = new HttpParams()
      .set('page', params.page.toString())
      .set('size', params.size.toString());
    if (params.sort) {
      httpParams = httpParams.set('sort', params.sort);
    }
    if (search) {
      httpParams = httpParams.set('search', search);
    }
    return this.http.get<ApiResponse<Page<UserFixedCostResponse>>>(this.API, { params: httpParams });
  }

  create(req: UserFixedCostRequest): Observable<ApiResponse<UserFixedCostResponse>> {
    return this.http.post<ApiResponse<UserFixedCostResponse>>(this.API, req);
  }

  update(id: string, req: UserFixedCostRequest): Observable<ApiResponse<UserFixedCostResponse>> {
    return this.http.put<ApiResponse<UserFixedCostResponse>>(`${this.API}/${id}`, req);
  }

  delete(id: string): Observable<ApiResponse<void>> {
    return this.http.delete<ApiResponse<void>>(`${this.API}/${id}`);
  }
}
