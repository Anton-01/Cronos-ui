import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, DestroyRef, computed, effect, inject, signal, untracked } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
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
import { MultiSelectModule } from 'primeng/multiselect';
import { SelectModule } from 'primeng/select';
import { TableLazyLoadEvent, TableModule } from 'primeng/table';
import { TagModule } from 'primeng/tag';
import { TooltipModule } from 'primeng/tooltip';
import { Subject, catchError, debounceTime, distinctUntilChanged, of, switchMap } from 'rxjs';

import { PERMISSIONS } from 'src/app/core/constants/permissions';
import {
  BulkResult,
  IamRoleSummary,
  IamUserSummary,
  USER_STATUS_TRANSITIONS,
  UserQuery,
  UserStats,
  UserStatus,
} from 'src/app/core/models/iam.models';
import { AuthorizationService } from 'src/app/core/services/authorization.service';
import { triggerBlobDownload } from 'src/app/core/services/domain/import-file.util';
import { IamRoleService } from 'src/app/core/services/iam/iam-role.service';
import { IamUserService } from 'src/app/core/services/iam/iam-user.service';
import { LanguageService } from 'src/app/core/services/language.service';
import { PageInfoService } from 'src/app/core/services/page-info.service';
import { catalogErrorMessage } from 'src/app/core/utils/catalog-error.util';
import { StatCardComponent } from 'src/app/shared/components/stat-card/stat-card.component';
import { TableSkeletonRowComponent } from 'src/app/shared/components/table-skeleton-row/table-skeleton-row.component';
import { CanDirective } from 'src/app/shared/directives/can.directive';
import { AlertService } from 'src/app/shared/services/alert.service';
import { ChangeStatusDialogComponent, StatusChange } from '../../shared/change-status-dialog/change-status-dialog.component';
import { userStatusOptions } from '../../shared/iam-labels';
import { RoleChipComponent } from '../../shared/role-chip.component';
import { UserAvatarComponent } from '../../shared/user-avatar.component';
import { UserStatusTagComponent } from '../../shared/user-status-tag.component';
import { BulkRolesDialogComponent } from './bulk-roles-dialog.component';

const MAX_ROLE_CHIPS = 2;

/** Bulk lifecycle actions offered from the selection toolbar. */
const BULK_STATUSES: readonly UserStatus[] = ['ACTIVE', 'SUSPENDED', 'LOCKED', 'DEACTIVATED'];

