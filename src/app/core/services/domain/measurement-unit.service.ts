import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable, map } from 'rxjs';
import { environment } from 'src/environments/environment';
import {
  ApiEnvelope,
  CatalogPage,
  ChangeStatusRequest,
  ImportReport,
  MeasurementUnitOptionResponse,
  MeasurementUnitRequest,
  MeasurementUnitResponse,
  RecordStatus,
  UnitConversionRequest,
  UnitConversionResponse,
} from '../../models/unit-catalog.models';
import { DownloadedFile, toDownloadedFile } from './import-file.util';

export interface MeasurementUnitQuery {
  page: number;
  size: number;
  sort?: string;
  search?: string;
}

@Injectable({ providedIn: 'root' })
export class MeasurementUnitService {
  private readonly API = environment.apiUrl + '/measurement-unit';
  private readonly http = inject(HttpClient);

  /** `GET /measurement-unit` — replaces the old `/measurement-unit/system`. */
  getAll(query: MeasurementUnitQuery): Observable<ApiEnvelope<CatalogPage<MeasurementUnitResponse>>> {
    let params = new HttpParams()
      .set('page', query.page.toString())
      .set('size', query.size.toString())
      .set('sort', query.sort ?? 'name,asc');
    if (query.search) {
      params = params.set('search', query.search);
    }
    return this.http.get<ApiEnvelope<CatalogPage<MeasurementUnitResponse>>>(this.API, { params });
  }

  /** `GET /measurement-unit/catalog` — unpaged, for a unit picker (e.g. the recipe-ingredient form). */
  getCatalogOptions(): Observable<ApiEnvelope<MeasurementUnitOptionResponse[]>> {
    return this.http.get<ApiEnvelope<MeasurementUnitOptionResponse[]>>(`${this.API}/catalog`);
  }

  getById(id: number): Observable<ApiEnvelope<MeasurementUnitResponse>> {
    return this.http.get<ApiEnvelope<MeasurementUnitResponse>>(`${this.API}/${id}`);
  }

  create(req: MeasurementUnitRequest): Observable<ApiEnvelope<MeasurementUnitResponse>> {
    return this.http.post<ApiEnvelope<MeasurementUnitResponse>>(this.API, req);
  }

  /** `PUT /measurement-unit/{id}` — body never carries `id`/`userId`/`status`. */
  update(id: number, req: MeasurementUnitRequest): Observable<ApiEnvelope<MeasurementUnitResponse>> {
    return this.http.put<ApiEnvelope<MeasurementUnitResponse>>(`${this.API}/${id}`, req);
  }

  changeStatus(id: number, status: RecordStatus): Observable<ApiEnvelope<MeasurementUnitResponse>> {
    const body: ChangeStatusRequest = { status };
    return this.http.patch<ApiEnvelope<MeasurementUnitResponse>>(`${this.API}/${id}/status`, body);
  }

  delete(id: number): Observable<ApiEnvelope<null>> {
    return this.http.delete<ApiEnvelope<null>>(`${this.API}/${id}`);
  }

  /** `POST /measurement-unit/convert` — any authenticated user; persists nothing. */
  convert(req: UnitConversionRequest): Observable<ApiEnvelope<UnitConversionResponse>> {
    return this.http.post<ApiEnvelope<UnitConversionResponse>>(`${this.API}/convert`, req);
  }

  /** `POST /measurement-unit/import?dryRun=` — multipart, part name `file`. */
  importFile(file: File, dryRun: boolean): Observable<ApiEnvelope<ImportReport>> {
    const formData = new FormData();
    formData.append('file', file, file.name);
    return this.http.post<ApiEnvelope<ImportReport>>(`${this.API}/import`, formData, {
      params: new HttpParams().set('dryRun', String(dryRun)),
    });
  }

  downloadTemplate(): Observable<DownloadedFile> {
    return this.http
      .get(`${this.API}/import/template`, { observe: 'response', responseType: 'blob' })
      .pipe(map((response) => toDownloadedFile(response, 'measurement-unit-template.xlsx')));
  }
}
