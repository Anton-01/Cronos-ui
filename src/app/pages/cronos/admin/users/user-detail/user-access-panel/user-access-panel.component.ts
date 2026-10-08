import { ChangeDetectionStrategy, Component, DestroyRef, OnInit, computed, effect, inject, input, output, signal, untracked } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { TranslatePipe } from '@ngx-translate/core';
import { ButtonModule } from 'primeng/button';
import { CardModule } from 'primeng/card';
import { MessageModule } from 'primeng/message';
import { MultiSelectModule } from 'primeng/multiselect';
import { TagModule } from 'primeng/tag';
import { TooltipModule } from 'primeng/tooltip';
import { Subject, catchError, debounceTime, forkJoin, of, switchMap } from 'rxjs';

import { PERMISSIONS } from 'src/app/core/constants/permissions';
import {
  EffectivePermission,
  IamRoleSummary,
  IamUserDetail,
  PermissionDefinition,
  PermissionGroupSummary,
  PermissionSource,
  PreviewUserAccessRequest,
  SodConflict,
  UserAccess,
} from 'src/app/core/models/iam.models';
import { AuthorizationService } from 'src/app/core/services/authorization.service';
import { IamPermissionService } from 'src/app/core/services/iam/iam-permission.service';
import { IamRoleService } from 'src/app/core/services/iam/iam-role.service';
import { IamUserService } from 'src/app/core/services/iam/iam-user.service';
import { LanguageService } from 'src/app/core/services/language.service';
import { catalogErrorMessage, findCatalogError } from 'src/app/core/utils/catalog-error.util';
import { AlertService } from 'src/app/shared/services/alert.service';
import { ConfirmService } from 'src/app/shared/services/confirm.service';
import { PermissionMatrixComponent } from '../../../shared/permission-matrix/permission-matrix.component';
import { ReasonDialogComponent } from '../../../shared/reason-dialog/reason-dialog.component';
import { RoleChipComponent } from '../../../shared/role-chip.component';

interface Draft {
  roleIds: number[];
  permissionGroupIds: number[];
  grants: string[];
  denials: string[];
}

function sameSet<T>(a: readonly T[], b: readonly T[]): boolean {
  if (a.length !== b.length) {
    return false;
  }
  const set = new Set(a);
  return b.every((item) => set.has(item));
}

/**
 * Edits the four access levers of a user — roles, permission groups, direct
 * grants and explicit denials — with a live server-side preview of the
 * effective permissions and any Segregation-of-Duties conflicts (doc §3.6).
 */
