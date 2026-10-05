import { ChangeDetectionStrategy, Component, computed, effect, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router } from '@angular/router';
import { FormBuilder, FormsModule, ReactiveFormsModule, Validators } from '@angular/forms';
import { TranslatePipe } from '@ngx-translate/core';
import { ButtonModule } from 'primeng/button';
import { CardModule } from 'primeng/card';
import { DialogModule } from 'primeng/dialog';
import { IconFieldModule } from 'primeng/iconfield';
import { InputIconModule } from 'primeng/inputicon';
import { InputTextModule } from 'primeng/inputtext';
import { MessageModule } from 'primeng/message';
import { TableModule } from 'primeng/table';
import { TabsModule } from 'primeng/tabs';
import { TagModule } from 'primeng/tag';
import { TextareaModule } from 'primeng/textarea';
import { TooltipModule } from 'primeng/tooltip';
import { map, switchMap } from 'rxjs';

import { PERMISSIONS } from 'src/app/core/constants/permissions';
import {
  PermissionDefinition,
  PermissionGroupDetail,
  PermissionGroupRequest,
  PermissionGroupSummary,
} from 'src/app/core/models/iam.models';
import { AuthorizationService } from 'src/app/core/services/authorization.service';
import { IamPermissionService } from 'src/app/core/services/iam/iam-permission.service';
import { LanguageService } from 'src/app/core/services/language.service';
import { PageInfoService } from 'src/app/core/services/page-info.service';
import { catalogErrorMessage, catalogErrors, hasCatalogError } from 'src/app/core/utils/catalog-error.util';
import { FieldErrorComponent } from 'src/app/shared/components/field-error/field-error.component';
import { TableSkeletonRowComponent } from 'src/app/shared/components/table-skeleton-row/table-skeleton-row.component';
import { CanDirective } from 'src/app/shared/directives/can.directive';
import { AlertService } from 'src/app/shared/services/alert.service';
import { ConfirmService } from 'src/app/shared/services/confirm.service';
import { RISK_SEVERITY, TagSeverity } from '../shared/iam-labels';
import { IAM_CODE_MAX, IAM_DESCRIPTION_MAX, IAM_NAME_MAX, iamCodeValidators, iamNameValidators, toIamCode } from '../shared/iam-validators';
import { PermissionMatrixComponent } from '../shared/permission-matrix/permission-matrix.component';
import { RoleChipComponent } from '../shared/role-chip.component';

type PageTab = 'groups' | 'catalog';

/**
 * Permission groups (reusable bundles assignable to roles and users) and the
 * read-only permission catalog they are built from.
 */
