import { ChangeDetectionStrategy, Component, OnInit, inject, signal } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { ReactiveFormsModule, FormBuilder, Validators } from '@angular/forms';

import { TranslatePipe } from '@ngx-translate/core';
import { ButtonModule } from 'primeng/button';
import { DialogModule } from 'primeng/dialog';
import { DividerModule } from 'primeng/divider';
import { InputTextModule } from 'primeng/inputtext';
import { MessageModule } from 'primeng/message';
import { PasswordModule } from 'primeng/password';
import { TagModule } from 'primeng/tag';

import { AuthService } from 'src/app/core/services/auth.service';
import { TokenService } from 'src/app/core/services/token.service';
import { ProfileStateService } from 'src/app/core/services/profile/ProfileStateService';
import { LanguageService } from 'src/app/core/services/language.service';
import { ToastService } from 'src/app/shared/services/toast.service';
import { passwordChangeValidator } from 'src/app/shared/validators/password.validators';

@Component({
  selector: 'app-sign-in-method',
  standalone: true,
  imports: [
    TranslatePipe,
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
  private readonly language = inject(LanguageService);
  private readonly fb = inject(FormBuilder);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly tokenService = inject(TokenService);

  /** Arrived here because the backend blocked the app until 2FA is enrolled (`?enroll2fa=1`). */
  readonly enrollmentRequired = signal(this.route.snapshot.queryParamMap.get('enroll2fa') === '1');

  readonly showChangePasswordForm = signal(false);
  readonly isChangingPassword = signal(false);
  readonly show2FAModal = signal(false);
  readonly isLoading2FA = signal(false);
  readonly twoFactorSetup = signal<{ secret: string; qrCodeUrl: string } | null>(null);

  readonly passwordForm = this.fb.nonNullable.group(
    {
      currentPassword: ['', [Validators.required]],
      newPassword: ['', [Validators.required, Validators.minLength(6)]],
      confirmPassword: ['', [Validators.required]],
    },
    { validators: passwordChangeValidator('currentPassword', 'newPassword', 'confirmPassword') },
  );

  readonly twoFactorCode = this.fb.group({
    code: ['', [Validators.required, Validators.minLength(6)]],
  });

  ngOnInit(): void {
    this.profileState.loadProfile();
    if (this.enrollmentRequired()) {
      // Straight to the QR: there is nothing else this user can do until they enrol.
      this.open2FAModal();
      this.setup2FA();
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
        this.toastService.error(this.language.t('COMMON.TOAST.ERROR'), err?.message);
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
        this.toastService.success(this.language.t('ACCOUNT.SIGN_IN.TOAST.TWO_FACTOR_ENABLED'));
        this.refreshSessionAfterEnrollment();
      },
      error: (err) => this.toastService.error(this.language.t('COMMON.TOAST.ERROR'), err?.message),
    });
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
        this.toastService.success(this.language.t('ACCOUNT.SIGN_IN.TOAST.TWO_FACTOR_DISABLED'));
      },
      error: (err) => this.toastService.error(this.language.t('COMMON.TOAST.ERROR'), err?.message),
    });
  }
}
