import {
  Component,
  OnInit,
  inject,
  signal,
  computed,
} from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { FormsModule, ReactiveFormsModule, FormBuilder, Validators } from '@angular/forms';
import { ButtonModule } from 'primeng/button';
import { CardModule } from 'primeng/card';
import { CheckboxModule } from 'primeng/checkbox';
import { InputTextModule } from 'primeng/inputtext';
import { TableModule } from 'primeng/table';
import { TagModule } from 'primeng/tag';
import { TextareaModule } from 'primeng/textarea';
import { TooltipModule } from 'primeng/tooltip';
import { map } from 'rxjs';
import { RoleService } from 'src/app/core/services/role.service';
import { PermissionService } from 'src/app/core/services/permission.service';
import { RoleResponse, PermissionResponse } from 'src/app/core/models';
import { ToastService } from 'src/app/shared/services/toast.service';
import { PageInfoService } from 'src/app/core/services/page-info.service';

const PROTECTED_ROLE = 'SUPER_ADMIN';
const MAX_BADGE_PREVIEW = 4;

@Component({
  selector: 'app-roles-management',
  standalone: true,
  imports: [
    FormsModule,
    ReactiveFormsModule,
    ButtonModule,
    CardModule,
    CheckboxModule,
    InputTextModule,
    TableModule,
    TagModule,
    TextareaModule,
    TooltipModule,
  ],
  templateUrl: './roles-management.component.html',
})
export class RolesManagementComponent implements OnInit {
  private roleService = inject(RoleService);
  private permissionService = inject(PermissionService);
  private toast = inject(ToastService);
  private pageInfoService = inject(PageInfoService);
  private fb = inject(FormBuilder);

  // ─── State ───────────────────────────────────────────────────────────────────
  roles = signal<RoleResponse[]>([]);
  allPermissions = signal<PermissionResponse[]>([]);
  isLoadingRoles = signal(false);
  isLoadingPermissions = signal(false);
  isSaving = signal(false);

  panelMode = signal<'none' | 'create' | 'edit'>('none');
  editingRole = signal<RoleResponse | null>(null);

  /** IDs currently checked in the panel form */
  selectedPermissionIds = signal<Set<number>>(new Set());
  /** Snapshot taken when panel opens — used to detect dirty state */
  private originalPermissionIds = new Set<number>();

  // ─── Reactive Form ────────────────────────────────────────────────────────────
  form = this.fb.group({
    name: ['', [Validators.required]],
    description: [''],
  });

  /**
   * Bridge reactive-form observables → Signals so that computed() can track them.
   * form.valid / form.dirty are plain getters, NOT signals — computed() would never
   * re-evaluate when only those change. toSignal() solves this by emitting on every
   * statusChanges / valueChanges event.
   */
  private formStatus = toSignal(this.form.statusChanges, {
    initialValue: this.form.status,
  });
  private formDirty = toSignal(
    this.form.valueChanges.pipe(map(() => this.form.dirty)),
    { initialValue: false },
  );

  // ─── Derived state ────────────────────────────────────────────────────────────

  /** Permissions grouped by resource for checkbox matrix */
  permissionGroups = computed<Record<string, PermissionResponse[]>>(() => {
    return this.allPermissions().reduce(
      (acc, p) => {
        if (!acc[p.resource]) acc[p.resource] = [];
        acc[p.resource].push(p);
        return acc;
      },
      {} as Record<string, PermissionResponse[]>
    );
  });

  /** Keys of permissionGroups, sorted alphabetically */
  resourceKeys = computed<string[]>(() =>
    Object.keys(this.permissionGroups()).sort()
  );

  /** Whether the name field is locked (editing SUPER_ADMIN) */
  isNameLocked = computed<boolean>(
    () => this.editingRole()?.name === PROTECTED_ROLE
  );

  /** Whether there are unsaved permission changes compared to the snapshot */
  private permissionsChanged = computed<boolean>(() => {
    const current = this.selectedPermissionIds();
    if (current.size !== this.originalPermissionIds.size) return true;
    for (const id of current) {
      if (!this.originalPermissionIds.has(id)) return true;
    }
    return false;
  });

  /** Combined dirty check: form fields OR permissions changed */
  isDirty = computed<boolean>(
    () => this.formDirty() || this.permissionsChanged(),
  );

  /** True when the panel save button should be active */
  canSave = computed<boolean>(
    () => this.formStatus() === 'VALID' && this.isDirty() && !this.isSaving(),
  );

  // ─── Helpers ─────────────────────────────────────────────────────────────────

  previewPermissions(role: RoleResponse): PermissionResponse[] {
    return role.permissions.slice(0, MAX_BADGE_PREVIEW);
  }

  extraCount(role: RoleResponse): number {
    return Math.max(0, role.permissions.length - MAX_BADGE_PREVIEW);
  }

  isPermissionSelected(id: number): boolean {
    return this.selectedPermissionIds().has(id);
  }

