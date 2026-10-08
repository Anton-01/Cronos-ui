import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';

import { environment } from 'src/environments/environment';
import {
  CurrencyOption,
  CurrencyRequest,
  CurrencyResponse,
  FinanceCatalogQuery,
  FinanceRecordStatus,
} from '../../models/finance.models';
import { ApiEnvelope, CatalogPage } from '../../models/unit-catalog.models';
import { toHttpParams } from '../../utils/http-params.util';

/** `/finance/currencies` — doc §9. */
@Injectable({ providedIn: 'root' })
export class CurrencyService {
  private readonly API = `${environment.apiUrl}/finance/currencies`;
  private readonly http = inject(HttpClient);

  search(query: FinanceCatalogQuery): Observable<ApiEnvelope<CatalogPage<CurrencyResponse>>> {
    return this.http.get<ApiEnvelope<CatalogPage<CurrencyResponse>>>(this.API, {
      params: toHttpParams({ sort: 'code,asc', ...query }),
    });
  }

  /** ACTIVE currencies, unpaged, default first. */
  options(): Observable<ApiEnvelope<CurrencyOption[]>> {
    return this.http.get<ApiEnvelope<CurrencyOption[]>>(`${this.API}/catalog`);
  }

  create(request: CurrencyRequest): Observable<ApiEnvelope<CurrencyResponse>> {
    return this.http.post<ApiEnvelope<CurrencyResponse>>(this.API, request);
  }

  update(id: number, request: CurrencyRequest): Observable<ApiEnvelope<CurrencyResponse>> {
    return this.http.put<ApiEnvelope<CurrencyResponse>>(`${this.API}/${id}`, request);
  }

  changeStatus(id: number, status: FinanceRecordStatus, version: number): Observable<ApiEnvelope<CurrencyResponse>> {
    return this.http.patch<ApiEnvelope<CurrencyResponse>>(`${this.API}/${id}/status`, { status, version });
  }

  setDefault(id: number, version: number): Observable<ApiEnvelope<CurrencyResponse>> {
    return this.http.patch<ApiEnvelope<CurrencyResponse>>(`${this.API}/${id}/default`, { version });
  }

  delete(id: number): Observable<ApiEnvelope<null>> {
    return this.http.delete<ApiEnvelope<null>>(`${this.API}/${id}`);
  }
}
