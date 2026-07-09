import { ChangeDetectionStrategy, Component, OnInit, inject } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';

import { TokenService } from 'src/app/core/services/token.service';
import { ToastService } from 'src/app/shared/services/toast.service';

@Component({
  selector: 'app-oauth2-callback',
  standalone: true,
  template: `
    <div class="flex flex-column align-items-center justify-content-center gap-3 min-h-screen">
      <i class="pi pi-spinner pi-spin text-3xl text-primary"></i>
      <p class="m-0 text-color-secondary">Procesando autenticación...</p>
    </div>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class OAuth2CallbackComponent implements OnInit {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly tokenService = inject(TokenService);
  private readonly toastService = inject(ToastService);

  ngOnInit(): void {
    const params = this.route.snapshot.queryParams;
    const accessToken = params['accessToken'];
    const refreshToken = params['refreshToken'];

    if (accessToken && refreshToken) {
      this.tokenService.saveTokens(accessToken, refreshToken);

      const payload = this.tokenService.parseJwt(accessToken);
      if (payload) {
        this.tokenService.saveUserInfo(payload.sub, payload.sub);
      }

      this.toastService.success('Bienvenido', 'Inicio de sesión exitoso.');
      this.router.navigate(['/dashboard']);
    } else {
      this.toastService.error('Error', 'No se pudo completar la autenticación.');
      this.router.navigate(['/auth/login']);
    }
  }
}
