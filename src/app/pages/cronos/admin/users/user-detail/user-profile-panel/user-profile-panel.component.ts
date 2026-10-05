import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, ElementRef, computed, effect, inject, input, output, signal, untracked, viewChild } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { FormBuilder, ReactiveFormsModule } from '@angular/forms';
import { TranslatePipe } from '@ngx-translate/core';
import { ButtonModule } from 'primeng/button';
import { CardModule } from 'primeng/card';
import { DatePickerModule } from 'primeng/datepicker';
import { DividerModule } from 'primeng/divider';
import { InputTextModule } from 'primeng/inputtext';
import { SelectModule } from 'primeng/select';
import { TooltipModule } from 'primeng/tooltip';
import { map } from 'rxjs';

import { PERMISSIONS } from 'src/app/core/constants/permissions';
import { CroppedAvatar } from 'src/app/core/models';
import { IamUserDetail, UpdateUserRequest } from 'src/app/core/models/iam.models';
import { AuthorizationService } from 'src/app/core/services/authorization.service';
import { IamUserService } from 'src/app/core/services/iam/iam-user.service';
import { LANGUAGE_OPTIONS, LanguageService } from 'src/app/core/services/language.service';
import { catalogErrors, catalogRootMessage, hasCatalogError } from 'src/app/core/utils/catalog-error.util';
import { AvatarCropperDialogComponent } from 'src/app/shared/components/avatar-cropper-dialog/avatar-cropper-dialog.component';
import { FieldErrorComponent } from 'src/app/shared/components/field-error/field-error.component';
import { PhoneInputComponent } from 'src/app/shared/components/phone-input/phone-input.component';
import { AlertService } from 'src/app/shared/services/alert.service';
import { ConfirmService } from 'src/app/shared/services/confirm.service';
import { focusFirstInvalidControl } from 'src/app/shared/utils/form-focus.util';
import { UserAvatarComponent } from '../../../shared/user-avatar.component';
import { USERNAME_MAX, blankToNull, buildIdentityForm, fromIsoDate, toIsoDate } from '../../user-identity-form';

