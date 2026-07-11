import { ChangeDetectionStrategy, Component, OnDestroy, OnInit, computed, inject, signal } from '@angular/core';
import { DecimalPipe } from '@angular/common';
import { FormsModule, ReactiveFormsModule, FormBuilder, Validators } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { Subject, combineLatest, debounceTime, startWith, takeUntil } from 'rxjs';

import { ButtonModule } from 'primeng/button';
import { CardModule } from 'primeng/card';
import { DialogModule } from 'primeng/dialog';
import { InputNumberModule } from 'primeng/inputnumber';
import { InputTextModule } from 'primeng/inputtext';
import { MessageModule } from 'primeng/message';
import { SelectModule } from 'primeng/select';
import { TagModule } from 'primeng/tag';
import { TextareaModule } from 'primeng/textarea';
import { ToggleSwitchModule } from 'primeng/toggleswitch';

import { IngredientService } from 'src/app/core/services/domain/ingredient.service';
import { CategoryService } from 'src/app/core/services/domain/category.service';
import { MeasurementUnitService } from 'src/app/core/services/domain/measurement-unit.service';
import {
  CategoryResponse,
  DensityConversion,
  MeasurementUnitResponse,
} from 'src/app/core/models/domain.model';
import { PageInfoService } from 'src/app/core/services/page-info.service';
import { AlertService } from 'src/app/shared/services/alert.service';

type YieldLevel = 'excellent' | 'good' | 'warning' | 'none';

const DENSITY_DIMENSIONS = new Set([
  'masa',
  'mass',
  'peso',
  'volumen',
  'volume',
  'masa y peso',
  'volumen y capacidad',
]);

