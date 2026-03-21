import { HttpErrorResponse, HttpEvent, HttpInterceptorFn, HttpRequest } from '@angular/common/http';
import { inject } from '@angular/core';
import { Router } from '@angular/router';
import { BehaviorSubject, Observable, catchError, filter, switchMap, take, throwError } from 'rxjs';
import { TokenService } from '../services/token.service';
import { AuthService } from '../services/auth.service';
import { ToastService } from '../../shared/services/toast.service';

// Module-level singletons for coordinating concurrent refresh
let isRefreshing = false;
let refreshTokenSubject: BehaviorSubject<string | null> = new BehaviorSubject<string | null>(null);

function cloneWithToken(req: HttpRequest<unknown>, token: string): HttpRequest<unknown> {
  return req.clone({
    setHeaders: { Authorization: `Bearer ${token}` },
  });
}

export const errorInterceptor: HttpInterceptorFn = (req, next) => {
  const tokenService = inject(TokenService);
  const authService = inject(AuthService);
  const router = inject(Router);
  const toast = inject(ToastService);

  return next(req).pipe(
    catchError((error: HttpErrorResponse) => {
      // Case 1: 401 on normal endpoint → try refresh
      if (
        error.status === 401 &&
        !req.url.includes('/auth/refresh') &&
        !req.url.includes('/auth/login')
      ) {
        return handle401(req, next, tokenService, authService, router, toast);
      }

      // Case 2: 401 on /auth/refresh → refresh token expired/revoked
      if (error.status === 401 && req.url.includes('/auth/refresh')) {
        performLogoutAndRedirect(tokenService, router, toast);
        return throwError(() => error.error);
      }

      // Case 3: 403/404/500 → toast error, do NOT logout
      if (error.status === 403) {
        toast.error('Acceso denegado', error.error?.message || 'No tienes permisos para esta acción');
      } else if (error.status === 404) {
        toast.error('No encontrado', error.error?.message || 'El recurso no fue encontrado');
      } else if (error.status >= 500) {
        toast.error('Error del servidor', error.error?.message || 'Ocurrió un error interno');
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
  toast: ToastService
): Observable<HttpEvent<unknown>> {
  if (!isRefreshing) {
    isRefreshing = true;
    refreshTokenSubject.next(null);

    const rt = tokenService.getRefreshToken();
    if (!rt) {
      isRefreshing = false;
      performLogoutAndRedirect(tokenService, router, toast);
      return throwError(() => ({ message: 'No refresh token' }));
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
        performLogoutAndRedirect(tokenService, router, toast);
        return throwError(() => err?.error);
      })
    );
  }

  // Request queued: wait until refreshTokenSubject emits real token
  return refreshTokenSubject.pipe(
    filter(token => token !== null),
    take(1),
    switchMap(token => next(cloneWithToken(req, token!)))
  );
}

function performLogoutAndRedirect(
  tokenService: TokenService,
  router: Router,
  toast: ToastService
): void {
  toast.error('Sesión expirada', 'Tu sesión ha expirado. Por favor, inicia sesión nuevamente.');
  tokenService.clearTokens();
  router.navigate(['/auth/login']);
}
