import { Component, OnInit, OnDestroy, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule, FormBuilder, Validators } from '@angular/forms';
import { Subject } from 'rxjs';
import { debounceTime, distinctUntilChanged, takeUntil } from 'rxjs/operators';
import { UserFixedCostService } from 'src/app/core/services/domain/user-fixed-cost.service';
import { UserFixedCostResponse } from 'src/app/core/models/domain.model';
import { PageRequest } from 'src/app/core/models/pagination.model';
import { AlertService } from 'src/app/shared/services/alert.service';
import { AlertContainerComponent } from 'src/app/shared/components/alert-container/alert-container.component';
import { PageInfoService, PageLink } from 'src/app/_metronic/layout/core/page-info.service';
import Swal from 'sweetalert2';

interface SelectOption {
  value: string;
  label: string;
}

interface CalculationMethodOption extends SelectOption {
  hint: string;
}

@Component({
  selector: 'app-costos-fijos',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, AlertContainerComponent],
  templateUrl: './costos-fijos.component.html',
})
export class CostosFijosComponent implements OnInit, OnDestroy {
  private service = inject(UserFixedCostService);
  private alertService = inject(AlertService);
  private pageInfoService = inject(PageInfoService);
  private fb = inject(FormBuilder);
  private destroy$ = new Subject<void>();

  items = signal<UserFixedCostResponse[]>([]);
  totalElements = signal(0);
  totalPages = signal(0);
  isLoading = signal(false);
  errorMessage = signal<string | null>(null);
  showForm = signal(false);
  selectedItem = signal<UserFixedCostResponse | null>(null);
  isSaving = signal(false);

  searchTerm = signal('');
  searchSubject = new Subject<string>();
  pageRequest: PageRequest = { page: 0, size: 10, sort: 'name,asc' };

  // Catálogos estáticos
  costTypes: SelectOption[] = [
    { value: 'LABOR', label: 'Mano de Obra / Sueldos' },
    { value: 'UTILITY', label: 'Servicios: Agua, Luz, Gas' },
    { value: 'RENT', label: 'Renta de Local / Espacio' },
    { value: 'PACKAGING', label: 'Cajas, Domos, Etiquetas' },
    { value: 'OVERHEAD', label: 'Gastos Administrativos / Indirectos' },
    { value: 'MARKETING', label: 'Publicidad / Redes' },
  ];

  allCalculationMethods: CalculationMethodOption[] = [
    { value: 'HOURLY_RATE', label: 'Tarifa por Hora', hint: 'Ideal para LABOR o UTILITY' },
    { value: 'PER_UNIT', label: 'Costo por Unidad', hint: 'Ideal para PACKAGING' },
    { value: 'FIXED_PER_BATCH', label: 'Costo fijo por lote producido', hint: 'Ideal para RENT u OVERHEAD' },
  ];

  filteredCalculationMethods: CalculationMethodOption[] = [...this.allCalculationMethods];

  form = this.fb.group({
    name: ['', [Validators.required, Validators.minLength(2), Validators.maxLength(100)]],
    description: ['', [Validators.maxLength(255)]],
    type: ['', [Validators.required]],
    defaultAmount: [null as number | null, [Validators.required, Validators.min(0)]],
    calculationMethod: ['', [Validators.required]],
  });

