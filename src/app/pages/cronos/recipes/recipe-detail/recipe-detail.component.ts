import { ChangeDetectionStrategy, Component, OnDestroy, OnInit, inject, signal } from '@angular/core';
import { FormsModule, ReactiveFormsModule, FormBuilder, Validators } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { BehaviorSubject, Subject } from 'rxjs';
import { debounceTime, distinctUntilChanged, takeUntil } from 'rxjs/operators';

import { ButtonModule } from 'primeng/button';
import { CardModule } from 'primeng/card';
import { ChipModule } from 'primeng/chip';
import { DialogModule } from 'primeng/dialog';
import { InputNumberModule } from 'primeng/inputnumber';
import { InputTextModule } from 'primeng/inputtext';
import { MessageModule } from 'primeng/message';
import { SelectModule } from 'primeng/select';
import { TableModule } from 'primeng/table';
import { TabsModule } from 'primeng/tabs';
import { TagModule } from 'primeng/tag';
import { TextareaModule } from 'primeng/textarea';
import { TooltipModule } from 'primeng/tooltip';

import { RecipeService } from 'src/app/core/services/domain/recipe.service';
import { IngredientService } from 'src/app/core/services/domain/ingredient.service';
import { UserFixedCostService } from 'src/app/core/services/domain/user-fixed-cost.service';
import { MeasurementUnitService } from 'src/app/core/services/domain/measurement-unit.service';
import {
  CreateRecipeRequest,
  IngredientResponse,
  MeasurementUnitResponse,
  RecipeCostBreakdown,
  RecipeDetailResponse,
  RecipeFileResponse,
  RecipeFixedCostResponse,
  RecipeIngredientResponse,
  RecipeShareAccessLogResponse,
  RecipeShareResponse,
  UserFixedCostResponse,
} from 'src/app/core/models/domain.model';
import { PageRequest } from 'src/app/core/models/pagination.model';
import { PageInfoService } from 'src/app/core/services/page-info.service';
import { AlertService } from 'src/app/shared/services/alert.service';
import { ConfirmService } from 'src/app/shared/services/confirm.service';
import { DetailSkeletonComponent } from 'src/app/shared/components/detail-skeleton/detail-skeleton.component';

type TabId = 'ingredients' | 'fixed-costs' | 'instructions' | 'files' | 'shares';

