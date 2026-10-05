import { NgTemplateOutlet } from '@angular/common';
import { ChangeDetectionStrategy, Component, DestroyRef, computed, effect, inject, input, model, output, signal, untracked } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { TranslatePipe } from '@ngx-translate/core';
import { ButtonModule } from 'primeng/button';
import { CheckboxModule } from 'primeng/checkbox';
import { DialogModule } from 'primeng/dialog';
import { InputOtpModule } from 'primeng/inputotp';
import { MessageModule } from 'primeng/message';
import { SkeletonModule } from 'primeng/skeleton';
import { TooltipModule } from 'primeng/tooltip';
import { Subscription, interval } from 'rxjs';

import { TwoFactorEnrollment, TwoFactorRecoveryCodes, TwoFactorStatus } from 'src/app/core/models/two-factor.models';
import { triggerBlobDownload } from 'src/app/core/services/domain/import-file.util';
import { LanguageService } from 'src/app/core/services/language.service';
import { TwoFactorService } from 'src/app/core/services/two-factor.service';
import { AlertService } from 'src/app/shared/services/alert.service';
import { copyToClipboard } from 'src/app/shared/utils/clipboard.util';
import { TwoFactorFailure, describeTwoFactorFailure, groupSecret, recoveryCodesFile } from './two-factor-error';

type Step = 1 | 2 | 3 | 4;

const CODE_LENGTH = 6;
const QR_DATA_URI = /^data:image\/(png|svg\+xml);base64,[A-Za-z0-9+/=]+$/;

/**
 * Four-step TOTP enrolment: get an app → scan → verify → save recovery codes.
 *
 * The pending enrolment is requested once per opening and shown with its
 * expiry; nothing is active on the server until step 3 succeeds. Step 4
 * cannot be closed until the user confirms they stored the codes, because
 * the server never shows them again.
 */
