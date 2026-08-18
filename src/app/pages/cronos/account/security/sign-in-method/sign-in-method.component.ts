import { ChangeDetectionStrategy, Component, OnInit, inject, signal } from '@angular/core';
import { ReactiveFormsModule, FormBuilder, Validators } from '@angular/forms';

import { ButtonModule } from 'primeng/button';
import { DialogModule } from 'primeng/dialog';
import { DividerModule } from 'primeng/divider';
import { InputTextModule } from 'primeng/inputtext';
import { MessageModule } from 'primeng/message';
import { PasswordModule } from 'primeng/password';
import { TagModule } from 'primeng/tag';

import { AuthService } from 'src/app/core/services/auth.service';
import { ProfileStateService } from 'src/app/core/services/profile/ProfileStateService';
import { ToastService } from 'src/app/shared/services/toast.service';

@Component({
  selector: 'app-sign-in-method',
  standalone: true,
  imports: [
    ReactiveFormsModule,
    ButtonModule,
    DialogModule,
    DividerModule,
    InputTextModule,
    MessageModule,
    PasswordModule,
    TagModule,
  ],
  templateUrl: './sign-in-method.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SignInMethodComponent implements OnInit {
  readonly profileState = inject(ProfileStateService);
  private readonly authService = inject(AuthService);
  private readonly toastService = inject(ToastService);
  private readonly fb = inject(FormBuilder);

  readonly showChangePasswordForm = signal(false);
  readonly isChangingPassword = signal(false);
  readonly show2FAModal = signal(false);
  readonly isLoading2FA = signal(false);
  readonly twoFactorSetup = signal<{ secret: string; qrCodeUrl: string } | null>(null);

  readonly passwordForm = this.fb.group({
    currentPassword: ['', [Validators.required]],
    newPassword: ['', [Validators.required, Validators.minLength(6)]],
    confirmPassword: ['', [Validators.required]],
  });

  readonly twoFactorCode = this.fb.group({
    code: ['', [Validators.required, Validators.minLength(6)]],
  });

  ngOnInit(): void {
    this.profileState.loadProfile();
  }

  togglePasswordForm(show: boolean): void {
    this.showChangePasswordForm.set(show);
    if (!show) {
      this.passwordForm.reset();
    }
  }

  savePassword(): void {
    if (this.passwordForm.invalid) {
      return;
    }
    if (this.passwordForm.value.newPassword !== this.passwordForm.value.confirmPassword) {
      this.toastService.error('Error', 'Las contraseñas no coinciden');
      return;
    }
    this.isChangingPassword.set(true);
    this.authService
      .changePassword({
        currentPassword: this.passwordForm.value.currentPassword!,
        newPassword: this.passwordForm.value.newPassword!,
        confirmPassword: this.passwordForm.value.confirmPassword!,
      })
      .subscribe({
        next: () => {
          this.isChangingPassword.set(false);
          this.passwordForm.reset();
          this.showChangePasswordForm.set(false);
          this.toastService.success('Contraseña actualizada correctamente');
        },
        error: (err) => {
          this.isChangingPassword.set(false);
          this.toastService.error('Error', err?.message);
        },
      });
  }

  open2FAModal(): void {
    this.show2FAModal.set(true);
    this.twoFactorSetup.set(null);
    this.twoFactorCode.reset();
  }

  close2FAModal(): void {
    this.show2FAModal.set(false);
    this.twoFactorSetup.set(null);
    this.twoFactorCode.reset();
  }

  setup2FA(): void {
    this.isLoading2FA.set(true);
    this.authService.setup2FA().subscribe({
      next: (res) => {
        this.twoFactorSetup.set({ secret: res.data.secret, qrCodeUrl: res.data.qrCodeUrl });
        this.isLoading2FA.set(false);
      },
      error: (err) => {
        this.isLoading2FA.set(false);
        this.toastService.error('Error', err?.message);
      },
    });
  }

  verify2FA(): void {
    if (this.twoFactorCode.invalid) {
      return;
    }
    this.authService.verify2FA({ code: Number(this.twoFactorCode.value.code) }).subscribe({
      next: () => {
        this.twoFactorSetup.set(null);
        this.twoFactorCode.reset();
        this.close2FAModal();
        const currentUser = this.profileState.user();
        if (currentUser) {
          this.profileState.updateUserSignal({ ...currentUser, twoFactorEnabled: true });
        }
        this.toastService.success('2FA activado correctamente');
      },
      error: (err) => this.toastService.error('Error', err?.message),
    });
  }

  disable2FA(): void {
    if (this.twoFactorCode.invalid) {
      return;
    }
    this.authService.disable2FA({ code: Number(this.twoFactorCode.value.code) }).subscribe({
      next: () => {
        this.twoFactorCode.reset();
        this.close2FAModal();
        const currentUser = this.profileState.user();
        if (currentUser) {
          this.profileState.updateUserSignal({ ...currentUser, twoFactorEnabled: false });
        }
        this.toastService.success('2FA desactivado correctamente');
      },
      error: (err) => this.toastService.error('Error', err?.message),
    });
  }
}
