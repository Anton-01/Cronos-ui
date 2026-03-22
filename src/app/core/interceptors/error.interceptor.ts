import { HttpErrorResponse, HttpEvent, HttpInterceptorFn, HttpRequest } from '@angular/common/http';
import { inject } from '@angular/core';
import { Router } from '@angular/router';
import { BehaviorSubject, Observable, catchError, filter, switchMap, take, throwError } from 'rxjs';
import { TokenService } from '../services/token.service';
import { AuthService } from '../services/auth.service';
import { AlertService } from '../../shared/services/alert.service';

/**
 * Functional HTTP interceptor for automatic JWT refresh on 401 errors.
 *
 * Uses module-level singletons (isRefreshing + BehaviorSubject) to coordinate
 * concurrent requests: only the first 401 triggers a refresh call, while all
 * subsequent 401s are queued until the refresh completes.
 *
 * If the refresh fails, a REFRESH_FAILED sentinel is emitted so queued
 * requests unblock and fail gracefully instead of hanging forever.
 */

// Module-level singletons for coordinating concurrent refresh
let isRefreshing = false;
const refreshTokenSubject = new BehaviorSubject<string | null>(null);

/** Sentinel value emitted when refresh fails, so queued requests can unblock. */
const REFRESH_FAILED = '__REFRESH_FAILED__';

function cloneWithToken(req: HttpRequest<unknown>, token: string): HttpRequest<unknown> {
  return req.clone({
    setHeaders: { Authorization: `Bearer ${token}` },
  });
}

export const errorInterceptor: HttpInterceptorFn = (req, next) => {
  const tokenService = inject(TokenService);
  const authService = inject(AuthService);
  const router = inject(Router);
  const alertService = inject(AlertService);

  return next(req).pipe(
    catchError((error: HttpErrorResponse) => {
      // Case 1: 401 on normal endpoint → try refresh
      if (
        error.status === 401 &&
        !req.url.includes('/auth/refresh') &&
        !req.url.includes('/auth/login')
      ) {
        return handle401(req, next, tokenService, authService, router, alertService);
      }

      // Case 2: 401 on /auth/refresh → refresh token expired/revoked
      if (error.status === 401 && req.url.includes('/auth/refresh')) {
        performLogoutAndRedirect(tokenService, router, alertService);
        return throwError(() => error.error);
      }

      // Case 3: 403/404/500 → alert error, do NOT logout
      if (error.status === 403) {
        alertService.error(error.error?.message || 'No tienes permisos para esta acción', 'Acceso denegado');
      } else if (error.status === 404) {
        alertService.error(error.error?.message || 'El recurso no fue encontrado', 'No encontrado');
      } else if (error.status >= 500) {
        alertService.error(error.error?.message || 'Ocurrió un error interno', 'Error del servidor');
      }

      // Case 4: propagate error
      return throwError(() => error.error || error);
    })
  );
};

function handle401(
  req: HttpRequest<unknown>,
  next: (req: HttpRequest<unknown>) => Observable<HttpEvent<unknown>>,
  tokenService: TokenService,
  authService: AuthService,
  router: Router,
  alertService: AlertService
): Observable<HttpEvent<unknown>> {
  if (!isRefreshing) {
    isRefreshing = true;
    refreshTokenSubject.next(null);

    const rt = tokenService.getRefreshToken();
    if (!rt) {
      isRefreshing = false;
      refreshTokenSubject.next(REFRESH_FAILED);
      performLogoutAndRedirect(tokenService, router, alertService);
      return throwError(() => ({ message: 'No refresh token available' }));
    }

    return authService.refreshToken(rt).pipe(
      switchMap(res => {
        isRefreshing = false;
        tokenService.saveTokens(res.data.accessToken, res.data.refreshToken);
        refreshTokenSubject.next(res.data.accessToken);
        return next(cloneWithToken(req, res.data.accessToken));
      }),
      catchError(err => {
        isRefreshing = false;
        // Emit sentinel so queued requests unblock and fail gracefully
        refreshTokenSubject.next(REFRESH_FAILED);
        performLogoutAndRedirect(tokenService, router, alertService);
        return throwError(() => err?.error || err);
      })
    );
  }

  // Request queued: wait until refreshTokenSubject emits a non-null value
  return refreshTokenSubject.pipe(
    filter(token => token !== null),
    take(1),
    switchMap(token => {
      // If refresh failed, reject the queued request instead of retrying
      if (token === REFRESH_FAILED) {
        return throwError(() => ({ message: 'Session expired' }));
      }
      return next(cloneWithToken(req, token!));
    })
  );
}

function performLogoutAndRedirect(
  tokenService: TokenService,
  router: Router,
  alertService: AlertService
): void {
  alertService.error('Tu sesión ha expirado. Por favor, inicia sesión nuevamente.', 'Sesión expirada');
  tokenService.clearTokens();
  router.navigate(['/auth/login']);
}
