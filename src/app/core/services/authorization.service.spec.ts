import { TestBed } from '@angular/core/testing';

import { PERMISSIONS } from '../constants/permissions';
import { AuthorizationService } from './authorization.service';
import { TokenService } from './token.service';

describe('AuthorizationService', () => {
  let roles: string[];
  let permissions: string[];
  let service: AuthorizationService;

  beforeEach(() => {
    roles = [];
    permissions = [];
    TestBed.configureTestingModule({
      providers: [
        {
          provide: TokenService,
          useValue: {
            hasRole: (role: string) => roles.includes(role),
            getRoles: () => roles,
            getPermissions: () => permissions,
            hasPermission: (permission: string) => permissions.includes(permission),
            getUserId: () => 'user-1',
          } satisfies Partial<TokenService>,
        },
      ],
    });
    service = TestBed.inject(AuthorizationService);
  });

  it('grants everything to SUPER_ADMIN', () => {
    roles = ['SUPER_ADMIN'];
    expect(service.can(PERMISSIONS.IAM_POLICY_UPDATE)).toBeTrue();
  });

  it('answers from the permissions claim when the token carries one', () => {
    roles = ['ADMIN'];
    permissions = [PERMISSIONS.IAM_ROLE_READ];

    expect(service.can(PERMISSIONS.IAM_ROLE_READ)).toBeTrue();
    // The claim is authoritative: the legacy ADMIN mapping must not widen it.
    expect(service.can(PERMISSIONS.IAM_USER_READ)).toBeFalse();
  });

  it('falls back to the legacy role mapping for tokens without the claim', () => {
    roles = ['ADMIN'];

    expect(service.can(PERMISSIONS.IAM_USER_READ)).toBeTrue();
    expect(service.can(PERMISSIONS.IAM_POLICY_UPDATE)).toBeFalse();
  });

  it('canAny is true when at least one permission is held', () => {
    permissions = [PERMISSIONS.FINANCE_TAX_READ];
    expect(service.canAny([PERMISSIONS.FINANCE_CURRENCY_READ, PERMISSIONS.FINANCE_TAX_READ])).toBeTrue();
    expect(service.canAny([PERMISSIONS.FINANCE_CURRENCY_READ])).toBeFalse();
  });
});
