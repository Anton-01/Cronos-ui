import { ChangeDetectionStrategy, Component, OnInit, computed, inject, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { ActivatedRoute, Router } from '@angular/router';
import { ReactiveFormsModule, FormBuilder, Validators } from '@angular/forms';

import { TranslatePipe } from '@ngx-translate/core';
import { ButtonModule } from 'primeng/button';
import { DividerModule } from 'primeng/divider';
import { MessageModule } from 'primeng/message';
import { PasswordModule } from 'primeng/password';
import { TagModule } from 'primeng/tag';
import { TooltipModule } from 'primeng/tooltip';

import { AuthService } from 'src/app/core/services/auth.service';
import { TokenService } from 'src/app/core/services/token.service';
import { TwoFactorService } from 'src/app/core/services/two-factor.service';
import { TwoFactorStatus } from 'src/app/core/models/two-factor.models';
import { TwoFactorEnrollmentDialogComponent } from '../two-factor/two-factor-enrollment-dialog.component';
import { TwoFactorManageDialogComponent, TwoFactorManageMode } from '../two-factor/two-factor-manage-dialog.component';
import { ProfileStateService } from 'src/app/core/services/profile/ProfileStateService';
import { LanguageService } from 'src/app/core/services/language.service';
import { ToastService } from 'src/app/shared/services/toast.service';
import { passwordChangeValidator } from 'src/app/shared/validators/password.validators';

@Component({
  selector: 'app-sign-in-method',
  standalone: true,
  imports: [
    DatePipe,
    TranslatePipe,
    ReactiveFormsModule,
    ButtonModule,
    DividerModule,
    MessageModule,
    PasswordModule,
    TagModule,
    TooltipModule,
    TwoFactorEnrollmentDialogComponent,
    TwoFactorManageDialogComponent,
  ],
  templateUrl: './sign-in-method.component.html',
  styles: `
    .tf-status-icon {
      display: inline-flex;
      flex-shrink: 0;
      align-items: center;
      justify-content: center;
      width: 2.5rem;
      height: 2.5rem;
      border-radius: 50%;
      background: color-mix(in srgb, var(--p-amber-500) 15%, transparent);
      color: var(--p-amber-600);
    }

    .tf-status-icon-on {
      background: color-mix(in srgb, var(--p-green-500) 15%, transparent);
      color: var(--p-green-600);
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SignInMethodComponent implements OnInit {
  readonly profileState = inject(ProfileStateService);
  private readonly authService = inject(AuthService);
  private readonly toastService = inject(ToastService);
  private readonly language = inject(LanguageService);
  private readonly fb = inject(FormBuilder);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly tokenService = inject(TokenService);

  /** Arrived here because the backend blocked the app until 2FA is enrolled (`?enroll2fa=1`). */
  readonly enrollmentRequired = signal(this.route.snapshot.queryParamMap.get('enroll2fa') === '1');

  readonly showChangePasswordForm = signal(false);
  readonly isChangingPassword = signal(false);
  private readonly twoFactor = inject(TwoFactorService);

  /** Server view of the user's 2FA; `null` until loaded or when the endpoint is unavailable. */
  readonly twoFactorStatus = signal<TwoFactorStatus | null>(null);
  readonly twoFactorLoading = signal(true);
  readonly enrollOpen = signal(false);
  readonly manageOpen = signal(false);
  readonly manageMode = signal<TwoFactorManageMode>('disable');

  /** Falls back to the profile flag if the status endpoint is not deployed yet. */
  readonly twoFactorEnabled = computed(() => this.twoFactorStatus()?.enabled ?? this.profileState.user()?.twoFactorEnabled ?? false);
  readonly twoFactorRequired = computed(() => this.twoFactorStatus()?.required ?? this.enrollmentRequired());
  readonly accountName = computed(() => this.profileState.user()?.email ?? '');

  readonly passwordForm = this.fb.nonNullable.group(
    {
      currentPassword: ['', [Validators.required]],
      newPassword: ['', [Validators.required, Validators.minLength(6)]],
      confirmPassword: ['', [Validators.required]],
    },
    { validators: passwordChangeValidator('currentPassword', 'newPassword', 'confirmPassword') },
  );


  ngOnInit(): void {
    this.profileState.loadProfile();
    this.loadTwoFactorStatus();
    if (this.enrollmentRequired()) {
      // Straight into the wizard: there is nothing else this user can do until they enrol.
      this.enrollOpen.set(true);
    }
  }

  togglePasswordForm(show: boolean): void {
    this.showChangePasswordForm.set(show);
    if (!show) {
      this.passwordForm.reset();
    }
  }

  savePassword(): void {
    if (this.passwordForm.invalid) {
      this.passwordForm.markAllAsTouched();
      return;
    }
    this.isChangingPassword.set(true);
    this.authService
      .changePassword(this.passwordForm.getRawValue())
      .subscribe({
        next: () => {
          this.isChangingPassword.set(false);
          this.passwordForm.reset();
          this.showChangePasswordForm.set(false);
          this.toastService.success(this.language.t('ACCOUNT.SIGN_IN.TOAST.PASSWORD_UPDATED'));
        },
        error: (err) => {
          this.isChangingPassword.set(false);
          this.toastService.error(this.language.t('COMMON.TOAST.ERROR'), err?.message);
        },
      });
  }

  private loadTwoFactorStatus(): void {
    this.twoFactorLoading.set(true);
    this.twoFactor.status().subscribe({
      next: (response) => {
        this.twoFactorStatus.set(response.data);
        this.twoFactorLoading.set(false);
      },
      error: () => this.twoFactorLoading.set(false),
    });
  }

  openManage(mode: TwoFactorManageMode): void {
    this.manageMode.set(mode);
    this.manageOpen.set(true);
  }

  onTwoFactorEnabled(status: TwoFactorStatus): void {
    this.applyStatus(status);
    this.toastService.success(this.language.t('ACCOUNT.SIGN_IN.TOAST.TWO_FACTOR_ENABLED'));
    this.refreshSessionAfterEnrollment();
  }

  applyStatus(status: TwoFactorStatus): void {
    this.twoFactorStatus.set(status);
    const currentUser = this.profileState.user();
    if (currentUser) {
      this.profileState.updateUserSignal({ ...currentUser, twoFactorEnabled: status.enabled });
    }
  }

  /**
   * The access token was minted before enrolment (its `2faEnabled` claim is
   * false), so swap it for a fresh one before returning to the blocked page.
   */
  private refreshSessionAfterEnrollment(): void {
    const refreshToken = this.tokenService.getRefreshToken();
    const finish = () => {
      if (!this.enrollmentRequired()) {
        return;
      }
      this.enrollmentRequired.set(false);
      const returnUrl = this.route.snapshot.queryParamMap.get('returnUrl');
      // Only same-app paths: never follow an absolute URL from the query string.
      const safe = returnUrl && returnUrl.startsWith('/') && !returnUrl.startsWith('//') ? returnUrl : '/dashboard';
      void this.router.navigateByUrl(safe);
    };
    if (!refreshToken) {
      finish();
      return;
    }
    this.authService.refreshToken(refreshToken).subscribe({
      next: (res) => {
        this.tokenService.saveTokens(res.data.accessToken, res.data.refreshToken);
        finish();
      },
      error: () => finish(),
    });
  }

}
