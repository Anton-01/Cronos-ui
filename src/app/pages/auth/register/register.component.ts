import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import {
  ReactiveFormsModule,
  FormBuilder,
  Validators,
  AbstractControl,
  ValidationErrors,
} from '@angular/forms';
import { Router, RouterLink } from '@angular/router';

import { ButtonModule } from 'primeng/button';
import { InputTextModule } from 'primeng/inputtext';
import { MessageModule } from 'primeng/message';
import { PasswordModule } from 'primeng/password';

import { AuthService } from 'src/app/core/services/auth.service';
import { ToastService } from 'src/app/shared/services/toast.service';

@Component({
  selector: 'app-register',
  standalone: true,
  imports: [ReactiveFormsModule, RouterLink, ButtonModule, InputTextModule, MessageModule, PasswordModule],
  templateUrl: './register.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class RegisterComponent {
  private readonly fb = inject(FormBuilder);
  private readonly authService = inject(AuthService);
  private readonly router = inject(Router);
  private readonly toastService = inject(ToastService);

  readonly isLoading = signal(false);
  readonly errorMessage = signal<string | null>(null);

  readonly registerForm = this.fb.group(
    {
      username: ['', [Validators.required, Validators.minLength(3)]],
      email: ['', [Validators.required, Validators.email]],
      password: ['', [Validators.required, Validators.minLength(6)]],
      confirmPassword: ['', [Validators.required]],
      firstName: [''],
      lastName: [''],
      phoneNumber: [''],
    },
    { validators: [this.passwordMatchValidator] }
  );

  passwordMatchValidator(control: AbstractControl): ValidationErrors | null {
    const password = control.get('password')?.value;
    const confirm = control.get('confirmPassword')?.value;
    if (password && confirm && password !== confirm) {
      return { passwordMismatch: true };
    }
    return null;
  }

  submit(): void {
    if (this.registerForm.invalid) {
      return;
    }

    this.isLoading.set(true);
    this.errorMessage.set(null);

    const formValue = this.registerForm.value;

    this.authService
      .register({
        username: formValue.username!,
        email: formValue.email!,
        password: formValue.password!,
        firstName: formValue.firstName || undefined,
        lastName: formValue.lastName || undefined,
        phoneNumber: formValue.phoneNumber || undefined,
      })
      .subscribe({
        next: () => {
          this.isLoading.set(false);
          this.toastService.success('Registro exitoso', 'Tu cuenta ha sido creada. Inicia sesión.');
          this.router.navigate(['/auth/login']);
        },
        error: (err) => {
          this.isLoading.set(false);
          this.errorMessage.set(err?.message || 'Error al registrar');
          this.toastService.error('Error', err?.message || 'No se pudo completar el registro');
        },
      });
  }
}
