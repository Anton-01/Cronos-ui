import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, ElementRef, computed, effect, inject, signal, untracked, viewChild } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { FormBuilder, FormsModule, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { TranslatePipe } from '@ngx-translate/core';
import { ButtonModule } from 'primeng/button';
import { CardModule } from 'primeng/card';
import { InputTextModule } from 'primeng/inputtext';
import { MessageModule } from 'primeng/message';
import { MultiSelectModule } from 'primeng/multiselect';
import { TabsModule } from 'primeng/tabs';
import { TagModule } from 'primeng/tag';
import { TextareaModule } from 'primeng/textarea';
import { TooltipModule } from 'primeng/tooltip';
import { forkJoin, map, of } from 'rxjs';

import { HasUnsavedChanges } from 'src/app/core/guards/unsaved-changes.guard';
import { PERMISSIONS } from 'src/app/core/constants/permissions';
import {
  IamRoleDetail,
  PermissionDefinition,
  PermissionGroupDetail,
  PermissionGroupSummary,
  RoleRequest,
} from 'src/app/core/models/iam.models';
import { AuthorizationService } from 'src/app/core/services/authorization.service';
import { IamPermissionService } from 'src/app/core/services/iam/iam-permission.service';
import { IamRoleService } from 'src/app/core/services/iam/iam-role.service';
import { LanguageService } from 'src/app/core/services/language.service';
import { PageInfoService } from 'src/app/core/services/page-info.service';
import { catalogErrorMessage, catalogErrors, catalogRootMessage, hasCatalogError } from 'src/app/core/utils/catalog-error.util';
import { DetailSkeletonComponent } from 'src/app/shared/components/detail-skeleton/detail-skeleton.component';
import { FieldErrorComponent } from 'src/app/shared/components/field-error/field-error.component';
import { AlertService } from 'src/app/shared/services/alert.service';
import { ConfirmService } from 'src/app/shared/services/confirm.service';
import { focusFirstInvalidControl } from 'src/app/shared/utils/form-focus.util';
import { ROLE_COLOR_PALETTE } from '../../shared/iam-labels';
import {
  IAM_CODE_MAX,
  IAM_DESCRIPTION_MAX,
  IAM_NAME_MAX,
  iamCodeValidators,
  iamNameValidators,
  toIamCode,
} from '../../shared/iam-validators';
import { PermissionMatrixComponent } from '../../shared/permission-matrix/permission-matrix.component';
import { RoleChipComponent } from '../../shared/role-chip.component';
import { RoleMembersComponent } from './role-members.component';

/** The platform's root role: every permission, nothing editable but its description. */
const ROOT_ROLE_CODE = 'SUPER_ADMIN';

type EditorTab = 'permissions' | 'members';

@Component({
  selector: 'app-role-editor',
  standalone: true,
  imports: [
    DatePipe,
    FormsModule,
    ReactiveFormsModule,
    RouterLink,
    TranslatePipe,
    ButtonModule,
    CardModule,
    InputTextModule,
    MessageModule,
    MultiSelectModule,
    TabsModule,
    TagModule,
    TextareaModule,
    TooltipModule,
    DetailSkeletonComponent,
    FieldErrorComponent,
    PermissionMatrixComponent,
    RoleChipComponent,
    RoleMembersComponent,
  ],
  templateUrl: './role-editor.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class RoleEditorComponent implements HasUnsavedChanges {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly fb = inject(FormBuilder);
  private readonly roleService = inject(IamRoleService);
  private readonly permissionService = inject(IamPermissionService);
  private readonly authorization = inject(AuthorizationService);
  private readonly alert = inject(AlertService);
  private readonly confirm = inject(ConfirmService);
  private readonly language = inject(LanguageService);
  private readonly pageInfo = inject(PageInfoService);

  private readonly formRef = viewChild<ElementRef<HTMLFormElement>>('roleFormEl');

  protected readonly palette = ROLE_COLOR_PALETTE;
  protected readonly codeMax = IAM_CODE_MAX;
  protected readonly nameMax = IAM_NAME_MAX;
  protected readonly descriptionMax = IAM_DESCRIPTION_MAX;

  protected readonly roleId = toSignal(
    this.route.paramMap.pipe(map((params) => (params.get('id') ? Number(params.get('id')) : null))),
    { initialValue: this.route.snapshot.paramMap.get('id') ? Number(this.route.snapshot.paramMap.get('id')) : null },
  );
  private readonly tabParam = toSignal(this.route.queryParamMap.pipe(map((params) => params.get('tab'))), {
    initialValue: this.route.snapshot.queryParamMap.get('tab'),
  });

  protected readonly isNew = computed(() => this.roleId() === null);
  protected readonly loadState = signal<'loading' | 'ready' | 'error'>('loading');
  protected readonly role = signal<IamRoleDetail | null>(null);
  protected readonly catalog = signal<PermissionDefinition[]>([]);
  protected readonly groups = signal<PermissionGroupSummary[]>([]);
  private readonly groupDetails = signal<ReadonlyMap<number, PermissionGroupDetail>>(new Map());
  protected readonly saving = signal(false);

  protected readonly permissions = signal<readonly string[]>([]);
  protected readonly groupIds = signal<number[]>([]);
  private saved = false;

  protected readonly form = this.fb.group({
    code: this.fb.nonNullable.control('', iamCodeValidators),
    name: this.fb.nonNullable.control('', iamNameValidators),
    description: this.fb.control<string | null>(null, Validators.maxLength(IAM_DESCRIPTION_MAX)),
    color: this.fb.control<string | null>(ROLE_COLOR_PALETTE[0]),
  });
  private readonly formValue = toSignal(this.form.valueChanges.pipe(map(() => this.form.getRawValue())), {
    initialValue: this.form.getRawValue(),
  });
  private readonly formDirty = toSignal(this.form.valueChanges.pipe(map(() => this.form.dirty)), { initialValue: false });

  protected readonly isRoot = computed(() => this.role()?.code === ROOT_ROLE_CODE);
  protected readonly canWrite = computed(() =>
    this.authorization.can(this.isNew() ? PERMISSIONS.IAM_ROLE_CREATE : PERMISSIONS.IAM_ROLE_UPDATE),
  );
  protected readonly matrixReadonly = computed(() => !this.canWrite() || this.isRoot());
  protected readonly canManageMembers = computed(() => this.authorization.can(PERMISSIONS.IAM_ROLE_MANAGE_MEMBERS));
  protected readonly activeTab = computed<EditorTab>(() => (this.tabParam() === 'members' && !this.isNew() ? 'members' : 'permissions'));

  protected readonly groupOptions = computed(() =>
    this.groups().map((group) => ({
      label: group.name,
      value: group.id,
      count: group.permissionCount,
      disabled: group.status !== 'ACTIVE',
    })),
  );

  /** Permissions the role receives through its groups, shown locked in the matrix. */
  protected readonly inherited = computed<ReadonlyMap<string, string>>(() => {
    const result = new Map<string, string>();
    const details = this.groupDetails();
    for (const id of this.groupIds()) {
      const group = details.get(id);
      if (!group) {
        continue;
      }
      for (const code of group.permissions) {
        const existing = result.get(code);
        const label = `${this.language.t('IAM.DETAIL.ACCESS.SOURCE.USER_GROUP')}: ${group.name}`;
        result.set(code, existing ? `${existing} · ${label}` : label);
      }
    }
    return result;
  });

  protected readonly effectiveCount = computed(() => new Set([...this.permissions(), ...this.inherited().keys()]).size);

  protected readonly isDirty = computed(
    () =>
      this.formDirty() ||
      !this.sameSet(this.permissions(), this.savedPermissionsSignal()) ||
      !this.sameSet(this.groupIds(), this.savedGroupsSignal()),
  );
  private readonly savedPermissionsSignal = signal<readonly string[]>([]);
  private readonly savedGroupsSignal = signal<readonly number[]>([]);

  protected readonly previewName = computed(() => this.formValue().name || this.language.t('IAM.ROLES.NEW_ROLE'));

  constructor() {
    effect(() => {
      const title = this.isNew() ? this.language.t('IAM.ROLES.CREATE') : (this.role()?.name ?? this.language.t('IAM.ROLES.TITLE'));
      this.pageInfo.updateTitle(title);
      this.pageInfo.updateDescription(this.language.t('IAM.ROLES.EDITOR_DESCRIPTION'));
      this.pageInfo.updateBreadcrumbs([
        { title: this.language.t('BREADCRUMB.HOME'), path: '/dashboard', isActive: false },
        { title: this.language.t('IAM.ROLES.TITLE'), path: '/cronos/admin/roles', isActive: false },
        { title, path: '', isActive: true },
      ]);
    });

    effect(() => {
      const id = this.roleId();
      untracked(() => this.load(id));
    });

    // Fetch the permission list of any newly selected group so the matrix can show it as inherited.
    effect(() => {
      const ids = this.groupIds();
      untracked(() => this.loadGroupDetails(ids));
    });

    effect(() => {
      if (this.canWrite()) {
        this.form.enable({ emitEvent: false });
      } else {
        this.form.disable({ emitEvent: false });
      }
    });
  }

  protected load(id = this.roleId()): void {
    this.loadState.set('loading');
    forkJoin({
      catalog: this.permissionService.catalog(),
      groups: this.permissionService.listGroups(),
      role: id === null ? of(null) : this.roleService.getById(id),
    }).subscribe({
      next: ({ catalog, groups, role }) => {
        this.catalog.set(catalog);
        this.groups.set(groups.data ?? []);
        if (role?.data) {
          this.hydrate(role.data);
        }
        this.loadState.set('ready');
      },
      error: (error: unknown) => {
        this.loadState.set('error');
        this.permissionService.invalidateCatalog();
        this.alert.error(catalogErrorMessage(error, this.language.t('IAM.ROLES.LOAD_FAILED')));
      },
    });
  }

  private hydrate(role: IamRoleDetail): void {
    this.role.set(role);
    this.form.reset({ code: role.code, name: role.name, description: role.description, color: role.color });
    if (role.system) {
      this.form.controls.code.disable({ emitEvent: false });
    }
    if (role.code === ROOT_ROLE_CODE) {
      this.form.controls.name.disable({ emitEvent: false });
    }
    this.permissions.set(role.permissions);
    this.groupIds.set(role.permissionGroups.map((group) => group.id));
    this.savedPermissionsSignal.set(role.permissions);
    this.savedGroupsSignal.set(role.permissionGroups.map((group) => group.id));
  }

  private loadGroupDetails(ids: number[]): void {
    const missing = ids.filter((id) => !this.groupDetails().has(id));
    if (missing.length === 0) {
      return;
    }
    forkJoin(missing.map((id) => this.permissionService.getGroup(id))).subscribe({
      next: (responses) => {
        const next = new Map(this.groupDetails());
        for (const response of responses) {
          if (response.data) {
            next.set(response.data.id, response.data);
          }
        }
        this.groupDetails.set(next);
      },
      error: () => this.alert.warning(this.language.t('IAM.ROLES.GROUP_DETAILS_FAILED')),
    });
  }

  protected selectTab(value: string | number | undefined): void {
    void this.router.navigate([], {
      relativeTo: this.route,
      queryParams: { tab: value === 'members' ? 'members' : null },
      queryParamsHandling: 'merge',
      replaceUrl: true,
    });
  }

  protected pickColor(color: string | null): void {
    if (!this.canWrite()) {
      return;
    }
    this.form.controls.color.setValue(color);
    this.form.markAsDirty();
  }

  protected onNameBlur(): void {
    // Suggest a code from the name on create, until the admin types one.
    const code = this.form.controls.code;
    if (this.isNew() && !code.dirty && !code.value) {
      code.setValue(toIamCode(this.form.controls.name.value));
    }
  }

  protected normalizeCode(): void {
    const code = this.form.controls.code;
    if (code.enabled) {
      code.setValue(toIamCode(code.value));
    }
  }

  // ─── Save ───

  protected save(): void {
    if (this.saving() || !this.canWrite()) {
      return;
    }
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      focusFirstInvalidControl(this.formRef()?.nativeElement);
      return;
    }
    if (this.permissions().length === 0 && this.groupIds().length === 0) {
      this.alert.warning(this.language.t('IAM.ROLES.EMPTY_PERMISSIONS'));
      return;
    }
    const value = this.form.getRawValue();
    const current = this.role();
    const request: RoleRequest = {
      code: value.code,
      name: value.name.trim(),
      description: value.description?.trim() || null,
      color: value.color,
      permissions: [...this.permissions()],
      permissionGroupIds: this.groupIds(),
      ...(current ? { version: current.version } : {}),
    };

    this.saving.set(true);
    const request$ = current ? this.roleService.update(current.id, request) : this.roleService.create(request);
    request$.subscribe({
      next: (response) => {
        this.saving.set(false);
        this.alert.success(this.language.t(current ? 'IAM.ROLES.UPDATED' : 'IAM.ROLES.CREATED', { name: request.name }));
        if (response.data) {
          this.hydrate(response.data);
          if (!current) {
            this.saved = true;
            void this.router.navigate(['/cronos/admin/roles', response.data.id], { replaceUrl: true });
          }
        }
      },
      error: (error: unknown) => this.onSaveError(error),
    });
  }

  private onSaveError(error: unknown): void {
    this.saving.set(false);
    if (hasCatalogError(error, 'CONCURRENT_MODIFICATION')) {
      this.alert.warning(this.language.t('IAM.COMMON.CONCURRENT_MODIFICATION'));
      this.load();
      return;
    }
    let applied = false;
    for (const detail of catalogErrors(error)) {
      const control = detail.field ? this.form.get(detail.field) : null;
      if (control) {
        control.setErrors({ ...(control.errors ?? {}), serverValidation: detail.message });
        control.markAsTouched();
        applied = true;
      }
    }
    this.alert.error(
      applied
        ? catalogRootMessage(error, this.language.t('COMMON.TOAST.SAVE_FAILED'))
        : catalogErrorMessage(error, this.language.t('COMMON.TOAST.SAVE_FAILED')),
    );
  }

  protected discard(): void {
    const current = this.role();
    if (current) {
      this.hydrate(current);
    } else {
      this.form.reset({ code: '', name: '', description: null, color: ROLE_COLOR_PALETTE[0] });
      this.permissions.set([]);
      this.groupIds.set([]);
    }
  }

  protected showError(name: 'code' | 'name' | 'description'): boolean {
    const control = this.form.controls[name];
    return control.invalid && (control.touched || control.dirty);
  }

  private sameSet<T>(a: readonly T[], b: readonly T[]): boolean {
    if (a.length !== b.length) {
      return false;
    }
    const set = new Set(a);
    return b.every((item) => set.has(item));
  }

  async canDeactivate(): Promise<boolean> {
    if (this.saved || !this.isDirty() || !this.canWrite()) {
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
