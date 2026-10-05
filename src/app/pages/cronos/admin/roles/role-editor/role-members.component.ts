import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, DestroyRef, computed, effect, inject, input, output, signal, untracked } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { TranslatePipe } from '@ngx-translate/core';
import { AutoCompleteCompleteEvent, AutoCompleteModule } from 'primeng/autocomplete';
import { ButtonModule } from 'primeng/button';
import { CardModule } from 'primeng/card';
import { DialogModule } from 'primeng/dialog';
import { IconFieldModule } from 'primeng/iconfield';
import { InputIconModule } from 'primeng/inputicon';
import { InputTextModule } from 'primeng/inputtext';
import { TableLazyLoadEvent, TableModule } from 'primeng/table';
import { TextareaModule } from 'primeng/textarea';
import { TooltipModule } from 'primeng/tooltip';
import { Subject, catchError, debounceTime, distinctUntilChanged, of, switchMap } from 'rxjs';

import { IamRoleDetail, IamUserSummary } from 'src/app/core/models/iam.models';
import { IamRoleService } from 'src/app/core/services/iam/iam-role.service';
import { IamUserService } from 'src/app/core/services/iam/iam-user.service';
import { LanguageService } from 'src/app/core/services/language.service';
import { catalogErrorMessage } from 'src/app/core/utils/catalog-error.util';
import { TableSkeletonRowComponent } from 'src/app/shared/components/table-skeleton-row/table-skeleton-row.component';
import { AlertService } from 'src/app/shared/services/alert.service';
import { REASON_MAX_LENGTH, REASON_MIN_LENGTH, ReasonDialogComponent } from '../../shared/reason-dialog/reason-dialog.component';
import { UserAvatarComponent } from '../../shared/user-avatar.component';
import { UserStatusTagComponent } from '../../shared/user-status-tag.component';