@Component({
  selector: 'app-user-list',
  standalone: true,
  imports: [
    DatePipe,
    FormsModule,
    RouterLink,
    TranslatePipe,
    ButtonModule,
    CardModule,
    DialogModule,
    IconFieldModule,
    InputIconModule,
    InputTextModule,
    MenuModule,
    MultiSelectModule,
    SelectModule,
    TableModule,
    TagModule,
    TooltipModule,
    CanDirective,
    StatCardComponent,
    TableSkeletonRowComponent,
    ChangeStatusDialogComponent,
    BulkRolesDialogComponent,
    RoleChipComponent,
    UserAvatarComponent,
    UserStatusTagComponent,
  ],
  templateUrl: './user-list.component.html',
  styleUrl: './user-list.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class UserListComponent {
  private readonly userService = inject(IamUserService);
  private readonly roleService = inject(IamRoleService);
  private readonly authorization = inject(AuthorizationService);
  private readonly alert = inject(AlertService);
  private readonly language = inject(LanguageService);
  private readonly pageInfo = inject(PageInfoService);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);

  protected readonly perms = PERMISSIONS;
  protected readonly maxRoleChips = MAX_ROLE_CHIPS;
  protected readonly skeletonRows = Array.from({ length: 8 });

  protected readonly users = signal<IamUserSummary[]>([]);
  protected readonly total = signal(0);
  protected readonly loading = signal(true);
  protected readonly exporting = signal(false);
  protected readonly stats = signal<UserStats | null>(null);
  protected readonly statsLoading = signal(true);
  protected readonly roles = signal<IamRoleSummary[]>([]);
  protected readonly selection = signal<IamUserSummary[]>([]);
  protected readonly rowMenu = signal<MenuItem[]>([]);
  protected readonly first = signal(0);

  // Filters
  protected readonly search = signal('');
  protected readonly statuses = signal<UserStatus[]>([]);
  protected readonly roleIds = signal<number[]>([]);
  protected readonly twoFactor = signal<boolean | null>(null);
  private readonly paging = signal<{ page: number; size: number; sort: string }>({ page: 0, size: 10, sort: 'createdAt,desc' });

  // Bulk dialogs
  protected readonly statusDialogOpen = signal(false);
  protected readonly bulkTarget = signal<UserStatus | null>(null);
  protected readonly bulkRolesOpen = signal(false);
  protected readonly bulkSaving = signal(false);

  protected readonly statusOptions = computed(() => userStatusOptions((key) => this.language.t(key)));
  protected readonly roleOptions = computed(() => this.roles().map((role) => ({ label: role.name, value: role.id })));
  protected readonly twoFactorOptions = computed(() => [
    { label: this.language.t('IAM.USERS.FILTERS.TWO_FACTOR_ON'), value: true },
    { label: this.language.t('IAM.USERS.FILTERS.TWO_FACTOR_OFF'), value: false },
  ]);
  protected readonly hasFilters = computed(
    () => this.search().length > 0 || this.statuses().length > 0 || this.roleIds().length > 0 || this.twoFactor() !== null,
  );
  protected readonly canChangeStatus = computed(() => this.authorization.can(PERMISSIONS.IAM_USER_CHANGE_STATUS));
  protected readonly canManageAccess = computed(() => this.authorization.can(PERMISSIONS.IAM_USER_MANAGE_ACCESS));
  protected readonly bulkMenu = computed<MenuItem[]>(() => [
    ...BULK_STATUSES.map((status) => ({
      label: this.language.t(`IAM.USERS.BULK.SET_${status}`),
      icon: this.bulkIcon(status),
      disabled: !this.canChangeStatus(),
      command: () => this.openBulkStatus(status),
    })),
    { separator: true },
    {
      label: this.language.t('IAM.USERS.BULK.ROLES'),
      icon: 'pi pi-shield',
      disabled: !this.canManageAccess(),
      command: () => this.bulkRolesOpen.set(true),
    },
  ]);
  protected readonly selectionLabel = computed(() =>
    this.language.t('IAM.USERS.BULK.SUBJECT', { count: this.selection().length }),
  );

  private readonly requests = new Subject<UserQuery>();
  private readonly searchInput = new Subject<string>();

  constructor() {
    effect(() => {
      this.pageInfo.updateTitle(this.language.t('IAM.USERS.TITLE'));
      this.pageInfo.updateDescription(this.language.t('IAM.USERS.DESCRIPTION'));
      this.pageInfo.updateBreadcrumbs([
        { title: this.language.t('BREADCRUMB.HOME'), path: '/dashboard', isActive: false },
        { title: this.language.t('NAV.SECTIONS.ADMINISTRATION'), path: '', isActive: false },
        { title: this.language.t('IAM.USERS.TITLE'), path: '', isActive: true },
      ]);
    });

    this.requests
      .pipe(
        switchMap((query) => {
          this.loading.set(true);
          return this.userService.search(query).pipe(
            catchError((error: unknown) => {
              this.alert.error(catalogErrorMessage(error, this.language.t('IAM.USERS.LOAD_FAILED')));
              return of(null);
            }),
          );
        }),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe((response) => {
        this.users.set(response?.data?.content ?? []);
        this.total.set(response?.data?.totalElements ?? 0);
        this.loading.set(false);
      });

    this.searchInput
      .pipe(debounceTime(350), distinctUntilChanged(), takeUntilDestroyed(this.destroyRef))
      .subscribe((term) => this.applyFilter(() => this.search.set(term)));

    effect(() => {
      const query = this.buildQuery();
      untracked(() => this.requests.next(query));
    });

    this.loadStats();
    this.roleService.list().subscribe({
      next: (response) => this.roles.set(response.data ?? []),
      error: () => this.roles.set([]),
    });
  }

  // ─── Data ───

  protected reload(): void {
    this.requests.next(this.buildQuery());
    this.loadStats();
  }

  private loadStats(): void {
    this.statsLoading.set(true);
    this.userService.stats().subscribe({
      next: (response) => {
        this.stats.set(response.data);
        this.statsLoading.set(false);
      },
      error: () => this.statsLoading.set(false),
    });
  }

  protected onLazyLoad(event: TableLazyLoadEvent): void {
    const size = event.rows ?? 10;
    const field = typeof event.sortField === 'string' ? event.sortField : 'createdAt';
    const sort = `${field},${event.sortOrder === 1 ? 'asc' : 'desc'}`;
    const next = { page: Math.floor((event.first ?? 0) / size), size, sort };
    const current = this.paging();
    if (current.page !== next.page || current.size !== next.size || current.sort !== next.sort) {
      this.first.set(event.first ?? 0);
      this.paging.set(next);
    }
  }

  protected onSearch(term: string): void {
    this.searchInput.next(term.trim());
  }

  protected setStatuses(value: UserStatus[]): void {
    this.applyFilter(() => this.statuses.set(value));
  }

  protected setRoleIds(value: number[]): void {
    this.applyFilter(() => this.roleIds.set(value));
  }

  protected setTwoFactor(value: boolean | null): void {
    this.applyFilter(() => this.twoFactor.set(value));
  }

  private applyFilter(change: () => void): void {
    change();
    this.selection.set([]);
    this.first.set(0);
    this.paging.update((current) => ({ ...current, page: 0 }));
  }

  /** KPI tiles double as one-click status filters. */
  protected filterByStatus(status: UserStatus | null): void {
    this.applyFilter(() => this.statuses.set(status ? [status] : []));
  }

  protected clearFilters(): void {
    this.applyFilter(() => {
      this.search.set('');
      this.statuses.set([]);
      this.roleIds.set([]);
      this.twoFactor.set(null);
    });
  }

  private buildQuery(): UserQuery {
    const { page, size, sort } = this.paging();
    return {
      page,
      size,
      sort,
      search: this.search() || undefined,
      statuses: this.statuses(),
      roleIds: this.roleIds(),
      twoFactorEnabled: this.twoFactor() ?? undefined,
    };
  }

  // ─── Row actions ───

  protected visibleRoles(user: IamUserSummary): IamUserSummary['roles'] {
    return user.roles.slice(0, MAX_ROLE_CHIPS);
  }

  protected hiddenRoles(user: IamUserSummary): string {
    return user.roles
      .slice(MAX_ROLE_CHIPS)
      .map((role) => role.name)
      .join(', ');
  }

  protected openRowMenu(user: IamUserSummary): void {
    const tab = (value: string) => () => this.router.navigate(['/cronos/admin/usuarios', user.id], { queryParams: { tab: value } });
    const items: MenuItem[] = [
      { label: this.language.t('IAM.USERS.ACTIONS.OPEN'), icon: 'pi pi-external-link', command: tab('overview') },
    ];
    if (this.canManageAccess()) {
      items.push({ label: this.language.t('IAM.USERS.ACTIONS.MANAGE_ACCESS'), icon: 'pi pi-shield', command: tab('access') });
    }
    if (this.authorization.can(PERMISSIONS.IAM_USER_RESET_CREDENTIALS) || this.authorization.can(PERMISSIONS.IAM_USER_MANAGE_SESSIONS)) {
      items.push({ label: this.language.t('IAM.USERS.ACTIONS.SECURITY'), icon: 'pi pi-lock', command: tab('security') });
    }
    if (this.authorization.can(PERMISSIONS.IAM_AUDIT_READ)) {
      items.push({ label: this.language.t('IAM.USERS.ACTIONS.ACTIVITY'), icon: 'pi pi-history', command: tab('activity') });
    }
    this.rowMenu.set(items);
  }

  // ─── Bulk ───

  private bulkIcon(status: UserStatus): string {
    return { ACTIVE: 'pi pi-check-circle', SUSPENDED: 'pi pi-pause-circle', LOCKED: 'pi pi-lock', DEACTIVATED: 'pi pi-ban', PENDING_ACTIVATION: 'pi pi-envelope' }[status];
  }

  private openBulkStatus(status: UserStatus): void {
    const self = this.authorization.currentUserId();
    if (this.selection().some((user) => user.id === self) && status !== 'ACTIVE') {
      this.alert.warning(this.language.t('IAM.USERS.BULK.SELF_EXCLUDED'));
    }
    this.bulkTarget.set(status);
    this.statusDialogOpen.set(true);
  }

  protected applyBulkStatus(change: StatusChange): void {
    const self = this.authorization.currentUserId();
    // Users for whom the transition is legal; the server re-validates each one.
    const eligible = this.selection().filter(
      (user) => user.id !== self && USER_STATUS_TRANSITIONS[user.status].includes(change.status),
    );
    if (eligible.length === 0) {
      this.alert.warning(this.language.t('IAM.USERS.BULK.NONE_ELIGIBLE'));
      return;
    }
    this.bulkSaving.set(true);
    this.userService
      .bulkStatus({ userIds: eligible.map((user) => user.id), status: change.status, reason: change.reason, comment: change.comment })
      .subscribe({
        next: (response) => {
          this.bulkSaving.set(false);
          this.statusDialogOpen.set(false);
          this.reportBulk(response.data, this.selection().length - eligible.length);
        },
        error: (error: unknown) => {
          this.bulkSaving.set(false);
          this.alert.error(catalogErrorMessage(error, this.language.t('IAM.USERS.BULK.FAILED')));
        },
      });
  }

  protected onBulkRolesDone(result: BulkResult | null): void {
    this.bulkRolesOpen.set(false);
    if (result) {
      this.reportBulk(result, 0);
    }
  }

  private reportBulk(result: BulkResult | null, skipped: number): void {
    const succeeded = result?.succeeded.length ?? 0;
    const failed = (result?.failed.length ?? 0) + skipped;
    if (failed === 0) {
      this.alert.success(this.language.t('IAM.USERS.BULK.DONE', { count: succeeded }));
    } else {
      const firstFailure = result?.failed[0]?.message;
      this.alert.warning(
        this.language.t('IAM.USERS.BULK.PARTIAL', { ok: succeeded, failed }) + (firstFailure ? ` — ${firstFailure}` : ''),
      );
    }
    this.selection.set([]);
    this.reload();
  }

  // ─── Export ───

  protected export(): void {
    const { page: _page, size: _size, ...query } = this.buildQuery();
    this.exporting.set(true);
    this.userService.export(query).subscribe({
      next: (file) => {
        this.exporting.set(false);
        triggerBlobDownload(file.blob, file.fileName);
      },
      error: (error: unknown) => {
        this.exporting.set(false);
        this.alert.error(catalogErrorMessage(error, this.language.t('IAM.USERS.EXPORT_FAILED')));
      },
    });
  }
}
