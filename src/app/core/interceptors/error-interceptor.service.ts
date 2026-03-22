import { Injectable } from '@angular/core';
import {
  HttpInterceptor,
  HttpRequest,
  HttpHandler,
  HttpEvent,
  HttpErrorResponse,
} from '@angular/common/http';
import { Router } from '@angular/router';
import { BehaviorSubject, Observable, catchError, filter, switchMap, take, throwError } from 'rxjs';
import { TokenService } from '../services/token.service';
import { AuthService } from '../services/auth.service';
import { ToastService } from '../../shared/services/toast.service';

/**
 * HTTP interceptor that handles 401 errors with automatic JWT refresh.
 *
 * Flow:
 * 1. A request returns 401 (and is not /auth/login or /auth/refresh).
 * 2. If no refresh is in progress, start one:
 *    - Set isRefreshing = true and reset the subject to null.
 *    - POST to /auth/refresh with the current refresh token.
 *    - On success: save new tokens, emit new access token on the subject,
 *      and retry the original request with the new token.
 *    - On failure: clear tokens, redirect to /auth/login.
 * 3. If a refresh IS already in progress, queue the request:
 *    - Wait on refreshTokenSubject until it emits a non-null token,
 *      then retry the request with that token.
 * 4. If refreshTokenSubject emits EMPTY_TOKEN (refresh failed),
 *    queued requests receive an error instead of hanging forever.
 */
@Injectable()
export class ErrorInterceptorService implements HttpInterceptor {
  private isRefreshing = false;
  private refreshTokenSubject: BehaviorSubject<string | null> = new BehaviorSubject<string | null>(null);

  /** Sentinel value emitted when refresh fails, so queued requests can unblock. */
  private static readonly REFRESH_FAILED = '__REFRESH_FAILED__';

  constructor(
    private tokenService: TokenService,
    private authService: AuthService,
    private router: Router,
    private toast: ToastService
  ) {}

  intercept(req: HttpRequest<unknown>, next: HttpHandler): Observable<HttpEvent<unknown>> {
    return next.handle(req).pipe(
      catchError((error: HttpErrorResponse) => {
        // Case 1: 401 on normal endpoint → try refresh
        if (
          error.status === 401 &&
          !req.url.includes('/auth/refresh') &&
          !req.url.includes('/auth/login')
        ) {
          return this.handle401(req, next);
        }

        // Case 2: 401 on /auth/refresh → refresh token expired/revoked
        if (error.status === 401 && req.url.includes('/auth/refresh')) {
          this.performLogoutAndRedirect();
          return throwError(() => error.error);
        }

        // Case 3: 403/404/500 → toast error, do NOT logout
        if (error.status === 403) {
          this.toast.error('Acceso denegado', error.error?.message || 'No tienes permisos para esta acción');
        } else if (error.status === 404) {
          this.toast.error('No encontrado', error.error?.message || 'El recurso no fue encontrado');
        } else if (error.status >= 500) {
          this.toast.error('Error del servidor', error.error?.message || 'Ocurrió un error interno');
        }

        return throwError(() => error.error || error);
      })
    );
  }

  private handle401(req: HttpRequest<unknown>, next: HttpHandler): Observable<HttpEvent<unknown>> {
    if (!this.isRefreshing) {
      this.isRefreshing = true;
      this.refreshTokenSubject.next(null);

      const rt = this.tokenService.getRefreshToken();
      if (!rt) {
        this.isRefreshing = false;
        this.refreshTokenSubject.next(ErrorInterceptorService.REFRESH_FAILED);
        this.performLogoutAndRedirect();
        return throwError(() => ({ message: 'No refresh token available' }));
      }

      return this.authService.refreshToken(rt).pipe(
        switchMap(res => {
          this.isRefreshing = false;
          this.tokenService.saveTokens(res.data.accessToken, res.data.refreshToken);
          this.refreshTokenSubject.next(res.data.accessToken);
          return next.handle(this.cloneWithToken(req, res.data.accessToken));
        }),
        catchError(err => {
          this.isRefreshing = false;
          // Emit sentinel so queued requests unblock and fail gracefully
          this.refreshTokenSubject.next(ErrorInterceptorService.REFRESH_FAILED);
          this.performLogoutAndRedirect();
          return throwError(() => err?.error || err);
        })
      );
    }

    // Request queued: wait until refreshTokenSubject emits a non-null value
    return this.refreshTokenSubject.pipe(
      filter(token => token !== null),
      take(1),
      switchMap(token => {
        // If refresh failed, reject the queued request instead of retrying
        if (token === ErrorInterceptorService.REFRESH_FAILED) {
          return throwError(() => ({ message: 'Session expired' }));
        }
        return next.handle(this.cloneWithToken(req, token!));
      })
    );
  }

  private cloneWithToken(req: HttpRequest<unknown>, token: string): HttpRequest<unknown> {
    return req.clone({
      setHeaders: { Authorization: `Bearer ${token}` },
    });
  }

  private performLogoutAndRedirect(): void {
    this.toast.error('Sesión expirada', 'Tu sesión ha expirado. Por favor, inicia sesión nuevamente.');
    this.tokenService.clearTokens();
    this.router.navigate(['/auth/login']);
  }
}
