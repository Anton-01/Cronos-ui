import { Component, inject, signal, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule, FormBuilder, Validators } from '@angular/forms';
import { AuthService } from 'src/app/core/services/auth.service';
import { ProfileStateService } from 'src/app/core/services/profile/ProfileStateService';
import { ToastService } from 'src/app/shared/services/toast.service';

@Component({
  selector: 'app-sign-in-method',
  templateUrl: './sign-in-method.component.html',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule],
})
export class SignInMethodComponent implements OnInit {
  public profileState = inject(ProfileStateService);
  private authService = inject(AuthService);
  private toast = inject(ToastService);
  private fb = inject(FormBuilder);

  showChangePasswordForm = signal(false);
  isChangingPassword = signal(false);
  show2FAModal = signal(false);
  isLoading2FA = signal(false);
  twoFactorSetup = signal<{ secret: string; qrCodeUrl: string } | null>(null);

  passwordForm = this.fb.group({
    currentPassword: ['', [Validators.required]],
    newPassword: ['', [Validators.required, Validators.minLength(6)]],
    confirmPassword: ['', [Validators.required]],
  });

  twoFactorCode = this.fb.group({
    code: ['', [Validators.required, Validators.minLength(6)]],
  });

  ngOnInit(): void {
    this.profileState.loadProfile();
  }

  togglePasswordForm(show: boolean): void {
    this.showChangePasswordForm.set(show);
    if (!show) this.passwordForm.reset();
  }

  savePassword(): void {
    if (this.passwordForm.invalid) return;
    if (this.passwordForm.value.newPassword !== this.passwordForm.value.confirmPassword) {
      this.toast.error('Error', 'Las contraseñas no coinciden');
      return;
    }
    this.isChangingPassword.set(true);
    this.authService.changePassword({
      currentPassword: this.passwordForm.value.currentPassword!,
      newPassword: this.passwordForm.value.newPassword!,
      confirmPassword: this.passwordForm.value.confirmPassword!,
    }).subscribe({
      next: () => {
        this.isChangingPassword.set(false);
        this.passwordForm.reset();
        this.showChangePasswordForm.set(false);
        this.toast.success('Contraseña actualizada correctamente');
      },
      error: err => {
        this.isChangingPassword.set(false);
        this.toast.error('Error', err?.message);
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
      next: res => {
        this.twoFactorSetup.set({ secret: res.data.secret, qrCodeUrl: res.data.qrCodeUrl });
        this.isLoading2FA.set(false);
      },
      error: err => {
        this.isLoading2FA.set(false);
        this.toast.error('Error', err?.message);
      },
    });
  }

  verify2FA(): void {
    if (this.twoFactorCode.invalid) return;
    this.authService.verify2FA({ code: Number(this.twoFactorCode.value.code) }).subscribe({
      next: () => {
        this.twoFactorSetup.set(null);
        this.twoFactorCode.reset();
        this.close2FAModal();
        const currentUser = this.profileState.user();
        if (currentUser) {
          this.profileState.updateUserSignal({ ...currentUser, twoFactorEnabled: true });
        }
        this.toast.success('2FA activado correctamente');
      },
      error: err => this.toast.error('Error', err?.message),
    });
  }

  disable2FA(): void {
    if (this.twoFactorCode.invalid) return;
    this.authService.disable2FA({ code: Number(this.twoFactorCode.value.code) }).subscribe({
      next: () => {
        this.twoFactorCode.reset();
        this.close2FAModal();
        const currentUser = this.profileState.user();
        if (currentUser) {
          this.profileState.updateUserSignal({ ...currentUser, twoFactorEnabled: false });
        }
        this.toast.success('2FA desactivado correctamente');
      },
      error: err => this.toast.error('Error', err?.message),
    });
  }
}
