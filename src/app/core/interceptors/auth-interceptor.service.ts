import { Injectable } from '@angular/core';
import { HttpInterceptor, HttpRequest, HttpHandler, HttpEvent } from '@angular/common/http';
import { Observable } from 'rxjs';
import { TokenService } from '../services/token.service';

const PUBLIC_URLS = ['/auth/login', '/auth/register', '/auth/refresh', '/public/recipes/share'];

@Injectable()
export class AuthInterceptorService implements HttpInterceptor {
  constructor(private tokenService: TokenService) {}

  intercept(req: HttpRequest<unknown>, next: HttpHandler): Observable<HttpEvent<unknown>> {
    // Always add X-Requested-With header
    let modifiedReq = req.clone({
      setHeaders: { 'X-Requested-With': 'XMLHttpRequest' },
    });

    // Skip Bearer for public URLs
    const isPublic = PUBLIC_URLS.some(url => req.url.includes(url));
    if (isPublic) {
      return next.handle(modifiedReq);
    }

    // Add Bearer token if available
    const token = this.tokenService.getAccessToken();
    if (token) {
      modifiedReq = modifiedReq.clone({
        setHeaders: { Authorization: `Bearer ${token}` },
      });
    }

    return next.handle(modifiedReq);
  }
}