@Component({
  selector: 'app-permission-groups',
  standalone: true,
  imports: [
    FormsModule,
    ReactiveFormsModule,
    TranslatePipe,
    ButtonModule,
    CardModule,
    DialogModule,
    IconFieldModule,
    InputIconModule,
    InputTextModule,
    MessageModule,
    TableModule,
    TabsModule,
    TagModule,
    TextareaModule,
    TooltipModule,
    CanDirective,
    FieldErrorComponent,
    PermissionMatrixComponent,
    RoleChipComponent,
    TableSkeletonRowComponent,
  ],
  templateUrl: './permission-groups.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PermissionGroupsComponent {
  private readonly permissionService = inject(IamPermissionService);
  private readonly authorization = inject(AuthorizationService);
  private readonly alert = inject(AlertService);
  private readonly confirm = inject(ConfirmService);
  private readonly language = inject(LanguageService);
  private readonly pageInfo = inject(PageInfoService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly fb = inject(FormBuilder);

  protected readonly perms = PERMISSIONS;
  protected readonly riskSeverity: Readonly<Record<string, TagSeverity>> = RISK_SEVERITY;
  protected readonly codeMax = IAM_CODE_MAX;
  protected readonly nameMax = IAM_NAME_MAX;
  protected readonly descriptionMax = IAM_DESCRIPTION_MAX;
  protected readonly skeletonRows = Array.from({ length: 5 });

  private readonly tabParam = toSignal(this.route.queryParamMap.pipe(map((params) => params.get('tab'))), {
    initialValue: this.route.snapshot.queryParamMap.get('tab'),
  });
  protected readonly activeTab = computed<PageTab>(() => (this.tabParam() === 'catalog' ? 'catalog' : 'groups'));

  protected readonly groups = signal<PermissionGroupSummary[]>([]);
  protected readonly catalog = signal<PermissionDefinition[]>([]);
  protected readonly loading = signal(true);
  protected readonly catalogLoading = signal(true);
  protected readonly search = signal('');
  protected readonly catalogSearch = signal('');

  // Editor
  protected readonly editorOpen = signal(false);
  protected readonly editing = signal<PermissionGroupDetail | null>(null);
  protected readonly editorLoading = signal(false);
  protected readonly saving = signal(false);
  protected readonly selected = signal<readonly string[]>([]);
  protected readonly form = this.fb.nonNullable.group({
    code: ['', iamCodeValidators],
    name: ['', iamNameValidators],
    description: ['', Validators.maxLength(IAM_DESCRIPTION_MAX)],
  });

  protected readonly canCreate = computed(() => this.authorization.can(PERMISSIONS.IAM_GROUP_CREATE));
  protected readonly canUpdate = computed(() => this.authorization.can(PERMISSIONS.IAM_GROUP_UPDATE));
  protected readonly canDelete = computed(() => this.authorization.can(PERMISSIONS.IAM_GROUP_DELETE));
  protected readonly editorReadonly = computed(() => {
    const group = this.editing();
    return group ? !this.canUpdate() || group.system : !this.canCreate();
  });

  protected readonly filteredGroups = computed(() => {
    const term = this.search().trim().toLowerCase();
    return this.groups().filter(
      (group) =>
        !term ||
        group.name.toLowerCase().includes(term) ||
        group.code.toLowerCase().includes(term) ||
        (group.description ?? '').toLowerCase().includes(term),
    );
  });
  protected readonly filteredCatalog = computed(() => {
    const term = this.catalogSearch().trim().toLowerCase();
    return this.catalog().filter(
      (permission) =>
        !term ||
        permission.code.toLowerCase().includes(term) ||
        permission.name.toLowerCase().includes(term) ||
        permission.moduleName.toLowerCase().includes(term) ||
        permission.resourceName.toLowerCase().includes(term),
    );
  });

  constructor() {
    effect(() => {
      this.pageInfo.updateTitle(this.language.t('IAM.GROUPS.TITLE'));
      this.pageInfo.updateDescription(this.language.t('IAM.GROUPS.DESCRIPTION'));
      this.pageInfo.updateBreadcrumbs([
        { title: this.language.t('BREADCRUMB.HOME'), path: '/dashboard', isActive: false },
        { title: this.language.t('IAM.ROLES.TITLE'), path: '/cronos/admin/roles', isActive: false },
        { title: this.language.t('IAM.GROUPS.TITLE'), path: '', isActive: true },
      ]);
    });
    this.load();
    this.permissionService.catalog().subscribe({
      next: (catalog) => {
        this.catalog.set(catalog);
        this.catalogLoading.set(false);
      },
      error: (error: unknown) => {
        this.catalogLoading.set(false);
        this.permissionService.invalidateCatalog();
        this.alert.error(catalogErrorMessage(error, this.language.t('IAM.GROUPS.CATALOG_FAILED')));
      },
    });
  }

  protected load(): void {
    this.loading.set(true);
    this.permissionService.listGroups().subscribe({
      next: (response) => {
        this.groups.set(response.data ?? []);
        this.loading.set(false);
      },
      error: (error: unknown) => {
        this.loading.set(false);
        this.alert.error(catalogErrorMessage(error, this.language.t('IAM.GROUPS.LOAD_FAILED')));
      },
    });
  }

  protected selectTab(value: string | number | undefined): void {
    void this.router.navigate([], {
      relativeTo: this.route,
      queryParams: { tab: value === 'catalog' ? 'catalog' : null },
      queryParamsHandling: 'merge',
      replaceUrl: true,
    });
  }

  // ─── Editor ───

  protected openCreate(): void {
    this.editing.set(null);
    this.form.reset({ code: '', name: '', description: '' });
    this.form.enable();
    this.selected.set([]);
    this.editorOpen.set(true);
  }

  protected openEdit(group: PermissionGroupSummary): void {
    this.editorLoading.set(true);
    this.editorOpen.set(true);
    this.permissionService.getGroup(group.id).subscribe({
      next: (response) => {
        this.editorLoading.set(false);
        const detail = response.data;
        if (!detail) {
          return;
        }
        this.editing.set(detail);
        this.form.reset({ code: detail.code, name: detail.name, description: detail.description ?? '' });
        this.form.controls.code.disable();
        if (this.editorReadonly()) {
          this.form.disable();
        } else {
          this.form.controls.name.enable();
          this.form.controls.description.enable();
        }
        this.selected.set(detail.permissions);
      },
      error: (error: unknown) => {
        this.editorLoading.set(false);
        this.editorOpen.set(false);
        this.alert.error(catalogErrorMessage(error, this.language.t('IAM.GROUPS.LOAD_FAILED')));
      },
    });
  }

  protected normalizeCode(): void {
    const control = this.form.controls.code;
    if (control.enabled) {
      control.setValue(toIamCode(control.value));
    }
  }

  protected onNameBlur(): void {
    const code = this.form.controls.code;
    if (!this.editing() && !code.dirty && !code.value) {
      code.setValue(toIamCode(this.form.controls.name.value));
    }
  }

  protected save(): void {
    if (this.saving() || this.editorReadonly()) {
      return;
    }
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    if (this.selected().length === 0) {
      this.alert.warning(this.language.t('IAM.GROUPS.EMPTY_SELECTION'));
      return;
    }
    const value = this.form.getRawValue();
    const current = this.editing();
    const request: PermissionGroupRequest = {
      code: value.code,
      name: value.name.trim(),
      description: value.description.trim() || null,
      permissions: [...this.selected()],
      ...(current ? { version: current.version } : {}),
    };
    this.saving.set(true);
    const request$ = current
      ? this.permissionService.updateGroup(current.id, request)
      : this.permissionService.createGroup(request);
    request$.subscribe({
      next: () => {
        this.saving.set(false);
        this.editorOpen.set(false);
        this.alert.success(this.language.t(current ? 'IAM.GROUPS.UPDATED' : 'IAM.GROUPS.CREATED', { name: request.name }));
        this.load();
      },
      error: (error: unknown) => {
        this.saving.set(false);
        if (hasCatalogError(error, 'CONCURRENT_MODIFICATION')) {
          this.alert.warning(this.language.t('IAM.COMMON.CONCURRENT_MODIFICATION'));
          this.editorOpen.set(false);
          this.load();
          return;
        }
        let applied = false;
        for (const detail of catalogErrors(error)) {
          const control = detail.field ? this.form.get(detail.field) : null;
          if (control) {
            control.setErrors({ serverValidation: detail.message });
            control.markAsTouched();
            applied = true;
          }
        }
        if (!applied) {
          this.alert.error(catalogErrorMessage(error, this.language.t('COMMON.TOAST.SAVE_FAILED')));
        }
      },
    });
  }

  protected async toggleStatus(group: PermissionGroupSummary): Promise<void> {
    const next = group.status === 'ACTIVE' ? 'INACTIVE' : 'ACTIVE';
    const confirmed = await this.confirm.confirm({
      title: this.language.t('COMMON.STATUS_TOGGLE.CONFIRM_TITLE'),
      message: this.language.t(next === 'INACTIVE' ? 'IAM.GROUPS.DEACTIVATE_MESSAGE' : 'IAM.GROUPS.ACTIVATE_MESSAGE', {
        name: group.name,
        roles: group.roleCount,
        users: group.userCount,
      }),
      severity: next === 'INACTIVE' ? 'danger' : 'primary',
    });
    if (!confirmed) {
      return;
    }
    this.permissionService
      .getGroup(group.id)
      .pipe(switchMap((detail) => this.permissionService.changeGroupStatus(group.id, next, detail.data?.version ?? 0)))
      .subscribe({
        next: () => {
          this.alert.success(this.language.t('COMMON.STATUS_TOGGLE.SUCCESS'));
          this.load();
        },
        error: (error: unknown) => this.alert.error(catalogErrorMessage(error, this.language.t('COMMON.STATUS_TOGGLE.FAILED'))),
      });
  }

  protected async remove(group: PermissionGroupSummary): Promise<void> {
    if (group.roleCount + group.userCount > 0) {
      this.alert.warning(this.language.t('IAM.GROUPS.DELETE_BLOCKED', { roles: group.roleCount, users: group.userCount }));
      return;
    }
    const confirmed = await this.confirm.confirmDelete(group.name);
    if (!confirmed) {
      return;
    }
    this.permissionService.deleteGroup(group.id).subscribe({
      next: () => {
        this.alert.success(this.language.t('IAM.GROUPS.DELETED'));
        this.load();
      },
      error: (error: unknown) => this.alert.error(catalogErrorMessage(error, this.language.t('COMMON.TOAST.DELETE_FAILED'))),
    });
  }

  protected showError(name: 'code' | 'name' | 'description'): boolean {
    const control = this.form.controls[name];
    return control.invalid && (control.touched || control.dirty);
  }
}
