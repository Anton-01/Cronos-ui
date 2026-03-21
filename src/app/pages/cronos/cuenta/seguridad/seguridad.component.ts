import { Component, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule, FormBuilder, Validators } from '@angular/forms';
import { AuthService } from 'src/app/core/services/auth.service';
import { ToastService } from 'src/app/shared/services/toast.service';
import { ActiveSession, LoginHistoryEntry } from 'src/app/core/models/user.model';

@Component({
  selector: 'app-seguridad',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule],
  templateUrl: './seguridad.component.html',
})
export class SeguridadComponent {
  private authService = inject(AuthService);
  private toast = inject(ToastService);
  private fb = inject(FormBuilder);

  isChangingPassword = signal(false);
  sessions = signal<ActiveSession[]>([]);
  loginHistory = signal<LoginHistoryEntry[]>([]);
  twoFactorSetup = signal<{ secret: string; qrCodeUrl: string } | null>(null);
  isLoading2FA = signal(false);

  passwordForm = this.fb.group({
    currentPassword: ['', [Validators.required]],
    newPassword: ['', [Validators.required, Validators.minLength(6)]],
    confirmPassword: ['', [Validators.required]],
  });

  twoFactorCode = this.fb.group({
    code: ['', [Validators.required, Validators.minLength(6)]],
  });

  changePassword(): void {
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
        this.toast.success('Contraseña actualizada');
      },
      error: err => {
        this.isChangingPassword.set(false);
        this.toast.error('Error', err?.message);
      },
    });
  }

  loadSessions(): void {
    this.authService.getActiveSessions().subscribe({
      next: res => this.sessions.set(res.data),
      error: err => this.toast.error('Error', err?.message),
    });
  }

  revokeSession(session: ActiveSession): void {
    this.authService.revokeSession(session.id).subscribe({
      next: () => {
        this.sessions.update(list => list.filter(s => s.id !== session.id));
        this.toast.success('Sesión revocada');
      },
      error: err => this.toast.error('Error', err?.message),
    });
  }

  loadLoginHistory(): void {
    this.authService.getLoginHistory().subscribe({
      next: res => this.loginHistory.set(res.data),
      error: err => this.toast.error('Error', err?.message),
    });
  }

  setup2FA(): void {
    this.isLoading2FA.set(true);
    this.authService.setup2FA().subscribe({
      next: res => {
        this.twoFactorSetup.set({ secret: res.data.secret, qrCodeUrl: res.data.qrCodeUrl });
        this.isLoading2FA.set(false);
      },
      error: err => { this.isLoading2FA.set(false); this.toast.error('Error', err?.message); },
    });
  }

  verify2FA(): void {
    if (this.twoFactorCode.invalid) return;
    this.authService.verify2FA({ code: Number(this.twoFactorCode.value.code) }).subscribe({
      next: () => {
        this.twoFactorSetup.set(null);
        this.twoFactorCode.reset();
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
        this.toast.success('2FA desactivado');
      },
      error: err => this.toast.error('Error', err?.message),
    });
  }
}
