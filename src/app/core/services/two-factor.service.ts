import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';

import { environment } from 'src/environments/environment';
import {
  ConfirmTwoFactorRequest,
  DisableTwoFactorRequest,
  RegenerateRecoveryCodesRequest,
  TwoFactorEnrollment,
  TwoFactorRecoveryCodes,
  TwoFactorStatus,
} from '../models/two-factor.models';
import { ApiEnvelope } from '../models/unit-catalog.models';

/** The signed-in user's own 2FA — doc §8.2. Every route here is exempt from the enrolment gate (§8.1). */
@Injectable({ providedIn: 'root' })
export class TwoFactorService {
  private readonly API = `${environment.apiUrl}/users/me/two-factor`;
  private readonly http = inject(HttpClient);

  status(): Observable<ApiEnvelope<TwoFactorStatus>> {
    return this.http.get<ApiEnvelope<TwoFactorStatus>>(this.API);
  }

  startEnrollment(): Observable<ApiEnvelope<TwoFactorEnrollment>> {
    return this.http.post<ApiEnvelope<TwoFactorEnrollment>>(`${this.API}/enrollment`, {});
  }

  confirmEnrollment(request: ConfirmTwoFactorRequest): Observable<ApiEnvelope<TwoFactorRecoveryCodes>> {
    return this.http.post<ApiEnvelope<TwoFactorRecoveryCodes>>(`${this.API}/enrollment/confirm`, request);
  }

  disable(request: DisableTwoFactorRequest): Observable<ApiEnvelope<TwoFactorStatus>> {
    return this.http.post<ApiEnvelope<TwoFactorStatus>>(`${this.API}/disable`, request);
  }

  regenerateRecoveryCodes(request: RegenerateRecoveryCodesRequest): Observable<ApiEnvelope<TwoFactorRecoveryCodes>> {
    return this.http.post<ApiEnvelope<TwoFactorRecoveryCodes>>(`${this.API}/recovery-codes`, request);
  }
}
