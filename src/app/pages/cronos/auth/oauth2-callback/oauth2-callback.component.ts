import { Component, OnInit, inject } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { TokenService } from 'src/app/core/services/token.service';
import { ToastService } from 'src/app/shared/services/toast.service';

@Component({
  selector: 'app-oauth2-callback',
  standalone: true,
  template: `
    <div class="d-flex flex-column flex-center min-vh-100">
      <div class="spinner-border text-primary" role="status">
        <span class="visually-hidden">Procesando...</span>
      </div>
      <p class="mt-4 text-gray-600">Procesando autenticación...</p>
    </div>
  `,
})
export class OAuth2CallbackComponent implements OnInit {
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private tokenService = inject(TokenService);
  private toast = inject(ToastService);

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

      this.toast.success('Bienvenido', 'Inicio de sesión exitoso.');
      this.router.navigate(['/cronos/dashboard']);
    } else {
      this.toast.error('Error', 'No se pudo completar la autenticación.');
      this.router.navigate(['/auth/login']);
    }
  }
}