@Component({
  selector: 'app-recipe-detail',
  standalone: true,
  imports: [
    FormsModule,
    ReactiveFormsModule,
    ButtonModule,
    CardModule,
    ChipModule,
    DialogModule,
    InputNumberModule,
    InputTextModule,
    MessageModule,
    SelectModule,
    TableModule,
    TabsModule,
    TagModule,
    TextareaModule,
    TooltipModule,
    DetailSkeletonComponent,
  ],
  templateUrl: './recipe-detail.component.html',
  styleUrl: './recipe-detail.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class RecipeDetailComponent implements OnInit, OnDestroy {
  private readonly recipeService = inject(RecipeService);
  private readonly ingredientService = inject(IngredientService);
  private readonly fixedCostService = inject(UserFixedCostService);
  private readonly measurementUnitService = inject(MeasurementUnitService);
  private readonly alertService = inject(AlertService);
  private readonly confirmService = inject(ConfirmService);
  private readonly pageInfoService = inject(PageInfoService);
  private readonly fb = inject(FormBuilder);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly destroy$ = new Subject<void>();

  // --- Core state ---
  recipeId = '';
  readonly recipe = signal<RecipeDetailResponse | null>(null);
  readonly isLoading = signal(true);
  readonly activeTab = signal<TabId>('ingredients');

  // --- Change notification ---
  private readonly recipeChanged$ = new BehaviorSubject<void>(undefined);
  readonly needsRecalculation = signal(false);

  readonly isSyncing = signal(false);
  readonly isPublishing = signal(false);

  // --- Ingredients tab ---
  readonly ingredients = signal<RecipeIngredientResponse[]>([]);
  readonly rawMaterials = signal<IngredientResponse[]>([]);
  readonly isAddingIngredient = signal(false);

  readonly ingredientForm = this.fb.group({
    rawMaterialId: ['', Validators.required],
    quantity: [null as number | null, [Validators.required, Validators.min(0.001)]],
    unitId: ['', Validators.required],
    notes: [''],
  });

  // --- Allergen substitute dialog ---
  readonly showSubstituteModal = signal(false);
  readonly substituteTargetIngredient = signal<RecipeIngredientResponse | null>(null);
  readonly substituteOptions = signal<IngredientResponse[]>([]);
  readonly selectedSubstituteId = signal<string | null>(null);
  readonly isSubstituting = signal(false);

  // --- Fixed costs tab ---
  readonly recipeFixedCosts = signal<RecipeFixedCostResponse[]>([]);
  readonly userFixedCosts = signal<UserFixedCostResponse[]>([]);
  readonly isAddingFixedCost = signal(false);

  readonly fixedCostForm = this.fb.group({
    userFixedCostId: ['', Validators.required],
    timeInMinutes: [null as number | null],
    percentage: [null as number | null],
  });
  readonly selectedFixedCostMethod = signal('');

  // --- Instructions tab ---
  readonly instructions = signal('');
  readonly storageInstructions = signal('');
  readonly shelfLifeDays = signal<number | null>(null);
  readonly isSavingInstructions = signal(false);

  // --- Files tab ---
  readonly files = signal<RecipeFileResponse[]>([]);
  readonly isLoadingFiles = signal(false);
  readonly isUploadingFile = signal(false);
  readonly isDragging = signal(false);

  readonly showFileDetailModal = signal(false);
  readonly selectedFile = signal<RecipeFileResponse | null>(null);
  readonly isUpdatingFile = signal(false);
  readonly replacementFile = signal<File | null>(null);
  readonly fileDetailForm = this.fb.group({
    fileName: [''],
    description: [''],
  });

  // --- Shares tab ---
  readonly shares = signal<RecipeShareResponse[]>([]);
  readonly isLoadingShares = signal(false);
  readonly isCreatingShare = signal(false);

  readonly shareForm = this.fb.group({
    expirationDays: [7, [Validators.required, Validators.min(1), Validators.max(30)]],
    recipientEmail: ['', [Validators.email]],
  });

  readonly showAnalyticsModal = signal(false);
  readonly analyticsTarget = signal<RecipeShareResponse | null>(null);
  readonly analyticsLogs = signal<RecipeShareAccessLogResponse[]>([]);
  readonly isLoadingAnalytics = signal(false);

  // --- Financial panel ---
  readonly costBreakdown = signal<RecipeCostBreakdown | null>(null);
  readonly isCalculating = signal(false);
  readonly simulationYield = signal<number | null>(null);

  readonly measurementUnits = signal<MeasurementUnitResponse[]>([]);

  ngOnInit(): void {
    this.recipeId = this.route.snapshot.paramMap.get('id')!;
    this.pageInfoService.updateTitle('Detalle de Receta');
    this.pageInfoService.updateBreadcrumbs([
      { title: 'Inicio', path: '/dashboard', isActive: false },
      { title: 'Recetas', path: '/cronos/recetas', isActive: false },
      { title: 'Detalle', path: '', isActive: true },
    ]);

    this.loadRecipe();
    this.loadRawMaterials();
    this.loadUserFixedCosts();
    this.loadMeasurementUnits();

    this.recipeChanged$.pipe(takeUntil(this.destroy$)).subscribe(() => {
      this.needsRecalculation.set(true);
    });
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  // ─── Recipe loading ───

  loadRecipe(): void {
    this.isLoading.set(true);
    this.recipeService.getById(this.recipeId).pipe(takeUntil(this.destroy$)).subscribe({
      next: (res) => {
        this.recipe.set(res.data);
        this.ingredients.set(res.data.ingredients || []);
        this.recipeFixedCosts.set(res.data.fixedCosts || []);
        this.instructions.set(res.data.instructions || '');
        this.storageInstructions.set(res.data.storageInstructions || '');
        this.shelfLifeDays.set(res.data.shelfLifeDays);
        this.needsRecalculation.set(res.data.needsRecalculation);
        this.isLoading.set(false);
      },
      error: (err) => {
        this.alertService.error(err?.error?.message || 'Error al cargar la receta');
        this.isLoading.set(false);
      },
    });
  }

  private loadRawMaterials(): void {
    const params: PageRequest = { page: 0, size: 200, sort: 'name,asc' };
    this.ingredientService.getAll(params).pipe(takeUntil(this.destroy$)).subscribe({
      next: (res) => this.rawMaterials.set(res.data.content),
    });
  }

  private loadUserFixedCosts(): void {
    const params: PageRequest = { page: 0, size: 100 };
    this.fixedCostService.getAll(params).pipe(takeUntil(this.destroy$)).subscribe({
      next: (res) => this.userFixedCosts.set(res.data.content.filter((c) => c.isActive)),
    });
  }

  private loadMeasurementUnits(): void {
    const params: PageRequest = { page: 0, size: 200, sort: 'name,asc' };
    this.measurementUnitService.getAll(params).pipe(takeUntil(this.destroy$)).subscribe({
      next: (res) => this.measurementUnits.set(res.data.content),
    });
  }

  // ─── Cost sync ───

  syncCosts(): void {
    this.isSyncing.set(true);
    this.recipeService.syncCosts(this.recipeId).pipe(takeUntil(this.destroy$)).subscribe({
      next: () => {
        this.isSyncing.set(false);
        this.alertService.success('Precios sincronizados correctamente');
        this.loadRecipe();
        this.costBreakdown.set(null);
      },
      error: (err) => {
        this.isSyncing.set(false);
        this.alertService.error(err?.error?.message || 'Error al sincronizar precios');
      },
    });
  }

  // ─── Status management ───

  async publishRecipe(): Promise<void> {
    const recipe = this.recipe();
    if (!recipe) {
      return;
    }

    const confirmed = await this.confirmService.confirm({
      title: '¿Publicar receta?',
      message: `La receta "${recipe.name}" pasará a estado Activa y estará disponible para producción.`,
      acceptLabel: 'Sí, publicar',
      icon: 'pi pi-cloud-upload',
    });
    if (!confirmed) {
      return;
    }

    this.isPublishing.set(true);
    const payload = {
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
    } as CreateRecipeRequest;

    this.recipeService.update(this.recipeId, payload).pipe(takeUntil(this.destroy$)).subscribe({
      next: () => {
        this.isPublishing.set(false);
        this.alertService.success('Receta publicada correctamente');
        this.loadRecipe();
      },
      error: (err) => {
        this.isPublishing.set(false);
        this.alertService.error(err?.error?.message || 'Error al publicar la receta');
      },
    });
  }

  getStatusSeverity(status: string): 'success' | 'warn' | 'secondary' {
    switch (status) {
      case 'ACTIVE':
        return 'success';
      case 'ARCHIVED':
        return 'secondary';
      default:
        return 'warn';
    }
  }

  getStatusLabel(status: string): string {
    switch (status) {
      case 'ACTIVE':
        return 'Activa';
      case 'ARCHIVED':
        return 'Archivada';
      default:
        return 'Borrador';
    }
  }

  // ─── Tab navigation ───

  setTab(tab: TabId): void {
    this.activeTab.set(tab);
    if (tab === 'files' && this.files().length === 0) {
      this.loadFiles();
    }
    if (tab === 'shares' && this.shares().length === 0) {
      this.loadShares();
    }
  }

  // ─── Ingredients tab ───

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
        this.alertService.success('Ingrediente agregado');
        this.loadRecipe();
        this.recipeChanged$.next();
      },
      error: (err) => {
        this.isAddingIngredient.set(false);
        this.alertService.error(err?.error?.message || 'Error al agregar ingrediente');
      },
    });
  }

  async removeIngredient(ingredient: RecipeIngredientResponse): Promise<void> {
    const confirmed = await this.confirmService.confirm({
      title: '¿Quitar ingrediente?',
      message: `Se quitará "${ingredient.rawMaterialName}" de la receta.`,
      acceptLabel: 'Sí, quitar',
      severity: 'danger',
      icon: 'pi pi-trash',
    });
    if (!confirmed) {
      return;
    }

    this.recipeService.removeIngredient(this.recipeId, ingredient.id)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: () => {
          this.alertService.success('Ingrediente eliminado');
          this.loadRecipe();
          this.recipeChanged$.next();
        },
        error: (err) => {
          this.alertService.error(err?.error?.message || 'Error al quitar ingrediente');
        },
      });
  }

  // ─── Allergen substitution ───

  openSubstituteModal(ingredient: RecipeIngredientResponse): void {
    this.substituteTargetIngredient.set(ingredient);
    this.selectedSubstituteId.set(null);
    this.substituteOptions.set(this.rawMaterials().filter((m) => m.id !== ingredient.rawMaterialId));
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
    if (!target || !substituteId) {
      return;
    }

    this.isSubstituting.set(true);
    this.recipeService.substituteIngredient(this.recipeId, target.id, { substituteMaterialId: substituteId })
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: () => {
          this.isSubstituting.set(false);
          this.closeSubstituteModal();
          this.alertService.success('Ingrediente sustituido correctamente');
          this.loadRecipe();
          this.recipeChanged$.next();
        },
        error: (err) => {
          this.isSubstituting.set(false);
          this.alertService.error(err?.error?.message || 'Error al sustituir ingrediente');
        },
      });
  }

  // ─── Fixed costs tab ───

  onFixedCostSelect(): void {
    const selectedId = this.fixedCostForm.value.userFixedCostId;
    const cost = this.userFixedCosts().find((c) => c.id === selectedId);
    this.selectedFixedCostMethod.set(cost?.calculationMethod || '');
    this.fixedCostForm.controls.timeInMinutes.setValue(null);
    this.fixedCostForm.controls.percentage.setValue(null);
  }

  addFixedCost(): void {
    if (this.fixedCostForm.controls.userFixedCostId.invalid) {
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
      error: (err) => {
        this.isAddingFixedCost.set(false);
        this.alertService.error(err?.error?.message || 'Error al agregar costo fijo');
      },
    });
  }

  async removeFixedCost(cost: RecipeFixedCostResponse): Promise<void> {
    const confirmed = await this.confirmService.confirm({
      title: '¿Quitar costo fijo?',
      message: `Se quitará "${cost.userFixedCostName}" de la receta.`,
      acceptLabel: 'Sí, quitar',
      severity: 'danger',
      icon: 'pi pi-trash',
    });
    if (!confirmed) {
      return;
    }

    this.recipeService.removeFixedCost(this.recipeId, cost.id)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: () => {
          this.alertService.success('Costo fijo eliminado');
          this.loadRecipe();
          this.recipeChanged$.next();
        },
        error: (err) => {
          this.alertService.error(err?.error?.message || 'Error al quitar costo fijo');
        },
      });
  }

  // ─── Instructions tab ───

  saveInstructions(): void {
    const recipe = this.recipe();
    if (!recipe) {
      return;
    }
    this.isSavingInstructions.set(true);

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
      error: (err) => {
        this.isSavingInstructions.set(false);
        this.alertService.error(err?.error?.message || 'Error al guardar instrucciones');
      },
    });
  }

  // ─── Files tab ───

  loadFiles(): void {
    this.isLoadingFiles.set(true);
    this.recipeService.getFiles(this.recipeId).pipe(takeUntil(this.destroy$)).subscribe({
      next: (res) => {
        this.files.set(res.data);
        this.isLoadingFiles.set(false);
      },
      error: (err) => {
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
      error: (err) => {
        this.isUploadingFile.set(false);
        this.alertService.error(err?.error?.message || 'Error al subir archivo');
      },
    });
  }

  async deleteFile(file: RecipeFileResponse): Promise<void> {
    const confirmed = await this.confirmService.confirmDelete(file.fileName);
    if (!confirmed) {
      return;
    }
    this.recipeService.deleteFile(this.recipeId, file.id)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: () => {
          this.alertService.success('Archivo eliminado');
          this.loadFiles();
        },
        error: (err) => {
          this.alertService.error(err?.error?.message || 'Error al eliminar archivo');
        },
      });
  }

  isImageFile(fileType: string): boolean {
    return fileType.startsWith('image/');
  }

  isPdfFile(fileType: string): boolean {
    return fileType === 'application/pdf';
  }

  formatFileSize(bytes: number): string {
    if (bytes < 1024) {
      return bytes + ' B';
    }
    if (bytes < 1048576) {
      return (bytes / 1024).toFixed(1) + ' KB';
    }
    return (bytes / 1048576).toFixed(1) + ' MB';
  }

  getFileIcon(fileType: string): string {
    if (fileType.startsWith('image/')) {
      return 'pi pi-image';
    }
    if (fileType === 'application/pdf') {
      return 'pi pi-file-pdf';
    }
    if (fileType.includes('word') || fileType.includes('document')) {
      return 'pi pi-file-word';
    }
    return 'pi pi-file';
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
    if (!file) {
      return;
    }

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
        error: (err) => {
          this.isUpdatingFile.set(false);
          this.alertService.error(err?.error?.message || 'Error al actualizar archivo');
        },
      });
  }

  // ─── Shares tab ───

  loadShares(): void {
    this.isLoadingShares.set(true);
    this.recipeService.getShares(this.recipeId).pipe(takeUntil(this.destroy$)).subscribe({
      next: (res) => {
        this.shares.set(res.data);
        this.isLoadingShares.set(false);
      },
      error: (err) => {
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
      error: (err) => {
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

  async revokeShare(share: RecipeShareResponse): Promise<void> {
    const confirmed = await this.confirmService.confirm({
      title: '¿Revocar enlace?',
      message: 'El enlace dejará de funcionar inmediatamente.',
      acceptLabel: 'Sí, revocar',
      severity: 'danger',
      icon: 'pi pi-ban',
    });
    if (!confirmed) {
      return;
    }

    this.recipeService.revokeShare(this.recipeId, share.id)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: () => {
          this.alertService.success('Enlace revocado');
          this.loadShares();
        },
        error: (err) => {
          this.alertService.error(err?.error?.message || 'Error al revocar enlace');
        },
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
        next: (res) => {
          this.analyticsLogs.set(res.data);
          this.isLoadingAnalytics.set(false);
        },
        error: (err) => {
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

  // ─── Financial panel ───

  calculateCosts(targetYield?: number): void {
    this.isCalculating.set(true);
    this.recipeService.getCostBreakdown(this.recipeId, targetYield)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (res) => {
          this.costBreakdown.set(res.data);
          this.isCalculating.set(false);
          this.needsRecalculation.set(false);
        },
        error: (err) => {
          this.isCalculating.set(false);
          this.alertService.error(err?.error?.message || 'Error al calcular costos');
        },
      });
  }

  simulateYield(): void {
    const value = this.simulationYield();
    if (value && value > 0) {
      this.calculateCosts(value);
    }
  }

  resetSimulation(): void {
    this.simulationYield.set(null);
    this.calculateCosts();
  }

  // ─── Navigation ───

  goBack(): void {
    this.router.navigate(['/cronos/recetas']);
  }

  editRecipe(): void {
    this.router.navigate(['/cronos/recetas/editar', this.recipeId]);
  }

  // ─── Helpers ───

  formatCurrency(value: number): string {
    return '$' + value.toFixed(2);
  }

  formatCostLabel(cost: UserFixedCostResponse): string {
    if (cost.calculationMethod === 'PERCENTAGE' && cost.percentage != null) {
      return `${cost.name} (${cost.percentage.toFixed(2)}%)`;
    }
    return `${cost.name} ($${cost.defaultAmount.toFixed(2)})`;
  }

  formatDate(date: string): string {
    return new Date(date).toLocaleDateString('es-MX', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  }

  formatDateShort(date: string): string {
    return new Date(date).toLocaleDateString('es-MX', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
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
    if (userAgent.includes('Chrome')) {
      return 'Chrome';
    }
    if (userAgent.includes('Firefox')) {
      return 'Firefox';
    }
    if (userAgent.includes('Safari')) {
      return 'Safari';
    }
    if (userAgent.includes('Edge')) {
      return 'Edge';
    }
    return 'Otro';
  }
}
