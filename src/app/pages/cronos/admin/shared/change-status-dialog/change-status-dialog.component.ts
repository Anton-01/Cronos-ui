import { ChangeDetectionStrategy, Component, computed, effect, inject, input, model, output } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { toSignal } from '@angular/core/rxjs-interop';
import { TranslatePipe } from '@ngx-translate/core';
import { ButtonModule } from 'primeng/button';
import { DatePickerModule } from 'primeng/datepicker';
import { DialogModule } from 'primeng/dialog';
import { MessageModule } from 'primeng/message';
import { SelectModule } from 'primeng/select';
import { TextareaModule } from 'primeng/textarea';
import { ToggleSwitchModule } from 'primeng/toggleswitch';

import {
  ChangeUserStatusRequest,
  StatusChangeReason,
  TIME_BOUND_STATUSES,
  UserStatus,
} from 'src/app/core/models/iam.models';
import { LanguageService } from 'src/app/core/services/language.service';
import { FieldErrorComponent } from 'src/app/shared/components/field-error/field-error.component';
import { REASON_MAX_LENGTH, REASON_MIN_LENGTH } from '../reason-dialog/reason-dialog.component';
import { statusReasonOptions } from '../iam-labels';

/** The status-change payload minus the optimistic-lock token, which the caller owns. */
export type StatusChange = Omit<ChangeUserStatusRequest, 'version'>;

/**
 * Collects everything a lifecycle transition needs: reason code, comment
 * (mandatory for OTHER), optional auto-revert date for SUSPENDED/LOCKED and
 * whether to kill live sessions. Used for single users and for bulk actions.
 */
