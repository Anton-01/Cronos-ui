import { Component, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule, FormBuilder, Validators } from '@angular/forms';
import { FormsModule } from '@angular/forms';
import { UserService, UserFilterRequest } from 'src/app/core/services/user.service';
import { UserResponse } from 'src/app/core/models/user.model';
import { ToastService } from 'src/app/shared/services/toast.service';

const ROLE_BADGE: Record<string, string> = {
  SUPER_ADMIN: 'badge-primary',
  ADMIN: 'badge-danger',
  MANAGER: 'badge-info',
  USER: 'badge-success',
};

@Component({
  selector: 'app-user-management',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, FormsModule],
  templateUrl: './user-management.component.html',
})
export class UserManagementComponent implements OnInit {
  private userService = inject(UserService);
  private toast = inject(ToastService);
  private fb = inject(FormBuilder);

  users = signal<UserResponse[]>([]);
  totalElements = signal(0);
  totalPages = signal(0);
  isLoading = signal(false);
  errorMessage = signal<string | null>(null);

  selectedUser = signal<UserResponse | null>(null);
  activePanel = signal<'none' | 'details' | 'roles'>('none');
  openDropdownId = signal<string | null>(null);

  roleFilter = signal<string>('');
  statusFilter = signal<string>('');

  pageRequest: UserFilterRequest = { page: 0, size: 10, sort: 'createdAt,desc' };

  rolesForm = this.fb.group({
    selectedRoles: [[] as string[], [Validators.required]],
  });

  allRoles = ['SUPER_ADMIN', 'ADMIN', 'MANAGER', 'USER'];

  ngOnInit(): void {
    this.load();
  }

  load(): void {
    this.isLoading.set(true);
    const params: UserFilterRequest = { ...this.pageRequest };
    if (this.roleFilter()) params.role = this.roleFilter();
    if (this.statusFilter()) params.enabled = this.statusFilter() === 'active';

    this.userService.getAllUsers(params).subscribe({
      next: res => {
        this.users.set(res.data.content);
        this.totalElements.set(res.data.totalElements);
        this.totalPages.set(res.data.totalPages);
        this.isLoading.set(false);
      },
      error: err => {
        this.errorMessage.set(err?.message || 'Error al cargar usuarios');
        this.isLoading.set(false);
      },
    });
  }

  goToPage(page: number): void {
    this.pageRequest = { ...this.pageRequest, page };
    this.load();
  }

  get pages(): number[] {
    return Array.from({ length: this.totalPages() }, (_, i) => i);
  }

  applyFilters(): void {
    this.pageRequest.page = 0;
    this.load();
  }

  getRoleBadgeClass(role: string): string {
    const normalized = role.replace(/^ROLE_/, '');
    return ROLE_BADGE[normalized] || 'badge-secondary';
  }

  normalizeRole(role: string): string {
    return role.replace(/^ROLE_/, '');
  }

  getInitials(user: UserResponse): string {
    const first = user.firstName?.charAt(0) || user.username.charAt(0);
    const last = user.lastName?.charAt(0) || '';
    return (first + last).toUpperCase();
  }

  toggleDropdown(id: string): void {
    this.openDropdownId.update(current => current === id ? null : id);
  }

  viewDetails(user: UserResponse): void {
    this.selectedUser.set(user);
    this.activePanel.set('details');
    this.openDropdownId.set(null);
  }

  openAssignRoles(user: UserResponse): void {
    this.selectedUser.set(user);
    const currentRoles = user.roles.map(r => r.replace(/^ROLE_/, ''));
    this.rolesForm.patchValue({ selectedRoles: currentRoles });
    this.activePanel.set('roles');
    this.openDropdownId.set(null);
  }

  closePanel(): void {
    this.activePanel.set('none');
    this.selectedUser.set(null);
  }

  toggleRole(role: string): void {
    const current = this.rolesForm.value.selectedRoles || [];
    if (current.includes(role)) {
      this.rolesForm.patchValue({ selectedRoles: current.filter(r => r !== role) });
    } else {
      this.rolesForm.patchValue({ selectedRoles: [...current, role] });
    }
  }

  isRoleSelected(role: string): boolean {
    return (this.rolesForm.value.selectedRoles || []).includes(role);
  }

  saveRoles(): void {
    const user = this.selectedUser();
    if (!user) return;
    const roles = this.rolesForm.value.selectedRoles || [];
    this.userService.assignRoles(user.id, { roles }).subscribe({
      next: res => {
        this.users.update(list => list.map(u => u.id === res.data.id ? res.data : u));
        this.toast.success('Roles actualizados');
        this.closePanel();
      },
      error: err => this.toast.error('Error', err?.message),
    });
  }

  toggleBlock(user: UserResponse): void {
    this.openDropdownId.set(null);
    const obs = user.accountNonLocked
      ? this.userService.blockUser(user.id)
      : this.userService.unblockUser(user.id);

    obs.subscribe({
      next: res => {
        this.users.update(list => list.map(u => u.id === res.data.id ? res.data : u));
        this.toast.success(res.data.accountNonLocked ? 'Usuario desbloqueado' : 'Usuario bloqueado');
      },
      error: err => this.toast.error('Error', err?.message),
    });
  }
}
