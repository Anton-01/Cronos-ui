import { ChangeDetectionStrategy, Component, computed, effect, input, model, output, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { TranslatePipe } from '@ngx-translate/core';
import { ButtonModule } from 'primeng/button';
import { DialogModule } from 'primeng/dialog';
import { MessageModule } from 'primeng/message';
import { TextareaModule } from 'primeng/textarea';

export const REASON_MIN_LENGTH = 10;
export const REASON_MAX_LENGTH = 500;

/**
 * Asks for the business justification every privileged change carries into
 * the audit trail (doc §1.5). The parent owns the request: it keeps the
 * dialog open with `saving` while in flight and closes it on success.
 */
@Component({
  selector: 'app-reason-dialog',
  standalone: true,
  imports: [FormsModule, TranslatePipe, ButtonModule, DialogModule, MessageModule, TextareaModule],
  template: `
    <p-dialog
      [header]="title()"
      [visible]="visible()"
      (visibleChange)="onVisibleChange($event)"
      [modal]="true"
      [draggable]="false"
      [style]="{ width: '32rem' }"
      [breakpoints]="{ '640px': '95vw' }"
    >
      <div class="flex flex-column gap-3">
        @if (message()) {
          <p class="m-0 text-color-secondary line-height-3">{{ message() }}</p>
        }
        @if (warning()) {
          <p-message severity="warn" [text]="warning()!" styleClass="w-full" />
        }
        <div class="flex flex-column gap-1">
          <label for="reasonText" class="font-medium">
            {{ 'IAM.REASON.LABEL' | translate }} <span class="text-red-500">*</span>
          </label>
          <textarea
            pTextarea
            id="reasonText"
            rows="3"
            [maxlength]="maxLength"
            [ngModel]="reason()"
            (ngModelChange)="reason.set($event)"
            [placeholder]="'IAM.REASON.PLACEHOLDER' | translate"
            [invalid]="touched() && !isValid()"
            aria-describedby="reasonHint"
          ></textarea>
          <small id="reasonHint" class="flex justify-content-between text-color-secondary">
            <span [class.text-red-500]="touched() && !isValid()">{{ 'IAM.REASON.MIN' | translate: { min: minLength } }}</span>
            <span>{{ reason().trim().length }} / {{ maxLength }}</span>
          </small>
        </div>
      </div>
      <ng-template pTemplate="footer">
        <p-button [label]="'COMMON.CANCEL' | translate" severity="secondary" [outlined]="true" [disabled]="saving()" (onClick)="visible.set(false)" />
        <p-button
          [label]="confirmLabel()"
          [severity]="severity()"
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
export class ReasonDialogComponent {
  readonly visible = model(false);
  readonly title = input.required<string>();
  readonly message = input<string | null>(null);
  readonly warning = input<string | null>(null);
  readonly confirmLabel = input.required<string>();
  readonly severity = input<'primary' | 'danger' | 'warn'>('primary');
  readonly saving = input(false);
  readonly confirmed = output<string>();

  protected readonly minLength = REASON_MIN_LENGTH;
  protected readonly maxLength = REASON_MAX_LENGTH;
  protected readonly reason = signal('');
  protected readonly touched = signal(false);
  protected readonly isValid = computed(() => {
    const length = this.reason().trim().length;
    return length >= REASON_MIN_LENGTH && length <= REASON_MAX_LENGTH;
  });

  constructor() {
    // Fresh text every time the dialog opens.
    effect(() => {
      if (this.visible()) {
        this.reason.set('');
        this.touched.set(false);
      }
    });
  }

  protected submit(): void {
    this.touched.set(true);
    if (!this.isValid() || this.saving()) {
      return;
    }
    this.confirmed.emit(this.reason().trim());
  }

  protected onVisibleChange(visible: boolean): void {
    if (!visible && this.saving()) {
      return;
    }
    this.visible.set(visible);
  }
}
