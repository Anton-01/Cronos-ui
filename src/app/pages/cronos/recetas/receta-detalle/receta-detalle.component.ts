import { Component, OnInit, OnDestroy, inject, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule, FormBuilder, Validators, FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { Subject, BehaviorSubject } from 'rxjs';
import { takeUntil, debounceTime, distinctUntilChanged } from 'rxjs/operators';
import { RecipeService } from 'src/app/core/services/domain/recipe.service';
import { IngredientService } from 'src/app/core/services/domain/ingredient.service';
import { UserFixedCostService } from 'src/app/core/services/domain/user-fixed-cost.service';
import { MeasurementUnitService } from 'src/app/core/services/domain/measurement-unit.service';
import { MeasurementUnitResponse } from 'src/app/core/models/domain.model';
import {
  RecipeDetailResponse,
  RecipeIngredientResponse,
  RecipeFixedCostResponse,
  RecipeCostBreakdown,
  IngredientResponse,
  UserFixedCostResponse,
  CreateRecipeRequest,
} from 'src/app/core/models/domain.model';
import { PageRequest } from 'src/app/core/models/pagination.model';
import { AlertService } from 'src/app/shared/services/alert.service';
import { AlertContainerComponent } from 'src/app/shared/components/alert-container/alert-container.component';
import { PageInfoService } from 'src/app/_metronic/layout/core/page-info.service';
import Swal from 'sweetalert2';

type TabId = 'ingredients' | 'fixed-costs' | 'instructions';

@Component({
  selector: 'app-receta-detalle',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, FormsModule, AlertContainerComponent],
  templateUrl: './receta-detalle.component.html',
})
export class RecetaDetalleComponent implements OnInit, OnDestroy {
  private recipeService = inject(RecipeService);
  private ingredientService = inject(IngredientService);
  private fixedCostService = inject(UserFixedCostService);
  private measurementUnitService = inject(MeasurementUnitService);
  private alertService = inject(AlertService);
  private pageInfoService = inject(PageInfoService);
  private fb = inject(FormBuilder);
  private router = inject(Router);
  private route = inject(ActivatedRoute);
  private destroy$ = new Subject<void>();

  // --- Core state ---
  recipeId = '';
  recipe = signal<RecipeDetailResponse | null>(null);
  isLoading = signal(true);
  activeTab = signal<TabId>('ingredients');

  // --- Change notification via RxJS ---
  private recipeChanged$ = new BehaviorSubject<void>(undefined);
  needsRecalculation = signal(false);

  // --- Ingredients Tab ---
  ingredients = signal<RecipeIngredientResponse[]>([]);
  rawMaterials = signal<IngredientResponse[]>([]);
  filteredRawMaterials = signal<IngredientResponse[]>([]);
  ingredientSearch = signal('');
  ingredientSearchSubject = new Subject<string>();
  isAddingIngredient = signal(false);

  ingredientForm = this.fb.group({
    rawMaterialId: ['', Validators.required],
    quantity: [null as number | null, [Validators.required, Validators.min(0.001)]],
    unitId: ['', Validators.required],
    notes: [''],
  });
  selectedRawMaterial = signal<IngredientResponse | null>(null);

  // --- Allergen Substitute Modal ---
  showSubstituteModal = signal(false);
  substituteTargetIngredient = signal<RecipeIngredientResponse | null>(null);
  substituteOptions = signal<IngredientResponse[]>([]);
  selectedSubstituteId = signal<string | null>(null);
  isSubstituting = signal(false);

  // --- Fixed Costs Tab ---
  recipeFixedCosts = signal<RecipeFixedCostResponse[]>([]);
  userFixedCosts = signal<UserFixedCostResponse[]>([]);
  isAddingFixedCost = signal(false);

  fixedCostForm = this.fb.group({
    userFixedCostId: ['', Validators.required],
    timeInMinutes: [null as number | null],
    percentage: [null as number | null],
  });
  selectedFixedCostMethod = signal('');

  // --- Instructions Tab ---
  instructions = signal('');
  storageInstructions = signal('');
  shelfLifeDays = signal<number | null>(null);
  isSavingInstructions = signal(false);

  // --- Financial Panel ---
  costBreakdown = signal<RecipeCostBreakdown | null>(null);
  isCalculating = signal(false);
  simulationYield = signal<number | null>(null);

