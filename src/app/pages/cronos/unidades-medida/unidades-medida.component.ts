import { Component, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule, FormBuilder, Validators } from '@angular/forms';
import { MeasurementUnitService } from 'src/app/core/services/domain/measurement-unit.service';
import { UnitTypeService } from 'src/app/core/services/domain/unit-type.service';
import { MeasurementUnitResponse, UnitTypeResponse } from 'src/app/core/models/domain.model';
import { PageRequest } from 'src/app/core/models/pagination.model';
import { ToastService } from 'src/app/shared/services/toast.service';

@Component({
  selector: 'app-unidades-medida',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule],
  templateUrl: './unidades-medida.component.html',
})
export class UnidadesMedidaComponent implements OnInit {
  private measurementUnitService = inject(MeasurementUnitService);
  private unitTypeService = inject(UnitTypeService);
  private toast = inject(ToastService);
  private fb = inject(FormBuilder);

  items = signal<MeasurementUnitResponse[]>([]);
  unitTypes = signal<UnitTypeResponse[]>([]);
  totalElements = signal(0);
  totalPages = signal(0);
  isLoading = signal(false);
  errorMessage = signal<string | null>(null);
  showForm = signal(false);
  selectedItem = signal<MeasurementUnitResponse | null>(null);
  showDeleteModal = signal(false);
  deletingItem = signal<MeasurementUnitResponse | null>(null);
  isDeleting = signal(false);
  isSaving = signal(false);

  pageRequest: PageRequest = { page: 0, size: 10, sort: 'name,asc' };
  form = this.fb.group({
    name: ['', [Validators.required, Validators.minLength(2)]],
    abbreviation: ['', [Validators.required]],
    unitTypeId: [null as number | null],
  });

  ngOnInit(): void {
    this.load();
    this.loadUnitTypes();
  }

  load(): void {
    this.isLoading.set(true);
    this.measurementUnitService.getAll(this.pageRequest).subscribe({
      next: res => { this.items.set(res.data.content); this.totalElements.set(res.data.totalElements); this.totalPages.set(res.data.totalPages); this.isLoading.set(false); },
      error: err => { this.errorMessage.set(err?.message || 'Error'); this.isLoading.set(false); },
    });
  }

  loadUnitTypes(): void {
    this.unitTypeService.getAll({ page: 0, size: 100, sort: 'name,asc' }).subscribe({
      next: res => this.unitTypes.set(res.data.content),
    });
  }

  goToPage(page: number): void { this.pageRequest = { ...this.pageRequest, page }; this.load(); }
  get pages(): number[] { return Array.from({ length: this.totalPages() }, (_, i) => i); }
  openCreate(): void { this.selectedItem.set(null); this.form.reset(); this.showForm.set(true); }
  openEdit(item: MeasurementUnitResponse): void {
    this.selectedItem.set(item);
    this.form.patchValue({ name: item.name, abbreviation: item.abbreviation, unitTypeId: item.unitType?.id ?? null });
    this.showForm.set(true);
  }
  closeForm(): void { this.showForm.set(false); this.selectedItem.set(null); }

  saveForm(): void {
    if (this.form.invalid) return;
    this.isSaving.set(true);
    const isEdit = !!this.selectedItem();
    const payload = { name: this.form.value.name!, abbreviation: this.form.value.abbreviation!, unitTypeId: this.form.value.unitTypeId || undefined };
    const obs = isEdit ? this.measurementUnitService.update({ id: this.selectedItem()!.id, ...payload }) : this.measurementUnitService.create(payload);
    obs.subscribe({
      next: () => { this.isSaving.set(false); this.closeForm(); this.load(); this.toast.success(isEdit ? 'Unidad actualizada' : 'Unidad creada'); },
      error: err => { this.isSaving.set(false); this.toast.error('Error', err?.message); },
    });
  }

  openDelete(item: MeasurementUnitResponse): void { this.deletingItem.set(item); this.showDeleteModal.set(true); }
  closeDeleteModal(): void { this.showDeleteModal.set(false); this.deletingItem.set(null); }

  confirmDelete(): void {
    const item = this.deletingItem();
    if (!item) return;
    this.isDeleting.set(true);
    this.measurementUnitService.delete(item.id).subscribe({
      next: () => { this.isDeleting.set(false); this.closeDeleteModal(); this.load(); this.toast.success('Unidad eliminada'); },
      error: err => { this.isDeleting.set(false); this.closeDeleteModal(); this.toast.error('Error al eliminar', err?.message); },
    });
  }
}
