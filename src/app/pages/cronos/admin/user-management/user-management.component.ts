import { ChangeDetectionStrategy, Component, OnInit, inject, signal } from '@angular/core';
import { FormsModule, ReactiveFormsModule, FormBuilder, Validators } from '@angular/forms';
import { MenuItem } from 'primeng/api';

import { AvatarModule } from 'primeng/avatar';
import { ButtonModule } from 'primeng/button';
import { CardModule } from 'primeng/card';
import { CheckboxModule } from 'primeng/checkbox';
import { DialogModule } from 'primeng/dialog';
import { IconFieldModule } from 'primeng/iconfield';
import { InputIconModule } from 'primeng/inputicon';
import { InputTextModule } from 'primeng/inputtext';
import { MenuModule } from 'primeng/menu';
import { SelectModule } from 'primeng/select';
import { TableModule } from 'primeng/table';
import { TagModule } from 'primeng/tag';
import { TooltipModule } from 'primeng/tooltip';

import { UserService, UserFilterRequest } from 'src/app/core/services/user.service';
import { UserResponse } from 'src/app/core/models/user.model';
import { PageInfoService } from 'src/app/core/services/page-info.service';
import { ToastService } from 'src/app/shared/services/toast.service';
import { CreateUserModalComponent } from './create-user-modal/create-user-modal.component';
import { TableSkeletonRowComponent } from 'src/app/shared/components/table-skeleton-row/table-skeleton-row.component';

type TagSeverity = 'success' | 'info' | 'warn' | 'danger' | 'secondary' | 'contrast';

const ROLE_SEVERITY: Record<string, TagSeverity> = {
  SUPER_ADMIN: 'contrast',
  ADMIN: 'danger',
  MANAGER: 'info',
  USER: 'success',
};

