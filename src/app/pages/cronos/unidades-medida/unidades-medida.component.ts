import { Component, OnInit, inject, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule, ReactiveFormsModule, FormBuilder, Validators } from '@angular/forms';
import { MeasurementUnitService } from 'src/app/core/services/domain/measurement-unit.service';
import { MeasurementUnitResponse } from 'src/app/core/models/domain.model';
import { PageRequest } from 'src/app/core/models/pagination.model';
import { AlertService } from 'src/app/shared/services/alert.service';
import { AlertContainerComponent } from 'src/app/shared/components/alert-container/alert-container.component';
import { PageInfoService } from 'src/app/_metronic/layout/core/page-info.service';
import Swal from 'sweetalert2';
import {StatusToggleComponent} from "../../../shared/components/modal-toggle-status/status-toggle.component";

@Component({
  selector: 'app-unidades-medida',
  standalone: true,
  imports: [CommonModule, FormsModule, ReactiveFormsModule, AlertContainerComponent, StatusToggleComponent],
  templateUrl: './unidades-medida.component.html',
})
export class UnidadesMedidaComponent implements OnInit {
  private measurementUnitService = inject(MeasurementUnitService);
  private alertService = inject(AlertService);
  private pageInfoService = inject(PageInfoService);
  private fb = inject(FormBuilder);

  items = signal<MeasurementUnitResponse[]>([]);
  totalElements = signal(0);
  totalPages = signal(0);
  isLoading = signal(false);
  errorMessage = signal<string | null>(null);
  showForm = signal(false);
  selectedItem = signal<MeasurementUnitResponse | null>(null);
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
      item.namePlural.toLowerCase().includes(term) ||
      item.unitType.toLowerCase().includes(term)
    );
  });

  form = this.fb.group({
    code: ['', [Validators.required, Validators.minLength(1)]],
    name: ['', [Validators.required, Validators.minLength(2)]],
    pluralName: ['', [Validators.required, Validators.minLength(2)]],
    dimensionName: ['', [Validators.required]],
    baseFactor: [1 as number, [Validators.required, Validators.min(0.000001)]],
    isBase: [false as boolean],
  });

  ngOnInit(): void {
    this.pageInfoService.updateTitle('Unidades de Medida');
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
    this.measurementUnitService.getAll(this.pageRequest).subscribe({
      next: res => {
        this.items.set(res.data.content);
        this.totalElements.set(res.data.totalElements);
        this.totalPages.set(res.data.totalPages);
        this.isLoading.set(false);
      },
      error: err => {
        this.errorMessage.set(err?.message || 'Error al cargar unidades de medida');
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

  openCreate(): void {
    this.selectedItem.set(null);
    this.form.reset({ baseFactor: 1, isBase: false });
    this.showForm.set(true);
  }

  openEdit(item: MeasurementUnitResponse): void {
    this.selectedItem.set(item);
    this.form.patchValue({
      code: item.codeIdentity,
      name: item.name,
      pluralName: item.namePlural,
      dimensionName: item.unitType,
      baseFactor: item.multiplierToBase,
      isBase: item.isBaseUnit,
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
      codeIdentity: val.code!,
      name: val.name!,
      namePlural: val.pluralName!,
      unitType: val.dimensionName!,
      multiplierToBase: val.baseFactor!,
      isBaseUnit: val.isBase!,
    };

    const obs = isEdit
      ? this.measurementUnitService.update({ id: this.selectedItem()!.id, ...payload })
      : this.measurementUnitService.create(payload);

    obs.subscribe({
      next: () => {
        this.isSaving.set(false);
        this.closeForm();
        this.load();
        this.alertService.success(isEdit ? 'Unidad de medida actualizada correctamente' : 'Unidad de medida creada correctamente');
      },
      error: err => {
        this.isSaving.set(false);
        this.alertService.error(err?.message || 'Error al guardar');
      },
    });
  }

  confirmDelete(item: MeasurementUnitResponse): void {
    Swal.fire({
      title: '¿Eliminar unidad de medida?',
      html: `Se eliminará <strong>${item.name}</strong>. Esta acción no se puede deshacer.`,
      icon: 'warning',
      showCancelButton: true,
      confirmButtonColor: '#d33',
      cancelButtonColor: '#6c757d',
      confirmButtonText: 'Sí, eliminar',
      cancelButtonText: 'Cancelar',
    }).then(result => {
      if (result.isConfirmed) {
        this.measurementUnitService.delete(item.id).subscribe({
          next: () => {
            this.load();
            this.alertService.success('Unidad de medida eliminada correctamente');
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
