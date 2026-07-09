import { ChangeDetectionStrategy, Component, OnInit, inject, signal } from '@angular/core';

import { ButtonModule } from 'primeng/button';
import { CardModule } from 'primeng/card';
import { DialogModule } from 'primeng/dialog';
import { TableModule } from 'primeng/table';
import { TagModule } from 'primeng/tag';
import { TooltipModule } from 'primeng/tooltip';

import { AuthService } from 'src/app/core/services/auth.service';
import { UserService } from 'src/app/core/services/user.service';
import { ActiveSession, LoginHistoryEntry, UserResponse } from 'src/app/core/models/user.model';
import { PageInfoService } from 'src/app/core/services/page-info.service';
import { ConfirmService } from 'src/app/shared/services/confirm.service';
import { ToastService } from 'src/app/shared/services/toast.service';
import { SignInMethodComponent } from './sign-in-method/sign-in-method.component';

@Component({
  selector: 'app-security',
  standalone: true,
  imports: [ButtonModule, CardModule, DialogModule, TableModule, TagModule, TooltipModule, SignInMethodComponent],
  templateUrl: './security.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SecurityComponent implements OnInit {
  private readonly authService = inject(AuthService);
  private readonly userService = inject(UserService);
  private readonly toastService = inject(ToastService);
  private readonly confirmService = inject(ConfirmService);
  private readonly pageInfoService = inject(PageInfoService);

  // Overview
  readonly user = signal<UserResponse | null>(null);
  readonly isLoadingProfile = signal(false);

  // Sessions
  readonly isLoadingSessions = signal(false);
  readonly sessions = signal<ActiveSession[]>([]);
  readonly selectedSession = signal<ActiveSession | null>(null);

  // Login history
  readonly isLoadingHistory = signal(false);
  readonly loginHistory = signal<LoginHistoryEntry[]>([]);

  ngOnInit(): void {
    this.pageInfoService.updateTitle('Seguridad');
    this.pageInfoService.updateBreadcrumbs([
      { title: 'Inicio', path: '/dashboard', isActive: false },
      { title: 'Cuenta', path: '', isActive: false },
      { title: 'Seguridad', path: '', isActive: true },
    ]);
    this.loadProfile();
    this.loadSessions();
    this.loadLoginHistory();
  }

  loadProfile(): void {
    this.isLoadingProfile.set(true);
    this.userService.getProfile().subscribe({
      next: (res) => {
        this.user.set(res.data);
        this.isLoadingProfile.set(false);
      },
      error: () => this.isLoadingProfile.set(false),
    });
  }

  loadSessions(): void {
    this.isLoadingSessions.set(true);
    this.authService.getActiveSessions().subscribe({
      next: (res) => {
        this.sessions.set(res.data);
        this.isLoadingSessions.set(false);
      },
      error: (err) => {
        this.isLoadingSessions.set(false);
        this.toastService.error('Error', err?.message);
      },
    });
  }

  async confirmRevokeSession(session: ActiveSession): Promise<void> {
    const confirmed = await this.confirmService.confirm({
      title: 'Revocar sesión',
      message: `¿Estás seguro de cerrar la sesión de ${session.browser} en ${session.os} (IP: ${session.ipAddress})?`,
      acceptLabel: 'Sí, revocar',
      severity: 'danger',
      icon: 'pi pi-sign-out',
    });
    if (!confirmed) {
      return;
    }
    this.revokeSession(session);
  }

  private revokeSession(session: ActiveSession): void {
    this.authService.revokeSession(session.id).subscribe({
      next: () => {
        this.sessions.update((list) => list.filter((s) => s.id !== session.id));
        this.toastService.success('Sesión revocada');
      },
      error: (err) => this.toastService.error('Error', err?.message),
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
      next: (res) => {
        this.loginHistory.set(res.data);
        this.isLoadingHistory.set(false);
      },
      error: (err) => {
        this.isLoadingHistory.set(false);
        this.toastService.error('Error', err?.message);
      },
    });
  }

  formatDate(date: Date | string): string {
    return new Date(date).toLocaleDateString('es-MX', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  }
}
