import { Component, OnInit, OnDestroy, inject, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule, FormBuilder, Validators } from '@angular/forms';
import { Router, ActivatedRoute } from '@angular/router';
import { Subject, combineLatest, startWith, takeUntil, debounceTime } from 'rxjs';
import { IngredientService } from 'src/app/core/services/domain/ingredient.service';
import { CategoryService } from 'src/app/core/services/domain/category.service';
import { MeasurementUnitService } from 'src/app/core/services/domain/measurement-unit.service';
import {
  CategoryResponse,
  MeasurementUnitResponse,
  DensityConversion,
} from 'src/app/core/models/domain.model';
import { AlertService } from 'src/app/shared/services/alert.service';
import { AlertContainerComponent } from 'src/app/shared/components/alert-container/alert-container.component';
import { PageInfoService } from 'src/app/_metronic/layout/core/page-info.service';

@Component({
  selector: 'app-ingrediente-form',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, AlertContainerComponent],
  templateUrl: './ingrediente-form.component.html',
  styleUrls: ['./ingrediente-form.component.scss'],
})
export class IngredienteFormComponent implements OnInit, OnDestroy {
  private fb = inject(FormBuilder);
  private ingredientService = inject(IngredientService);
  private categoryService = inject(CategoryService);
  private measurementUnitService = inject(MeasurementUnitService);
  private alertService = inject(AlertService);
  private pageInfoService = inject(PageInfoService);
  private router = inject(Router);
  private route = inject(ActivatedRoute);
  private destroy$ = new Subject<void>();

  isEdit = false;
  ingredientId: string | null = null;

  categories = signal<CategoryResponse[]>([]);
  measurementUnits = signal<MeasurementUnitResponse[]>([]);

  isLoading = signal(false);
  isSaving = signal(false);

  // Live calculation
  realUnitCost = signal(0);
  usableQuantity = signal(0);

  // Category dropdown
  showCategoryDropdown = signal(false);
  selectedCategory = computed(() => {
    const id = this.form.get('categoryId')?.value;
    if (!id) return null;
    return this.categories().find(c => c.id === id) ?? null;
  });

  // Density conversion
  showDensitySwitch = signal(false);
  hasDensityConversion = signal(false);
  showDensityModal = signal(false);
  densityData = signal<DensityConversion | null>(null);

  // Yield indicator
  yieldLevel = signal<'excellent' | 'good' | 'warning' | 'none'>('none');

  currencies = [
    { code: 'MXN', name: 'MXN \u2013 Peso Mexicano' },
    { code: 'USD', name: 'USD \u2013 Dólar Americano' },
    { code: 'EUR', name: 'EUR \u2013 Euro' },
  ];

  form = this.fb.group({
    name: ['', [Validators.required, Validators.minLength(2)]],
    description: [''],
    brand: [''],
    supplier: [''],
    categoryId: [null as number | null, [Validators.required]],
    purchaseUnitId: [null as number | null, [Validators.required]],
    purchaseQuantity: [null as number | null, [Validators.required, Validators.min(0.0001)]],
    unitCost: [null as number | null, [Validators.required, Validators.min(0)]],
    currency: ['MXN', [Validators.required]],
    yieldPercentage: [100 as number, [Validators.required, Validators.min(1), Validators.max(100)]],
    minimumStock: [null as number | null],
  });

  densityForm = this.fb.group({
    gramsPerCup: [null as number | null, [Validators.required, Validators.min(0.01)]],
    gramsPerTablespoon: [null as number | null],
    gramsPerTeaspoon: [null as number | null],
  });

  selectedUnitName = computed(() => {
    const unitId = this.form.get('purchaseUnitId')?.value;
    if (!unitId) return 'Unidad';
    const unit = this.measurementUnits().find(u => u.id === unitId);
    return unit?.name || 'Unidad';
  });

  selectedUnitCode = computed(() => {
    const unitId = this.form.get('purchaseUnitId')?.value;
    if (!unitId) return '';
    const unit = this.measurementUnits().find(u => u.id === unitId);
    return unit?.codeIdentity || '';
  });

