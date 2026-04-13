import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from 'src/environments/environment';
import { ApiResponse } from '../../models/api-response.model';
import { PublicQuoteResponse } from '../../models/domain.model';

@Injectable({ providedIn: 'root' })
export class PublicQuoteService {
  private readonly API = environment.apiUrl + '/public/quotes';
  private http = inject(HttpClient);

  getByToken(token: string): Observable<ApiResponse<PublicQuoteResponse>> {
    return this.http.get<ApiResponse<PublicQuoteResponse>>(`${this.API}/${token}`);
  }
}
