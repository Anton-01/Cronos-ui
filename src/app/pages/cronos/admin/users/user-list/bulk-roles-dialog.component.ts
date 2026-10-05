import { ChangeDetectionStrategy, Component, computed, inject, input, output, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { TranslatePipe } from '@ngx-translate/core';
import { ButtonModule } from 'primeng/button';
import { DialogModule } from 'primeng/dialog';
import { MessageModule } from 'primeng/message';
import { MultiSelectModule } from 'primeng/multiselect';
import { TextareaModule } from 'primeng/textarea';

import { BulkResult, IamRoleSummary, IamUserSummary } from 'src/app/core/models/iam.models';
import { IamUserService } from 'src/app/core/services/iam/iam-user.service';
import { LanguageService } from 'src/app/core/services/language.service';
import { catalogErrorMessage } from 'src/app/core/utils/catalog-error.util';
import { AlertService } from 'src/app/shared/services/alert.service';
import { REASON_MAX_LENGTH, REASON_MIN_LENGTH } from '../../shared/reason-dialog/reason-dialog.component';

/** Adds and/or removes roles across the selected users in one audited call. */
@Component({
  selector: 'app-bulk-roles-dialog',
  standalone: true,
  imports: [FormsModule, TranslatePipe, ButtonModule, DialogModule, MessageModule, MultiSelectModule, TextareaModule],
  template: `
    <p-dialog
      [header]="'IAM.USERS.BULK.ROLES' | translate"
      [visible]="true"
      (visibleChange)="!$event && !saving() && done.emit(null)"
      [modal]="true"
      [draggable]="false"
      [style]="{ width: '34rem' }"
      [breakpoints]="{ '640px': '95vw' }"
    >
      <div class="flex flex-column gap-3">
        <p class="m-0 text-color-secondary">{{ 'IAM.USERS.BULK.ROLES_DESCRIPTION' | translate: { count: users().length } }}</p>
        <div class="flex flex-column gap-1">
          <label class="font-medium" for="bulkAdd">{{ 'IAM.USERS.BULK.ADD_ROLES' | translate }}</label>
          <p-multiselect inputId="bulkAdd" [options]="options()" [ngModel]="add()" (ngModelChange)="add.set($event ?? [])" optionLabel="label" optionValue="value" display="chip" [filter]="true" styleClass="w-full" />
        </div>
        <div class="flex flex-column gap-1">
          <label class="font-medium" for="bulkRemove">{{ 'IAM.USERS.BULK.REMOVE_ROLES' | translate }}</label>
          <p-multiselect inputId="bulkRemove" [options]="options()" [ngModel]="remove()" (ngModelChange)="remove.set($event ?? [])" optionLabel="label" optionValue="value" display="chip" [filter]="true" styleClass="w-full" />
        </div>
        @if (overlap()) {
          <p-message severity="error" [text]="'IAM.USERS.BULK.OVERLAP' | translate" styleClass="w-full" />
        }
        <div class="flex flex-column gap-1">
          <label class="font-medium" for="bulkReason">{{ 'IAM.REASON.LABEL' | translate }} <span class="text-red-500">*</span></label>
          <textarea pTextarea id="bulkReason" rows="3" [maxlength]="maxLength" [ngModel]="reason()" (ngModelChange)="reason.set($event)" [placeholder]="'IAM.REASON.PLACEHOLDER' | translate"></textarea>
          <small class="text-color-secondary">{{ 'IAM.REASON.MIN' | translate: { min: minLength } }}</small>
        </div>
      </div>
      <ng-template pTemplate="footer">
        <p-button [label]="'COMMON.CANCEL' | translate" severity="secondary" [outlined]="true" [disabled]="saving()" (onClick)="done.emit(null)" />
        <p-button [label]="'IAM.COMMON.APPLY' | translate" icon="pi pi-check" [loading]="saving()" [disabled]="!canSubmit()" (onClick)="submit()" />
      </ng-template>
    </p-dialog>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class BulkRolesDialogComponent {
  private readonly userService = inject(IamUserService);
  private readonly alert = inject(AlertService);
  private readonly language = inject(LanguageService);

  readonly users = input.required<IamUserSummary[]>();
  readonly roles = input.required<IamRoleSummary[]>();
  readonly done = output<BulkResult | null>();

  protected readonly minLength = REASON_MIN_LENGTH;
  protected readonly maxLength = REASON_MAX_LENGTH;
  protected readonly add = signal<number[]>([]);
  protected readonly remove = signal<number[]>([]);
  protected readonly reason = signal('');
  protected readonly saving = signal(false);

  protected readonly options = computed(() =>
    this.roles()
      .filter((role) => role.status === 'ACTIVE')
      .map((role) => ({ label: role.name, value: role.id })),
  );
  protected readonly overlap = computed(() => this.add().some((id) => this.remove().includes(id)));
  protected readonly canSubmit = computed(
    () =>
      !this.saving() &&
      !this.overlap() &&
      this.add().length + this.remove().length > 0 &&
      this.reason().trim().length >= REASON_MIN_LENGTH,
  );

  protected submit(): void {
    if (!this.canSubmit()) {
      return;
    }
    this.saving.set(true);
    this.userService
      .bulkRoles({
        userIds: this.users().map((user) => user.id),
        addRoleIds: this.add(),
        removeRoleIds: this.remove(),
        reason: this.reason().trim(),
      })
      .subscribe({
        next: (response) => {
          this.saving.set(false);
          this.done.emit(response.data);
        },
        error: (error: unknown) => {
          this.saving.set(false);
          this.alert.error(catalogErrorMessage(error, this.language.t('IAM.USERS.BULK.FAILED')));
        },
      });
  }
}
