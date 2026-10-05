import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable, map } from 'rxjs';
import { environment } from 'src/environments/environment';
import {
  ApiEnvelope,
  CatalogPage,
  ChangeStatusRequest,
  ImportReport,
  RecordStatus,
  UnitTypeRequest,
  UnitTypeResponse,
} from '../../models/unit-catalog.models';
import { DownloadedFile, toDownloadedFile } from './import-file.util';

export interface UnitTypeQuery {
  page: number;
  size: number;
  sort?: string;
  search?: string;
}

@Injectable({ providedIn: 'root' })
export class UnitTypeService {
  private readonly API = environment.apiUrl + '/unit-type';
  private readonly http = inject(HttpClient);

  getAll(query: UnitTypeQuery): Observable<ApiEnvelope<CatalogPage<UnitTypeResponse>>> {
    let params = new HttpParams()
      .set('page', query.page.toString())
      .set('size', query.size.toString())
      .set('sort', query.sort ?? 'name,asc');
    if (query.search) {
      params = params.set('search', query.search);
    }
    return this.http.get<ApiEnvelope<CatalogPage<UnitTypeResponse>>>(this.API, { params });
  }

  getById(id: number): Observable<ApiEnvelope<UnitTypeResponse>> {
    return this.http.get<ApiEnvelope<UnitTypeResponse>>(`${this.API}/${id}`);
  }

  create(req: UnitTypeRequest): Observable<ApiEnvelope<UnitTypeResponse>> {
    return this.http.post<ApiEnvelope<UnitTypeResponse>>(this.API, req);
  }

  update(id: number, req: UnitTypeRequest): Observable<ApiEnvelope<UnitTypeResponse>> {
    return this.http.put<ApiEnvelope<UnitTypeResponse>>(`${this.API}/${id}`, req);
  }

  changeStatus(id: number, status: RecordStatus): Observable<ApiEnvelope<UnitTypeResponse>> {
    const body: ChangeStatusRequest = { status };
    return this.http.patch<ApiEnvelope<UnitTypeResponse>>(`${this.API}/${id}/status`, body);
  }

  delete(id: number): Observable<ApiEnvelope<null>> {
    return this.http.delete<ApiEnvelope<null>>(`${this.API}/${id}`);
  }

  /** `POST /unit-type/import?dryRun=` — multipart, part name `file`. */
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
      .pipe(map((response) => toDownloadedFile(response, 'unit-type-template.xlsx')));
  }
}
