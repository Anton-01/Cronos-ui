import { ChangeDetectionStrategy, Component, OnInit, inject, signal } from '@angular/core';

import { TranslatePipe } from '@ngx-translate/core';
import { ButtonModule } from 'primeng/button';
import { CardModule } from 'primeng/card';
import { DialogModule } from 'primeng/dialog';
import { TableModule } from 'primeng/table';
import { TagModule } from 'primeng/tag';
import { TooltipModule } from 'primeng/tooltip';

import { AuthService } from 'src/app/core/services/auth.service';
import { ActiveSession, LoginHistoryEntry } from 'src/app/core/models/user.model';
import { LanguageService } from 'src/app/core/services/language.service';
import { ConfirmService } from 'src/app/shared/services/confirm.service';
import { ToastService } from 'src/app/shared/services/toast.service';
import { SignInMethodComponent } from './sign-in-method/sign-in-method.component';
import { TableSkeletonRowComponent } from 'src/app/shared/components/table-skeleton-row/table-skeleton-row.component';

/**
 * Security tab of Account Settings: sign-in method (password + 2FA), active
 * sessions and sign-in history. Rendered lazily by the tab shell, so its
 * requests fire the first time the tab is opened, not on page load.
 */
@Component({
  selector: 'app-security-panel',
  standalone: true,
  imports: [
    TranslatePipe,
    ButtonModule,
    CardModule,
    DialogModule,
    TableModule,
    TagModule,
    TooltipModule,
    SignInMethodComponent,
    TableSkeletonRowComponent,
  ],
  templateUrl: './security-panel.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SecurityPanelComponent implements OnInit {
  private readonly authService = inject(AuthService);
  private readonly toastService = inject(ToastService);
  private readonly language = inject(LanguageService);
  private readonly confirmService = inject(ConfirmService);

  // Sessions
  readonly isLoadingSessions = signal(false);
  protected readonly skeletonRows = Array.from({ length: 4 });
  readonly sessions = signal<ActiveSession[]>([]);
  readonly selectedSession = signal<ActiveSession | null>(null);

  // Login history
  readonly isLoadingHistory = signal(false);
  readonly loginHistory = signal<LoginHistoryEntry[]>([]);

  ngOnInit(): void {
    this.loadSessions();
    this.loadLoginHistory();
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
        this.toastService.error(this.language.t('COMMON.TOAST.ERROR'), err?.message);
      },
    });
  }

  async confirmRevokeSession(session: ActiveSession): Promise<void> {
    const confirmed = await this.confirmService.confirm({
      title: this.language.t('ACCOUNT.SECURITY.REVOKE_TITLE'),
      message: this.language.t('ACCOUNT.SECURITY.REVOKE_MESSAGE', {
        browser: session.browser,
        os: session.os,
        ip: session.ipAddress,
      }),
      acceptLabel: this.language.t('ACCOUNT.SECURITY.REVOKE_ACCEPT'),
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
        this.toastService.success(this.language.t('ACCOUNT.SECURITY.SESSION_REVOKED'));
      },
      error: (err) => this.toastService.error(this.language.t('COMMON.TOAST.ERROR'), err?.message),
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
        this.toastService.error(this.language.t('COMMON.TOAST.ERROR'), err?.message);
      },
    });
  }

  formatDate(date: Date | string): string {
    return new Date(date).toLocaleDateString(this.language.current(), {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  }
}
