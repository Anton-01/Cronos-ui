import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, effect, inject, signal, viewChild } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { TranslatePipe } from '@ngx-translate/core';
import { MenuItem } from 'primeng/api';
import { ButtonModule } from 'primeng/button';
import { CardModule } from 'primeng/card';
import { MenuModule } from 'primeng/menu';
import { MessageModule } from 'primeng/message';
import { SelectButtonModule } from 'primeng/selectbutton';
import { SkeletonModule } from 'primeng/skeleton';
import { TabsModule } from 'primeng/tabs';
import { TagModule } from 'primeng/tag';
import { TooltipModule } from 'primeng/tooltip';
import { FormsModule } from '@angular/forms';
import { map } from 'rxjs';

import { HasUnsavedChanges } from 'src/app/core/guards/unsaved-changes.guard';
import { PERMISSIONS } from 'src/app/core/constants/permissions';
import { AuditPerspective, IamUserDetail, USER_STATUS_TRANSITIONS, UserStatus } from 'src/app/core/models/iam.models';
import { AuthorizationService } from 'src/app/core/services/authorization.service';
import { IamUserService } from 'src/app/core/services/iam/iam-user.service';
import { LanguageService } from 'src/app/core/services/language.service';
import { PageInfoService } from 'src/app/core/services/page-info.service';
import { catalogErrorMessage, hasCatalogError } from 'src/app/core/utils/catalog-error.util';
import { DetailSkeletonComponent } from 'src/app/shared/components/detail-skeleton/detail-skeleton.component';
import { AlertService } from 'src/app/shared/services/alert.service';
import { AuditEventTableComponent } from '../../shared/audit-event-table/audit-event-table.component';
import { ChangeStatusDialogComponent, StatusChange } from '../../shared/change-status-dialog/change-status-dialog.component';
import { USER_STATUS_ICON } from '../../shared/iam-labels';
import { RoleChipComponent } from '../../shared/role-chip.component';
import { UserAvatarComponent } from '../../shared/user-avatar.component';
import { UserStatusTagComponent } from '../../shared/user-status-tag.component';
import { UserAccessPanelComponent } from './user-access-panel/user-access-panel.component';
import { UserProfilePanelComponent } from './user-profile-panel/user-profile-panel.component';
import { UserSecurityPanelComponent } from './user-security-panel/user-security-panel.component';

export type UserDetailTab = 'overview' | 'access' | 'security' | 'activity';

interface TabDef {
  value: UserDetailTab;
  labelKey: string;
  icon: string;
  permissions: readonly string[];
}

const TABS: readonly TabDef[] = [
  { value: 'overview', labelKey: 'IAM.DETAIL.TABS.OVERVIEW', icon: 'pi pi-id-card', permissions: [PERMISSIONS.IAM_USER_READ] },
  { value: 'access', labelKey: 'IAM.DETAIL.TABS.ACCESS', icon: 'pi pi-shield', permissions: [PERMISSIONS.IAM_USER_READ] },
  {
    value: 'security',
    labelKey: 'IAM.DETAIL.TABS.SECURITY',
    icon: 'pi pi-lock',
    permissions: [PERMISSIONS.IAM_USER_RESET_CREDENTIALS, PERMISSIONS.IAM_USER_MANAGE_SESSIONS],
  },
  { value: 'activity', labelKey: 'IAM.DETAIL.TABS.ACTIVITY', icon: 'pi pi-history', permissions: [PERMISSIONS.IAM_AUDIT_READ] },
];

