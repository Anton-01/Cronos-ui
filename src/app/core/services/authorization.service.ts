import { Injectable, inject } from '@angular/core';

import { LEGACY_ROLE_PERMISSIONS } from '../constants/permissions';
import { TokenService } from './token.service';

const SUPER_ADMIN = 'SUPER_ADMIN';

/**
 * The single place the UI asks "may the signed-in user do X?".
 *
 * This is presentation only — it hides buttons and routes the user cannot
 * use. Every endpoint enforces the same codes server-side (doc §1.4); a
 * hidden button is never the security boundary.
 *
 * Reads the token on every call rather than caching: the access token is
 * swapped on refresh, and a stale cache would keep showing revoked actions.
 */
@Injectable({ providedIn: 'root' })
export class AuthorizationService {
  private readonly tokens = inject(TokenService);

  isSuperAdmin(): boolean {
    return this.tokens.hasRole(SUPER_ADMIN);
  }

  can(permission: string): boolean {
    if (this.isSuperAdmin() || this.tokens.hasPermission(permission)) {
      return true;
    }
    // Transitional: tokens minted before the `permissions` claim shipped.
    if (this.tokens.getPermissions().length > 0) {
      return false;
    }
    return this.tokens.getRoles().some((role) => LEGACY_ROLE_PERMISSIONS[role]?.includes(permission) ?? false);
  }

  canAny(permissions: readonly string[]): boolean {
    return permissions.some((permission) => this.can(permission));
  }

  /** The signed-in user's id (JWT `sub`) — used to block self-lockout actions. */
  currentUserId(): string | null {
    return this.tokens.getUserId();
  }
}
