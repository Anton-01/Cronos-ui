import { Component, inject, signal, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { AuthService } from 'src/app/core/services/auth.service';
import { UserService } from 'src/app/core/services/user.service';
import { ToastService } from 'src/app/shared/services/toast.service';
import { ActiveSession, LoginHistoryEntry, UserResponse } from 'src/app/core/models/user.model';
import { SignInMethodComponent } from 'src/app/modules/account/settings/forms/sign-in-method/sign-in-method.component';
import Swal from 'sweetalert2';

@Component({
  selector: 'app-seguridad',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, RouterLink, SignInMethodComponent],
  templateUrl: './seguridad.component.html',
})
export class SeguridadComponent implements OnInit {
  private authService = inject(AuthService);
  private userService = inject(UserService);
  private toast = inject(ToastService);

  // Overview
  user = signal<UserResponse | null>(null);
  isLoadingProfile = signal(false);

  // Sessions
  isLoadingSessions = signal(false);
  sessions = signal<ActiveSession[]>([]);
  selectedSession = signal<ActiveSession | null>(null);

  // Login History
  isLoadingHistory = signal(false);
  loginHistory = signal<LoginHistoryEntry[]>([]);

  ngOnInit(): void {
    this.loadProfile();
    this.loadSessions();
    this.loadLoginHistory();
  }

  loadProfile(): void {
    this.isLoadingProfile.set(true);
    this.userService.getProfile().subscribe({
      next: res => {
        this.user.set(res.data);
        this.isLoadingProfile.set(false);
      },
      error: () => this.isLoadingProfile.set(false),
    });
  }

  loadSessions(): void {
    this.isLoadingSessions.set(true);
    this.authService.getActiveSessions().subscribe({
      next: res => {
        this.sessions.set(res.data);
        this.isLoadingSessions.set(false);
      },
      error: err => {
        this.isLoadingSessions.set(false);
        this.toast.error('Error', err?.message);
      },
    });
  }

  confirmRevokeSession(session: ActiveSession): void {
    Swal.fire({
      title: 'Revocar sesión',
      html: `<p>¿Estás seguro de cerrar esta sesión?</p>
             <p class="text-muted mb-0"><strong>${session.browser}</strong> en <strong>${session.os}</strong></p>
             <p class="text-muted">IP: ${session.ipAddress}</p>`,
      icon: 'warning',
      showCancelButton: true,
      confirmButtonColor: '#f1416c',
      cancelButtonColor: '#b5b5c3',
      confirmButtonText: 'Sí, revocar',
      cancelButtonText: 'Cancelar',
    }).then(result => {
      if (result.isConfirmed) {
        this.revokeSession(session);
      }
    });
  }

  private revokeSession(session: ActiveSession): void {
    this.authService.revokeSession(session.id).subscribe({
      next: () => {
        this.sessions.update(list => list.filter(s => s.id !== session.id));
        this.toast.success('Sesión revocada');
      },
      error: err => this.toast.error('Error', err?.message),
    });
  }

  showSessionDetail(session: ActiveSession): void {
    this.selectedSession.set(session);
  }

  closeSessionDetail(): void {
    this.selectedSession.set(null);
  }

  loadLoginHistory(): void {
    this.isLoadingHistory.set(true);
    this.authService.getLoginHistory().subscribe({
      next: res => {
        this.loginHistory.set(res.data);
        this.isLoadingHistory.set(false);
      },
      error: err => {
        this.isLoadingHistory.set(false);
        this.toast.error('Error', err?.message);
      },
    });
  }
}