@Component({
  selector: 'app-user-access-panel',
  standalone: true,
  imports: [
    FormsModule,
    TranslatePipe,
    ButtonModule,
    CardModule,
    MessageModule,
    MultiSelectModule,
    TagModule,
    TooltipModule,
    PermissionMatrixComponent,
    ReasonDialogComponent,
    RoleChipComponent,
  ],
  templateUrl: './user-access-panel.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class UserAccessPanelComponent implements OnInit {
  private readonly userService = inject(IamUserService);
  private readonly roleService = inject(IamRoleService);
  private readonly permissionService = inject(IamPermissionService);
  private readonly authorization = inject(AuthorizationService);
  private readonly alert = inject(AlertService);
  private readonly confirm = inject(ConfirmService);
  private readonly language = inject(LanguageService);
  private readonly destroyRef = inject(DestroyRef);

  readonly user = input.required<IamUserDetail>();
  readonly accessSaved = output<void>();
  readonly writeFailed = output<unknown>();

  protected readonly loading = signal(true);
  protected readonly loadFailed = signal(false);
  protected readonly catalog = signal<PermissionDefinition[]>([]);
  protected readonly roles = signal<IamRoleSummary[]>([]);
  protected readonly groups = signal<PermissionGroupSummary[]>([]);
  protected readonly original = signal<UserAccess | null>(null);

  protected readonly roleIds = signal<number[]>([]);
  protected readonly groupIds = signal<number[]>([]);
  protected readonly grants = signal<readonly string[]>([]);
  protected readonly denials = signal<readonly string[]>([]);

  protected readonly effective = signal<EffectivePermission[]>([]);
  protected readonly conflicts = signal<SodConflict[]>([]);
  protected readonly added = signal<string[]>([]);
  protected readonly removed = signal<string[]>([]);
  protected readonly previewing = signal(false);

  protected readonly reasonOpen = signal(false);
  protected readonly saving = signal(false);

  protected readonly isSelf = computed(() => this.user().id === this.authorization.currentUserId());
  protected readonly canEdit = computed(() => this.authorization.can(PERMISSIONS.IAM_USER_MANAGE_ACCESS) && !this.isSelf());

  protected readonly roleOptions = computed(() =>
    this.roles().map((role) => ({ label: role.name, value: role.id, color: role.color, disabled: role.status !== 'ACTIVE' })),
  );
  protected readonly groupOptions = computed(() =>
    this.groups().map((group) => ({ label: group.name, value: group.id, disabled: group.status !== 'ACTIVE' })),
  );
  protected readonly selectedRoles = computed(() => {
    const ids = new Set(this.roleIds());
    return this.roles().filter((role) => ids.has(role.id));
  });

  /** code → "Rol: Ventas · Grupo: Reportes" for every permission held through something other than a direct grant. */
  protected readonly inherited = computed<ReadonlyMap<string, string>>(() => {
    const map = new Map<string, string>();
    for (const permission of this.effective()) {
      const labels = permission.sources.filter((source) => source.type !== 'DIRECT_GRANT').map((source) => this.sourceLabel(source));
      if (labels.length > 0) {
        map.set(permission.code, labels.join(' · '));
      }
    }
    return map;
  });

  protected readonly grantedCount = computed(() => this.effective().filter((permission) => permission.granted).length);
  protected readonly blocking = computed(() => this.conflicts().some((conflict) => conflict.severity === 'BLOCKING'));

  private readonly draft = computed<Draft>(() => ({
    roleIds: this.roleIds(),
    permissionGroupIds: this.groupIds(),
    grants: [...this.grants()],
    denials: [...this.denials()],
  }));

  protected readonly isDirty = computed(() => {
    const original = this.original();
    if (!original) {
      return false;
    }
    const draft = this.draft();
    return !(
      sameSet(draft.roleIds, original.roles.map((role) => role.id)) &&
      sameSet(draft.permissionGroupIds, original.permissionGroups.map((group) => group.id)) &&
      sameSet(draft.grants, original.grants) &&
      sameSet(draft.denials, original.denials)
    );
  });

  private readonly previews = new Subject<PreviewUserAccessRequest>();

  constructor() {
    this.previews
      .pipe(
        debounceTime(300),
        switchMap((request) => {
          this.previewing.set(true);
          return this.userService.previewAccess(this.user().id, request).pipe(catchError(() => of(null)));
        }),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe((response) => {
        this.previewing.set(false);
        // A preview that lands after a discard describes a draft that no longer exists.
        if (response?.data && this.isDirty()) {
          this.effective.set(response.data.effective);
          this.conflicts.set(response.data.sodConflicts);
          this.added.set(response.data.added);
          this.removed.set(response.data.removed);
        }
      });

    effect(() => {
      const draft = this.draft();
      untracked(() => {
        if (this.isDirty()) {
          this.previews.next(draft);
          return;
        }
        // Back to the saved state: show the saved effective set, not the last preview.
        const original = this.original();
        if (original) {
          this.effective.set(original.effective);
          this.conflicts.set(original.sodConflicts);
          this.added.set([]);
          this.removed.set([]);
        }
      });
    });
  }

  ngOnInit(): void {
    this.load();
  }

  protected load(): void {
    this.loading.set(true);
    this.loadFailed.set(false);
    forkJoin({
      access: this.userService.getAccess(this.user().id),
      catalog: this.permissionService.catalog(),
      roles: this.roleService.list(),
      groups: this.permissionService.listGroups(),
    }).subscribe({
      next: ({ access, catalog, roles, groups }) => {
        this.catalog.set(catalog);
        this.roles.set(roles.data ?? []);
        this.groups.set(groups.data ?? []);
        if (access.data) {
          this.reset(access.data);
        }
        this.loading.set(false);
      },
      error: (error: unknown) => {
        this.loading.set(false);
        this.loadFailed.set(true);
        this.permissionService.invalidateCatalog();
        this.alert.error(catalogErrorMessage(error, this.language.t('IAM.DETAIL.ACCESS.LOAD_FAILED')));
      },
    });
  }

  private reset(access: UserAccess): void {
    this.original.set(access);
    this.roleIds.set(access.roles.map((role) => role.id));
    this.groupIds.set(access.permissionGroups.map((group) => group.id));
    this.grants.set(access.grants);
    this.denials.set(access.denials);
    this.effective.set(access.effective);
    this.conflicts.set(access.sodConflicts);
    this.added.set([]);
    this.removed.set([]);
  }

  protected discard(): void {
    const original = this.original();
    if (original) {
      this.reset(original);
    }
  }

  protected labelOf(code: string): string {
    return this.catalog().find((permission) => permission.code === code)?.name ?? code;
  }

  private sourceLabel(source: PermissionSource): string {
    const prefix = this.language.t(`IAM.DETAIL.ACCESS.SOURCE.${source.type}`);
    const via = source.viaName ? ` (${this.language.t('IAM.DETAIL.ACCESS.VIA')} ${source.viaName})` : '';
    return `${prefix}: ${source.name ?? '—'}${via}`;
  }

  // ─── Save ───

  protected requestSave(): void {
    if (!this.canEdit() || !this.isDirty()) {
      return;
    }
    if (this.blocking()) {
      this.alert.error(this.language.t('IAM.SOD.BLOCKING_SAVE'));
      return;
    }
    this.reasonOpen.set(true);
  }

  protected save(reason: string): void {
    const original = this.original();
    if (!original) {
      return;
    }
    this.saving.set(true);
    this.userService.updateAccess(this.user().id, { ...this.draft(), reason, version: original.version }).subscribe({
      next: (response) => {
        this.saving.set(false);
        this.reasonOpen.set(false);
        if (response.data) {
          this.reset(response.data);
        }
        this.alert.success(this.language.t('IAM.DETAIL.ACCESS.SAVED'));
        this.accessSaved.emit();
      },
      error: (error: unknown) => {
        this.saving.set(false);
        const escalation = findCatalogError(error, 'PRIVILEGE_ESCALATION');
        if (escalation) {
          this.alert.error(escalation.message);
          return;
        }
        this.reasonOpen.set(false);
        this.writeFailed.emit(error);
      },
    });
  }

  async canDeactivate(): Promise<boolean> {
    if (!this.isDirty()) {
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
