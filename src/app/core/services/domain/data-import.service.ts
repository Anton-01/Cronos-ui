import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from 'src/environments/environment';
import {
  ApiEnvelope,
  CatalogPage,
  ImportBatchQuery,
  ImportBatchSummary,
  ImportReport,
} from '../../models/unit-catalog.models';

/** `GET /data-imports` — cross-resource audit trail for the bulk-import wizard. */
@Injectable({ providedIn: 'root' })
export class DataImportService {
  private readonly API = environment.apiUrl + '/data-imports';
  private readonly http = inject(HttpClient);

  getBatches(query: ImportBatchQuery): Observable<ApiEnvelope<CatalogPage<ImportBatchSummary>>> {
    let params = new HttpParams().set('page', query.page.toString()).set('size', query.size.toString());
    if (query.resource) {
      params = params.set('resource', query.resource);
    }
    if (query.status) {
      params = params.set('status', query.status);
    }
    return this.http.get<ApiEnvelope<CatalogPage<ImportBatchSummary>>>(this.API, { params });
  }

  getReport(batchId: string): Observable<ApiEnvelope<ImportReport>> {
    return this.http.get<ApiEnvelope<ImportReport>>(`${this.API}/${batchId}`);
  }
}
