import { Component, OnInit, OnDestroy } from '@angular/core';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { Subscription } from 'rxjs';
import { AuthService as CronosAuthService } from 'src/app/core/services/auth.service';
import { TokenService } from 'src/app/core/services/token.service';
import { ToastService } from 'src/app/shared/services/toast.service';
import { LoginRequest } from 'src/app/core/models/auth.model';

@Component({
  selector: 'app-login',
  templateUrl: './login.component.html',
  styleUrls: ['./login.component.scss'],
})
export class LoginComponent implements OnInit, OnDestroy {
  loginForm: FormGroup;
  hasError = false;
  errorMessage = '';
  isLoading = false;
  showTwoFactor = false;

  private unsubscribe: Subscription[] = [];

  constructor(
    private fb: FormBuilder,
    private cronosAuth: CronosAuthService,
    private tokenService: TokenService,
    private router: Router,
    private toast: ToastService
  ) {
    if (this.tokenService.isLoggedIn()) {
      this.router.navigate(['/dashboard']);
    }
  }

  ngOnInit(): void {
    this.initForm();
  }

  get f() {
    return this.loginForm.controls;
  }

  initForm() {
    this.loginForm = this.fb.group({
      username: ['', Validators.compose([Validators.required, Validators.minLength(3)])],
      password: ['', Validators.compose([Validators.required, Validators.minLength(3)])],
      twoFactorCode: [''],
    });
  }

  submit() {
    this.hasError = false;
    this.isLoading = true;

    const request: LoginRequest = {
      username: this.f.username.value,
      password: this.f.password.value,
    };

    if (this.showTwoFactor && this.f.twoFactorCode.value) {
      request.twoFactorCode = Number(this.f.twoFactorCode.value);
    }

    const loginSubscr = this.cronosAuth.login(request).subscribe({
      next: res => {
        this.isLoading = false;
        if (res.data.requiresTwoFactor) {
          this.showTwoFactor = true;
          this.toast.success('Verificación requerida', 'Ingresa el código 2FA.');
        } else {
          this.tokenService.saveTokens(res.data.accessToken, res.data.refreshToken);
          this.tokenService.saveUserInfo(res.data.username, res.data.email);
          this.router.navigate(['/dashboard']);
        }
      },
      error: err => {
        this.isLoading = false;
        this.hasError = true;
        this.errorMessage = err?.message || 'Credenciales incorrectas';
        this.toast.error('Error', this.errorMessage);
      },
    });
    this.unsubscribe.push(loginSubscr);
  }

  loginWithGoogle(): void {
    window.location.href = `${window.location.origin}/oauth2/authorization/google`;
  }

  loginWithFacebook(): void {
    window.location.href = `${window.location.origin}/oauth2/authorization/facebook`;
  }

  ngOnDestroy() {
    this.unsubscribe.forEach((sb) => sb.unsubscribe());
  }
}
