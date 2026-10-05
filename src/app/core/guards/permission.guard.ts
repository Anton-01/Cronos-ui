import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';

import { ToastService } from '../../shared/services/toast.service';
import { AuthorizationService } from '../services/authorization.service';
import { LanguageService } from '../services/language.service';
import { TokenService } from '../services/token.service';

/**
 * Route guard for permission-gated screens. `data.permissions` is an any-of
 * list: holding one of them opens the route.
 *
 * ```ts
 * { path: 'admin/roles', canActivate: [permissionGuard], data: { permissions: [PERMISSIONS.IAM_ROLE_READ] } }
 * ```
 */
export const permissionGuard: CanActivateFn = (route) => {
  const tokens = inject(TokenService);
  const authorization = inject(AuthorizationService);
  const router = inject(Router);

  if (!tokens.isLoggedIn()) {
    return router.createUrlTree(['/auth/login']);
  }

  const required = (route.data?.['permissions'] as readonly string[] | undefined) ?? [];
  if (required.length === 0 || authorization.canAny(required)) {
    return true;
  }

  const language = inject(LanguageService);
  inject(ToastService).error(language.t('ERRORS.RESTRICTED_TITLE'), language.t('ERRORS.RESTRICTED'));
  return router.createUrlTree(['/dashboard']);
};
