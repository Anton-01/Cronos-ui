import { ChangeDetectionStrategy, Component, computed, effect, inject, input, model, output, signal, untracked } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { TranslatePipe } from '@ngx-translate/core';
import { ButtonModule } from 'primeng/button';
import { DialogModule } from 'primeng/dialog';
import { InputOtpModule } from 'primeng/inputotp';
import { InputTextModule } from 'primeng/inputtext';
import { MessageModule } from 'primeng/message';
import { PasswordModule } from 'primeng/password';
import { SelectButtonModule } from 'primeng/selectbutton';

import { TwoFactorStatus } from 'src/app/core/models/two-factor.models';
import { triggerBlobDownload } from 'src/app/core/services/domain/import-file.util';
import { LanguageService } from 'src/app/core/services/language.service';
import { TwoFactorService } from 'src/app/core/services/two-factor.service';
import { AlertService } from 'src/app/shared/services/alert.service';
import { copyToClipboard } from 'src/app/shared/utils/clipboard.util';
import { TwoFactorFailure, describeTwoFactorFailure, recoveryCodesFile } from './two-factor-error';

export type TwoFactorManageMode = 'disable' | 'regenerate';
type CodeKind = 'TOTP' | 'RECOVERY';

const RECOVERY_PATTERN = /^[A-Z0-9]{4}-?[A-Z0-9]{4}$/;

/**
 * Re-authenticated 2FA management: turning it off (password + code) and
 * issuing a fresh set of recovery codes (code). Either a 6-digit app code or
 * an unused recovery code proves possession — the latter is what a user who
 * lost their phone still has.
 */
@Component({
  selector: 'app-two-factor-manage-dialog',
  standalone: true,
  imports: [
    FormsModule,
    TranslatePipe,
    ButtonModule,
    DialogModule,
    InputOtpModule,
    InputTextModule,
    MessageModule,
    PasswordModule,
    SelectButtonModule,
  ],
  templateUrl: './two-factor-manage-dialog.component.html',
  styleUrl: './two-factor.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class TwoFactorManageDialogComponent {
  private readonly twoFactor = inject(TwoFactorService);
  private readonly alert = inject(AlertService);
  private readonly language = inject(LanguageService);

  readonly visible = model(false);
  readonly mode = input<TwoFactorManageMode>('disable');
  readonly accountName = input('');
  readonly changed = output<TwoFactorStatus>();

  protected readonly codeKind = signal<CodeKind>('TOTP');
  protected readonly totp = signal('');
  protected readonly recoveryCode = signal('');
  protected readonly password = signal('');
  protected readonly busy = signal(false);
  protected readonly failure = signal<TwoFactorFailure | null>(null);
  protected readonly newCodes = signal<string[] | null>(null);

  protected readonly kindOptions = computed(() => [
    { label: this.language.t('ACCOUNT.TWO_FACTOR.MANAGE.USE_APP'), value: 'TOTP' as CodeKind },
    { label: this.language.t('ACCOUNT.TWO_FACTOR.MANAGE.USE_RECOVERY'), value: 'RECOVERY' as CodeKind },
  ]);
  protected readonly code = computed(() =>
    this.codeKind() === 'TOTP' ? this.totp() : this.recoveryCode().trim().toUpperCase(),
  );
  protected readonly codeValid = computed(() =>
    this.codeKind() === 'TOTP' ? /^\d{6}$/.test(this.totp()) : RECOVERY_PATTERN.test(this.code()),
  );
  protected readonly canSubmit = computed(
    () => !this.busy() && this.codeValid() && (this.mode() === 'regenerate' || this.password().length > 0),
  );

  constructor() {
    effect(() => {
      if (this.visible()) {
        untracked(() => {
          this.codeKind.set('TOTP');
          this.totp.set('');
          this.recoveryCode.set('');
          this.password.set('');
          this.failure.set(null);
          this.newCodes.set(null);
        });
      }
    });
  }

  protected submit(): void {
    if (!this.canSubmit()) {
      return;
    }
    this.busy.set(true);
    this.failure.set(null);
    if (this.mode() === 'disable') {
      this.twoFactor.disable({ password: this.password(), code: this.code() }).subscribe({
        next: (response) => {
          this.busy.set(false);
          this.visible.set(false);
          this.alert.success(this.language.t('ACCOUNT.SIGN_IN.TOAST.TWO_FACTOR_DISABLED'));
          if (response.data) {
            this.changed.emit(response.data);
          }
        },
        error: (error: unknown) => this.fail(error),
      });
      return;
    }
    this.twoFactor.regenerateRecoveryCodes({ code: this.code() }).subscribe({
      next: (response) => {
        this.busy.set(false);
        this.newCodes.set(response.data?.recoveryCodes ?? []);
        if (response.data) {
          this.changed.emit(response.data.status);
        }
      },
      error: (error: unknown) => this.fail(error),
    });
  }

  private fail(error: unknown): void {
    this.busy.set(false);
    const failure = describeTwoFactorFailure(error);
    this.failure.set(failure);
    if (failure.codeRejected) {
      this.totp.set('');
    }
  }

  protected async copyCodes(): Promise<void> {
    if (await copyToClipboard(this.newCodes()?.join('\n') ?? '')) {
      this.alert.info(this.language.t('ACCOUNT.TWO_FACTOR.RECOVERY.COPIED'));
    }
  }

  protected downloadCodes(): void {
    const file = recoveryCodesFile(this.newCodes() ?? [], this.accountName(), this.language.t('ACCOUNT.TWO_FACTOR.RECOVERY.FILE_HEADER'));
    triggerBlobDownload(file, 'cronos-recovery-codes.txt');
  }
}
