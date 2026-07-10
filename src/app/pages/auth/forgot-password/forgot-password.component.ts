import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterLink } from '@angular/router';

import { ButtonModule } from 'primeng/button';
import { MessageModule } from 'primeng/message';

@Component({
  selector: 'app-forgot-password',
  standalone: true,
  imports: [RouterLink, ButtonModule, MessageModule],
  template: `
    <h3 class="m-0 mb-3 text-center text-lg font-semibold text-color">Recuperar Contraseña</h3>
    <div class="flex flex-column gap-3">
      <p-message
        severity="info"
        text="La recuperación de contraseña se gestiona con el administrador del sistema. Contáctalo para restablecer tu acceso."
      />
      <p-button label="Volver al inicio de sesión" icon="pi pi-arrow-left" severity="secondary" [outlined]="true" styleClass="w-full" routerLink="/auth/login" />
    </div>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ForgotPasswordComponent {}
