import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { TokenService } from '../services/token.service';
import { ToastService } from '../../shared/services/toast.service';
import { LanguageService } from '../services/language.service';

const ROLE_LEVEL: Record<string, number> = {
  SUPER_ADMIN: 4,
  ADMIN: 3,
  MANAGER: 2,
  USER: 1,
};

export const roleGuard: CanActivateFn = (route) => {
  const tokenService = inject(TokenService);
  const router = inject(Router);
  const toast = inject(ToastService);
  const language = inject(LanguageService);

  if (!tokenService.isLoggedIn()) {
    return router.createUrlTree(['/auth/login']);
  }

  const requiredRole = (route.data?.['role'] as string) ?? 'USER';
  const primaryRole = tokenService.getPrimaryRole();
  const userLevel = ROLE_LEVEL[primaryRole] ?? 0;

  if (userLevel >= (ROLE_LEVEL[requiredRole] ?? 0)) {
    return true;
  }

  toast.error(language.t('ERRORS.RESTRICTED_TITLE'), language.t('ERRORS.RESTRICTED'));
  return router.createUrlTree(['/cronos/dashboard']);
};