@Component({
  selector: 'app-change-status-dialog',
  standalone: true,
  imports: [
    ReactiveFormsModule,
    TranslatePipe,
    ButtonModule,
    DatePickerModule,
    DialogModule,
    MessageModule,
    SelectModule,
    TextareaModule,
    ToggleSwitchModule,
    FieldErrorComponent,
  ],
  template: `
    <p-dialog
      [header]="'IAM.STATUS_DIALOG.TITLE.' + (targetStatus() ?? 'ACTIVE') | translate"
      [visible]="visible()"
      (visibleChange)="onVisibleChange($event)"
      [modal]="true"
      [draggable]="false"
      [style]="{ width: '34rem' }"
      [breakpoints]="{ '640px': '95vw' }"
    >
      <form [formGroup]="form" class="flex flex-column gap-3" (ngSubmit)="submit()">
        <p class="m-0 text-color-secondary line-height-3">
          {{ 'IAM.STATUS_DIALOG.DESCRIPTION.' + (targetStatus() ?? 'ACTIVE') | translate: { subject: subject() } }}
        </p>

        @if (isRestrictive()) {
          <p-message severity="warn" [text]="'IAM.STATUS_DIALOG.SESSIONS_WARNING' | translate" styleClass="w-full" />
        }

        <div class="flex flex-column gap-1">
          <label for="statusReason" class="font-medium">{{ 'IAM.STATUS_DIALOG.REASON' | translate }} <span class="text-red-500">*</span></label>
          <p-select
            inputId="statusReason"
            formControlName="reason"
            [options]="reasonOptions()"
            optionLabel="label"
            optionValue="value"
            [placeholder]="'IAM.STATUS_DIALOG.REASON_PLACEHOLDER' | translate"
            styleClass="w-full"
          />
          <app-field-error [errors]="form.controls.reason.errors" [visible]="form.controls.reason.touched" />
        </div>

        <div class="flex flex-column gap-1">
          <label for="statusComment" class="font-medium">
            {{ 'IAM.STATUS_DIALOG.COMMENT' | translate }}
            @if (commentRequired()) {
              <span class="text-red-500">*</span>
            }
          </label>
          <textarea pTextarea id="statusComment" rows="3" formControlName="comment" [maxlength]="maxLength" [placeholder]="'IAM.REASON.PLACEHOLDER' | translate"></textarea>
          <app-field-error [errors]="form.controls.comment.errors" [visible]="form.controls.comment.touched" />
        </div>

        @if (isTimeBound()) {
          <div class="flex flex-column gap-1">
            <label for="statusUntil" class="font-medium">{{ 'IAM.STATUS_DIALOG.UNTIL' | translate }}</label>
            <p-datepicker
              inputId="statusUntil"
              formControlName="until"
              [showTime]="true"
              hourFormat="24"
              [minDate]="minUntil"
              [showIcon]="true"
              [showClear]="true"
              styleClass="w-full"
              [placeholder]="'IAM.STATUS_DIALOG.UNTIL_PLACEHOLDER' | translate"
            />
            <small class="text-color-secondary">{{ 'IAM.STATUS_DIALOG.UNTIL_HINT' | translate }}</small>
          </div>
        }

        @if (!isRestrictive()) {
          <label class="flex align-items-center gap-2 cursor-pointer">
            <p-toggleswitch formControlName="revokeSessions" />
            <span>{{ 'IAM.STATUS_DIALOG.REVOKE_SESSIONS' | translate }}</span>
          </label>
        }
      </form>
      <ng-template pTemplate="footer">
        <p-button [label]="'COMMON.CANCEL' | translate" severity="secondary" [outlined]="true" [disabled]="saving()" (onClick)="visible.set(false)" />
        <p-button
          [label]="'IAM.STATUS_DIALOG.CONFIRM.' + (targetStatus() ?? 'ACTIVE') | translate"
          [severity]="isRestrictive() ? 'danger' : 'primary'"
          icon="pi pi-check"
          [loading]="saving()"
          [disabled]="saving()"
          (onClick)="submit()"
        />
      </ng-template>
    </p-dialog>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ChangeStatusDialogComponent {
  private readonly fb = inject(FormBuilder);
  private readonly language = inject(LanguageService);

  readonly visible = model(false);
  readonly targetStatus = input<UserStatus | null>(null);
  /** "Juan Pérez" or "3 usuarios" — interpolated into the description. */
  readonly subject = input('');
  readonly saving = input(false);
  readonly confirmed = output<StatusChange>();

  protected readonly maxLength = REASON_MAX_LENGTH;
  protected readonly minUntil = new Date();
  protected readonly reasonOptions = computed(() => statusReasonOptions((key) => this.language.t(key)));

  protected readonly form = this.fb.group({
    reason: this.fb.control<StatusChangeReason | null>(null, Validators.required),
    comment: this.fb.control('', [Validators.maxLength(REASON_MAX_LENGTH)]),
    until: this.fb.control<Date | null>(null),
    revokeSessions: this.fb.nonNullable.control(false),
  });

  private readonly reasonValue = toSignal(this.form.controls.reason.valueChanges, { initialValue: null });
  protected readonly commentRequired = computed(() => this.reasonValue() === 'OTHER');
  protected readonly isTimeBound = computed(() => {
    const status = this.targetStatus();
    return status !== null && TIME_BOUND_STATUSES.includes(status);
  });
  protected readonly isRestrictive = computed(() => {
    const status = this.targetStatus();
    return status === 'SUSPENDED' || status === 'LOCKED' || status === 'DEACTIVATED';
  });

  constructor() {
    effect(() => {
      if (this.visible()) {
        this.form.reset({ reason: null, comment: '', until: null, revokeSessions: false });
      }
    });
    effect(() => {
      const comment = this.form.controls.comment;
      comment.setValidators(
        this.commentRequired()
          ? [Validators.required, Validators.minLength(REASON_MIN_LENGTH), Validators.maxLength(REASON_MAX_LENGTH)]
          : [Validators.maxLength(REASON_MAX_LENGTH)],
      );
      comment.updateValueAndValidity({ emitEvent: false });
    });
  }

  protected submit(): void {
    const status = this.targetStatus();
    if (!status || this.saving()) {
      return;
    }
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    const { reason, comment, until, revokeSessions } = this.form.getRawValue();
    this.confirmed.emit({
      status,
      reason: reason!,
      comment: comment?.trim() || null,
      until: this.isTimeBound() && until ? until.toISOString() : null,
      revokeSessions: this.isRestrictive() || revokeSessions,
    });
  }

  protected onVisibleChange(visible: boolean): void {
    if (!visible && this.saving()) {
      return;
    }
    this.visible.set(visible);
  }
}