@Component({
  selector: 'app-two-factor-enrollment-dialog',
  standalone: true,
  imports: [
    NgTemplateOutlet,
    FormsModule,
    TranslatePipe,
    ButtonModule,
    CheckboxModule,
    DialogModule,
    InputOtpModule,
    MessageModule,
    SkeletonModule,
    TooltipModule,
  ],
  templateUrl: './two-factor-enrollment-dialog.component.html',
  styleUrl: './two-factor.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class TwoFactorEnrollmentDialogComponent {
  private readonly twoFactor = inject(TwoFactorService);
  private readonly alert = inject(AlertService);
  private readonly language = inject(LanguageService);

  readonly visible = model(false);
  /** Opened because the backend blocked the app — changes the copy, not the flow. */
  readonly mandatory = input(false);
  readonly enabled = output<TwoFactorStatus>();

  protected readonly codeLength = CODE_LENGTH;
  protected readonly step = signal<Step>(1);
  protected readonly enrollment = signal<TwoFactorEnrollment | null>(null);
  protected readonly loadingEnrollment = signal(false);
  protected readonly enrollmentFailure = signal<TwoFactorFailure | null>(null);
  protected readonly code = signal('');
  protected readonly verifying = signal(false);
  protected readonly verifyFailure = signal<TwoFactorFailure | null>(null);
  protected readonly result = signal<TwoFactorRecoveryCodes | null>(null);
  protected readonly acknowledged = signal(false);
  protected readonly secondsLeft = signal(0);
  protected readonly showSecret = signal(false);

  protected readonly qrSrc = computed(() => {
    const uri = this.enrollment()?.qrCodeDataUri ?? '';
    return QR_DATA_URI.test(uri) ? uri : null;
  });
  protected readonly groupedSecret = computed(() => groupSecret(this.enrollment()?.secret ?? ''));
  protected readonly expired = computed(() => this.enrollment() !== null && this.secondsLeft() <= 0);
  protected readonly countdown = computed(() => {
    const seconds = Math.max(0, this.secondsLeft());
    return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
  });
  protected readonly canClose = computed(() => this.step() !== 4 || this.acknowledged());

  private ticker: Subscription | null = null;

  constructor() {
    effect(() => {
      if (this.visible()) {
        untracked(() => this.reset());
      }
    });
    inject(DestroyRef).onDestroy(() => this.ticker?.unsubscribe());
  }

  private reset(): void {
    this.step.set(1);
    this.enrollment.set(null);
    this.enrollmentFailure.set(null);
    this.code.set('');
    this.verifyFailure.set(null);
    this.result.set(null);
    this.acknowledged.set(false);
    this.showSecret.set(false);
    this.requestEnrollment();
  }

  // ─── Enrollment ───

  protected requestEnrollment(): void {
    if (this.loadingEnrollment()) {
      return;
    }
    this.loadingEnrollment.set(true);
    this.enrollmentFailure.set(null);
    this.twoFactor.startEnrollment().subscribe({
      next: (response) => {
        this.loadingEnrollment.set(false);
        this.enrollment.set(response.data);
        this.code.set('');
        this.verifyFailure.set(null);
        this.startCountdown();
      },
      error: (error: unknown) => {
        this.loadingEnrollment.set(false);
        this.enrollmentFailure.set(describeTwoFactorFailure(error));
      },
    });
  }

  private startCountdown(): void {
    this.ticker?.unsubscribe();
    const expiresAt = this.enrollment()?.expiresAt;
    if (!expiresAt) {
      return;
    }
    const update = () => this.secondsLeft.set(Math.round((new Date(expiresAt).getTime() - Date.now()) / 1000));
    update();
    this.ticker = interval(1000).subscribe(update);
  }

  protected async copySecret(): Promise<void> {
    const copied = await copyToClipboard(this.enrollment()?.secret ?? '');
    if (copied) {
      this.alert.info(this.language.t('ACCOUNT.TWO_FACTOR.SCAN.COPIED'));
    }
  }

  // ─── Verify ───

  protected onCodeChange(value: string | null): void {
    const digits = (value ?? '').replace(/\D/g, '').slice(0, CODE_LENGTH);
    this.code.set(digits);
    this.verifyFailure.set(null);
    // Authenticator users expect the form to submit itself on the last digit.
    if (digits.length === CODE_LENGTH) {
      this.verify();
    }
  }

  protected verify(): void {
    const enrollment = this.enrollment();
    if (!enrollment || this.verifying() || this.code().length !== CODE_LENGTH) {
      return;
    }
    if (this.expired()) {
      this.verifyFailure.set({ titleKey: 'ACCOUNT.TWO_FACTOR.ERRORS.EXPIRED', detail: null, traceId: null, codeRejected: false });
      return;
    }
    this.verifying.set(true);
    this.twoFactor.confirmEnrollment({ enrollmentId: enrollment.enrollmentId, code: this.code() }).subscribe({
      next: (response) => {
        this.verifying.set(false);
        this.ticker?.unsubscribe();
        this.result.set(response.data);
        this.step.set(4);
      },
      error: (error: unknown) => {
        this.verifying.set(false);
        const failure = describeTwoFactorFailure(error);
        this.verifyFailure.set(failure);
        if (failure.codeRejected) {
          this.code.set('');
        }
      },
    });
  }

  // ─── Recovery codes ───

  protected async copyCodes(): Promise<void> {
    const copied = await copyToClipboard(this.result()?.recoveryCodes.join('\n') ?? '');
    if (copied) {
      this.alert.info(this.language.t('ACCOUNT.TWO_FACTOR.RECOVERY.COPIED'));
    }
  }

  protected downloadCodes(): void {
    const codes = this.result()?.recoveryCodes ?? [];
    const file = recoveryCodesFile(codes, this.enrollment()?.accountName ?? '', this.language.t('ACCOUNT.TWO_FACTOR.RECOVERY.FILE_HEADER'));
    triggerBlobDownload(file, 'cronos-recovery-codes.txt');
  }

  protected finish(): void {
    const result = this.result();
    if (!result || !this.acknowledged()) {
      return;
    }
    this.visible.set(false);
    this.enabled.emit(result.status);
  }

  protected onVisibleChange(visible: boolean): void {
    if (!visible && !this.canClose()) {
      return;
    }
    if (!visible) {
      this.ticker?.unsubscribe();
    }
    this.visible.set(visible);
  }
}
