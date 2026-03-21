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

@Injectable()
export class ErrorInterceptorService implements HttpInterceptor {
  private isRefreshing = false;
  private refreshTokenSubject: BehaviorSubject<string | null> = new BehaviorSubject<string | null>(null);

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
        this.performLogoutAndRedirect();
        return throwError(() => ({ message: 'No refresh token' }));
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
          this.performLogoutAndRedirect();
          return throwError(() => err?.error);
        })
      );
    }

    // Request queued: wait until refreshTokenSubject emits a real token
    return this.refreshTokenSubject.pipe(
      filter(token => token !== null),
      take(1),
      switchMap(token => next.handle(this.cloneWithToken(req, token!)))
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
