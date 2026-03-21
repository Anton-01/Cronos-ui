import { Component, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule, FormBuilder, Validators } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { AuthService } from 'src/app/core/services/auth.service';
import { TokenService } from 'src/app/core/services/token.service';
import { ToastService } from 'src/app/shared/services/toast.service';
import { LoginRequest } from 'src/app/core/models/auth.model';
import { environment } from 'src/environments/environment';

@Component({
  selector: 'app-cronos-login',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, RouterLink],
  templateUrl: './login.component.html',
})
export class CronosLoginComponent {
  private fb = inject(FormBuilder);
  private authService = inject(AuthService);
  private tokenService = inject(TokenService);
  private router = inject(Router);
  private toast = inject(ToastService);

  isLoading = signal(false);
  errorMessage = signal<string | null>(null);
  showTwoFactor = signal(false);

  loginForm = this.fb.group({
    username: ['', [Validators.required, Validators.minLength(3)]],
    password: ['', [Validators.required, Validators.minLength(3)]],
    twoFactorCode: [''],
  });

  submit(): void {
    if (this.loginForm.invalid) return;

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
      next: res => {
        this.isLoading.set(false);
        if (res.data.requiresTwoFactor) {
          this.showTwoFactor.set(true);
          this.toast.success('Verificación requerida', 'Ingresa el código de autenticación de dos factores.');
        } else {
          this.tokenService.saveTokens(res.data.accessToken, res.data.refreshToken);
          this.tokenService.saveUserInfo(res.data.username, res.data.email);
          this.router.navigate(['/cronos/dashboard']);
        }
      },
      error: err => {
        this.isLoading.set(false);
        this.errorMessage.set(err?.message || 'Error al iniciar sesión');
        this.toast.error('Error', err?.message || 'Credenciales incorrectas');
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
