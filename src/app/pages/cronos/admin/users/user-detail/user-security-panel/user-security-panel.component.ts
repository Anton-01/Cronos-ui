import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, OnInit, computed, inject, input, output, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { TranslatePipe } from '@ngx-translate/core';
import { ButtonModule } from 'primeng/button';
import { CardModule } from 'primeng/card';
import { DialogModule } from 'primeng/dialog';
import { DividerModule } from 'primeng/divider';
import { MessageModule } from 'primeng/message';
import { RadioButtonModule } from 'primeng/radiobutton';
import { TableLazyLoadEvent, TableModule } from 'primeng/table';
import { TagModule } from 'primeng/tag';
import { ToggleSwitchModule } from 'primeng/toggleswitch';
import { TooltipModule } from 'primeng/tooltip';

import { PERMISSIONS } from 'src/app/core/constants/permissions';
import {
  IamUserDetail,
  LoginAttempt,
  PasswordResetMode,
  PasswordResetResponse,
  UserSession,
} from 'src/app/core/models/iam.models';
import { AuthorizationService } from 'src/app/core/services/authorization.service';
import { IamUserService } from 'src/app/core/services/iam/iam-user.service';
import { LanguageService } from 'src/app/core/services/language.service';
import { catalogErrorMessage } from 'src/app/core/utils/catalog-error.util';
import { TableSkeletonRowComponent } from 'src/app/shared/components/table-skeleton-row/table-skeleton-row.component';
import { AlertService } from 'src/app/shared/services/alert.service';
import { ConfirmService } from 'src/app/shared/services/confirm.service';
import { LOGIN_OUTCOME_SEVERITY, TagSeverity } from '../../../shared/iam-labels';
import { ReasonDialogComponent } from '../../../shared/reason-dialog/reason-dialog.component';

