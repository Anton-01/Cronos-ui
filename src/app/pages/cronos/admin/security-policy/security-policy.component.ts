import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, effect, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { AbstractControl, FormBuilder, ReactiveFormsModule, ValidationErrors, ValidatorFn, Validators } from '@angular/forms';
import { TranslatePipe } from '@ngx-translate/core';
import { ButtonModule } from 'primeng/button';
import { CardModule } from 'primeng/card';
import { DividerModule } from 'primeng/divider';
import { InputNumberModule } from 'primeng/inputnumber';
import { MessageModule } from 'primeng/message';
import { MultiSelectModule } from 'primeng/multiselect';
import { ToggleSwitchModule } from 'primeng/toggleswitch';
import { map } from 'rxjs';

import { HasUnsavedChanges } from 'src/app/core/guards/unsaved-changes.guard';
import { PERMISSIONS } from 'src/app/core/constants/permissions';
import { IamRoleSummary, SecurityPolicy, SecurityPolicyRequest } from 'src/app/core/models/iam.models';
import { AuthorizationService } from 'src/app/core/services/authorization.service';
import { IamAuditService } from 'src/app/core/services/iam/iam-audit.service';
import { IamRoleService } from 'src/app/core/services/iam/iam-role.service';
import { LanguageService } from 'src/app/core/services/language.service';
import { PageInfoService } from 'src/app/core/services/page-info.service';
import { catalogErrorMessage, catalogErrors, hasCatalogError } from 'src/app/core/utils/catalog-error.util';
import { DetailSkeletonComponent } from 'src/app/shared/components/detail-skeleton/detail-skeleton.component';
import { FieldErrorComponent } from 'src/app/shared/components/field-error/field-error.component';
import { AlertService } from 'src/app/shared/services/alert.service';
import { ConfirmService } from 'src/app/shared/services/confirm.service';

/** Bounds mirrored from doc §8 — the server enforces the same ranges. */
export const POLICY_BOUNDS = {
  passwordMinLength: [8, 128],
  passwordHistory: [0, 24],
  passwordMaxAgeDays: [0, 365],
  maxFailedAttempts: [3, 20],
  lockoutMinutes: [1, 1440],
  sessionIdleMinutes: [5, 480],
  sessionAbsoluteHours: [1, 720],
  maxConcurrentSessions: [1, 20],
  invitationTtlHours: [1, 336],
} as const;

type BoundedField = keyof typeof POLICY_BOUNDS;

const bounded = (field: BoundedField) => [Validators.required, Validators.min(POLICY_BOUNDS[field][0]), Validators.max(POLICY_BOUNDS[field][1])];

/** Idle timeout must fit inside the absolute session lifetime. */
const sessionWindowValidator: ValidatorFn = (group: AbstractControl): ValidationErrors | null => {
  const idle = group.get('sessionIdleMinutes')?.value as number | null;
  const absolute = group.get('sessionAbsoluteHours')?.value as number | null;
  return idle !== null && absolute !== null && idle > absolute * 60 ? { idleExceedsAbsolute: true } : null;
};