/** Members of a role: server-paged list, add (search-as-you-type) and remove, both justified. */
@Component({
  selector: 'app-role-members',
  standalone: true,
  imports: [
    DatePipe,
    FormsModule,
    RouterLink,
    TranslatePipe,
    AutoCompleteModule,
    ButtonModule,
    CardModule,
    DialogModule,
    IconFieldModule,
    InputIconModule,
    InputTextModule,
    TableModule,
    TextareaModule,
    TooltipModule,
    ReasonDialogComponent,
    TableSkeletonRowComponent,
    UserAvatarComponent,
    UserStatusTagComponent,
  ],
  template: `
    <p-card>
      <p-table
        [value]="members()"
        dataKey="id"
        [lazy]="true"
        (onLazyLoad)="onLazyLoad($event)"
        [totalRecords]="total()"
        [first]="first()"
        [rows]="10"
        [paginator]="true"
        [loading]="loading()"
        [showLoader]="false"
        [rowHover]="true"
      >
        <ng-template pTemplate="caption">
          <div class="flex flex-wrap align-items-center justify-content-between gap-2">
            <p-iconfield iconPosition="left">
              <p-inputicon styleClass="pi pi-search" />
              <input pInputText type="search" [placeholder]="'IAM.USERS.SEARCH' | translate" (input)="searchInput.next($any($event.target).value)" />
            </p-iconfield>
            @if (canManage() && role().status === 'ACTIVE') {
              <p-button [label]="'IAM.ROLES.ADD_MEMBERS' | translate" icon="pi pi-user-plus" (onClick)="openAdd()" />
            }
          </div>
        </ng-template>
        <ng-template pTemplate="header">
          <tr>
            <th>{{ 'IAM.USERS.COLUMNS.USER' | translate }}</th>
            <th style="width: 10rem">{{ 'COMMON.TABLE.STATUS' | translate }}</th>
            <th style="width: 10rem">{{ 'IAM.USERS.COLUMNS.LAST_LOGIN' | translate }}</th>
            <th style="width: 4rem"></th>
          </tr>
        </ng-template>
        <ng-template pTemplate="body" let-user>
          <tr>
            <td>
              <a [routerLink]="['/cronos/admin/usuarios', user.id]" class="flex align-items-center gap-3 no-underline text-color">
                <app-user-avatar [avatarUrl]="user.avatarUrl" [firstName]="user.firstName" [lastName]="user.lastName" [displayName]="user.displayName" />
                <div class="flex flex-column">
                  <span class="font-medium">{{ user.displayName }}</span>
                  <span class="text-sm text-color-secondary">{{ user.email }}</span>
                </div>
              </a>
            </td>
            <td><app-user-status-tag [status]="user.status" [until]="user.statusUntil" /></td>
            <td class="text-sm">{{ user.lastLoginAt ? (user.lastLoginAt | date: 'mediumDate') : ('IAM.USERS.NEVER' | translate) }}</td>
            <td class="text-right">
              @if (canManage()) {
                <p-button icon="pi pi-user-minus" severity="danger" [text]="true" [rounded]="true" [pTooltip]="'IAM.ROLES.REMOVE_MEMBER' | translate" [ariaLabel]="'IAM.ROLES.REMOVE_MEMBER' | translate" (onClick)="askRemove(user)" />
              }
            </td>
          </tr>
        </ng-template>
        <ng-template pTemplate="loadingbody">
          @for (row of skeletonRows; track $index) {
            <tr appTableSkeletonRow [columns]="4"></tr>
          }
        </ng-template>
        <ng-template pTemplate="emptymessage">
          <tr><td colspan="4" class="text-center text-color-secondary py-5">{{ 'IAM.ROLES.NO_MEMBERS' | translate }}</td></tr>
        </ng-template>
      </p-table>
    </p-card>

    <p-dialog
      [header]="'IAM.ROLES.ADD_MEMBERS' | translate"
      [visible]="addOpen()"
      (visibleChange)="!$event && !saving() && addOpen.set(false)"
      [modal]="true"
      [draggable]="false"
      [style]="{ width: '36rem' }"
      [breakpoints]="{ '640px': '95vw' }"
    >
      <div class="flex flex-column gap-3">
        <div class="flex flex-column gap-1">
          <label for="memberSearch" class="font-medium">{{ 'IAM.ROLES.FIND_USERS' | translate }}</label>
          <p-autocomplete
            inputId="memberSearch"
            [ngModel]="picked()"
            (ngModelChange)="picked.set($event ?? [])"
            [suggestions]="suggestions()"
            (completeMethod)="searchUsers($event)"
            [multiple]="true"
            optionLabel="displayName"
            dataKey="id"
            [minQueryLength]="2"
            [delay]="300"
            styleClass="w-full"
            [placeholder]="'IAM.ROLES.FIND_USERS_PLACEHOLDER' | translate"
          >
            <ng-template let-user #item>
              <div class="flex align-items-center gap-2">
                <app-user-avatar [avatarUrl]="user.avatarUrl" [firstName]="user.firstName" [lastName]="user.lastName" [displayName]="user.displayName" />
                <div class="flex flex-column">
                  <span>{{ user.displayName }}</span>
                  <small class="text-color-secondary">{{ user.email }}</small>
                </div>
              </div>
            </ng-template>
          </p-autocomplete>
        </div>
        <div class="flex flex-column gap-1">
          <label for="memberReason" class="font-medium">{{ 'IAM.REASON.LABEL' | translate }} <span class="text-red-500">*</span></label>
          <textarea pTextarea id="memberReason" rows="3" [maxlength]="maxLength" [ngModel]="reason()" (ngModelChange)="reason.set($event)" [placeholder]="'IAM.REASON.PLACEHOLDER' | translate"></textarea>
          <small class="text-color-secondary">{{ 'IAM.REASON.MIN' | translate: { min: minLength } }}</small>
        </div>
      </div>
      <ng-template pTemplate="footer">
        <p-button [label]="'COMMON.CANCEL' | translate" severity="secondary" [outlined]="true" [disabled]="saving()" (onClick)="addOpen.set(false)" />
        <p-button
          [label]="'IAM.ROLES.ADD_N' | translate: { count: picked().length }"
          icon="pi pi-check"
          [loading]="saving()"
          [disabled]="picked().length === 0 || reason().trim().length < minLength"
          (onClick)="add()"
        />
      </ng-template>
    </p-dialog>

    <app-reason-dialog
      [(visible)]="removeOpen"
      [title]="'IAM.ROLES.REMOVE_MEMBER' | translate"
      [message]="'IAM.ROLES.REMOVE_MESSAGE' | translate: { user: removing()?.displayName ?? '', role: role().name }"
      [confirmLabel]="'IAM.ROLES.REMOVE_MEMBER' | translate"
      severity="danger"
      [saving]="saving()"
      (confirmed)="remove($event)"
    />
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class RoleMembersComponent {
  private readonly roleService = inject(IamRoleService);
  private readonly userService = inject(IamUserService);
  private readonly alert = inject(AlertService);
  private readonly language = inject(LanguageService);
  private readonly destroyRef = inject(DestroyRef);

  readonly role = input.required<IamRoleDetail>();
  readonly canManage = input(false);
  readonly membersChanged = output<void>();

  /** Narrowed so a parent reload (new role object, same id) does not refetch the page. */
  private readonly roleId = computed(() => this.role().id);

  protected readonly minLength = REASON_MIN_LENGTH;
  protected readonly maxLength = REASON_MAX_LENGTH;
  protected readonly skeletonRows = Array.from({ length: 5 });

  protected readonly members = signal<IamUserSummary[]>([]);
  protected readonly total = signal(0);
  protected readonly loading = signal(true);
  protected readonly first = signal(0);
  private readonly query = signal({ page: 0, size: 10, search: '' });

  protected readonly addOpen = signal(false);
  protected readonly picked = signal<IamUserSummary[]>([]);
  protected readonly suggestions = signal<IamUserSummary[]>([]);
  protected readonly reason = signal('');
  protected readonly saving = signal(false);
  protected readonly removeOpen = signal(false);
  protected readonly removing = signal<IamUserSummary | null>(null);

  readonly searchInput = new Subject<string>();

  constructor() {
    this.searchInput.pipe(debounceTime(350), distinctUntilChanged(), takeUntilDestroyed(this.destroyRef)).subscribe((search) => {
      this.first.set(0);
      this.query.update((current) => ({ ...current, page: 0, search: search.trim() }));
    });
    effect(() => {
      const query = this.query();
      const id = this.roleId();
      untracked(() => this.fetch(id, query));
    });
  }

  private fetch(id: number, query: { page: number; size: number; search: string }): void {
    this.loading.set(true);
    this.roleService.members(id, query.page, query.size, query.search || undefined).subscribe({
      next: (response) => {
        this.members.set(response.data?.content ?? []);
        this.total.set(response.data?.totalElements ?? 0);
        this.loading.set(false);
      },
      error: (error: unknown) => {
        this.loading.set(false);
        this.alert.error(catalogErrorMessage(error, this.language.t('IAM.ROLES.MEMBERS_FAILED')));
      },
    });
  }

  protected onLazyLoad(event: TableLazyLoadEvent): void {
    const size = event.rows ?? 10;
    const page = Math.floor((event.first ?? 0) / size);
    const current = this.query();
    if (current.page !== page || current.size !== size) {
      this.first.set(event.first ?? 0);
      this.query.set({ ...current, page, size });
    }
  }

  protected openAdd(): void {
    this.picked.set([]);
    this.reason.set('');
    this.addOpen.set(true);
  }

  protected searchUsers(event: AutoCompleteCompleteEvent): void {
    this.userService
      .search({ page: 0, size: 10, search: event.query, statuses: ['ACTIVE', 'PENDING_ACTIVATION'] })
      .pipe(catchError(() => of(null)))
      .subscribe((response) => {
        const memberIds = new Set(this.members().map((member) => member.id));
        const alreadyHas = (user: IamUserSummary) => memberIds.has(user.id) || user.roles.some((role) => role.id === this.role().id);
        this.suggestions.set((response?.data?.content ?? []).filter((user) => !alreadyHas(user)));
      });
  }

  protected add(): void {
    if (this.saving()) {
      return;
    }
    this.saving.set(true);
    this.roleService.addMembers(this.role().id, { userIds: this.picked().map((user) => user.id), reason: this.reason().trim() }).subscribe({
      next: (response) => {
        this.saving.set(false);
        this.addOpen.set(false);
        this.alert.success(this.language.t('IAM.ROLES.MEMBERS_ADDED', { count: response.data?.added ?? 0 }));
        this.query.update((current) => ({ ...current }));
        this.membersChanged.emit();
      },
      error: (error: unknown) => {
        this.saving.set(false);
        this.alert.error(catalogErrorMessage(error, this.language.t('IAM.COMMON.ACTION_FAILED')));
      },
    });
  }

  protected askRemove(user: IamUserSummary): void {
    this.removing.set(user);
    this.removeOpen.set(true);
  }

  protected remove(reason: string): void {
    const user = this.removing();
    if (!user || this.saving()) {
      return;
    }
    this.saving.set(true);
    this.roleService.removeMembers(this.role().id, { userIds: [user.id], reason }).subscribe({
      next: () => {
        this.saving.set(false);
        this.removeOpen.set(false);
        this.alert.success(this.language.t('IAM.ROLES.MEMBER_REMOVED', { user: user.displayName }));
        this.query.update((current) => ({ ...current }));
        this.membersChanged.emit();
      },
      error: (error: unknown) => {
        this.saving.set(false);
        this.alert.error(catalogErrorMessage(error, this.language.t('IAM.COMMON.ACTION_FAILED')));
      },
    });
  }
}