  selectedCurrencyCode = computed(() => {
    return this.form.get('currency')?.value || 'MXN';
  });

  ngOnInit(): void {
    this.ingredientId = this.route.snapshot.paramMap.get('id');
    this.isEdit = !!this.ingredientId;

    this.pageInfoService.updateTitle(this.isEdit ? 'Editar Ingrediente' : 'Nuevo Ingrediente');
    this.pageInfoService.updateBreadcrumbs([
      { title: 'Inicio', path: '/dashboard', isActive: false },
      { title: '', path: '', isActive: false, isSeparator: true },
      { title: 'Ingredientes', path: '/cronos/ingredientes', isActive: false },
      { title: '', path: '', isActive: false, isSeparator: true },
    ]);

    this.loadCategories();
    this.loadMeasurementUnits();

    this.setupLiveCalculation();
    this.setupUnitWatch();
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  private loadCategories(): void {
    this.categoryService.getAll({ page: 0, size: 200, sort: 'name,asc' }).subscribe({
      next: res => this.categories.set(res.data.content),
    });
  }

  private loadMeasurementUnits(): void {
    this.measurementUnitService.getAll({ page: 0, size: 200, sort: 'name,asc' }).subscribe({
      next: res => {
        this.measurementUnits.set(res.data.content);
        if (this.isEdit) {
          this.loadIngredient();
        }
      },
    });
  }

  private loadIngredient(): void {
    if (!this.ingredientId) return;
    this.isLoading.set(true);
    this.ingredientService.getById(this.ingredientId).subscribe({
      next: res => {
        const data = res.data;
        this.form.patchValue({
          name: data.name,
          description: data.description ?? '',
          brand: data.brand ?? '',
          supplier: data.supplier ?? '',
          categoryId: data.categoryId,
          purchaseUnitId: data.purchaseUnitId,
          purchaseQuantity: data.purchaseQuantity,
          unitCost: data.unitCost,
          currency: data.currency,
          yieldPercentage: data.yieldPercentage,
          minimumStock: data.minimumStock,
        });
        if (data.densityConversion) {
          this.densityData.set(data.densityConversion);
          this.hasDensityConversion.set(true);
        }
        this.isLoading.set(false);
      },
      error: () => {
        this.alertService.error('Error al cargar el ingrediente');
        this.isLoading.set(false);
      },
    });
  }

  private setupLiveCalculation(): void {
    const qty$ = this.form.get('purchaseQuantity')!.valueChanges.pipe(startWith(this.form.get('purchaseQuantity')!.value));
    const cost$ = this.form.get('unitCost')!.valueChanges.pipe(startWith(this.form.get('unitCost')!.value));
    const yield$ = this.form.get('yieldPercentage')!.valueChanges.pipe(startWith(this.form.get('yieldPercentage')!.value));

    combineLatest([qty$, cost$, yield$]).pipe(
      takeUntil(this.destroy$),
      debounceTime(150),
    ).subscribe(([qty, cost, yieldPct]) => {
      const q = Number(qty) || 0;
      const c = Number(cost) || 0;
      const y = Number(yieldPct) || 0;

      const usable = q * (y / 100);
      this.usableQuantity.set(usable);
      this.realUnitCost.set(usable > 0 ? c / usable : 0);

      if (y >= 90) this.yieldLevel.set('excellent');
      else if (y >= 80) this.yieldLevel.set('good');
      else if (y > 0) this.yieldLevel.set('warning');
      else this.yieldLevel.set('none');
    });
  }

  private static readonly DENSITY_DIMENSIONS = new Set(['masa', 'mass', 'peso', 'volumen', 'volume']);

  private setupUnitWatch(): void {
    this.form.get('purchaseUnitId')!.valueChanges.pipe(
      takeUntil(this.destroy$),
    ).subscribe(unitId => {
      if (!unitId) {
        this.showDensitySwitch.set(false);
        return;
      }
      const unit = this.measurementUnits().find(u => u.id === unitId);
      const dimension = (unit?.unitType ?? '').toLowerCase().trim();
      const canHaveDensity = IngredienteFormComponent.DENSITY_DIMENSIONS.has(dimension);

      this.showDensitySwitch.set(canHaveDensity);
      if (!canHaveDensity) {
        this.hasDensityConversion.set(false);
        this.densityData.set(null);
      }
    });
  }

  getYieldLabel(): string {
    switch (this.yieldLevel()) {
      case 'excellent': return 'Excelente';
      case 'good': return 'Bueno';
      case 'warning': return 'Alto desperdicio';
      default: return '';
    }
  }

  getYieldIcon(): string {
    switch (this.yieldLevel()) {
      case 'excellent': return 'ki-check-circle';
      case 'good': return 'ki-information';
      case 'warning': return 'ki-information-2';
      default: return '';
    }
  }

  openDensityModal(): void {
    if (this.densityData()) {
      this.densityForm.patchValue({
        gramsPerCup: this.densityData()!.gramsPerCup,
        gramsPerTablespoon: this.densityData()!.gramsPerTablespoon ?? null,
        gramsPerTeaspoon: this.densityData()!.gramsPerTeaspoon ?? null,
      });
    } else {
      this.densityForm.reset();
    }
    this.showDensityModal.set(true);
  }

  closeDensityModal(): void {
    this.showDensityModal.set(false);
  }

  saveDensityConversion(): void {
    if (this.densityForm.invalid) return;
    const val = this.densityForm.value;
    this.densityData.set({
      gramsPerCup: val.gramsPerCup!,
      gramsPerTablespoon: val.gramsPerTablespoon || undefined,
      gramsPerTeaspoon: val.gramsPerTeaspoon || undefined,
    });
    this.hasDensityConversion.set(true);
    this.closeDensityModal();
  }

  removeDensityConversion(): void {
    this.densityData.set(null);
    this.hasDensityConversion.set(false);
  }

  onDensitySwitchChange(event: Event): void {
    const checked = (event.target as HTMLInputElement).checked;
    if (checked) {
      this.openDensityModal();
    } else {
      this.removeDensityConversion();
    }
  }

  save(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    this.isSaving.set(true);
    const val = this.form.value;

    const payload = {
      name: val.name!,
      description: val.description || undefined,
      brand: val.brand || undefined,
      supplier: val.supplier || undefined,
      categoryId: val.categoryId!,
      purchaseUnitId: val.purchaseUnitId!,
      purchaseQuantity: val.purchaseQuantity!,
      unitCost: val.unitCost!,
      currency: val.currency!,
      yieldPercentage: val.yieldPercentage!,
      minimumStock: val.minimumStock || undefined,
      densityConversion: this.densityData() || undefined,
    };

    const obs = this.isEdit
      ? this.ingredientService.update({ id: this.ingredientId!, ...payload })
      : this.ingredientService.create(payload);

    obs.subscribe({
      next: () => {
        this.isSaving.set(false);
        this.alertService.success(this.isEdit ? 'Ingrediente actualizado correctamente' : 'Ingrediente creado correctamente');
        this.router.navigate(['/cronos/ingredientes']);
      },
      error: err => {
        this.isSaving.set(false);
        this.alertService.error(err?.message || 'Error al guardar');
      },
    });
  }

  goBack(): void {
    this.router.navigate(['/cronos/ingredientes']);
  }

  toggleCategoryDropdown(): void {
    this.showCategoryDropdown.update(v => !v);
  }

  selectCategory(cat: CategoryResponse): void {
    this.form.controls.categoryId.setValue(cat.id);
    this.form.controls.categoryId.markAsTouched();
    this.showCategoryDropdown.set(false);
  }

  isFieldInvalid(fieldName: string): boolean {
    const control = this.form.get(fieldName);
    return !!control && control.invalid && control.touched;
  }
}
