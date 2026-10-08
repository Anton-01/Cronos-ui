import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';

import { environment } from 'src/environments/environment';
import {
  FinanceCatalogQuery,
  FinanceRecordStatus,
  TaxRateOption,
  TaxRateRequest,
  TaxRateResponse,
} from '../../models/finance.models';
import { ApiEnvelope, CatalogPage } from '../../models/unit-catalog.models';
import { toHttpParams } from '../../utils/http-params.util';

/** `/finance/tax-rates` — doc §10. */
@Injectable({ providedIn: 'root' })
export class TaxRateService {
  private readonly API = `${environment.apiUrl}/finance/tax-rates`;
  private readonly http = inject(HttpClient);

  search(query: FinanceCatalogQuery): Observable<ApiEnvelope<CatalogPage<TaxRateResponse>>> {
    return this.http.get<ApiEnvelope<CatalogPage<TaxRateResponse>>>(this.API, {
      params: toHttpParams({ sort: 'ratePercent,desc', ...query }),
    });
  }

  /** ACTIVE and currently valid (`validFrom ≤ today ≤ validTo`), default first. */
  options(): Observable<ApiEnvelope<TaxRateOption[]>> {
    return this.http.get<ApiEnvelope<TaxRateOption[]>>(`${this.API}/catalog`);
  }

  create(request: TaxRateRequest): Observable<ApiEnvelope<TaxRateResponse>> {
    return this.http.post<ApiEnvelope<TaxRateResponse>>(this.API, request);
  }

  update(id: number, request: TaxRateRequest): Observable<ApiEnvelope<TaxRateResponse>> {
    return this.http.put<ApiEnvelope<TaxRateResponse>>(`${this.API}/${id}`, request);
  }

  changeStatus(id: number, status: FinanceRecordStatus, version: number): Observable<ApiEnvelope<TaxRateResponse>> {
    return this.http.patch<ApiEnvelope<TaxRateResponse>>(`${this.API}/${id}/status`, { status, version });
  }

  setDefault(id: number, version: number): Observable<ApiEnvelope<TaxRateResponse>> {
    return this.http.patch<ApiEnvelope<TaxRateResponse>>(`${this.API}/${id}/default`, { version });
  }

  delete(id: number): Observable<ApiEnvelope<null>> {
    return this.http.delete<ApiEnvelope<null>>(`${this.API}/${id}`);
  }
}
