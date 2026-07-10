import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { ReactiveFormsModule, FormBuilder, Validators } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';

import { ButtonModule } from 'primeng/button';
import { DividerModule } from 'primeng/divider';
import { InputTextModule } from 'primeng/inputtext';
import { MessageModule } from 'primeng/message';
import { PasswordModule } from 'primeng/password';

import { AuthService } from 'src/app/core/services/auth.service';
import { TokenService } from 'src/app/core/services/token.service';
import { ToastService } from 'src/app/shared/services/toast.service';
import { LoginRequest } from 'src/app/core/models/auth.model';

@Component({
  selector: 'app-login',
  standalone: true,
  imports: [ReactiveFormsModule, RouterLink, ButtonModule, DividerModule, InputTextModule, MessageModule, PasswordModule],
  templateUrl: './login.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class LoginComponent {
  private readonly fb = inject(FormBuilder);
  private readonly authService = inject(AuthService);
  private readonly tokenService = inject(TokenService);
  private readonly router = inject(Router);
  private readonly toastService = inject(ToastService);

  readonly isLoading = signal(false);
  readonly errorMessage = signal<string | null>(null);
  readonly showTwoFactor = signal(false);

  readonly loginForm = this.fb.group({
    username: ['', [Validators.required, Validators.minLength(3)]],
    password: ['', [Validators.required, Validators.minLength(3)]],
    twoFactorCode: [''],
  });

  submit(): void {
    if (this.loginForm.invalid) {
      return;
    }

    this.isLoading.set(true);
    this.errorMessage.set(null);

    const request: LoginRequest = {
      username: this.loginForm.value.username!,
      password: this.loginForm.value.password!,
    };

    if (this.showTwoFactor() && this.loginForm.value.twoFactorCode) {
      request.twoFactorCode = Number(this.loginForm.value.twoFactorCode);
    }

    this.authService.login(request).subscribe({
      next: (res) => {
        this.isLoading.set(false);
        if (res.data.requiresTwoFactor) {
          this.showTwoFactor.set(true);
          this.toastService.success('Verificación requerida', 'Ingresa el código de autenticación de dos factores.');
        } else {
          this.tokenService.saveTokens(res.data.accessToken, res.data.refreshToken);
          this.tokenService.saveUserInfo(res.data.username, res.data.email);
          this.router.navigate(['/dashboard']);
        }
      },
      error: (err) => {
        this.isLoading.set(false);
        this.errorMessage.set(err?.message || 'Error al iniciar sesión');
        this.toastService.error('Error', err?.message || 'Credenciales incorrectas');
      },
    });
  }

  loginWithGoogle(): void {
    window.location.href = `${window.location.origin}/oauth2/authorization/google`;
  }

  loginWithFacebook(): void {
    window.location.href = `${window.location.origin}/oauth2/authorization/facebook`;
  }
}
