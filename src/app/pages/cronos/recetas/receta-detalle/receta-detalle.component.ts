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
import {
  MeasurementUnitResponse,
  RecipeDetailResponse,
  RecipeIngredientResponse,
  RecipeFixedCostResponse,
  RecipeCostBreakdown,
  IngredientResponse,
  UserFixedCostResponse,
  CreateRecipeRequest,
  RecipeFileResponse,
  RecipeShareResponse,
  RecipeShareAccessLogResponse,
} from 'src/app/core/models/domain.model';
import { PageRequest } from 'src/app/core/models/pagination.model';
import { AlertService } from 'src/app/shared/services/alert.service';
import { AlertContainerComponent } from 'src/app/shared/components/alert-container/alert-container.component';
import { PageInfoService } from 'src/app/_metronic/layout/core/page-info.service';
import Swal from 'sweetalert2';

type TabId = 'ingredients' | 'fixed-costs' | 'instructions' | 'files' | 'shares';

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

  // --- Sync Costs ---
  isSyncing = signal(false);

  // --- Status Management ---
  isPublishing = signal(false);

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

  // --- Files Tab ---
  files = signal<RecipeFileResponse[]>([]);
  isLoadingFiles = signal(false);
  isUploadingFile = signal(false);
  isDragging = signal(false);

  // File Detail Modal
  showFileDetailModal = signal(false);
  selectedFile = signal<RecipeFileResponse | null>(null);
  isUpdatingFile = signal(false);
  replacementFile = signal<File | null>(null);
  fileDetailForm = this.fb.group({
    fileName: [''],
    description: [''],
  });

  // --- Shares Tab ---
  shares = signal<RecipeShareResponse[]>([]);
  isLoadingShares = signal(false);
  isCreatingShare = signal(false);

  shareForm = this.fb.group({
    expirationDays: [7, [Validators.required, Validators.min(1), Validators.max(30)]],
    recipientEmail: ['', [Validators.email]],
  });

  // Share Analytics Modal
  showAnalyticsModal = signal(false);
  analyticsTarget = signal<RecipeShareResponse | null>(null);
  analyticsLogs = signal<RecipeShareAccessLogResponse[]>([]);
  isLoadingAnalytics = signal(false);

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

  // ─── SYNC COSTS (COST ROLLUP) ───

  syncCosts(): void {
    this.isSyncing.set(true);
    this.recipeService.syncCosts(this.recipeId).pipe(takeUntil(this.destroy$)).subscribe({
      next: () => {
        this.isSyncing.set(false);
        this.alertService.success('Precios sincronizados correctamente');
        this.loadRecipe();
        this.costBreakdown.set(null); // Clear stale breakdown
      },
      error: err => {
        this.isSyncing.set(false);
        this.alertService.error(err?.error?.message || 'Error al sincronizar precios');
      },
    });
  }

  // ─── STATUS MANAGEMENT ───

  publishRecipe(): void {
    const recipe = this.recipe();
    if (!recipe) return;

    Swal.fire({
      title: '¿Publicar receta?',
      html: `La receta <strong>${recipe.name}</strong> pasará a estado <strong>Activa</strong> y estará disponible para producción.`,
      icon: 'question',
      showCancelButton: true,
      confirmButtonColor: '#50cd89',
      cancelButtonColor: '#6c757d',
      confirmButtonText: 'Sí, publicar',
      cancelButtonText: 'Cancelar',
    }).then(result => {
      if (result.isConfirmed) {
        this.isPublishing.set(true);
        const payload: CreateRecipeRequest = {
          name: recipe.name,
          description: recipe.description ?? undefined,
          yieldQuantity: recipe.yieldQuantity,
          yieldUnit: recipe.yieldUnit,
          preparationTimeMinutes: recipe.preparationTimeMinutes ?? undefined,
          bakingTimeMinutes: recipe.bakingTimeMinutes ?? undefined,
          coolingTimeMinutes: recipe.coolingTimeMinutes ?? undefined,
          instructions: recipe.instructions ?? undefined,
          storageInstructions: recipe.storageInstructions ?? undefined,
          shelfLifeDays: recipe.shelfLifeDays ?? undefined,
          status: 'ACTIVE',
        } as any; // status added to the existing update payload

        this.recipeService.update(this.recipeId, payload).pipe(takeUntil(this.destroy$)).subscribe({
          next: () => {
            this.isPublishing.set(false);
            this.alertService.success('Receta publicada correctamente');
            this.loadRecipe();
          },
          error: err => {
            this.isPublishing.set(false);
            this.alertService.error(err?.error?.message || 'Error al publicar la receta');
          },
        });
      }
    });
  }

  getStatusBadgeClass(status: string): string {
    switch (status) {
      case 'ACTIVE': return 'badge badge-light-success';
      case 'ARCHIVED': return 'badge badge-light-dark';
      default: return 'badge badge-light-warning';
    }
  }

  getStatusLabel(status: string): string {
    switch (status) {
      case 'ACTIVE': return 'Activa';
      case 'ARCHIVED': return 'Archivada';
      default: return 'Borrador';
    }
  }

  // ─── TAB NAVIGATION ───

  setTab(tab: TabId): void {
    this.activeTab.set(tab);
    if (tab === 'files' && this.files().length === 0) {
      this.loadFiles();
    }
    if (tab === 'shares' && this.shares().length === 0) {
      this.loadShares();
    }
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
      unitId: this.ingredientForm.value.unitId!,
      notes: this.ingredientForm.value.notes || undefined,
    };

    this.recipeService.addIngredient(this.recipeId, payload).pipe(takeUntil(this.destroy$)).subscribe({
      next: () => {
        this.isAddingIngredient.set(false);
        this.ingredientForm.reset();
        this.clearRawMaterialSelection();
        this.alertService.success('Ingrediente agregado');
        this.loadRecipe();
        this.recipeChanged$.next();
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

  // ─── FILES TAB ───

  loadFiles(): void {
    this.isLoadingFiles.set(true);
    this.recipeService.getFiles(this.recipeId).pipe(takeUntil(this.destroy$)).subscribe({
      next: res => {
        this.files.set(res.data);
        this.isLoadingFiles.set(false);
      },
      error: err => {
        this.isLoadingFiles.set(false);
        this.alertService.error(err?.error?.message || 'Error al cargar archivos');
      },
    });
  }

  onFileSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    if (input.files && input.files.length > 0) {
      this.uploadFile(input.files[0]);
      input.value = '';
    }
  }

  onDragOver(event: DragEvent): void {
    event.preventDefault();
    event.stopPropagation();
    this.isDragging.set(true);
  }

  onDragLeave(event: DragEvent): void {
    event.preventDefault();
    event.stopPropagation();
    this.isDragging.set(false);
  }

  onDrop(event: DragEvent): void {
    event.preventDefault();
    event.stopPropagation();
    this.isDragging.set(false);
    if (event.dataTransfer?.files && event.dataTransfer.files.length > 0) {
      this.uploadFile(event.dataTransfer.files[0]);
    }
  }

  private uploadFile(file: File): void {
    this.isUploadingFile.set(true);
    this.recipeService.uploadFile(this.recipeId, file).pipe(takeUntil(this.destroy$)).subscribe({
      next: () => {
        this.isUploadingFile.set(false);
        this.alertService.success('Archivo subido correctamente');
        this.loadFiles();
      },
      error: err => {
        this.isUploadingFile.set(false);
        this.alertService.error(err?.error?.message || 'Error al subir archivo');
      },
    });
  }

  deleteFile(file: RecipeFileResponse): void {
    Swal.fire({
      title: '¿Eliminar archivo?',
      html: `Se eliminará <strong>${file.fileName}</strong>.`,
      icon: 'warning',
      showCancelButton: true,
      confirmButtonColor: '#d33',
      cancelButtonColor: '#6c757d',
      confirmButtonText: 'Sí, eliminar',
      cancelButtonText: 'Cancelar',
    }).then(result => {
      if (result.isConfirmed) {
        this.recipeService.deleteFile(this.recipeId, file.id)
          .pipe(takeUntil(this.destroy$))
          .subscribe({
            next: () => {
              this.alertService.success('Archivo eliminado');
              this.loadFiles();
            },
            error: err => {
              this.alertService.error(err?.error?.message || 'Error al eliminar archivo');
            },
          });
      }
    });
  }

  isImageFile(fileType: string): boolean {
    return fileType.startsWith('image/');
  }

  formatFileSize(bytes: number): string {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1048576) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / 1048576).toFixed(1) + ' MB';
  }

  isPdfFile(fileType: string): boolean {
    return fileType === 'application/pdf';
  }

  getFileIcon(fileType: string): { icon: string; bgClass: string; textClass: string } {
    if (fileType.startsWith('image/')) return { icon: 'ki-picture', bgClass: 'bg-light-primary', textClass: 'text-primary' };
    if (fileType === 'application/pdf') return { icon: 'ki-document', bgClass: 'bg-light-danger', textClass: 'text-danger' };
    if (fileType.includes('word') || fileType.includes('document')) return { icon: 'ki-notepad', bgClass: 'bg-light-info', textClass: 'text-info' };
    return { icon: 'ki-file', bgClass: 'bg-light-warning', textClass: 'text-warning' };
  }

  openFileDetail(file: RecipeFileResponse): void {
    this.selectedFile.set(file);
    this.replacementFile.set(null);
    this.fileDetailForm.patchValue({
      fileName: file.fileName,
      description: file.description ?? '',
    });
    this.showFileDetailModal.set(true);
  }

  closeFileDetail(): void {
    this.showFileDetailModal.set(false);
    this.selectedFile.set(null);
    this.replacementFile.set(null);
  }

  onReplacementFileSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    if (input.files && input.files.length > 0) {
      this.replacementFile.set(input.files[0]);
    }
  }

  updateFileDetail(): void {
    const file = this.selectedFile();
    if (!file) return;

    this.isUpdatingFile.set(true);
    const formData = new FormData();
    formData.append('id', file.id);
    formData.append('fileName', this.fileDetailForm.value.fileName || file.fileName);
    if (this.fileDetailForm.value.description) {
      formData.append('description', this.fileDetailForm.value.description);
    }
    const replacement = this.replacementFile();
    if (replacement) {
      formData.append('file', replacement);
    }

    this.recipeService.updateFile(this.recipeId, file.id, formData)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (res) => {
          this.isUpdatingFile.set(false);
          this.alertService.success('Archivo actualizado correctamente');
          this.selectedFile.set(res.data);
          this.loadFiles();
        },
        error: err => {
          this.isUpdatingFile.set(false);
          this.alertService.error(err?.error?.message || 'Error al actualizar archivo');
        },
      });
  }

  // ─── SHARES TAB ───

  loadShares(): void {
    this.isLoadingShares.set(true);
    this.recipeService.getShares(this.recipeId).pipe(takeUntil(this.destroy$)).subscribe({
      next: res => {
        this.shares.set(res.data);
        this.isLoadingShares.set(false);
      },
      error: err => {
        this.isLoadingShares.set(false);
        this.alertService.error(err?.error?.message || 'Error al cargar enlaces');
      },
    });
  }

  createShare(): void {
    if (this.shareForm.invalid) {
      this.shareForm.markAllAsTouched();
      return;
    }

    this.isCreatingShare.set(true);
    const payload = {
      expirationDays: this.shareForm.value.expirationDays!,
      recipientEmail: this.shareForm.value.recipientEmail || undefined,
    };

    this.recipeService.createShare(this.recipeId, payload).pipe(takeUntil(this.destroy$)).subscribe({
      next: () => {
        this.isCreatingShare.set(false);
        this.shareForm.reset({ expirationDays: 7, recipientEmail: '' });
        this.alertService.success('Enlace generado correctamente');
        this.loadShares();
      },
      error: err => {
        this.isCreatingShare.set(false);
        this.alertService.error(err?.error?.message || 'Error al generar enlace');
      },
    });
  }

  copyShareUrl(url: string): void {
    navigator.clipboard.writeText(url).then(() => {
      this.alertService.success('Enlace copiado al portapapeles');
    });
  }

  revokeShare(share: RecipeShareResponse): void {
    Swal.fire({
      title: '¿Revocar enlace?',
      text: 'El enlace dejará de funcionar inmediatamente.',
      icon: 'warning',
      showCancelButton: true,
      confirmButtonColor: '#d33',
      cancelButtonColor: '#6c757d',
      confirmButtonText: 'Sí, revocar',
      cancelButtonText: 'Cancelar',
    }).then(result => {
      if (result.isConfirmed) {
        this.recipeService.revokeShare(this.recipeId, share.id)
          .pipe(takeUntil(this.destroy$))
          .subscribe({
            next: () => {
              this.alertService.success('Enlace revocado');
              this.loadShares();
            },
            error: err => {
              this.alertService.error(err?.error?.message || 'Error al revocar enlace');
            },
          });
      }
    });
  }

  openAnalyticsModal(share: RecipeShareResponse): void {
    this.analyticsTarget.set(share);
    this.analyticsLogs.set([]);
    this.showAnalyticsModal.set(true);
    this.isLoadingAnalytics.set(true);

    this.recipeService.getShareAnalytics(this.recipeId, share.id)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: res => {
          this.analyticsLogs.set(res.data);
          this.isLoadingAnalytics.set(false);
        },
        error: err => {
          this.isLoadingAnalytics.set(false);
          this.alertService.error(err?.error?.message || 'Error al cargar analíticas');
        },
      });
  }

  closeAnalyticsModal(): void {
    this.showAnalyticsModal.set(false);
    this.analyticsTarget.set(null);
  }

  isShareExpired(share: RecipeShareResponse): boolean {
    return new Date(share.expiresAt) < new Date();
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

  formatDate(date: string): string {
    return new Date(date).toLocaleDateString('es-MX', {
      year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
    });
  }

  formatDateShort(date: string): string {
    return new Date(date).toLocaleDateString('es-MX', {
      year: 'numeric', month: 'short', day: 'numeric',
    });
  }

  getFixedCostMethodLabel(method: string): string {
    const map: Record<string, string> = {
      HOURLY_RATE: 'Tarifa por Hora',
      PER_UNIT: 'Costo por Unidad',
      FIXED_PER_BATCH: 'Fijo por Lote',
    };
    return map[method] || method;
  }

  parseBrowser(userAgent: string): string {
    if (userAgent.includes('Chrome')) return 'Chrome';
    if (userAgent.includes('Firefox')) return 'Firefox';
    if (userAgent.includes('Safari')) return 'Safari';
    if (userAgent.includes('Edge')) return 'Edge';
    return 'Otro';
  }
}
