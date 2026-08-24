import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterLink } from '@angular/router';

import { TranslatePipe } from '@ngx-translate/core';
import { ButtonModule } from 'primeng/button';
import { MessageModule } from 'primeng/message';

@Component({
  selector: 'app-forgot-password',
  standalone: true,
  imports: [RouterLink, TranslatePipe, ButtonModule, MessageModule],
  template: `
    <h3 class="m-0 mb-3 text-center text-lg font-semibold text-color">
      {{ 'AUTH.FORGOT_PASSWORD.TITLE' | translate }}
    </h3>
    <div class="flex flex-column gap-3">
      <p-message severity="info" [text]="'AUTH.FORGOT_PASSWORD.MESSAGE' | translate" />
      <p-button
        [label]="'AUTH.FORGOT_PASSWORD.BACK_TO_LOGIN' | translate"
        icon="pi pi-arrow-left"
        severity="secondary"
        [outlined]="true"
        styleClass="w-full"
        routerLink="/auth/login"
      />
    </div>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ForgotPasswordComponent {}
