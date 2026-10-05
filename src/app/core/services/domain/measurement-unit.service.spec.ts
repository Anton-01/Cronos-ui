import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';

import { environment } from 'src/environments/environment';
import { MeasurementUnitService } from './measurement-unit.service';

const API = `${environment.apiUrl}/measurement-unit`;
const EMPTY_OK = { meta: { traceId: 't', timestamp: '' }, status: 'SUCCESS' as const, message: null, data: null };

describe('MeasurementUnitService', () => {
  let service: MeasurementUnitService;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    service = TestBed.inject(MeasurementUnitService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => httpMock.verify());

  it('getAll hits GET /measurement-unit, not the old /system suffix', () => {
    service.getAll({ page: 0, size: 10 }).subscribe();
    const req = httpMock.expectOne((r) => r.url === API);
    expect(req.request.method).toBe('GET');
    req.flush({ ...EMPTY_OK, data: { content: [], pageNumber: 0, pageSize: 10, totalElements: 0, totalPages: 0, last: true } });
  });

  it('getCatalogOptions hits the unpaged GET /measurement-unit/catalog', () => {
    service.getCatalogOptions().subscribe();
    const req = httpMock.expectOne(`${API}/catalog`);
    expect(req.request.method).toBe('GET');
    req.flush({ ...EMPTY_OK, data: [] });
  });

  it('update PUTs to /{id} with a body carrying no id/userId/status', () => {
    service.update(3, { codeIdentity: 'G', name: 'Gramo', namePlural: 'Gramos', unitTypeId: 1, multiplierToBase: 1, isBaseUnit: true }).subscribe();
    const req = httpMock.expectOne(`${API}/3`);
    expect(req.request.method).toBe('PUT');
    const sentKeys = Object.keys(req.request.body as object);
    expect(sentKeys).not.toContain('id');
    expect(sentKeys).not.toContain('status');
    expect(sentKeys).not.toContain('userId');
    req.flush(EMPTY_OK);
  });

  it('changeStatus PATCHes /{id}/status', () => {
    service.changeStatus(3, 'ACTIVE').subscribe();
    const req = httpMock.expectOne(`${API}/3/status`);
    expect(req.request.method).toBe('PATCH');
    expect(req.request.body).toEqual({ status: 'ACTIVE' });
    req.flush(EMPTY_OK);
  });

  it('convert POSTs to /convert and returns the conversion result', () => {
    const response = {
      ...EMPTY_OK,
      data: {
        quantity: 2.5,
        fromUnitId: 1,
        fromUnitCode: 'KG',
        toUnitId: 2,
        toUnitCode: 'G',
        result: 2500,
        path: 'LINEAR',
        densityRuleId: null,
        rawMaterialId: null,
      },
    };
    let result: number | undefined;
    service.convert({ quantity: 2.5, fromUnitId: 1, toUnitId: 2 }).subscribe((res) => (result = res.data?.result));

    const req = httpMock.expectOne(`${API}/convert`);
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual({ quantity: 2.5, fromUnitId: 1, toUnitId: 2 });
    req.flush(response);
    expect(result).toBe(2500);
  });

  it('importFile sends dryRun as a query param and the file as a multipart "file" part', () => {
    const file = new File(['x'], 'measurement-units.xlsx');
    service.importFile(file, false).subscribe();

    const req = httpMock.expectOne((r) => r.url === `${API}/import`);
    expect(req.request.params.get('dryRun')).toBe('false');
    const sentFile = (req.request.body as FormData).get('file') as File;
    expect(sentFile.name).toBe(file.name);
    req.flush(EMPTY_OK);
  });
});
