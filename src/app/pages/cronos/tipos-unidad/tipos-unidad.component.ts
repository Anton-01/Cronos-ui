import { Component, OnInit, inject, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { ReactiveFormsModule, FormBuilder, Validators } from '@angular/forms';
import { UnitTypeService } from 'src/app/core/services/domain/unit-type.service';
import { UnitTypeResponse } from 'src/app/core/models/domain.model';
import { PageRequest } from 'src/app/core/models/pagination.model';
import { AlertService } from 'src/app/shared/services/alert.service';
import { AlertContainerComponent } from 'src/app/shared/components/alert-container/alert-container.component';
import Swal from 'sweetalert2';

@Component({
  selector: 'app-tipos-unidad',
  standalone: true,
  imports: [CommonModule, RouterLink, ReactiveFormsModule, AlertContainerComponent],
  templateUrl: './tipos-unidad.component.html',
})
export class TiposUnidadComponent implements OnInit {
  private unitTypeService = inject(UnitTypeService);
  private alertService = inject(AlertService);
  private fb = inject(FormBuilder);

  items = signal<UnitTypeResponse[]>([]);
  totalElements = signal(0);
  totalPages = signal(0);
  isLoading = signal(false);
  errorMessage = signal<string | null>(null);
  showForm = signal(false);
  selectedItem = signal<UnitTypeResponse | null>(null);
  isSaving = signal(false);

  searchTerm = signal('');
  pageRequest: PageRequest = { page: 0, size: 10, sort: 'name,asc' };

  filteredItems = computed(() => {
    const term = this.searchTerm().toLowerCase().trim();
    const all = this.items();
    if (!term) return all;
    return all.filter(item =>
      item.name.toLowerCase().includes(term) ||
      item.codeIdentity.toLowerCase().includes(term) ||
      item.dimension.toLowerCase().includes(term)
    );
  });

  form = this.fb.group({
    codeIdentity: ['', [Validators.required, Validators.minLength(2)]],
    name: ['', [Validators.required, Validators.minLength(2)]],
    dimension: ['', [Validators.required, Validators.minLength(2)]],
  });

  ngOnInit(): void {
    this.load();
  }

  load(): void {
    this.isLoading.set(true);
    this.errorMessage.set(null);
    this.unitTypeService.getAll(this.pageRequest).subscribe({
      next: res => {
        this.items.set(res.data.content);
        this.totalElements.set(res.data.totalElements);
        this.totalPages.set(res.data.totalPages);
        this.isLoading.set(false);
      },
      error: err => {
        this.errorMessage.set(err?.message || 'Error al cargar tipos de unidad');
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

  openEdit(item: UnitTypeResponse): void {
    this.selectedItem.set(item);
    this.form.patchValue({
      codeIdentity: item.codeIdentity,
      name: item.name,
      dimension: item.dimension,
    });
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
    const val = this.form.value;
    const payload = {
      codeIdentity: val.codeIdentity!,
      name: val.name!,
      dimension: val.dimension!,
    };
    const obs = isEdit
      ? this.unitTypeService.update({ id: this.selectedItem()!.id, ...payload })
      : this.unitTypeService.create(payload);

    obs.subscribe({
      next: () => {
        this.isSaving.set(false);
        this.closeForm();
        this.load();
        this.alertService.success(isEdit ? 'Tipo de unidad actualizado correctamente' : 'Tipo de unidad creado correctamente');
      },
      error: err => {
        this.isSaving.set(false);
        this.alertService.error(err?.message || 'Error al guardar');
      },
    });
  }

  confirmDelete(item: UnitTypeResponse): void {
    Swal.fire({
      title: '¿Eliminar tipo de unidad?',
      html: `Se eliminará <strong>${item.name}</strong>. Esta acción no se puede deshacer.`,
      icon: 'warning',
      showCancelButton: true,
      confirmButtonColor: '#d33',
      cancelButtonColor: '#6c757d',
      confirmButtonText: 'Sí, eliminar',
      cancelButtonText: 'Cancelar',
    }).then(result => {
      if (result.isConfirmed) {
        this.unitTypeService.delete(item.id).subscribe({
          next: () => {
            this.load();
            this.alertService.success('Tipo de unidad eliminado correctamente');
          },
          error: err => {
            this.alertService.error(err?.message || 'Error al eliminar');
          },
        });
      }
    });
  }
}
