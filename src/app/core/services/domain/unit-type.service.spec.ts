import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';

import { environment } from 'src/environments/environment';
import { UnitTypeService } from './unit-type.service';
import { ApiEnvelope, CatalogPage, UnitTypeResponse } from '../../models/unit-catalog.models';

const API = `${environment.apiUrl}/unit-type`;

describe('UnitTypeService', () => {
  let service: UnitTypeService;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    service = TestBed.inject(UnitTypeService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => httpMock.verify());

  it('getAll sends page/size/sort and reads a CatalogPage', () => {
    const page: CatalogPage<UnitTypeResponse> = {
      content: [],
      pageNumber: 0,
      pageSize: 10,
      totalElements: 0,
      totalPages: 0,
      last: true,
    };
    const envelope: ApiEnvelope<CatalogPage<UnitTypeResponse>> = {
      meta: { traceId: 't1', timestamp: '2026-10-04T00:00:00Z' },
      status: 'SUCCESS',
      message: null,
      data: page,
    };

    service.getAll({ page: 0, size: 10 }).subscribe((res) => expect(res.data).toEqual(page));

    const req = httpMock.expectOne((r) => r.url === API);
    expect(req.request.params.get('page')).toBe('0');
    expect(req.request.params.get('size')).toBe('10');
    expect(req.request.params.get('sort')).toBe('name,asc');
    req.flush(envelope);
  });

  it('create POSTs the request body as-is', () => {
    service.create({ codeIdentity: 'KG', name: 'Kilogramo', dimension: 'MASS' }).subscribe();
    const req = httpMock.expectOne(API);
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual({ codeIdentity: 'KG', name: 'Kilogramo', dimension: 'MASS' });
    req.flush({ meta: { traceId: 't', timestamp: '' }, status: 'SUCCESS', message: null, data: null });
  });

  it('update PUTs to /{id}', () => {
    service.update(7, { codeIdentity: 'KG', name: 'Kilogramo', dimension: 'MASS' }).subscribe();
    const req = httpMock.expectOne(`${API}/7`);
    expect(req.request.method).toBe('PUT');
    req.flush({ meta: { traceId: 't', timestamp: '' }, status: 'SUCCESS', message: null, data: null });
  });

  it('changeStatus PATCHes /{id}/status with { status }', () => {
    service.changeStatus(7, 'INACTIVE').subscribe();
    const req = httpMock.expectOne(`${API}/7/status`);
    expect(req.request.method).toBe('PATCH');
    expect(req.request.body).toEqual({ status: 'INACTIVE' });
    req.flush({ meta: { traceId: 't', timestamp: '' }, status: 'SUCCESS', message: null, data: null });
  });

  it('delete DELETEs /{id}', () => {
    service.delete(7).subscribe();
    const req = httpMock.expectOne(`${API}/7`);
    expect(req.request.method).toBe('DELETE');
    req.flush({ meta: { traceId: 't', timestamp: '' }, status: 'SUCCESS', message: null, data: null });
  });

  it('importFile sends dryRun as a query param and the file as a multipart "file" part', () => {
    const file = new File(['x'], 'unit-types.xlsx');
    service.importFile(file, true).subscribe();

    const req = httpMock.expectOne((r) => r.url === `${API}/import`);
    expect(req.request.method).toBe('POST');
    expect(req.request.params.get('dryRun')).toBe('true');
    expect(req.request.body instanceof FormData).toBeTrue();
    const sentFile = (req.request.body as FormData).get('file') as File;
    expect(sentFile.name).toBe(file.name);
    req.flush({ meta: { traceId: 't', timestamp: '' }, status: 'SUCCESS', message: null, data: null });
  });

  it('downloadTemplate reads the file name from Content-Disposition', () => {
    let fileName = '';
    service.downloadTemplate().subscribe((result) => (fileName = result.fileName));

    const req = httpMock.expectOne(`${API}/import/template`);
    req.flush(new Blob(['x']), {
      headers: { 'Content-Disposition': 'attachment; filename="01-unit-types.xlsx"' },
    });
    expect(fileName).toBe('01-unit-types.xlsx');
  });
});