  // --- Measurement units for ingredient form ---
  measurementUnits = signal<MeasurementUnitResponse[]>([]);

  ngOnInit(): void {
    this.recipeId = this.route.snapshot.paramMap.get('id')!;
    this.pageInfoService.updateTitle('Detalle de Receta');
    this.pageInfoService.updateBreadcrumbs([
      { title: 'Inicio', path: '/dashboard', isActive: false },
      { title: '', path: '', isActive: false, isSeparator: true },
      { title: 'Recetas', path: '/cronos/recetas', isActive: false },
      { title: '', path: '', isActive: false, isSeparator: true },
    ]);

    this.loadRecipe();
    this.loadRawMaterials();
    this.loadUserFixedCosts();
    this.loadMeasurementUnits();

    // Ingredient search with debounce
    this.ingredientSearchSubject
      .pipe(debounceTime(200), distinctUntilChanged(), takeUntil(this.destroy$))
      .subscribe(term => {
        this.ingredientSearch.set(term);
        this.filterRawMaterials(term);
      });

    // Listen for recipe changes to suggest recalculation
    this.recipeChanged$
      .pipe(takeUntil(this.destroy$))
      .subscribe(() => {
        this.needsRecalculation.set(true);
      });
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  // ─── RECIPE LOADING ───

  loadRecipe(): void {
    this.isLoading.set(true);
    this.recipeService.getById(this.recipeId).pipe(takeUntil(this.destroy$)).subscribe({
      next: res => {
        this.recipe.set(res.data);
        this.ingredients.set(res.data.ingredients || []);
        this.recipeFixedCosts.set(res.data.fixedCosts || []);
        this.instructions.set(res.data.instructions || '');
        this.storageInstructions.set(res.data.storageInstructions || '');
        this.shelfLifeDays.set(res.data.shelfLifeDays);
        this.needsRecalculation.set(res.data.needsRecalculation);
        this.isLoading.set(false);
      },
      error: err => {
        this.alertService.error(err?.error?.message || 'Error al cargar la receta');
        this.isLoading.set(false);
      },
    });
  }

  private loadRawMaterials(): void {
    const params: PageRequest = { page: 0, size: 200, sort: 'name,asc' };
    this.ingredientService.getAll(params).pipe(takeUntil(this.destroy$)).subscribe({
      next: res => {
        this.rawMaterials.set(res.data.content);
        this.filteredRawMaterials.set(res.data.content);
      },
    });
  }

  private loadUserFixedCosts(): void {
    const params: PageRequest = { page: 0, size: 100 };
    this.fixedCostService.getAll(params).pipe(takeUntil(this.destroy$)).subscribe({
      next: res => {
        this.userFixedCosts.set(res.data.content.filter(c => c.isActive));
      },
    });
  }

  private loadMeasurementUnits(): void {
    const params: PageRequest = { page: 0, size: 200, sort: 'name,asc' };
    this.measurementUnitService.getAll(params).pipe(takeUntil(this.destroy$)).subscribe({
      next: res => {
        this.measurementUnits.set(res.data.content);
      },
    });
  }

  // ─── TAB NAVIGATION ───

  setTab(tab: TabId): void {
    this.activeTab.set(tab);
  }

  // ─── INGREDIENTS TAB ───

  onIngredientSearchInput(event: Event): void {
    const value = (event.target as HTMLInputElement).value;
    this.ingredientSearchSubject.next(value);
  }

  filterRawMaterials(term: string): void {
    const lower = term.toLowerCase().trim();
    if (!lower) {
      this.filteredRawMaterials.set(this.rawMaterials());
      return;
    }
    this.filteredRawMaterials.set(
      this.rawMaterials().filter(m =>
        m.name.toLowerCase().includes(lower) || m.categoryName.toLowerCase().includes(lower)
      )
    );
  }

  selectRawMaterial(material: IngredientResponse): void {
    this.selectedRawMaterial.set(material);
    this.ingredientForm.controls['rawMaterialId'].setValue(material.id);
    this.ingredientSearch.set(material.name);
    this.filteredRawMaterials.set([]);
  }

  clearRawMaterialSelection(): void {
    this.selectedRawMaterial.set(null);
    this.ingredientForm.controls['rawMaterialId'].setValue('');
    this.ingredientSearch.set('');
    this.filteredRawMaterials.set(this.rawMaterials());
  }

  addIngredient(): void {
    if (this.ingredientForm.invalid) {
      this.ingredientForm.markAllAsTouched();
      return;
    }

    this.isAddingIngredient.set(true);
    const payload = {
      rawMaterialId: this.ingredientForm.value.rawMaterialId!,
      quantity: this.ingredientForm.value.quantity!,
      unitId: this.ingredientForm.value.rawMaterialId!, // Use rawMaterialId's purchase unit
      notes: this.ingredientForm.value.notes || undefined,
    };

    this.recipeService.addIngredient(this.recipeId, payload).pipe(takeUntil(this.destroy$)).subscribe({
      next: () => {
        this.isAddingIngredient.set(false);
        this.ingredientForm.reset();
        this.clearRawMaterialSelection();
        this.alertService.success('Ingrediente agregado');
        this.loadRecipe();
        this.recipeChanged$.next(); // Notify financial panel
      },
      error: err => {
        this.isAddingIngredient.set(false);
        this.alertService.error(err?.error?.message || 'Error al agregar ingrediente');
      },
    });
  }

  removeIngredient(ingredient: RecipeIngredientResponse): void {
    Swal.fire({
      title: '¿Quitar ingrediente?',
      html: `Se quitará <strong>${ingredient.rawMaterialName}</strong> de la receta.`,
      icon: 'warning',
      showCancelButton: true,
      confirmButtonColor: '#d33',
      cancelButtonColor: '#6c757d',
      confirmButtonText: 'Sí, quitar',
      cancelButtonText: 'Cancelar',
    }).then(result => {
      if (result.isConfirmed) {
        this.recipeService.removeIngredient(this.recipeId, ingredient.id)
          .pipe(takeUntil(this.destroy$))
          .subscribe({
            next: () => {
              this.alertService.success('Ingrediente eliminado');
              this.loadRecipe();
              this.recipeChanged$.next();
            },
            error: err => {
              this.alertService.error(err?.error?.message || 'Error al quitar ingrediente');
            },
          });
      }
    });
  }

  // ─── ALLERGEN SUBSTITUTION ───

  openSubstituteModal(ingredient: RecipeIngredientResponse): void {
    this.substituteTargetIngredient.set(ingredient);
    this.selectedSubstituteId.set(null);
    // Filter raw materials that could be substitutes (exclude current)
    this.substituteOptions.set(
      this.rawMaterials().filter(m => m.id !== ingredient.rawMaterialId)
    );
    this.showSubstituteModal.set(true);
  }

  closeSubstituteModal(): void {
    this.showSubstituteModal.set(false);
    this.substituteTargetIngredient.set(null);
    this.selectedSubstituteId.set(null);
  }

  confirmSubstitution(): void {
    const target = this.substituteTargetIngredient();
    const substituteId = this.selectedSubstituteId();
    if (!target || !substituteId) return;

    this.isSubstituting.set(true);
    this.recipeService.substituteIngredient(this.recipeId, target.id, {
      substituteMaterialId: substituteId,
    }).pipe(takeUntil(this.destroy$)).subscribe({
      next: () => {
        this.isSubstituting.set(false);
        this.closeSubstituteModal();
        this.alertService.success('Ingrediente sustituido correctamente');
        this.loadRecipe();
        this.recipeChanged$.next();
      },
      error: err => {
        this.isSubstituting.set(false);
        this.alertService.error(err?.error?.message || 'Error al sustituir ingrediente');
      },
    });
  }

  // ─── FIXED COSTS TAB ───

  onFixedCostSelect(): void {
    const selectedId = this.fixedCostForm.value.userFixedCostId;
    const cost = this.userFixedCosts().find(c => c.id === selectedId);
    this.selectedFixedCostMethod.set(cost?.calculationMethod || '');
    // Reset conditional fields
    this.fixedCostForm.controls['timeInMinutes'].setValue(null);
    this.fixedCostForm.controls['percentage'].setValue(null);
  }

  addFixedCost(): void {
    if (this.fixedCostForm.controls['userFixedCostId'].invalid) {
      this.fixedCostForm.markAllAsTouched();
      return;
    }

    this.isAddingFixedCost.set(true);
    const payload = {
      userFixedCostId: this.fixedCostForm.value.userFixedCostId!,
      timeInMinutes: this.fixedCostForm.value.timeInMinutes ?? undefined,
      percentage: this.fixedCostForm.value.percentage ?? undefined,
    };

    this.recipeService.addFixedCost(this.recipeId, payload).pipe(takeUntil(this.destroy$)).subscribe({
      next: () => {
        this.isAddingFixedCost.set(false);
        this.fixedCostForm.reset();
        this.selectedFixedCostMethod.set('');
        this.alertService.success('Costo fijo agregado');
        this.loadRecipe();
        this.recipeChanged$.next();
      },
      error: err => {
        this.isAddingFixedCost.set(false);
        this.alertService.error(err?.error?.message || 'Error al agregar costo fijo');
      },
    });
  }

  removeFixedCost(cost: RecipeFixedCostResponse): void {
    Swal.fire({
      title: '¿Quitar costo fijo?',
      html: `Se quitará <strong>${cost.userFixedCostName}</strong> de la receta.`,
      icon: 'warning',
      showCancelButton: true,
      confirmButtonColor: '#d33',
      cancelButtonColor: '#6c757d',
      confirmButtonText: 'Sí, quitar',
      cancelButtonText: 'Cancelar',
    }).then(result => {
      if (result.isConfirmed) {
        this.recipeService.removeFixedCost(this.recipeId, cost.id)
          .pipe(takeUntil(this.destroy$))
          .subscribe({
            next: () => {
              this.alertService.success('Costo fijo eliminado');
              this.loadRecipe();
              this.recipeChanged$.next();
            },
            error: err => {
              this.alertService.error(err?.error?.message || 'Error al quitar costo fijo');
            },
          });
      }
    });
  }

  // ─── INSTRUCTIONS TAB ───

  saveInstructions(): void {
    this.isSavingInstructions.set(true);
    const recipe = this.recipe();
    if (!recipe) return;

    const payload: CreateRecipeRequest = {
      name: recipe.name,
      yieldQuantity: recipe.yieldQuantity,
      yieldUnit: recipe.yieldUnit,
      instructions: this.instructions(),
      storageInstructions: this.storageInstructions(),
      shelfLifeDays: this.shelfLifeDays() ?? undefined,
    };

    this.recipeService.update(this.recipeId, payload).pipe(takeUntil(this.destroy$)).subscribe({
      next: () => {
        this.isSavingInstructions.set(false);
        this.alertService.success('Instrucciones guardadas');
      },
      error: err => {
        this.isSavingInstructions.set(false);
        this.alertService.error(err?.error?.message || 'Error al guardar instrucciones');
      },
    });
  }

  // ─── FINANCIAL PANEL ───

  calculateCosts(targetYield?: number): void {
    this.isCalculating.set(true);
    this.recipeService.getCostBreakdown(this.recipeId, targetYield)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: res => {
          this.costBreakdown.set(res.data);
          this.isCalculating.set(false);
          this.needsRecalculation.set(false);
        },
        error: err => {
          this.isCalculating.set(false);
          this.alertService.error(err?.error?.message || 'Error al calcular costos');
        },
      });
  }

  onSimulateYield(event: Event): void {
    const value = +(event.target as HTMLInputElement).value;
    if (value > 0) {
      this.simulationYield.set(value);
      this.calculateCosts(value);
    }
  }

  onSimulateYieldKeydown(event: KeyboardEvent): void {
    if (event.key === 'Enter') {
      event.preventDefault();
      const value = this.simulationYield();
      if (value && value > 0) {
        this.calculateCosts(value);
      }
    }
  }

  resetSimulation(): void {
    this.simulationYield.set(null);
    this.calculateCosts();
  }

  // ─── NAVIGATION ───

  goBack(): void {
    this.router.navigate(['/cronos/recetas']);
  }

  editRecipe(): void {
    this.router.navigate(['/cronos/recetas/editar', this.recipeId]);
  }

  // ─── HELPERS ───

  formatCurrency(value: number): string {
    return '$' + value.toFixed(2);
  }

  getFixedCostMethodLabel(method: string): string {
    const map: Record<string, string> = {
      HOURLY_RATE: 'Tarifa por Hora',
      PER_UNIT: 'Costo por Unidad',
      FIXED_PER_BATCH: 'Fijo por Lote',
    };
    return map[method] || method;
  }
}