@Component({
  selector: 'app-user-detail',
  standalone: true,
  imports: [
    DatePipe,
    FormsModule,
    RouterLink,
    TranslatePipe,
    ButtonModule,
    CardModule,
    MenuModule,
    MessageModule,
    SelectButtonModule,
    SkeletonModule,
    TabsModule,
    TagModule,
    TooltipModule,
    DetailSkeletonComponent,
    AuditEventTableComponent,
    ChangeStatusDialogComponent,
    RoleChipComponent,
    UserAvatarComponent,
    UserStatusTagComponent,
    UserAccessPanelComponent,
    UserProfilePanelComponent,
    UserSecurityPanelComponent,
  ],
  templateUrl: './user-detail.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class UserDetailComponent implements HasUnsavedChanges {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly userService = inject(IamUserService);
  private readonly authorization = inject(AuthorizationService);
  private readonly alert = inject(AlertService);
  private readonly language = inject(LanguageService);
  private readonly pageInfo = inject(PageInfoService);

  private readonly profilePanel = viewChild(UserProfilePanelComponent);
  private readonly accessPanel = viewChild(UserAccessPanelComponent);

  protected readonly user = signal<IamUserDetail | null>(null);
  protected readonly loadState = signal<'loading' | 'ready' | 'error' | 'not-found'>('loading');
  protected readonly statusDialogOpen = signal(false);
  protected readonly statusTarget = signal<UserStatus | null>(null);
  protected readonly statusSaving = signal(false);
  protected readonly perspective = signal<AuditPerspective>('TARGET');

  private readonly userId = toSignal(this.route.paramMap.pipe(map((params) => params.get('id') ?? '')), {
    initialValue: this.route.snapshot.paramMap.get('id') ?? '',
  });
  private readonly tabParam = toSignal(this.route.queryParamMap.pipe(map((params) => params.get('tab'))), {
    initialValue: this.route.snapshot.queryParamMap.get('tab'),
  });

  protected readonly tabs = computed(() => TABS.filter((tab) => this.authorization.canAny(tab.permissions)));
  protected readonly activeTab = computed<UserDetailTab>(() => {
    const requested = this.tabParam();
    return this.tabs().find((tab) => tab.value === requested)?.value ?? 'overview';
  });
  protected readonly isSelf = computed(() => this.user()?.id === this.authorization.currentUserId());
  protected readonly statusIcon = USER_STATUS_ICON;

  protected readonly statusActions = computed<MenuItem[]>(() => {
    const user = this.user();
    if (!user || !this.authorization.can(PERMISSIONS.IAM_USER_CHANGE_STATUS)) {
      return [];
    }
    return USER_STATUS_TRANSITIONS[user.status]
      // An administrator can never lock themselves out.
      .filter((status) => !(this.isSelf() && status !== 'ACTIVE'))
      .map((status) => ({
        label: this.language.t(`IAM.STATUS_DIALOG.ACTION.${status}`),
        icon: USER_STATUS_ICON[status],
        command: () => this.openStatusDialog(status),
      }));
  });

  protected readonly auditScope = computed(() => {
    const id = this.userId();
    return this.perspective() === 'ACTOR' ? { actorId: id } : { targetType: 'USER', targetId: id };
  });
  protected readonly perspectiveOptions = computed(() => [
    { label: this.language.t('IAM.DETAIL.ACTIVITY.ON_USER'), value: 'TARGET' as AuditPerspective },
    { label: this.language.t('IAM.DETAIL.ACTIVITY.BY_USER'), value: 'ACTOR' as AuditPerspective },
  ]);

  protected readonly accountAlerts = computed<string[]>(() => {
    const user = this.user();
    if (!user) {
      return [];
    }
    const alerts: string[] = [];
    if (!user.emailVerified) {
      alerts.push('IAM.DETAIL.ALERTS.EMAIL_UNVERIFIED');
    }
    if (user.mustChangePassword) {
      alerts.push('IAM.DETAIL.ALERTS.MUST_CHANGE_PASSWORD');
    }
    if (user.failedLoginAttempts > 0) {
      alerts.push('IAM.DETAIL.ALERTS.FAILED_ATTEMPTS');
    }
    if (user.accessExpiresAt && new Date(user.accessExpiresAt).getTime() - Date.now() < 30 * 86_400_000) {
      alerts.push('IAM.DETAIL.ALERTS.EXPIRING');
    }
    return alerts;
  });

  constructor() {
    effect(() => {
      const name = this.user()?.displayName ?? this.language.t('IAM.DETAIL.TITLE');
      this.pageInfo.updateTitle(name);
      this.pageInfo.updateDescription(this.language.t('IAM.DETAIL.DESCRIPTION'));
      this.pageInfo.updateBreadcrumbs([
        { title: this.language.t('BREADCRUMB.HOME'), path: '/dashboard', isActive: false },
        { title: this.language.t('IAM.USERS.TITLE'), path: '/cronos/admin/usuarios', isActive: false },
        { title: name, path: '', isActive: true },
      ]);
    });
    effect(() => {
      const id = this.userId();
      if (id) {
        this.load(id);
      }
    });
  }

  protected load(id = this.userId()): void {
    this.loadState.set('loading');
    this.userService.getById(id).subscribe({
      next: (response) => {
        this.user.set(response.data);
        this.loadState.set(response.data ? 'ready' : 'not-found');
      },
      error: (error: unknown) => {
        const status = (error as { status?: number } | null)?.status;
        this.loadState.set(status === 404 || hasCatalogError(error, 'RESOURCE_NOT_FOUND') ? 'not-found' : 'error');
      },
    });
  }

  protected selectTab(value: string | number | undefined): void {
    void this.router.navigate([], {
      relativeTo: this.route,
      queryParams: { tab: value === 'overview' ? null : value },
      queryParamsHandling: 'merge',
      replaceUrl: true,
    });
  }

  protected onUserChanged(user: IamUserDetail): void {
    this.user.set(user);
  }

  // ─── Status ───

  private openStatusDialog(status: UserStatus): void {
    this.statusTarget.set(status);
    this.statusDialogOpen.set(true);
  }

  protected applyStatus(change: StatusChange): void {
    const user = this.user();
    if (!user) {
      return;
    }
    this.statusSaving.set(true);
    this.userService.changeStatus(user.id, { ...change, version: user.version }).subscribe({
      next: (response) => {
        this.statusSaving.set(false);
        this.statusDialogOpen.set(false);
        if (response.data) {
          this.user.set(response.data);
        }
        this.alert.success(this.language.t('IAM.STATUS_DIALOG.DONE', { status: this.language.t(`IAM.USER_STATUS.${change.status}`) }));
      },
      error: (error: unknown) => {
        this.statusSaving.set(false);
        this.handleWriteError(error, 'IAM.STATUS_DIALOG.FAILED');
      },
    });
  }

  /** 409 CONCURRENT_MODIFICATION → reload so the admin decides on fresh data. */
  handleWriteError(error: unknown, fallbackKey: string): void {
    if (hasCatalogError(error, 'CONCURRENT_MODIFICATION')) {
      this.alert.warning(this.language.t('IAM.COMMON.CONCURRENT_MODIFICATION'));
      this.load();
      return;
    }
    this.alert.error(catalogErrorMessage(error, this.language.t(fallbackKey)));
  }

  async canDeactivate(): Promise<boolean> {
    const profile = this.profilePanel();
    const access = this.accessPanel();
    return (await (profile?.canDeactivate() ?? true)) && (await (access?.canDeactivate() ?? true));
  }
}