@Component({
  selector: 'app-security-policy',
  standalone: true,
  imports: [
    DatePipe,
    ReactiveFormsModule,
    TranslatePipe,
    ButtonModule,
    CardModule,
    DividerModule,
    InputNumberModule,
    MessageModule,
    MultiSelectModule,
    ToggleSwitchModule,
    DetailSkeletonComponent,
    FieldErrorComponent,
  ],
  templateUrl: './security-policy.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SecurityPolicyComponent implements HasUnsavedChanges {
  private readonly fb = inject(FormBuilder);
  private readonly auditService = inject(IamAuditService);
  private readonly roleService = inject(IamRoleService);
  private readonly authorization = inject(AuthorizationService);
  private readonly alert = inject(AlertService);
  private readonly confirm = inject(ConfirmService);
  private readonly language = inject(LanguageService);
  private readonly pageInfo = inject(PageInfoService);

  protected readonly bounds = POLICY_BOUNDS;
  protected readonly loadState = signal<'loading' | 'ready' | 'error'>('loading');
  protected readonly policy = signal<SecurityPolicy | null>(null);
  protected readonly roles = signal<IamRoleSummary[]>([]);
  protected readonly saving = signal(false);
  protected readonly canEdit = computed(() => this.authorization.can(PERMISSIONS.IAM_POLICY_UPDATE));

  protected readonly form = this.fb.nonNullable.group(
    {
      passwordMinLength: [12, bounded('passwordMinLength')],
      passwordRequireUppercase: [true],
      passwordRequireLowercase: [true],
      passwordRequireDigit: [true],
      passwordRequireSymbol: [true],
      passwordHistory: [5, bounded('passwordHistory')],
      passwordMaxAgeDays: [90, bounded('passwordMaxAgeDays')],
      maxFailedAttempts: [5, bounded('maxFailedAttempts')],
      lockoutMinutes: [15, bounded('lockoutMinutes')],
      sessionIdleMinutes: [30, bounded('sessionIdleMinutes')],
      sessionAbsoluteHours: [12, bounded('sessionAbsoluteHours')],
      maxConcurrentSessions: [3, bounded('maxConcurrentSessions')],
      invitationTtlHours: [72, bounded('invitationTtlHours')],
      twoFactorRequiredRoleIds: [[] as number[]],
    },
    { validators: [sessionWindowValidator] },
  );

  private readonly dirty = toSignal(this.form.valueChanges.pipe(map(() => this.form.dirty)), { initialValue: false });
  protected readonly isDirty = computed(() => this.dirty());
  protected readonly roleOptions = computed(() => this.roles().map((role) => ({ label: role.name, value: role.id })));

  /** Human summary of the password rule, live as the admin edits. */
  private readonly value = toSignal(this.form.valueChanges.pipe(map(() => this.form.getRawValue())), {
    initialValue: this.form.getRawValue(),
  });
  protected readonly strengthScore = computed(() => {
    const v = this.value();
    let score = Math.min(4, Math.max(0, Math.floor((v.passwordMinLength - 8) / 2)));
    score += [v.passwordRequireUppercase, v.passwordRequireLowercase, v.passwordRequireDigit, v.passwordRequireSymbol].filter(Boolean).length;
    return Math.min(8, score);
  });
  protected readonly strengthKey = computed(() => {
    const score = this.strengthScore();
    return score >= 6 ? 'STRONG' : score >= 3 ? 'MODERATE' : 'WEAK';
  });

  constructor() {
    effect(() => {
      this.pageInfo.updateTitle(this.language.t('IAM.POLICY.TITLE'));
      this.pageInfo.updateDescription(this.language.t('IAM.POLICY.DESCRIPTION'));
      this.pageInfo.updateBreadcrumbs([
        { title: this.language.t('BREADCRUMB.HOME'), path: '/dashboard', isActive: false },
        { title: this.language.t('NAV.SECTIONS.ADMINISTRATION'), path: '', isActive: false },
        { title: this.language.t('IAM.POLICY.TITLE'), path: '', isActive: true },
      ]);
    });
    effect(() => {
      if (this.canEdit()) {
        this.form.enable({ emitEvent: false });
      } else {
        this.form.disable({ emitEvent: false });
      }
    });
    this.load();
    this.roleService.list({ status: 'ACTIVE' }).subscribe({
      next: (response) => this.roles.set(response.data ?? []),
      error: () => this.roles.set([]),
    });
  }

  protected load(): void {
    this.loadState.set('loading');
    this.auditService.securityPolicy().subscribe({
      next: (response) => {
        if (response.data) {
          this.hydrate(response.data);
        }
        this.loadState.set('ready');
      },
      error: (error: unknown) => {
        this.loadState.set('error');
        this.alert.error(catalogErrorMessage(error, this.language.t('IAM.POLICY.LOAD_FAILED')));
      },
    });
  }

  private hydrate(policy: SecurityPolicy): void {
    this.policy.set(policy);
    const { updatedAt: _updatedAt, updatedBy: _updatedBy, version: _version, ...values } = policy;
    this.form.reset(values);
  }

  protected discard(): void {
    const policy = this.policy();
    if (policy) {
      this.hydrate(policy);
    }
  }

  protected async save(): Promise<void> {
    const policy = this.policy();
    if (!policy || this.saving() || !this.canEdit()) {
      return;
    }
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    const value = this.form.getRawValue();
    const weakening =
      value.passwordMinLength < policy.passwordMinLength ||
      value.maxFailedAttempts > policy.maxFailedAttempts ||
      value.passwordHistory < policy.passwordHistory ||
      (value.passwordRequireSymbol === false && policy.passwordRequireSymbol);
    if (weakening) {
      const confirmed = await this.confirm.confirm({
        title: this.language.t('IAM.POLICY.WEAKEN_TITLE'),
        message: this.language.t('IAM.POLICY.WEAKEN_MESSAGE'),
        severity: 'danger',
        icon: 'pi pi-exclamation-triangle',
      });
      if (!confirmed) {
        return;
      }
    }
    const request: SecurityPolicyRequest = { ...value, version: policy.version };
    this.saving.set(true);
    this.auditService.updateSecurityPolicy(request).subscribe({
      next: (response) => {
        this.saving.set(false);
        if (response.data) {
          this.hydrate(response.data);
        }
        this.alert.success(this.language.t('IAM.POLICY.SAVED'));
      },
      error: (error: unknown) => {
        this.saving.set(false);
        if (hasCatalogError(error, 'CONCURRENT_MODIFICATION')) {
          this.alert.warning(this.language.t('IAM.COMMON.CONCURRENT_MODIFICATION'));
          this.load();
          return;
        }
        for (const detail of catalogErrors(error)) {
          const control = detail.field ? this.form.get(detail.field) : null;
          control?.setErrors({ serverValidation: detail.message });
          control?.markAsTouched();
        }
        this.alert.error(catalogErrorMessage(error, this.language.t('COMMON.TOAST.SAVE_FAILED')));
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
