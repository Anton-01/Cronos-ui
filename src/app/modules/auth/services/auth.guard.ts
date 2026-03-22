import { Injectable } from '@angular/core';
import { ActivatedRouteSnapshot, Router, RouterStateSnapshot } from '@angular/router';
import { TokenService } from 'src/app/core/services/token.service';

@Injectable({ providedIn: 'root' })
export class AuthGuard {
  constructor(
    private tokenService: TokenService,
    private router: Router
  ) {}

  canActivate(route: ActivatedRouteSnapshot, state: RouterStateSnapshot) {
    if (this.tokenService.isLoggedIn()) {
      return true;
    }

    this.router.navigate(['/auth/login']);
    return false;
  }
}
