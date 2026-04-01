import { Component, OnInit, inject, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule, FormBuilder, Validators } from '@angular/forms';
import { CategoryService } from 'src/app/core/services/domain/category.service';
import { CategoryResponse } from 'src/app/core/models/domain.model';
import { PageRequest } from 'src/app/core/models/pagination.model';
import { AlertService } from 'src/app/shared/services/alert.service';
import { AlertContainerComponent } from 'src/app/shared/components/alert-container/alert-container.component';
import { PageInfoService } from 'src/app/_metronic/layout/core/page-info.service';
import Swal from 'sweetalert2';
import {StatusToggleComponent} from "../../../shared/components/modal-toggle-status/status-toggle.component";

@Component({
  selector: 'app-categorias',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, AlertContainerComponent, StatusToggleComponent],
  templateUrl: './categorias.component.html',
})
export class CategoriasComponent implements OnInit {
  private categoryService = inject(CategoryService);
  private alertService = inject(AlertService);
  private pageInfoService = inject(PageInfoService);
  private fb = inject(FormBuilder);

  items = signal<CategoryResponse[]>([]);
  totalElements = signal(0);
  totalPages = signal(0);
  isLoading = signal(false);
  errorMessage = signal<string | null>(null);
  showForm = signal(false);
  selectedItem = signal<CategoryResponse | null>(null);
  isSaving = signal(false);

  searchTerm = signal('');
  pageRequest: PageRequest = { page: 0, size: 10, sort: 'name,asc' };

  filteredItems = computed(() => {
    const term = this.searchTerm().toLowerCase().trim();
    const all = this.items();
    if (!term) return all;
    return all.filter(item =>
      item.name.toLowerCase().includes(term) ||
      (item.description && item.description.toLowerCase().includes(term))
    );
  });

  form = this.fb.group({
    name: ['', [Validators.required, Validators.minLength(2)]],
    description: [''],
  });

  ngOnInit(): void {
    this.pageInfoService.updateTitle('Categorías');
    this.pageInfoService.updateBreadcrumbs([
      { title: 'Inicio', path: '/dashboard', isActive: false },
      { title: '', path: '', isActive: false, isSeparator: true },
      { title: 'Cronos', path: '/dashboard', isActive: false },
      { title: '', path: '', isActive: false, isSeparator: true },
    ]);
    this.load();
  }

  load(): void {
    this.isLoading.set(true);
    this.errorMessage.set(null);
    this.categoryService.getAll(this.pageRequest).subscribe({
      next: res => {
        this.items.set(res.data.content);
        this.totalElements.set(res.data.totalElements);
        this.totalPages.set(res.data.totalPages);
        this.isLoading.set(false);
      },
      error: err => {
        this.errorMessage.set(err?.message || 'Error al cargar categorías');
        this.isLoading.set(false);
      },
    });
  }

  onSearchInput(event: Event): void {
    this.searchTerm.set((event.target as HTMLInputElement).value);
  }

  goToPage(page: number): void {
    if (page < 0 || page >= this.totalPages()) return;
    this.pageRequest = { ...this.pageRequest, page };
    this.load();
  }

  get pages(): number[] {
    return Array.from({ length: this.totalPages() }, (_, i) => i);
  }

  getStatusBadgeClass(status: string): string {
    return status === 'ACTIVE' ? 'badge badge-light-success' : 'badge badge-light-danger';
  }

  getStatusLabel(status: string): string {
    return status === 'ACTIVE' ? 'Activo' : 'Inactivo';
  }

  openCreate(): void {
    this.selectedItem.set(null);
    this.form.reset();
    this.showForm.set(true);
  }

  openEdit(item: CategoryResponse): void {
    this.selectedItem.set(item);
    this.form.patchValue({ name: item.name, description: item.description ?? '' });
    this.showForm.set(true);
  }

  closeForm(): void {
    this.showForm.set(false);
    this.selectedItem.set(null);
  }

  saveForm(): void {
    if (this.form.invalid) return;
    this.isSaving.set(true);
    const isEdit = !!this.selectedItem();
    const payload = {
      name: this.form.value.name!,
      description: this.form.value.description || undefined,
    };

    const obs = isEdit
      ? this.categoryService.update({ id: this.selectedItem()!.id, ...payload })
      : this.categoryService.create(payload);

    obs.subscribe({
      next: () => {
        this.isSaving.set(false);
        this.closeForm();
        this.load();
        this.alertService.success(isEdit ? 'Categoría actualizada correctamente' : 'Categoría creada correctamente');
      },
      error: err => {
        this.isSaving.set(false);
        this.alertService.error(err?.message || 'Error al guardar');
      },
    });
  }

  confirmDelete(item: CategoryResponse): void {
    Swal.fire({
      title: '¿Eliminar categoría?',
      html: `Se eliminará <strong>${item.name}</strong>. Esta acción no se puede deshacer.`,
      icon: 'warning',
      showCancelButton: true,
      confirmButtonColor: '#d33',
      cancelButtonColor: '#6c757d',
      confirmButtonText: 'Sí, eliminar',
      cancelButtonText: 'Cancelar',
    }).then(result => {
      if (result.isConfirmed) {
        this.categoryService.delete(item.id).subscribe({
          next: () => {
            this.load();
            this.alertService.success('Categoría eliminada correctamente');
          },
          error: err => {
            this.alertService.error(err?.message || 'Error al eliminar');
          },
        });
      }
    });
  }

  protected updateItemStatusInSignal(id: number, newStatus: "ACTIVE" | "INACTIVE") {
    this.items.update(currentItems =>
      currentItems.map(item =>
        item.id === id ? { ...item, status: newStatus } : item
      )
    );
  }
}