@Component({
  selector: 'app-ingredient-form',
  standalone: true,
  imports: [
    DecimalPipe,
    FormsModule,
    ReactiveFormsModule,
    ButtonModule,
    CardModule,
    DialogModule,
    InputNumberModule,
    InputTextModule,
    MessageModule,
    SelectModule,
    TagModule,
    TextareaModule,
    ToggleSwitchModule,
  ],
  templateUrl: './ingredient-form.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class IngredientFormComponent implements OnInit, OnDestroy {
  private readonly fb = inject(FormBuilder);
  private readonly ingredientService = inject(IngredientService);
  private readonly categoryService = inject(CategoryService);
  private readonly measurementUnitService = inject(MeasurementUnitService);
  private readonly alertService = inject(AlertService);
  private readonly pageInfoService = inject(PageInfoService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly destroy$ = new Subject<void>();

  isEdit = false;
  ingredientId: string | null = null;

  readonly categories = signal<CategoryResponse[]>([]);
  readonly measurementUnits = signal<MeasurementUnitResponse[]>([]);

  readonly isLoading = signal(false);
  readonly isSaving = signal(false);

  // Live calculation
  readonly realUnitCost = signal(0);
  readonly usableQuantity = signal(0);

  // Density conversion
  readonly showDensitySwitch = signal(false);
  readonly hasDensityConversion = signal(false);
  readonly showDensityModal = signal(false);
  readonly densityData = signal<DensityConversion | null>(null);

  // Yield indicator
  readonly yieldLevel = signal<YieldLevel>('none');

  readonly currencies = [
    { code: 'MXN', name: 'MXN – Peso Mexicano' },
    { code: 'USD', name: 'USD – Dólar Americano' },
    { code: 'EUR', name: 'EUR – Euro' },
  ];

  readonly form = this.fb.group({
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

  readonly densityForm = this.fb.group({
    gramsPerCup: [null as number | null, [Validators.required, Validators.min(0.01)]],
    gramsPerTablespoon: [null as number | null],
    gramsPerTeaspoon: [null as number | null],
  });

  readonly selectedUnitCode = computed(() => {
    const unitId = this.form.controls.purchaseUnitId.value;
    if (!unitId) {
      return '';
    }
    return this.measurementUnits().find((u) => u.id === unitId)?.codeIdentity ?? '';
  });

  ngOnInit(): void {
    this.ingredientId = this.route.snapshot.paramMap.get('id');
    this.isEdit = !!this.ingredientId;

    this.pageInfoService.updateTitle(this.isEdit ? 'Editar Ingrediente' : 'Nuevo Ingrediente');
    this.pageInfoService.updateDescription('Registra la información de compra y costeo del ingrediente');
    this.pageInfoService.updateBreadcrumbs([
      { title: 'Inicio', path: '/dashboard', isActive: false },
      { title: 'Ingredientes', path: '/cronos/ingredientes', isActive: false },
      { title: this.isEdit ? 'Editar' : 'Nuevo', path: '', isActive: true },
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
      next: (res) => this.categories.set(res.data.content),
    });
  }

  private loadMeasurementUnits(): void {
    this.measurementUnitService.getAll({ page: 0, size: 200, sort: 'name,asc' }).subscribe({
      next: (res) => {
        this.measurementUnits.set(res.data.content);
        if (this.isEdit) {
          this.loadIngredient();
        }
      },
    });
  }

  private loadIngredient(): void {
    if (!this.ingredientId) {
      return;
    }
    this.isLoading.set(true);
    this.ingredientService.getById(this.ingredientId).subscribe({
      next: (res) => {
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
    const quantity$ = this.form.controls.purchaseQuantity.valueChanges.pipe(
      startWith(this.form.controls.purchaseQuantity.value)
    );
    const cost$ = this.form.controls.unitCost.valueChanges.pipe(
      startWith(this.form.controls.unitCost.value)
    );
    const yield$ = this.form.controls.yieldPercentage.valueChanges.pipe(
      startWith(this.form.controls.yieldPercentage.value)
    );

    combineLatest([quantity$, cost$, yield$])
      .pipe(takeUntil(this.destroy$), debounceTime(150))
      .subscribe(([quantity, cost, yieldPercentage]) => {
        const q = Number(quantity) || 0;
        const c = Number(cost) || 0;
        const y = Number(yieldPercentage) || 0;

        const usable = q * (y / 100);
        this.usableQuantity.set(usable);
        this.realUnitCost.set(usable > 0 ? c / usable : 0);

        if (y >= 90) {
          this.yieldLevel.set('excellent');
        } else if (y >= 80) {
          this.yieldLevel.set('good');
        } else if (y > 0) {
          this.yieldLevel.set('warning');
        } else {
          this.yieldLevel.set('none');
        }
      });
  }

  private setupUnitWatch(): void {
    this.form.controls.purchaseUnitId.valueChanges.pipe(takeUntil(this.destroy$)).subscribe((unitId) => {
      if (!unitId) {
        this.showDensitySwitch.set(false);
        return;
      }
      const unit = this.measurementUnits().find((u) => u.id === unitId);
      const dimension = (unit?.unitType ?? '').toLowerCase().trim();
      const canHaveDensity = DENSITY_DIMENSIONS.has(dimension);

      this.showDensitySwitch.set(canHaveDensity);
      if (!canHaveDensity) {
        this.hasDensityConversion.set(false);
        this.densityData.set(null);
      }
    });
  }

  getYieldLabel(): string {
    switch (this.yieldLevel()) {
      case 'excellent':
        return 'Excelente';
      case 'good':
        return 'Bueno';
      case 'warning':
        return 'Alto desperdicio';
      default:
        return '';
    }
  }

  getYieldSeverity(): 'success' | 'info' | 'warn' | 'secondary' {
    switch (this.yieldLevel()) {
      case 'excellent':
        return 'success';
      case 'good':
        return 'info';
      case 'warning':
        return 'warn';
      default:
        return 'secondary';
    }
  }

  openDensityModal(): void {
    const density = this.densityData();
    if (density) {
      this.densityForm.patchValue({
        gramsPerCup: density.gramsPerCup,
        gramsPerTablespoon: density.gramsPerTablespoon ?? null,
        gramsPerTeaspoon: density.gramsPerTeaspoon ?? null,
      });
    } else {
      this.densityForm.reset();
    }
    this.showDensityModal.set(true);
  }

  closeDensityModal(): void {
    this.showDensityModal.set(false);
    if (!this.densityData()) {
      this.hasDensityConversion.set(false);
    }
  }

  saveDensityConversion(): void {
    if (this.densityForm.invalid) {
      return;
    }
    const value = this.densityForm.value;
    this.densityData.set({
      gramsPerCup: value.gramsPerCup!,
      gramsPerTablespoon: value.gramsPerTablespoon || undefined,
      gramsPerTeaspoon: value.gramsPerTeaspoon || undefined,
    });
    this.hasDensityConversion.set(true);
    this.showDensityModal.set(false);
  }

  removeDensityConversion(): void {
    this.densityData.set(null);
    this.hasDensityConversion.set(false);
  }

  onDensitySwitchChange(checked: boolean): void {
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
    const value = this.form.value;

    const payload = {
      name: value.name!,
      description: value.description || undefined,
      brand: value.brand || undefined,
      supplier: value.supplier || undefined,
      categoryId: value.categoryId!,
      purchaseUnitId: value.purchaseUnitId!,
      purchaseQuantity: value.purchaseQuantity!,
      unitCost: value.unitCost!,
      currency: value.currency!,
      yieldPercentage: value.yieldPercentage!,
      minimumStock: value.minimumStock || undefined,
      densityConversion: this.densityData() || undefined,
    };

    const request$ = this.isEdit
      ? this.ingredientService.update({ id: this.ingredientId!, ...payload })
      : this.ingredientService.create(payload);

    request$.subscribe({
      next: () => {
        this.isSaving.set(false);
        this.alertService.success(
          this.isEdit ? 'Ingrediente actualizado correctamente' : 'Ingrediente creado correctamente'
        );
        this.router.navigate(['/cronos/ingredientes']);
      },
      error: (err) => {
        this.isSaving.set(false);
        this.alertService.error(err?.message || 'Error al guardar');
      },
    });
  }

  goBack(): void {
    this.router.navigate(['/cronos/ingredientes']);
  }

  isFieldInvalid(fieldName: string): boolean {
    const control = this.form.get(fieldName);
    return !!control && control.invalid && control.touched;
  }
}