  ngOnInit(): void {
    this.pageInfoService.updateTitle('Costos Fijos');
    this.pageInfoService.updateBreadcrumbs([
      { title: 'Inicio', path: '/dashboard', isActive: false },
      { title: '', path: '', isActive: false, isSeparator: true },
      { title: 'Costos', path: '/cronos/costos-fijos', isActive: false },
      { title: '', path: '', isActive: false, isSeparator: true },
    ]);
    this.load();

    this.searchSubject
      .pipe(debounceTime(300), distinctUntilChanged(), takeUntil(this.destroy$))
      .subscribe(term => {
        this.searchTerm.set(term);
        this.pageRequest = { ...this.pageRequest, page: 0 };
        this.load();
      });
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  load(): void {
    this.isLoading.set(true);
    this.errorMessage.set(null);
    const search = this.searchTerm().trim() || undefined;
    this.service.getAll(this.pageRequest, search).subscribe({
      next: res => {
        this.items.set(res.data.content);
        this.totalElements.set(res.data.totalElements);
        this.totalPages.set(res.data.totalPages);
        this.isLoading.set(false);
      },
      error: err => {
        this.errorMessage.set(err?.error?.message || err?.message || 'Error al cargar costos fijos');
        this.isLoading.set(false);
      },
    });
  }

  onSearchInput(event: Event): void {
    const value = (event.target as HTMLInputElement).value;
    this.searchSubject.next(value);
  }

  goToPage(page: number): void {
    if (page < 0 || page >= this.totalPages()) return;
    this.pageRequest = { ...this.pageRequest, page };
    this.load();
  }

  get pages(): number[] {
    return Array.from({ length: this.totalPages() }, (_, i) => i);
  }

  getTypeBadgeClass(type: string): string {
    const map: Record<string, string> = {
      LABOR: 'badge badge-light-primary',
      UTILITY: 'badge badge-light-warning',
      RENT: 'badge badge-light-info',
      PACKAGING: 'badge badge-light-success',
      OVERHEAD: 'badge badge-light-dark',
      MARKETING: 'badge badge-light-danger',
    };
    return map[type] || 'badge badge-light';
  }

  getTypeLabel(type: string): string {
    const found = this.costTypes.find(t => t.value === type);
    return found ? found.label : type;
  }

  getCalculationMethodLabel(method: string): string {
    const found = this.allCalculationMethods.find(m => m.value === method);
    return found ? found.label : method;
  }

  getStatusBadgeClass(isActive: boolean): string {
    return isActive ? 'badge badge-light-success' : 'badge badge-light-danger';
  }

  getStatusLabel(isActive: boolean): string {
    return isActive ? 'Activo' : 'Inactivo';
  }

  onTypeChange(): void {
    const type = this.form.value.type;
    this.form.controls['calculationMethod'].setValue('');

    switch (type) {
      case 'LABOR':
      case 'UTILITY':
        this.filteredCalculationMethods = this.allCalculationMethods.filter(m =>
          m.value === 'HOURLY_RATE'
        );
        break;
      case 'PACKAGING':
        this.filteredCalculationMethods = this.allCalculationMethods.filter(m =>
          m.value === 'PER_UNIT'
        );
        break;
      case 'RENT':
      case 'OVERHEAD':
        this.filteredCalculationMethods = this.allCalculationMethods.filter(m =>
          m.value === 'FIXED_PER_BATCH'
        );
        break;
      case 'MARKETING':
        this.filteredCalculationMethods = this.allCalculationMethods.filter(m =>
          m.value === 'PER_UNIT' || m.value === 'FIXED_PER_BATCH'
        );
        break;
      default:
        this.filteredCalculationMethods = [...this.allCalculationMethods];
    }

    // Auto-select if only one option
    if (this.filteredCalculationMethods.length === 1) {
      this.form.controls['calculationMethod'].setValue(this.filteredCalculationMethods[0].value);
    }
  }

  openCreate(): void {
    this.selectedItem.set(null);
    this.form.reset();
    this.filteredCalculationMethods = [...this.allCalculationMethods];
    this.showForm.set(true);
  }

  openEdit(item: UserFixedCostResponse): void {
    this.selectedItem.set(item);
    this.form.patchValue({
      name: item.name,
      description: item.description ?? '',
      type: item.type,
      defaultAmount: item.defaultAmount,
      calculationMethod: item.calculationMethod,
    });
    // Trigger filtered methods based on type
    this.onTypeChange();
    // Re-set calculationMethod after filtering
    this.form.controls['calculationMethod'].setValue(item.calculationMethod);
    this.showForm.set(true);
  }

  closeForm(): void {
    this.showForm.set(false);
    this.selectedItem.set(null);
  }

  saveForm(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    this.isSaving.set(true);
    const isEdit = !!this.selectedItem();
    const payload = {
      name: this.form.value.name!,
      description: this.form.value.description || undefined,
      type: this.form.value.type!,
      defaultAmount: this.form.value.defaultAmount!,
      calculationMethod: this.form.value.calculationMethod!,
    };

    const obs = isEdit
      ? this.service.update(this.selectedItem()!.id, payload)
      : this.service.create(payload);

    obs.subscribe({
      next: () => {
        this.isSaving.set(false);
        this.closeForm();
        this.load();
        this.alertService.success(
          isEdit ? 'Costo fijo actualizado correctamente' : 'Costo fijo creado correctamente'
        );
      },
      error: err => {
        this.isSaving.set(false);
        this.alertService.error(err?.error?.message || err?.message || 'Error al guardar');
      },
    });
  }

  confirmDelete(item: UserFixedCostResponse): void {
    Swal.fire({
      title: '¿Eliminar costo fijo?',
      html: `Se eliminará <strong>${item.name}</strong>. Esta acción no se puede deshacer.`,
      icon: 'warning',
      showCancelButton: true,
      confirmButtonColor: '#d33',
      cancelButtonColor: '#6c757d',
      confirmButtonText: 'Sí, eliminar',
      cancelButtonText: 'Cancelar',
    }).then(result => {
      if (result.isConfirmed) {
        this.service.delete(item.id).subscribe({
          next: () => {
            this.load();
            this.alertService.success('Costo fijo eliminado correctamente');
          },
          error: err => {
            this.alertService.error(err?.error?.message || err?.message || 'Error al eliminar');
          },
        });
      }
    });
  }

  formatCurrency(value: number): string {
    return '$' + value.toFixed(2);
  }
}
