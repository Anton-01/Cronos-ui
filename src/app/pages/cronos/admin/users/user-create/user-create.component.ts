import { ChangeDetectionStrategy, Component, DestroyRef, ElementRef, computed, effect, inject, signal, viewChild } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { FormBuilder, FormsModule, ReactiveFormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { TranslatePipe } from '@ngx-translate/core';
import { ButtonModule } from 'primeng/button';
import { CardModule } from 'primeng/card';
import { CheckboxModule } from 'primeng/checkbox';
import { DatePickerModule } from 'primeng/datepicker';
import { DividerModule } from 'primeng/divider';
import { InputTextModule } from 'primeng/inputtext';
import { MessageModule } from 'primeng/message';
import { MultiSelectModule } from 'primeng/multiselect';
import { RadioButtonModule } from 'primeng/radiobutton';
import { SelectModule } from 'primeng/select';
import { StepperModule } from 'primeng/stepper';
import { TagModule } from 'primeng/tag';
import { ToggleSwitchModule } from 'primeng/toggleswitch';
import { TooltipModule } from 'primeng/tooltip';
import { map } from 'rxjs';

import { HasUnsavedChanges } from 'src/app/core/guards/unsaved-changes.guard';
import { CroppedAvatar } from 'src/app/core/models';
import {
  ActivationMode,
  CreateUserRequest,
  IamRoleSummary,
  PermissionGroupSummary,
} from 'src/app/core/models/iam.models';
import { IamPermissionService } from 'src/app/core/services/iam/iam-permission.service';
import { IamRoleService } from 'src/app/core/services/iam/iam-role.service';
import { IamUserService } from 'src/app/core/services/iam/iam-user.service';
import { LANGUAGE_OPTIONS, LanguageService } from 'src/app/core/services/language.service';
import { PageInfoService } from 'src/app/core/services/page-info.service';
import { catalogErrorMessage, catalogErrors, catalogRootMessage } from 'src/app/core/utils/catalog-error.util';
import { AvatarCropperDialogComponent } from 'src/app/shared/components/avatar-cropper-dialog/avatar-cropper-dialog.component';
import { FieldErrorComponent } from 'src/app/shared/components/field-error/field-error.component';
import { PhoneInputComponent } from 'src/app/shared/components/phone-input/phone-input.component';
import { focusFirstInvalidControl } from 'src/app/shared/utils/form-focus.util';
import { AlertService } from 'src/app/shared/services/alert.service';
import { ConfirmService } from 'src/app/shared/services/confirm.service';
import { RoleChipComponent } from '../../shared/role-chip.component';
import { UserAvatarComponent } from '../../shared/user-avatar.component';
import { USERNAME_MAX, blankToNull, buildIdentityForm, toIsoDate } from '../user-identity-form';

type Step = 1 | 2 | 3;

/** Request-body paths the server may reject → the wizard step that owns them. */
const FIELD_STEP: Readonly<Record<string, Step>> = {
  firstName: 1,
  lastName: 1,
  username: 1,
  email: 1,
  phoneNumber: 1,
  jobTitle: 1,
  department: 1,
  employeeNumber: 1,
  locale: 1,
  accessExpiresAt: 2,
  roleIds: 2,
  permissionGroupIds: 2,
};

/**
 * Three-step onboarding: identity → access → activation & review.
 *
 * The password is never typed by an administrator: the user either receives
 * an invitation link or a one-time temporary password by e-mail (doc §3.2).
 */
@Component({
  selector: 'app-user-create',
  standalone: true,
  imports: [
    FormsModule,
    ReactiveFormsModule,
    RouterLink,
    TranslatePipe,
    ButtonModule,
    CardModule,
    CheckboxModule,
    DatePickerModule,
    DividerModule,
    InputTextModule,
    MessageModule,
    MultiSelectModule,
    RadioButtonModule,
    SelectModule,
    StepperModule,
    TagModule,
    ToggleSwitchModule,
    TooltipModule,
    AvatarCropperDialogComponent,
    FieldErrorComponent,
    PhoneInputComponent,
    RoleChipComponent,
    UserAvatarComponent,
  ],
  templateUrl: './user-create.component.html',
  styleUrl: './user-create.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class UserCreateComponent implements HasUnsavedChanges {
  private readonly fb = inject(FormBuilder);
  private readonly userService = inject(IamUserService);
  private readonly roleService = inject(IamRoleService);
  private readonly permissionService = inject(IamPermissionService);
  private readonly alert = inject(AlertService);
  private readonly confirm = inject(ConfirmService);
  private readonly language = inject(LanguageService);
  private readonly pageInfo = inject(PageInfoService);
  private readonly router = inject(Router);

  private readonly identityRef = viewChild<ElementRef<HTMLFormElement>>('identityFormEl');

  protected readonly usernameMax = USERNAME_MAX;
  protected readonly minExpiry = new Date(Date.now() + 24 * 60 * 60 * 1000);
  protected readonly localeOptions = LANGUAGE_OPTIONS.map((option) => ({ value: option.code, label: `${option.flag} ${option.label}` }));

  protected readonly step = signal<Step>(1);
  protected readonly saving = signal(false);
  protected readonly cropperOpen = signal(false);
  protected readonly avatar = signal<CroppedAvatar | null>(null);
  protected readonly roles = signal<IamRoleSummary[]>([]);
  protected readonly groups = signal<PermissionGroupSummary[]>([]);
  protected readonly catalogLoading = signal(true);
  private submitted = false;

  protected readonly identity = buildIdentityForm(this.fb, this.userService);
  protected readonly access = this.fb.group({
    roleIds: this.fb.nonNullable.control<number[]>([]),
    permissionGroupIds: this.fb.nonNullable.control<number[]>([]),
    requireTwoFactor: this.fb.nonNullable.control(false),
  });
  protected readonly activation = this.fb.group({
    activationMode: this.fb.nonNullable.control<ActivationMode>('INVITATION'),
  });

  private readonly identityValue = toSignal(this.identity.valueChanges.pipe(map(() => this.identity.getRawValue())), {
    initialValue: this.identity.getRawValue(),
  });
  private readonly accessValue = toSignal(this.access.valueChanges.pipe(map(() => this.access.getRawValue())), {
    initialValue: this.access.getRawValue(),
  });
  private readonly identityStatus = toSignal(this.identity.statusChanges, { initialValue: this.identity.status });

  protected readonly activeRoles = computed(() => this.roles().filter((role) => role.status === 'ACTIVE'));
  protected readonly groupOptions = computed(() =>
    this.groups()
      .filter((group) => group.status === 'ACTIVE')
      .map((group) => ({ label: group.name, value: group.id, count: group.permissionCount })),
  );
  protected readonly selectedRoles = computed(() => {
    const ids = new Set(this.accessValue().roleIds);
    return this.roles().filter((role) => ids.has(role.id));
  });
  protected readonly selectedGroups = computed(() => {
    const ids = new Set(this.accessValue().permissionGroupIds);
    return this.groups().filter((group) => ids.has(group.id));
  });
  protected readonly displayName = computed(() => {
    const { firstName, lastName, username } = this.identityValue();
    return `${firstName} ${lastName}`.trim() || username || this.language.t('IAM.CREATE.NEW_USER');
  });
  protected readonly identityPending = computed(() => this.identityStatus() === 'PENDING');
  protected readonly noAccessWarning = computed(
    () => this.accessValue().roleIds.length === 0 && this.accessValue().permissionGroupIds.length === 0,
  );

  constructor() {
    effect(() => {
      this.pageInfo.updateTitle(this.language.t('IAM.CREATE.TITLE'));
      this.pageInfo.updateDescription(this.language.t('IAM.CREATE.DESCRIPTION'));
      this.pageInfo.updateBreadcrumbs([
        { title: this.language.t('BREADCRUMB.HOME'), path: '/dashboard', isActive: false },
        { title: this.language.t('IAM.USERS.TITLE'), path: '/cronos/admin/usuarios', isActive: false },
        { title: this.language.t('IAM.CREATE.TITLE'), path: '', isActive: true },
      ]);
    });

    this.roleService.list({ status: 'ACTIVE' }).subscribe({
      next: (response) => {
        this.roles.set(response.data ?? []);
        this.catalogLoading.set(false);
      },
      error: (error: unknown) => {
        this.catalogLoading.set(false);
        this.alert.error(catalogErrorMessage(error, this.language.t('IAM.ROLES.LOAD_FAILED')));
      },
    });
    this.permissionService.listGroups().subscribe({
      next: (response) => this.groups.set(response.data ?? []),
      error: () => this.groups.set([]),
    });

    const revoke = () => {
      const url = this.avatar()?.previewUrl;
      if (url) {
        URL.revokeObjectURL(url);
      }
    };
    inject(DestroyRef).onDestroy(revoke);
  }

  // ─── Navigation ───

  protected goTo(step: Step): void {
    if (step > this.step() && !this.validateStep(this.step())) {
      return;
    }
    this.step.set(step);
  }

  private validateStep(step: Step): boolean {
    if (step === 1) {
      if (this.identity.invalid || this.identity.pending) {
        this.identity.markAllAsTouched();
        if (this.identity.pending) {
          this.alert.info(this.language.t('IAM.CREATE.CHECKING_AVAILABILITY'));
        }
        focusFirstInvalidControl(this.identityRef()?.nativeElement);
        return false;
      }
    }
    return true;
  }

  // ─── Roles ───

  protected isRoleSelected(id: number): boolean {
    return this.accessValue().roleIds.includes(id);
  }

  protected toggleRole(id: number): void {
    const current = this.access.controls.roleIds.value;
    this.access.controls.roleIds.setValue(current.includes(id) ? current.filter((value) => value !== id) : [...current, id]);
    this.access.markAsDirty();
  }

  // ─── Avatar ───

  protected onAvatarCropped(cropped: CroppedAvatar): void {
    const previous = this.avatar()?.previewUrl;
    if (previous) {
      URL.revokeObjectURL(previous);
    }
    this.avatar.set(cropped);
    this.cropperOpen.set(false);
  }

  protected removeAvatar(): void {
    const previous = this.avatar()?.previewUrl;
    if (previous) {
      URL.revokeObjectURL(previous);
    }
    this.avatar.set(null);
  }

  // ─── Submit ───

  protected submit(): void {
    if (this.saving() || !this.validateStep(1)) {
      if (this.identity.invalid) {
        this.step.set(1);
      }
      return;
    }
    const identity = this.identity.getRawValue();
    const access = this.access.getRawValue();
    const request: CreateUserRequest = {
      username: identity.username.trim(),
      email: identity.email.trim().toLowerCase(),
      firstName: identity.firstName.trim(),
      lastName: identity.lastName.trim(),
      phoneNumber: identity.phoneNumber,
      jobTitle: blankToNull(identity.jobTitle),
      department: blankToNull(identity.department),
      employeeNumber: blankToNull(identity.employeeNumber),
      locale: identity.locale,
      roleIds: access.roleIds,
      permissionGroupIds: access.permissionGroupIds,
      accessExpiresAt: toIsoDate(identity.accessExpiresAt),
      activationMode: this.activation.controls.activationMode.value,
      requireTwoFactor: access.requireTwoFactor,
    };

    this.saving.set(true);
    this.userService.create(request, this.avatar()?.file ?? null).subscribe({
      next: (response) => {
        this.saving.set(false);
        this.submitted = true;
        this.alert.success(
          this.language.t(
            request.activationMode === 'INVITATION' ? 'IAM.CREATE.TOAST.INVITED' : 'IAM.CREATE.TOAST.CREATED',
            { email: request.email },
          ),
        );
        const id = response.data?.id;
        void this.router.navigate(id ? ['/cronos/admin/usuarios', id] : ['/cronos/admin/usuarios']);
      },
      error: (error: unknown) => this.onSubmitError(error),
    });
  }

  private onSubmitError(error: unknown): void {
    this.saving.set(false);
    let firstStep: Step | null = null;
    for (const detail of catalogErrors(error)) {
      if (!detail.field) {
        continue;
      }
      const control = this.identity.get(detail.field) ?? this.access.get(detail.field);
      if (control) {
        control.setErrors({ ...(control.errors ?? {}), serverValidation: detail.message });
        control.markAsTouched();
        const step = FIELD_STEP[detail.field] ?? null;
        firstStep = firstStep === null || (step !== null && step < firstStep) ? step : firstStep;
      }
    }
    if (firstStep !== null) {
      this.step.set(firstStep);
      this.alert.error(catalogRootMessage(error, this.language.t('IAM.CREATE.TOAST.FAILED')));
      return;
    }
    this.alert.error(catalogErrorMessage(error, this.language.t('IAM.CREATE.TOAST.FAILED')));
  }

  // ─── Leave guard ───

  async canDeactivate(): Promise<boolean> {
    const dirty = this.identity.dirty || this.access.dirty || this.avatar() !== null;
    if (this.submitted || !dirty) {
      return true;
    }
    return this.confirm.confirm({
      title: this.language.t('ACCOUNT.SETTINGS.UNSAVED_TITLE'),
      message: this.language.t('IAM.CREATE.UNSAVED_MESSAGE'),
      acceptLabel: this.language.t('ACCOUNT.SETTINGS.UNSAVED_ACCEPT'),
      severity: 'danger',
    });
  }

  protected showError(name: keyof typeof this.identity.controls): boolean {
    const control = this.identity.controls[name];
    return control.invalid && (control.touched || control.dirty);
  }
}