/** Editable identity + organisation data, avatar management and read-only account facts. */
@Component({
  selector: 'app-user-profile-panel',
  standalone: true,
  imports: [
    DatePipe,
    ReactiveFormsModule,
    TranslatePipe,
    ButtonModule,
    CardModule,
    DatePickerModule,
    DividerModule,
    InputTextModule,
    SelectModule,
    TooltipModule,
    AvatarCropperDialogComponent,
    FieldErrorComponent,
    PhoneInputComponent,
    UserAvatarComponent,
  ],
  templateUrl: './user-profile-panel.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class UserProfilePanelComponent {
  private readonly fb = inject(FormBuilder);
  private readonly userService = inject(IamUserService);
  private readonly authorization = inject(AuthorizationService);
  private readonly alert = inject(AlertService);
  private readonly confirm = inject(ConfirmService);
  private readonly language = inject(LanguageService);

  private readonly formRef = viewChild<ElementRef<HTMLFormElement>>('profileFormEl');

  readonly user = input.required<IamUserDetail>();
  readonly userChanged = output<IamUserDetail>();
  readonly writeFailed = output<unknown>();

  protected readonly usernameMax = USERNAME_MAX;
  protected readonly today = new Date();
  protected readonly localeOptions = LANGUAGE_OPTIONS.map((option) => ({ value: option.code, label: `${option.flag} ${option.label}` }));
  protected readonly canEdit = computed(() => this.authorization.can(PERMISSIONS.IAM_USER_UPDATE));

  protected readonly saving = signal(false);
  protected readonly avatarBusy = signal(false);
  protected readonly cropperOpen = signal(false);

  protected readonly form = buildIdentityForm(this.fb, this.userService, () => this.user().id);
  private readonly dirty = toSignal(this.form.valueChanges.pipe(map(() => this.form.dirty)), { initialValue: false });
  protected readonly isDirty = computed(() => this.dirty());

  constructor() {
    // Re-hydrate whenever a fresh copy of the user arrives (after any save or reload).
    effect(() => {
      const user = this.user();
      untracked(() => this.hydrate(user));
    });
    effect(() => {
      if (this.canEdit()) {
        this.form.enable({ emitEvent: false });
      } else {
        this.form.disable({ emitEvent: false });
      }
    });
  }

  private hydrate(user: IamUserDetail): void {
    this.form.reset(
      {
        firstName: user.firstName ?? '',
        lastName: user.lastName ?? '',
        username: user.username,
        email: user.email,
        phoneNumber: user.phoneNumber,
        jobTitle: user.jobTitle,
        department: user.department,
        employeeNumber: user.employeeNumber,
        locale: user.locale,
        accessExpiresAt: fromIsoDate(user.accessExpiresAt),
      },
      { emitEvent: true },
    );
  }

  protected discard(): void {
    this.hydrate(this.user());
  }

  protected save(): void {
    if (this.saving() || !this.canEdit()) {
      return;
    }
    if (this.form.invalid || this.form.pending) {
      this.form.markAllAsTouched();
      focusFirstInvalidControl(this.formRef()?.nativeElement);
      return;
    }
    const value = this.form.getRawValue();
    const request: UpdateUserRequest = {
      username: value.username.trim(),
      email: value.email.trim().toLowerCase(),
      firstName: value.firstName.trim(),
      lastName: value.lastName.trim(),
      phoneNumber: value.phoneNumber,
      jobTitle: blankToNull(value.jobTitle),
      department: blankToNull(value.department),
      employeeNumber: blankToNull(value.employeeNumber),
      locale: value.locale,
      accessExpiresAt: toIsoDate(value.accessExpiresAt),
      version: this.user().version,
    };
    const emailChanged = request.email !== this.user().email.toLowerCase();

    this.saving.set(true);
    this.userService.update(this.user().id, request).subscribe({
      next: (response) => {
        this.saving.set(false);
        if (response.data) {
          this.userChanged.emit(response.data);
        }
        this.alert.success(this.language.t(emailChanged ? 'IAM.DETAIL.PROFILE.SAVED_EMAIL' : 'IAM.DETAIL.PROFILE.SAVED'));
      },
      error: (error: unknown) => {
        this.saving.set(false);
        if (!hasCatalogError(error, 'CONCURRENT_MODIFICATION') && this.applyFieldErrors(error)) {
          this.alert.error(catalogRootMessage(error, this.language.t('IAM.DETAIL.PROFILE.SAVE_FAILED')));
          return;
        }
        this.writeFailed.emit(error);
      },
    });
  }

  private applyFieldErrors(error: unknown): boolean {
    let applied = false;
    for (const detail of catalogErrors(error)) {
      const control = detail.field ? this.form.get(detail.field) : null;
      if (control) {
        control.setErrors({ ...(control.errors ?? {}), serverValidation: detail.message });
        control.markAsTouched();
        applied = true;
      }
    }
    return applied;
  }

  // ─── Avatar ───

  protected onAvatarCropped(cropped: CroppedAvatar): void {
    this.avatarBusy.set(true);
    this.userService.uploadAvatar(this.user().id, cropped.file).subscribe({
      next: (response) => {
        URL.revokeObjectURL(cropped.previewUrl);
        this.avatarBusy.set(false);
        this.cropperOpen.set(false);
        if (response.data) {
          this.userChanged.emit({ ...this.user(), avatarUrl: response.data.avatarUrl, updatedAt: response.data.updatedAt });
        }
        this.alert.success(this.language.t('IAM.DETAIL.PROFILE.AVATAR_UPDATED'));
      },
      error: (error: unknown) => {
        URL.revokeObjectURL(cropped.previewUrl);
        this.avatarBusy.set(false);
        this.writeFailed.emit(error);
      },
    });
  }

  protected async removeAvatar(): Promise<void> {
    const confirmed = await this.confirm.confirm({
      title: this.language.t('IAM.DETAIL.PROFILE.REMOVE_AVATAR_TITLE'),
      message: this.language.t('IAM.DETAIL.PROFILE.REMOVE_AVATAR_MESSAGE'),
      severity: 'danger',
      icon: 'pi pi-trash',
    });
    if (!confirmed) {
      return;
    }
    this.avatarBusy.set(true);
    this.userService.removeAvatar(this.user().id).subscribe({
      next: () => {
        this.avatarBusy.set(false);
        this.userChanged.emit({ ...this.user(), avatarUrl: null });
        this.alert.success(this.language.t('IAM.DETAIL.PROFILE.AVATAR_REMOVED'));
      },
      error: (error: unknown) => {
        this.avatarBusy.set(false);
        this.writeFailed.emit(error);
      },
    });
  }

  protected showError(name: keyof typeof this.form.controls): boolean {
    const control = this.form.controls[name];
    return control.invalid && (control.touched || control.dirty);
  }

  async canDeactivate(): Promise<boolean> {
    if (!this.form.dirty) {
      return true;
    }
    return this.confirm.confirm({
      title: this.language.t('ACCOUNT.SETTINGS.UNSAVED_TITLE'),
      message: this.language.t('ACCOUNT.SETTINGS.UNSAVED_MESSAGE'),
      acceptLabel: this.language.t('ACCOUNT.SETTINGS.UNSAVED_ACCEPT'),
      severity: 'danger',
    });
  }
}
