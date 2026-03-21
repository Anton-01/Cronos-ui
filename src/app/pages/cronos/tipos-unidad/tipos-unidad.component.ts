import { Component, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule, FormBuilder, Validators } from '@angular/forms';
import { UnitTypeService } from 'src/app/core/services/domain/unit-type.service';
import { UnitTypeResponse } from 'src/app/core/models/domain.model';
import { PageRequest } from 'src/app/core/models/pagination.model';
import { ToastService } from 'src/app/shared/services/toast.service';

@Component({
  selector: 'app-tipos-unidad',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule],
  templateUrl: './tipos-unidad.component.html',
})
export class TiposUnidadComponent implements OnInit {
  private unitTypeService = inject(UnitTypeService);
  private toast = inject(ToastService);
  private fb = inject(FormBuilder);

  items = signal<UnitTypeResponse[]>([]);
  totalElements = signal(0);
  totalPages = signal(0);
  isLoading = signal(false);
  errorMessage = signal<string | null>(null);
  showForm = signal(false);
  selectedItem = signal<UnitTypeResponse | null>(null);
  showDeleteModal = signal(false);
  deletingItem = signal<UnitTypeResponse | null>(null);
  isDeleting = signal(false);
  isSaving = signal(false);

  pageRequest: PageRequest = { page: 0, size: 10, sort: 'name,asc' };
  form = this.fb.group({ name: ['', [Validators.required, Validators.minLength(2)]], description: [''] });

  ngOnInit(): void { this.load(); }

  load(): void {
    this.isLoading.set(true);
    this.unitTypeService.getAll(this.pageRequest).subscribe({
      next: res => { this.items.set(res.data.content); this.totalElements.set(res.data.totalElements); this.totalPages.set(res.data.totalPages); this.isLoading.set(false); },
      error: err => { this.errorMessage.set(err?.message || 'Error al cargar tipos de unidad'); this.isLoading.set(false); },
    });
  }

  goToPage(page: number): void { this.pageRequest = { ...this.pageRequest, page }; this.load(); }
  get pages(): number[] { return Array.from({ length: this.totalPages() }, (_, i) => i); }
  openCreate(): void { this.selectedItem.set(null); this.form.reset(); this.showForm.set(true); }
  openEdit(item: UnitTypeResponse): void { this.selectedItem.set(item); this.form.patchValue({ name: item.name, description: item.description ?? '' }); this.showForm.set(true); }
  closeForm(): void { this.showForm.set(false); this.selectedItem.set(null); }

  saveForm(): void {
    if (this.form.invalid) return;
    this.isSaving.set(true);
    const isEdit = !!this.selectedItem();
    const payload = { name: this.form.value.name!, description: this.form.value.description || undefined };
    const obs = isEdit ? this.unitTypeService.update({ id: this.selectedItem()!.id, ...payload }) : this.unitTypeService.create(payload);
    obs.subscribe({
      next: () => { this.isSaving.set(false); this.closeForm(); this.load(); this.toast.success(isEdit ? 'Tipo de unidad actualizado' : 'Tipo de unidad creado'); },
      error: err => { this.isSaving.set(false); this.toast.error('Error', err?.message); },
    });
  }

  openDelete(item: UnitTypeResponse): void { this.deletingItem.set(item); this.showDeleteModal.set(true); }
  closeDeleteModal(): void { this.showDeleteModal.set(false); this.deletingItem.set(null); }

  confirmDelete(): void {
    const item = this.deletingItem();
    if (!item) return;
    this.isDeleting.set(true);
    this.unitTypeService.delete(item.id).subscribe({
      next: () => { this.isDeleting.set(false); this.closeDeleteModal(); this.load(); this.toast.success('Tipo de unidad eliminado'); },
      error: err => { this.isDeleting.set(false); this.closeDeleteModal(); this.toast.error('Error al eliminar', err?.message); },
    });
  }
}
