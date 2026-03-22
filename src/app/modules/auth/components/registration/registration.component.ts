import { Component, OnInit, OnDestroy } from '@angular/core';
import { FormGroup, FormBuilder, Validators, AbstractControl, ValidationErrors } from '@angular/forms';
import { Subscription } from 'rxjs';
import { Router } from '@angular/router';
import { AuthService as CronosAuthService } from 'src/app/core/services/auth.service';
import { TokenService } from 'src/app/core/services/token.service';
import { ToastService } from 'src/app/shared/services/toast.service';

@Component({
  selector: 'app-registration',
  templateUrl: './registration.component.html',
  styleUrls: ['./registration.component.scss'],
})
export class RegistrationComponent implements OnInit, OnDestroy {
  registrationForm: FormGroup;
  hasError = false;
  errorMessage = '';
  isLoading = false;

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
    return this.registrationForm.controls;
  }

  initForm() {
    this.registrationForm = this.fb.group(
      {
        username: ['', Validators.compose([Validators.required, Validators.minLength(3)])],
        email: ['', Validators.compose([Validators.required, Validators.email])],
        firstName: [''],
        lastName: [''],
        phoneNumber: [''],
        password: ['', Validators.compose([Validators.required, Validators.minLength(6)])],
        confirmPassword: ['', Validators.compose([Validators.required])],
        agree: [false, Validators.requiredTrue],
      },
      { validators: [this.passwordMatchValidator] }
    );
  }

  passwordMatchValidator(control: AbstractControl): ValidationErrors | null {
    const password = control.get('password')?.value;
    const confirm = control.get('confirmPassword')?.value;
    if (password && confirm && password !== confirm) {
      return { passwordMismatch: true };
    }
    return null;
  }

  submit() {
    this.hasError = false;
    this.isLoading = true;

    const registrationSubscr = this.cronosAuth
      .register({
        username: this.f.username.value,
        email: this.f.email.value,
        password: this.f.password.value,
        firstName: this.f.firstName.value || undefined,
        lastName: this.f.lastName.value || undefined,
        phoneNumber: this.f.phoneNumber.value || undefined,
      })
      .subscribe({
        next: () => {
          this.isLoading = false;
          this.toast.success('Registro exitoso', 'Tu cuenta ha sido creada. Inicia sesión.');
          this.router.navigate(['/auth/login']);
        },
        error: err => {
          this.isLoading = false;
          this.hasError = true;
          this.errorMessage = err?.message || 'Error al registrar';
          this.toast.error('Error', this.errorMessage);
        },
      });
    this.unsubscribe.push(registrationSubscr);
  }

  ngOnDestroy() {
    this.unsubscribe.forEach((sb) => sb.unsubscribe());
  }
}
