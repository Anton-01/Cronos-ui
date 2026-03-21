import { HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { TokenService } from '../services/token.service';

const PUBLIC_URLS = ['/auth/login', '/auth/register', '/auth/refresh'];

export const authInterceptor: HttpInterceptorFn = (req, next) => {
  const tokenService = inject(TokenService);

  // Always add X-Requested-With header
  let modifiedReq = req.clone({
    setHeaders: { 'X-Requested-With': 'XMLHttpRequest' },
  });

  // Skip Bearer for public URLs
  const isPublic = PUBLIC_URLS.some(url => req.url.includes(url));
  if (isPublic) {
    return next(modifiedReq);
  }

  // Add Bearer token if available
  const token = tokenService.getAccessToken();
  if (token) {
    modifiedReq = modifiedReq.clone({
      setHeaders: { Authorization: `Bearer ${token}` },
    });
  }

  return next(modifiedReq);
};
