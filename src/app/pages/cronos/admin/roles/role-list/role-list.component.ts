import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, effect, inject, signal } from '@angular/core';
import { FormBuilder, FormsModule, ReactiveFormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { TranslatePipe } from '@ngx-translate/core';
import { MenuItem } from 'primeng/api';
import { ButtonModule } from 'primeng/button';
import { CardModule } from 'primeng/card';
import { DialogModule } from 'primeng/dialog';
import { IconFieldModule } from 'primeng/iconfield';
import { InputIconModule } from 'primeng/inputicon';
import { InputTextModule } from 'primeng/inputtext';
import { MenuModule } from 'primeng/menu';
import { SelectModule } from 'primeng/select';
import { TableModule } from 'primeng/table';
import { TagModule } from 'primeng/tag';
import { TooltipModule } from 'primeng/tooltip';
import { switchMap } from 'rxjs';

import { PERMISSIONS } from 'src/app/core/constants/permissions';
import { IamRecordStatus, IamRoleSummary } from 'src/app/core/models/iam.models';
import { AuthorizationService } from 'src/app/core/services/authorization.service';
import { IamRoleService } from 'src/app/core/services/iam/iam-role.service';
import { LanguageService } from 'src/app/core/services/language.service';
import { PageInfoService } from 'src/app/core/services/page-info.service';
import { catalogErrorMessage, catalogErrors } from 'src/app/core/utils/catalog-error.util';
import { FieldErrorComponent } from 'src/app/shared/components/field-error/field-error.component';
import { TableSkeletonRowComponent } from 'src/app/shared/components/table-skeleton-row/table-skeleton-row.component';
import { CanDirective } from 'src/app/shared/directives/can.directive';
import { statusOptions } from 'src/app/shared/i18n/catalog-options';
import { AlertService } from 'src/app/shared/services/alert.service';
import { ConfirmService } from 'src/app/shared/services/confirm.service';
import { RoleChipComponent } from '../../shared/role-chip.component';
import { IAM_CODE_MAX, iamCodeValidators, iamNameValidators, toIamCode } from '../../shared/iam-validators';

@Component({
  selector: 'app-role-list',
  standalone: true,
  imports: [
    DatePipe,
    FormsModule,
    ReactiveFormsModule,
    RouterLink,
    TranslatePipe,
    ButtonModule,
    CardModule,
    DialogModule,
    IconFieldModule,
    InputIconModule,
    InputTextModule,
    MenuModule,
    SelectModule,
    TableModule,
    TagModule,
    TooltipModule,
    CanDirective,
    FieldErrorComponent,
    RoleChipComponent,
    TableSkeletonRowComponent,
  ],
  templateUrl: './role-list.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class RoleListComponent {
  private readonly roleService = inject(IamRoleService);
  private readonly authorization = inject(AuthorizationService);
  private readonly alert = inject(AlertService);
  private readonly confirm = inject(ConfirmService);
  private readonly language = inject(LanguageService);
  private readonly pageInfo = inject(PageInfoService);
  private readonly router = inject(Router);
  private readonly fb = inject(FormBuilder);

  protected readonly perms = PERMISSIONS;
  protected readonly codeMax = IAM_CODE_MAX;
  protected readonly skeletonRows = Array.from({ length: 5 });

  protected readonly roles = signal<IamRoleSummary[]>([]);
  protected readonly loading = signal(true);
  protected readonly search = signal('');
  protected readonly status = signal<IamRecordStatus | null>(null);
  protected readonly rowMenu = signal<MenuItem[]>([]);

  protected readonly cloneSource = signal<IamRoleSummary | null>(null);
  protected readonly cloning = signal(false);
  protected readonly cloneForm = this.fb.nonNullable.group({
    code: ['', iamCodeValidators],
    name: ['', iamNameValidators],
  });

  protected readonly statusOptions = computed(() => statusOptions((key) => this.language.t(key)));
  protected readonly filtered = computed(() => {
    const term = this.search().trim().toLowerCase();
    const status = this.status();
    return this.roles().filter(
      (role) =>
        (!status || role.status === status) &&
        (!term ||
          role.name.toLowerCase().includes(term) ||
          role.code.toLowerCase().includes(term) ||
          (role.description ?? '').toLowerCase().includes(term)),
    );
  });
  protected readonly totals = computed(() => ({
    roles: this.roles().length,
    custom: this.roles().filter((role) => !role.system).length,
    unused: this.roles().filter((role) => role.userCount === 0).length,
  }));

  constructor() {
    effect(() => {
      this.pageInfo.updateTitle(this.language.t('IAM.ROLES.TITLE'));
      this.pageInfo.updateDescription(this.language.t('IAM.ROLES.DESCRIPTION'));
      this.pageInfo.updateBreadcrumbs([
        { title: this.language.t('BREADCRUMB.HOME'), path: '/dashboard', isActive: false },
        { title: this.language.t('NAV.SECTIONS.ADMINISTRATION'), path: '', isActive: false },
        { title: this.language.t('IAM.ROLES.TITLE'), path: '', isActive: true },
      ]);
    });
    this.load();
  }

  protected load(): void {
    this.loading.set(true);
    this.roleService.list().subscribe({
      next: (response) => {
        this.roles.set(response.data ?? []);
        this.loading.set(false);
      },
      error: (error: unknown) => {
        this.loading.set(false);
        this.alert.error(catalogErrorMessage(error, this.language.t('IAM.ROLES.LOAD_FAILED')));
      },
    });
  }

  protected openRowMenu(role: IamRoleSummary): void {
    const items: MenuItem[] = [
      { label: this.language.t('IAM.ROLES.ACTIONS.OPEN'), icon: 'pi pi-pencil', command: () => this.open(role) },
      {
        label: this.language.t('IAM.ROLES.ACTIONS.MEMBERS'),
        icon: 'pi pi-users',
        command: () => void this.router.navigate(['/cronos/admin/roles', role.id], { queryParams: { tab: 'members' } }),
      },
    ];
    if (this.authorization.can(PERMISSIONS.IAM_ROLE_CREATE)) {
      items.push({ label: this.language.t('IAM.ROLES.ACTIONS.CLONE'), icon: 'pi pi-copy', command: () => this.openClone(role) });
    }
    if (this.authorization.can(PERMISSIONS.IAM_ROLE_UPDATE) && !role.system) {
      items.push({
        label: this.language.t(role.status === 'ACTIVE' ? 'IAM.ROLES.ACTIONS.DEACTIVATE' : 'IAM.ROLES.ACTIONS.ACTIVATE'),
        icon: role.status === 'ACTIVE' ? 'pi pi-ban' : 'pi pi-check-circle',
        command: () => void this.toggleStatus(role),
      });
    }
    if (this.authorization.can(PERMISSIONS.IAM_ROLE_DELETE) && !role.system) {
      items.push({ separator: true });
      items.push({
        label: this.language.t('COMMON.DELETE'),
        icon: 'pi pi-trash',
        disabled: role.userCount > 0,
        title: role.userCount > 0 ? this.language.t('IAM.ROLES.DELETE_BLOCKED') : undefined,
        command: () => void this.remove(role),
      });
    }
    this.rowMenu.set(items);
  }

  protected open(role: IamRoleSummary): void {
    void this.router.navigate(['/cronos/admin/roles', role.id]);
  }

  private async toggleStatus(role: IamRoleSummary): Promise<void> {
    const next: IamRecordStatus = role.status === 'ACTIVE' ? 'INACTIVE' : 'ACTIVE';
    const confirmed = await this.confirm.confirm({
      title: this.language.t('COMMON.STATUS_TOGGLE.CONFIRM_TITLE'),
      message: this.language.t(next === 'INACTIVE' ? 'IAM.ROLES.DEACTIVATE_MESSAGE' : 'IAM.ROLES.ACTIVATE_MESSAGE', {
        name: role.name,
        count: role.userCount,
      }),
      severity: next === 'INACTIVE' ? 'danger' : 'primary',
    });
    if (!confirmed) {
      return;
    }
    // The list carries no version; fetch the detail first so the write is optimistic-locked.
    this.roleService
      .getById(role.id)
      .pipe(switchMap((detail) => this.roleService.changeStatus(role.id, next, detail.data?.version ?? 0)))
      .subscribe({
        next: () => {
          this.alert.success(this.language.t('COMMON.STATUS_TOGGLE.SUCCESS'));
          this.load();
        },
        error: (error: unknown) => this.alert.error(catalogErrorMessage(error, this.language.t('COMMON.STATUS_TOGGLE.FAILED'))),
      });
  }

  private async remove(role: IamRoleSummary): Promise<void> {
    const confirmed = await this.confirm.confirmDelete(role.name);
    if (!confirmed) {
      return;
    }
    this.roleService.delete(role.id).subscribe({
      next: () => {
        this.alert.success(this.language.t('IAM.ROLES.DELETED'));
        this.load();
      },
      error: (error: unknown) => this.alert.error(catalogErrorMessage(error, this.language.t('COMMON.TOAST.DELETE_FAILED'))),
    });
  }

  // ─── Clone ───

  private openClone(role: IamRoleSummary): void {
    this.cloneForm.reset({ code: toIamCode(`${role.code}_COPY`), name: `${role.name} (${this.language.t('IAM.ROLES.COPY')})` });
    this.cloneSource.set(role);
  }

  protected normalizeCloneCode(): void {
    const control = this.cloneForm.controls.code;
    control.setValue(toIamCode(control.value));
  }

  protected submitClone(): void {
    const source = this.cloneSource();
    if (!source || this.cloning()) {
      return;
    }
    if (this.cloneForm.invalid) {
      this.cloneForm.markAllAsTouched();
      return;
    }
    this.cloning.set(true);
    this.roleService.clone(source.id, this.cloneForm.getRawValue()).subscribe({
      next: (response) => {
        this.cloning.set(false);
        this.cloneSource.set(null);
        this.alert.success(this.language.t('IAM.ROLES.CLONED'));
        if (response.data) {
          void this.router.navigate(['/cronos/admin/roles', response.data.id]);
        }
      },
      error: (error: unknown) => {
        this.cloning.set(false);
        let applied = false;
        for (const detail of catalogErrors(error)) {
          const control = detail.field === 'code' || detail.field === 'name' ? this.cloneForm.controls[detail.field] : null;
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
}