/** Credentials (password, 2FA, invitation), live sessions and the sign-in history. */
@Component({
  selector: 'app-user-security-panel',
  standalone: true,
  imports: [
    DatePipe,
    FormsModule,
    TranslatePipe,
    ButtonModule,
    CardModule,
    DialogModule,
    DividerModule,
    MessageModule,
    RadioButtonModule,
    TableModule,
    TagModule,
    ToggleSwitchModule,
    TooltipModule,
    ReasonDialogComponent,
    TableSkeletonRowComponent,
  ],
  templateUrl: './user-security-panel.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class UserSecurityPanelComponent implements OnInit {
  private readonly userService = inject(IamUserService);
  private readonly authorization = inject(AuthorizationService);
  private readonly alert = inject(AlertService);
  private readonly confirm = inject(ConfirmService);
  private readonly language = inject(LanguageService);

  readonly user = input.required<IamUserDetail>();
  readonly userChanged = output<IamUserDetail>();
  readonly writeFailed = output<unknown>();

  protected readonly outcomeSeverity: Readonly<Record<string, TagSeverity>> = LOGIN_OUTCOME_SEVERITY;
  protected readonly skeletonRows = Array.from({ length: 4 });
  protected readonly canResetCredentials = computed(() => this.authorization.can(PERMISSIONS.IAM_USER_RESET_CREDENTIALS));
  protected readonly canManageSessions = computed(() => this.authorization.can(PERMISSIONS.IAM_USER_MANAGE_SESSIONS));
  protected readonly isSelf = computed(() => this.user().id === this.authorization.currentUserId());
  protected readonly canReceiveReset = computed(() => this.user().status === 'ACTIVE' || this.user().status === 'LOCKED');

  // Password reset dialog
  protected readonly resetOpen = signal(false);
  protected readonly resetMode = signal<PasswordResetMode>('EMAIL_LINK');
  protected readonly resetRevoke = signal(true);
  protected readonly resetBusy = signal(false);
  protected readonly resetResult = signal<PasswordResetResponse | null>(null);

  protected readonly twoFactorOpen = signal(false);
  protected readonly busy = signal<string | null>(null);

  // Sessions
  protected readonly sessions = signal<UserSession[]>([]);
  protected readonly sessionsLoading = signal(true);

  // Login history
  protected readonly attempts = signal<LoginAttempt[]>([]);
  protected readonly attemptsTotal = signal(0);
  protected readonly attemptsLoading = signal(true);

  ngOnInit(): void {
    this.loadSessions();
  }

  // ─── Password ───

  protected openReset(): void {
    this.resetMode.set('EMAIL_LINK');
    this.resetRevoke.set(true);
    this.resetResult.set(null);
    this.resetOpen.set(true);
  }

  protected submitReset(): void {
    this.resetBusy.set(true);
    this.userService.resetPassword(this.user().id, { mode: this.resetMode(), revokeSessions: this.resetRevoke() }).subscribe({
      next: (response) => {
        this.resetBusy.set(false);
        this.resetResult.set(response.data);
        if (this.resetRevoke()) {
          this.loadSessions();
        }
      },
      error: (error: unknown) => {
        this.resetBusy.set(false);
        this.alert.error(catalogErrorMessage(error, this.language.t('IAM.SECURITY.RESET.FAILED')));
      },
    });
  }

  protected async requirePasswordChange(): Promise<void> {
    const confirmed = await this.confirm.confirm({
      title: this.language.t('IAM.SECURITY.FORCE_CHANGE.TITLE'),
      message: this.language.t('IAM.SECURITY.FORCE_CHANGE.MESSAGE', { name: this.user().displayName }),
      icon: 'pi pi-key',
    });
    if (!confirmed) {
      return;
    }
    this.run('force', this.userService.requirePasswordChange(this.user().id), 'IAM.SECURITY.FORCE_CHANGE.DONE');
  }

  protected resetTwoFactor(reason: string): void {
    this.run('2fa', this.userService.resetTwoFactor(this.user().id, { reason }), 'IAM.SECURITY.TWO_FACTOR.DONE', () =>
      this.twoFactorOpen.set(false),
    );
  }

  protected resendInvitation(): void {
    this.run('invite', this.userService.resendInvitation(this.user().id), 'IAM.SECURITY.INVITATION.DONE');
  }

  private run(
    key: string,
    request$: ReturnType<IamUserService['requirePasswordChange']>,
    successKey: string,
    onSuccess?: () => void,
  ): void {
    this.busy.set(key);
    request$.subscribe({
      next: (response) => {
        this.busy.set(null);
        onSuccess?.();
        if (response.data) {
          this.userChanged.emit(response.data);
        }
        this.alert.success(this.language.t(successKey, { email: this.user().email }));
      },
      error: (error: unknown) => {
        this.busy.set(null);
        this.writeFailed.emit(error);
      },
    });
  }

  // ─── Sessions ───

  protected loadSessions(): void {
    if (!this.canManageSessions()) {
      this.sessionsLoading.set(false);
      return;
    }
    this.sessionsLoading.set(true);
    this.userService.sessions(this.user().id).subscribe({
      next: (response) => {
        this.sessions.set(response.data ?? []);
        this.sessionsLoading.set(false);
      },
      error: () => {
        this.sessions.set([]);
        this.sessionsLoading.set(false);
      },
    });
  }

  protected async revokeSession(session: UserSession): Promise<void> {
    const confirmed = await this.confirm.confirm({
      title: this.language.t('IAM.SECURITY.SESSIONS.REVOKE_TITLE'),
      message: this.language.t('IAM.SECURITY.SESSIONS.REVOKE_MESSAGE', { device: `${session.browser} · ${session.os}` }),
      severity: 'danger',
      icon: 'pi pi-sign-out',
    });
    if (!confirmed) {
      return;
    }
    this.userService.revokeSession(this.user().id, session.id).subscribe({
      next: () => {
        this.sessions.update((list) => list.filter((item) => item.id !== session.id));
        this.alert.success(this.language.t('IAM.SECURITY.SESSIONS.REVOKED'));
      },
      error: (error: unknown) => this.alert.error(catalogErrorMessage(error, this.language.t('IAM.COMMON.ACTION_FAILED'))),
    });
  }

  protected async revokeAll(): Promise<void> {
    const confirmed = await this.confirm.confirm({
      title: this.language.t('IAM.SECURITY.SESSIONS.REVOKE_ALL_TITLE'),
      message: this.language.t('IAM.SECURITY.SESSIONS.REVOKE_ALL_MESSAGE', { name: this.user().displayName }),
      severity: 'danger',
      icon: 'pi pi-sign-out',
    });
    if (!confirmed) {
      return;
    }
    this.userService.revokeAllSessions(this.user().id).subscribe({
      next: (response) => {
        this.sessions.set([]);
        this.alert.success(this.language.t('IAM.SECURITY.SESSIONS.REVOKED_ALL', { count: response.data?.revoked ?? 0 }));
      },
      error: (error: unknown) => this.alert.error(catalogErrorMessage(error, this.language.t('IAM.COMMON.ACTION_FAILED'))),
    });
  }

  // ─── Login history ───

  protected loadAttempts(event: TableLazyLoadEvent): void {
    const size = event.rows ?? 10;
    const page = Math.floor((event.first ?? 0) / size);
    this.attemptsLoading.set(true);
    this.userService.loginHistory(this.user().id, page, size).subscribe({
      next: (response) => {
        this.attempts.set(response.data?.content ?? []);
        this.attemptsTotal.set(response.data?.totalElements ?? 0);
        this.attemptsLoading.set(false);
      },
      error: () => {
        this.attempts.set([]);
        this.attemptsLoading.set(false);
      },
    });
  }
}
