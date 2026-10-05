import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';

import { environment } from 'src/environments/environment';
import { DataImportService } from './data-import.service';

const API = `${environment.apiUrl}/data-imports`;
const EMPTY_OK = { meta: { traceId: 't', timestamp: '' }, status: 'SUCCESS' as const, message: null, data: null };

describe('DataImportService', () => {
  let service: DataImportService;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    service = TestBed.inject(DataImportService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => httpMock.verify());

  it('getBatches omits resource/status params when not provided', () => {
    service.getBatches({ page: 0, size: 20 }).subscribe();
    const req = httpMock.expectOne((r) => r.url === API);
    expect(req.request.params.has('resource')).toBeFalse();
    expect(req.request.params.has('status')).toBeFalse();
    req.flush({ ...EMPTY_OK, data: { content: [], pageNumber: 0, pageSize: 20, totalElements: 0, totalPages: 0, last: true } });
  });

  it('getBatches forwards resource/status filters', () => {
    service.getBatches({ page: 0, size: 20, resource: 'UNIT_TYPE', status: 'REJECTED' }).subscribe();
    const req = httpMock.expectOne((r) => r.url === API);
    expect(req.request.params.get('resource')).toBe('UNIT_TYPE');
    expect(req.request.params.get('status')).toBe('REJECTED');
    req.flush({ ...EMPTY_OK, data: { content: [], pageNumber: 0, pageSize: 20, totalElements: 0, totalPages: 0, last: true } });
  });

  it('getReport GETs /data-imports/{batchId}', () => {
    service.getReport('b-1').subscribe();
    const req = httpMock.expectOne(`${API}/b-1`);
    expect(req.request.method).toBe('GET');
    req.flush(EMPTY_OK);
  });
});