@Component({
  selector: 'app-user-management',
  standalone: true,
  imports: [
    FormsModule,
    ReactiveFormsModule,
    AvatarModule,
    ButtonModule,
    CardModule,
    CheckboxModule,
    DialogModule,
    IconFieldModule,
    InputIconModule,
    InputTextModule,
    MenuModule,
    SelectModule,
    TableModule,
    TagModule,
    TooltipModule,
    CreateUserModalComponent,
    TableSkeletonRowComponent,
  ],
  templateUrl: './user-management.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class UserManagementComponent implements OnInit {
  private readonly userService = inject(UserService);
  private readonly toastService = inject(ToastService);
  private readonly pageInfoService = inject(PageInfoService);
  private readonly fb = inject(FormBuilder);

  readonly users = signal<UserResponse[]>([]);
  readonly isLoading = signal(false);
  protected readonly skeletonRows = Array.from({ length: 6 });

  readonly selectedUser = signal<UserResponse | null>(null);
  readonly activePanel = signal<'none' | 'details' | 'roles'>('none');
  readonly showCreateModal = signal(false);
  readonly actionMenuItems = signal<MenuItem[]>([]);

  readonly roleFilter = signal<string>('');
  readonly statusFilter = signal<string>('');

  readonly rolesForm = this.fb.group({
    selectedRoles: [[] as string[], [Validators.required]],
  });

  readonly allRoles = ['SUPER_ADMIN', 'ADMIN', 'MANAGER', 'USER'];

  readonly roleFilterOptions = this.allRoles.map((role) => ({ label: role, value: role }));
  readonly statusFilterOptions = [
    { label: 'Activos', value: 'active' },
    { label: 'Inactivos', value: 'inactive' },
  ];

  ngOnInit(): void {
    this.pageInfoService.updateTitle('Gestión de Usuarios');
    this.pageInfoService.updateDescription('Administra los usuarios del sistema, sus roles y accesos');
    this.pageInfoService.updateBreadcrumbs([
      { title: 'Inicio', path: '/dashboard', isActive: false },
      { title: 'Administración', path: '', isActive: false },
      { title: 'Usuarios', path: '', isActive: true },
    ]);
    this.load();
  }

  load(): void {
    this.isLoading.set(true);
    const params: UserFilterRequest = { page: 0, size: 1000, sort: 'createdAt,desc' };
    if (this.roleFilter()) {
      params.role = this.roleFilter();
    }
    if (this.statusFilter()) {
      params.enabled = this.statusFilter() === 'active';
    }

    this.userService.getAllUsers(params).subscribe({
      next: (res) => {
        this.users.set(res.data.content);
        this.isLoading.set(false);
      },
      error: (err) => {
        this.isLoading.set(false);
        this.toastService.error('Error', err?.message || 'Error al cargar usuarios');
      },
    });
  }

  applyFilters(): void {
    this.load();
  }

  getRoleSeverity(role: string): TagSeverity {
    return ROLE_SEVERITY[this.normalizeRole(role)] ?? 'secondary';
  }

  normalizeRole(role: string): string {
    return role.replace(/^ROLE_/, '');
  }

  getInitials(user: UserResponse): string {
    const first = user.firstName?.charAt(0) || user.username.charAt(0);
    const last = user.lastName?.charAt(0) || '';
    return (first + last).toUpperCase();
  }

  openCreateModal(): void {
    this.showCreateModal.set(true);
  }

  onUserCreated(): void {
    this.showCreateModal.set(false);
    this.load();
  }

  buildActionMenu(user: UserResponse): void {
    this.actionMenuItems.set([
      { label: 'Ver detalles', icon: 'pi pi-eye', command: () => this.viewDetails(user) },
      { label: 'Asignar roles', icon: 'pi pi-shield', command: () => this.openAssignRoles(user) },
      { separator: true },
      {
        label: user.accountNonLocked ? 'Bloquear usuario' : 'Desbloquear usuario',
        icon: user.accountNonLocked ? 'pi pi-lock' : 'pi pi-lock-open',
        command: () => this.toggleBlock(user),
      },
    ]);
  }

  viewDetails(user: UserResponse): void {
    this.selectedUser.set(user);
    this.activePanel.set('details');
  }

  openAssignRoles(user: UserResponse): void {
    this.selectedUser.set(user);
    const currentRoles = user.roles.map((role) => this.normalizeRole(role));
    this.rolesForm.patchValue({ selectedRoles: currentRoles });
    this.activePanel.set('roles');
  }

  closePanel(): void {
    this.activePanel.set('none');
    this.selectedUser.set(null);
  }

  toggleRole(role: string): void {
    const current = this.rolesForm.value.selectedRoles || [];
    if (current.includes(role)) {
      this.rolesForm.patchValue({ selectedRoles: current.filter((r) => r !== role) });
    } else {
      this.rolesForm.patchValue({ selectedRoles: [...current, role] });
    }
  }

  isRoleSelected(role: string): boolean {
    return (this.rolesForm.value.selectedRoles || []).includes(role);
  }

  saveRoles(): void {
    const user = this.selectedUser();
    if (!user) {
      return;
    }
    const roles = this.rolesForm.value.selectedRoles || [];
    this.userService.assignRoles(user.id, { roles }).subscribe({
      next: (res) => {
        this.users.update((list) => list.map((u) => (u.id === res.data.id ? res.data : u)));
        this.toastService.success('Roles actualizados');
        this.closePanel();
      },
      error: (err) => this.toastService.error('Error', err?.message),
    });
  }

  toggleBlock(user: UserResponse): void {
    const request$ = user.accountNonLocked
      ? this.userService.blockUser(user.id)
      : this.userService.unblockUser(user.id);

    request$.subscribe({
      next: (res) => {
        this.users.update((list) => list.map((u) => (u.id === res.data.id ? res.data : u)));
        this.toastService.success(res.data.accountNonLocked ? 'Usuario desbloqueado' : 'Usuario bloqueado');
      },
      error: (err) => this.toastService.error('Error', err?.message),
    });
  }

  formatDate(date: string | null): string {
    if (!date) {
      return '-';
    }
    return new Date(date).toLocaleDateString('es-MX', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  }
}
