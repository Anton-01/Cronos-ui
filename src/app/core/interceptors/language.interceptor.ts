import { HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { environment } from 'src/environments/environment';
import { LanguageService } from '../services/language.service';

/**
 * Tags every backend call with the user's active locale.
 *
 * The backend resolves its validation and error bundles from
 * `Accept-Language`, so this header is what makes a 400 come back in the
 * language the user is reading. It is set globally rather than per-service:
 * a service that forgets it would return English errors into a Spanish UI.
 *
 * Only requests to our own API are tagged. Static assets — including the
 * `/assets/i18n/*.json` bundles a future `@ngx-translate` loader will
 * fetch — keep their own content negotiation and must not inherit ours.
 */
export const languageInterceptor: HttpInterceptorFn = (req, next) => {
  if (!req.url.startsWith(environment.apiUrl)) {
    return next(req);
  }

  const languageService = inject(LanguageService);

  return next(
    req.clone({
      setHeaders: { 'Accept-Language': languageService.acceptLanguage() },
    }),
  );
};