  // ─── Lifecycle ────────────────────────────────────────────────────────────────

  ngOnInit(): void {
    this.pageInfoService.updateTitle('Gestión de Roles');
    this.pageInfoService.updateBreadcrumbs([
      { title: 'Inicio', path: '/dashboard', isActive: false },
      { title: 'Administración', path: '', isActive: false },
      { title: 'Roles', path: '', isActive: true },
    ]);
    this.loadRoles();
    this.loadPermissions();
  }

  // ─── Data Loading ─────────────────────────────────────────────────────────────

  loadRoles(): void {
    this.isLoadingRoles.set(true);
    this.roleService.getAll().subscribe({
      next: res => {
        this.roles.set(res.data);
        this.isLoadingRoles.set(false);
      },
      error: err => {
        this.toast.error('Error', err?.error?.message || 'No se pudieron cargar los roles');
        this.isLoadingRoles.set(false);
      },
    });
  }

  loadPermissions(): void {
    this.isLoadingPermissions.set(true);
    this.permissionService.getAll().subscribe({
      next: res => {
        this.allPermissions.set(res.data);
        this.isLoadingPermissions.set(false);
      },
      error: err => {
        this.toast.error('Error', err?.error?.message || 'No se pudieron cargar los permisos');
        this.isLoadingPermissions.set(false);
      },
    });
  }

  // ─── Panel Control ────────────────────────────────────────────────────────────

  openCreate(): void {
    this.editingRole.set(null);
    this.form.reset({ name: '', description: '' });
    this.form.get('name')!.enable();
    this.selectedPermissionIds.set(new Set());
    this.originalPermissionIds = new Set();
    this.panelMode.set('create');
  }

  openEdit(role: RoleResponse): void {
    this.editingRole.set(role);

    const nameCtrl = this.form.get('name')!;
    this.form.reset({ name: role.name, description: role.description ?? '' });

    if (role.name === PROTECTED_ROLE) {
      nameCtrl.disable();
    } else {
      nameCtrl.enable();
    }

    const ids = new Set(role.permissions.map(p => p.id));
    this.selectedPermissionIds.set(new Set(ids));
    this.originalPermissionIds = new Set(ids);
    this.panelMode.set('edit');
  }

  closePanel(): void {
    this.panelMode.set('none');
    this.editingRole.set(null);
    this.form.reset();
    this.selectedPermissionIds.set(new Set());
  }

  // ─── Checkbox Toggle ──────────────────────────────────────────────────────────

  togglePermission(id: number): void {
    this.selectedPermissionIds.update(set => {
      const next = new Set(set);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }

  toggleResourceGroup(resource: string, checked: boolean): void {
    const group = this.permissionGroups()[resource] ?? [];
    this.selectedPermissionIds.update(set => {
      const next = new Set(set);
      for (const p of group) {
        if (checked) {
          next.add(p.id);
        } else {
          next.delete(p.id);
        }
      }
      return next;
    });
  }

  isGroupFullySelected(resource: string): boolean {
    const group = this.permissionGroups()[resource] ?? [];
    return group.length > 0 && group.every(p => this.selectedPermissionIds().has(p.id));
  }

  isGroupPartiallySelected(resource: string): boolean {
    const group = this.permissionGroups()[resource] ?? [];
    const selected = group.filter(p => this.selectedPermissionIds().has(p.id));
    return selected.length > 0 && selected.length < group.length;
  }

  // ─── Submit ───────────────────────────────────────────────────────────────────

  onSubmit(): void {
    this.form.markAllAsTouched();
    if (!this.canSave()) return;

    const rawName = (this.form.get('name')!.value ?? '').trim().toUpperCase();
    const payload = {
      name: this.isNameLocked() ? this.editingRole()!.name : rawName,
      description: (this.form.value.description ?? '').trim(),
      permissionIds: Array.from(this.selectedPermissionIds()),
    };

    this.isSaving.set(true);

    if (this.panelMode() === 'create') {
      this.roleService.create(payload).subscribe({
        next: res => {
          this.roles.update(list => [...list, res.data]);
          this.toast.success('Rol creado', `"${res.data.name}" fue creado exitosamente`);
          this.isSaving.set(false);
          this.closePanel();
        },
        error: err => {
          this.toast.error('Error', err?.error?.message || 'No se pudo crear el rol');
          this.isSaving.set(false);
        },
      });
    } else {
      const id = this.editingRole()!.id;
      this.roleService.update(id, payload).subscribe({
        next: res => {
          this.roles.update(list => list.map(r => r.id === id ? res.data : r));
          this.toast.success('Rol actualizado', `"${res.data.name}" fue actualizado`);
          this.isSaving.set(false);
          this.closePanel();
        },
        error: err => {
          this.toast.error('Error', err?.error?.message || 'No se pudo actualizar el rol');
          this.isSaving.set(false);
        },
      });
    }
  }
}
