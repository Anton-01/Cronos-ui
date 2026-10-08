import { DatePipe, DecimalPipe, Location } from '@angular/common';
import { ChangeDetectionStrategy, Component, DestroyRef, ElementRef, computed, effect, inject, signal, untracked, viewChild } from '@angular/core';
import { takeUntilDestroyed, toSignal } from '@angular/core/rxjs-interop';
import { FormArray, FormBuilder, FormsModule, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { TranslatePipe } from '@ngx-translate/core';
import { MenuItem } from 'primeng/api';
import { AutoCompleteCompleteEvent, AutoCompleteModule } from 'primeng/autocomplete';
import { ButtonModule } from 'primeng/button';
import { CardModule } from 'primeng/card';
import { DividerModule } from 'primeng/divider';
import { EditorModule } from 'primeng/editor';
import { InputNumberModule } from 'primeng/inputnumber';
import { InputTextModule } from 'primeng/inputtext';
import { MenuModule } from 'primeng/menu';
import { MessageModule } from 'primeng/message';
import { SelectModule } from 'primeng/select';
import { TabsModule } from 'primeng/tabs';
import { TagModule } from 'primeng/tag';
import { TextareaModule } from 'primeng/textarea';
import { TooltipModule } from 'primeng/tooltip';
import { Subject, catchError, debounceTime, forkJoin, map, of, switchMap, tap } from 'rxjs';

import { HasUnsavedChanges } from 'src/app/core/guards/unsaved-changes.guard';
import { PERMISSIONS } from 'src/app/core/constants/permissions';
import { UserFixedCostResponse } from 'src/app/core/models/domain.model';
import {
  AllergenResponse,
  RecipeCostPreview,
  RecipeCostPreviewRequest,
  RecipeDetail,
  RecipeDifficulty,
  RecipeFile,
  RecipeFixedCostRequest,
  RecipeRequest,
  RecipeStatus,
} from 'src/app/core/models/kitchen.models';
import { AuthorizationService } from 'src/app/core/services/authorization.service';
import { AllergenService } from 'src/app/core/services/domain/allergen.service';
import { RecipeService } from 'src/app/core/services/domain/recipe.service';
import { FinanceDefaultsStore } from 'src/app/core/services/finance/finance-defaults.store';
import { LanguageService } from 'src/app/core/services/language.service';
import { PageInfoService } from 'src/app/core/services/page-info.service';
import { catalogErrorMessage, catalogErrors, catalogRootMessage, hasCatalogError } from 'src/app/core/utils/catalog-error.util';
import { DetailSkeletonComponent } from 'src/app/shared/components/detail-skeleton/detail-skeleton.component';
import { FieldErrorComponent } from 'src/app/shared/components/field-error/field-error.component';
import { AlertService } from 'src/app/shared/services/alert.service';
import { ConfirmService } from 'src/app/shared/services/confirm.service';
import { focusFirstInvalidControl } from 'src/app/shared/utils/form-focus.util';
import { IAM_CODE_PATTERN, toIamCode } from '../../admin/shared/iam-validators';
import { CostStatusTagComponent } from '../../kitchen-shared/cost-status-tag.component';
import { RECIPE_STATUS_PILL, difficultyOptions, formatMinutes } from '../../kitchen-shared/kitchen-labels';
import { KitchenLookupsStore } from '../../kitchen-shared/kitchen-lookups.store';
import { LineDraft, lineFromServer, lineToRequest, summarizeAllergens, validateLines } from './recipe-draft';
import { RecipeFilesPanelComponent } from './recipe-files-panel.component';
import { RecipeHistoryPanelComponent } from './recipe-history-panel.component';
import { RecipeLinesEditorComponent } from './recipe-lines-editor.component';
import { RecipeSharesPanelComponent } from './recipe-shares-panel.component';

type StudioTab = 'general' | 'ingredients' | 'process' | 'costing' | 'files' | 'history' | 'shares';

const TABS: readonly { value: StudioTab; labelKey: string; icon: string; savedOnly: boolean }[] = [
  { value: 'general', labelKey: 'KITCHEN.STUDIO.TABS.GENERAL', icon: 'pi pi-info-circle', savedOnly: false },
  { value: 'ingredients', labelKey: 'KITCHEN.STUDIO.TABS.INGREDIENTS', icon: 'pi pi-shopping-bag', savedOnly: false },
  { value: 'process', labelKey: 'KITCHEN.STUDIO.TABS.PROCESS', icon: 'pi pi-list', savedOnly: false },
  { value: 'costing', labelKey: 'KITCHEN.STUDIO.TABS.COSTING', icon: 'pi pi-calculator', savedOnly: false },
  { value: 'files', labelKey: 'KITCHEN.STUDIO.TABS.FILES', icon: 'pi pi-paperclip', savedOnly: false },
  { value: 'history', labelKey: 'KITCHEN.STUDIO.TABS.HISTORY', icon: 'pi pi-history', savedOnly: true },
  { value: 'shares', labelKey: 'KITCHEN.STUDIO.TABS.SHARES', icon: 'pi pi-share-alt', savedOnly: true },
];

const YIELD_UNITS = ['piezas', 'porciones', 'rebanadas', 'unidades', 'docenas', 'kg', 'g', 'L'];
/** Sanitised HTML limit (doc §5.3). Counted on the HTML, which is what is stored. */
export const PROCESS_HTML_MAX = 100_000;
const PREVIEW_DEBOUNCE_MS = 450;

function stripHtml(html: string | null): string {
  return (html ?? '').replace(/<[^>]*>/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim();
}

/**
 * Recipe studio: one screen to create and maintain a recipe — general data,
 * ingredient builder with allergen detection and substitutes, rich-text
 * process, costing (waste, fixed costs, target margin) with a live server
 * cost preview, attachments, version history and share links.
 *
 * The whole recipe is saved as one aggregate (`PUT /recipes/{id}` with its
 * `version`), so a save is atomic and two editors can never interleave
 * half-changes.
 */
@Component({
  selector: 'app-recipe-studio',
  standalone: true,
  imports: [
    DatePipe,
    DecimalPipe,
    FormsModule,
    ReactiveFormsModule,
    RouterLink,
    TranslatePipe,
    AutoCompleteModule,
    ButtonModule,
    CardModule,
    DividerModule,
    EditorModule,
    InputNumberModule,
    InputTextModule,
    MenuModule,
    MessageModule,
    SelectModule,
    TabsModule,
    TagModule,
    TextareaModule,
    TooltipModule,
    DetailSkeletonComponent,
    FieldErrorComponent,
    CostStatusTagComponent,
    RecipeFilesPanelComponent,
    RecipeHistoryPanelComponent,
    RecipeLinesEditorComponent,
    RecipeSharesPanelComponent,
  ],
  templateUrl: './recipe-studio.component.html',
  styleUrl: './recipe-studio.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class RecipeStudioComponent implements HasUnsavedChanges {
  private readonly fb = inject(FormBuilder);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly location = inject(Location);
  private readonly recipeService = inject(RecipeService);
  private readonly allergenService = inject(AllergenService);
  private readonly authorization = inject(AuthorizationService);
  private readonly lookups = inject(KitchenLookupsStore);
  private readonly finance = inject(FinanceDefaultsStore);
  private readonly alert = inject(AlertService);
  private readonly confirm = inject(ConfirmService);
  private readonly language = inject(LanguageService);
  private readonly pageInfo = inject(PageInfoService);
  private readonly destroyRef = inject(DestroyRef);

  private readonly formRef = viewChild<ElementRef<HTMLFormElement>>('generalFormEl');
  private readonly filesPanel = viewChild(RecipeFilesPanelComponent);

  protected readonly statusPill = RECIPE_STATUS_PILL;
  protected readonly processMax = PROCESS_HTML_MAX;

  protected readonly recipeId = signal<string | null>(this.route.snapshot.paramMap.get('id'));
  protected readonly isNew = computed(() => this.recipeId() === null);
  protected readonly loadState = signal<'loading' | 'ready' | 'error'>('loading');
  protected readonly recipe = signal<RecipeDetail | null>(null);
  protected readonly allergenCatalog = signal<AllergenResponse[]>([]);
  protected readonly saving = signal(false);
  protected readonly actionsMenu = signal<MenuItem[]>([]);
  protected readonly yieldUnitSuggestions = signal<string[]>([]);

  protected readonly lines = signal<LineDraft[]>([]);
  protected readonly files = signal<RecipeFile[]>([]);
  protected readonly preview = signal<RecipeCostPreview | null>(null);
  protected readonly costing = signal(false);
  private readonly linesDirty = signal(false);
  private skipLinesDirty = true;

  private readonly tabParam = toSignal(this.route.queryParamMap.pipe(map((params) => params.get('tab'))), {
    initialValue: this.route.snapshot.queryParamMap.get('tab'),
  });
  protected readonly tabs = computed(() => TABS.filter((tab) => !tab.savedOnly || !this.isNew()));
  protected readonly activeTab = computed<StudioTab>(() => this.tabs().find((tab) => tab.value === this.tabParam())?.value ?? (this.isNew() ? 'general' : 'ingredients'));

  protected readonly form = this.fb.group({
    name: this.fb.nonNullable.control('', [Validators.required, Validators.minLength(3), Validators.maxLength(120)]),
    code: this.fb.nonNullable.control('', [Validators.required, Validators.maxLength(50), Validators.pattern(IAM_CODE_PATTERN)]),
    categoryId: this.fb.control<number | null>(null),
    difficulty: this.fb.nonNullable.control<RecipeDifficulty>('EASY', Validators.required),
    description: this.fb.control<string | null>(null, Validators.maxLength(1000)),
    yieldQuantity: this.fb.control<number | null>(null, [Validators.required, Validators.min(0.01), Validators.max(100_000)]),
    yieldUnit: this.fb.nonNullable.control('piezas', [Validators.required, Validators.maxLength(30)]),
    prepMinutes: this.fb.control<number | null>(null, [Validators.min(0), Validators.max(10_080)]),
    bakeMinutes: this.fb.control<number | null>(null, [Validators.min(0), Validators.max(10_080)]),
    coolMinutes: this.fb.control<number | null>(null, [Validators.min(0), Validators.max(10_080)]),
    ovenTemperatureC: this.fb.control<number | null>(null, [Validators.min(30), Validators.max(320)]),
    shelfLifeDays: this.fb.control<number | null>(null, [Validators.min(0), Validators.max(730)]),
    storageInstructions: this.fb.control<string | null>(null, Validators.maxLength(1000)),
    processHtml: this.fb.control<string | null>(null, Validators.maxLength(PROCESS_HTML_MAX)),
    targetMarginPercent: this.fb.nonNullable.control(60, [Validators.required, Validators.min(0), Validators.max(1000)]),
    wastePercent: this.fb.nonNullable.control(3, [Validators.required, Validators.min(0), Validators.max(50)]),
    fixedCosts: this.fb.array<ReturnType<typeof buildFixedCostGroup>>([]),
  });

  private readonly formValue = toSignal(this.form.valueChanges.pipe(map(() => this.form.getRawValue())), { initialValue: this.form.getRawValue() });
  private readonly formDirty = toSignal(this.form.valueChanges.pipe(map(() => this.form.dirty)), { initialValue: false });

  protected readonly canWrite = computed(() =>
    this.authorization.can(this.isNew() ? PERMISSIONS.RECIPE_CREATE : PERMISSIONS.RECIPE_UPDATE),
  );
  protected readonly isDirty = computed(() => this.canWrite() && (this.formDirty() || this.linesDirty()));
  protected readonly lineIssues = computed(() => validateLines(this.lines()));
  protected readonly allergens = computed(() => summarizeAllergens(this.lines()));
  protected readonly difficultyOptions = computed(() => difficultyOptions((key) => this.language.t(key)));
  protected readonly categoryOptions = computed(() => this.lookups.snapshot().productCategories);
  protected readonly fixedCostCatalog = computed(() => this.lookups.snapshot().fixedCosts);
  protected readonly totalTime = computed(() => {
    const value = this.formValue();
    return formatMinutes((value.prepMinutes ?? 0) + (value.bakeMinutes ?? 0) + (value.coolMinutes ?? 0), (key) => this.language.t(key));
  });
  protected readonly processChars = computed(() => (this.formValue().processHtml ?? '').length);
  protected readonly processWords = computed(() => {
    const text = stripHtml(this.formValue().processHtml);
    return text ? text.split(' ').length : 0;
  });

  /** line key → cost, mapped from the preview (which keys lines by their display order). */
  protected readonly lineCosts = computed<ReadonlyMap<string, number | null>>(() => {
    const preview = this.preview();
    const lines = this.lines();
    const map = new Map<string, number | null>();
    for (const entry of preview?.lines ?? []) {
      const line = lines[Number(entry.lineKey)];
      if (line) {
        map.set(line.key, entry.lineCost);
      }
    }
    return map;
  });
  protected readonly cost = computed(() => this.preview()?.cost ?? this.recipe()?.cost ?? null);
  protected readonly margin = computed(() => this.formValue().targetMarginPercent);
  protected readonly currency = computed(() => this.cost()?.currency ?? this.finance.defaultCurrency().code);

  private readonly previews = new Subject<RecipeCostPreviewRequest>();

  constructor() {
    effect(() => {
      const name = this.recipe()?.name ?? (this.isNew() ? this.language.t('KITCHEN.STUDIO.NEW') : this.language.t('KITCHEN.RECIPES.TITLE'));
      this.pageInfo.updateTitle(name);
      this.pageInfo.updateDescription(this.language.t('KITCHEN.STUDIO.DESCRIPTION'));
      this.pageInfo.updateBreadcrumbs([
        { title: this.language.t('BREADCRUMB.HOME'), path: '/dashboard', isActive: false },
        { title: this.language.t('KITCHEN.RECIPES.TITLE'), path: '/cronos/recetas', isActive: false },
        { title: name, path: '', isActive: true },
      ]);
    });

    effect(() => {
      const editable = this.canWrite();
      untracked(() => {
        if (editable) {
          this.form.enable({ emitEvent: false });
          if (!this.isNew()) {
            this.form.controls.code.disable({ emitEvent: false });
          }
        } else {
          this.form.disable({ emitEvent: false });
        }
      });
    });

    // Any line change marks the recipe dirty (except the initial hydrate).
    effect(() => {
      this.lines();
      untracked(() => {
        if (this.skipLinesDirty) {
          this.skipLinesDirty = false;
          return;
        }
        this.linesDirty.set(true);
      });
    });

    // Live server cost preview on every relevant change.
    this.previews
      .pipe(
        debounceTime(PREVIEW_DEBOUNCE_MS),
        tap(() => this.costing.set(true)),
        switchMap((request) => this.recipeService.costPreview(request).pipe(catchError(() => of(null)))),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe((response) => {
        this.costing.set(false);
        if (response?.data) {
          this.preview.set(response.data);
        }
      });
    effect(() => {
      const request = this.buildPreviewRequest();
      untracked(() => {
        if (request.lines && request.lines.length > 0 && this.loadState() === 'ready') {
          this.previews.next(request);
        }
      });
    });

    this.load();
  }

  // ─── Load ───

  protected load(): void {
    this.loadState.set('loading');
    const id = this.recipeId();
    forkJoin({
      lookups: this.lookups.load(),
      allergens: this.allergenService.active().pipe(catchError(() => of([]))),
      finance: this.finance.load().pipe(catchError(() => of(undefined))),
      recipe: id ? this.recipeService.getById(id) : of(null),
    }).subscribe({
      next: ({ allergens, recipe }) => {
        this.allergenCatalog.set(allergens);
        if (recipe?.data) {
          this.hydrate(recipe.data);
        }
        this.loadState.set('ready');
      },
      error: (error: unknown) => {
        this.loadState.set('error');
        this.alert.error(catalogErrorMessage(error, this.language.t('KITCHEN.RECIPES.LOAD_FAILED')));
      },
    });
  }

  private hydrate(recipe: RecipeDetail): void {
    this.recipe.set(recipe);
    this.files.set(recipe.files);
    this.preview.set(null);
    const dimensions = new Map(this.lookups.snapshot().units.map((unit) => [unit.id, unit.dimension]));
    this.skipLinesDirty = true;
    this.lines.set(recipe.lines.slice().sort((a, b) => a.displayOrder - b.displayOrder).map((line) => lineFromServer(line, dimensions.get(line.unitId) ?? 'MASS')));
    this.linesDirty.set(false);
    this.form.controls.fixedCosts.clear({ emitEvent: false });
    for (const cost of recipe.fixedCosts) {
      this.form.controls.fixedCosts.push(buildFixedCostGroup(this.fb, cost.id, cost.userFixedCostId, cost.minutes, cost.percentage), { emitEvent: false });
    }
    this.form.reset({
      name: recipe.name,
      code: recipe.code,
      categoryId: recipe.categoryId,
      difficulty: recipe.difficulty,
      description: recipe.description,
      yieldQuantity: recipe.yieldQuantity,
      yieldUnit: recipe.yieldUnit,
      prepMinutes: recipe.prepMinutes,
      bakeMinutes: recipe.bakeMinutes,
      coolMinutes: recipe.coolMinutes,
      ovenTemperatureC: recipe.ovenTemperatureC,
      shelfLifeDays: recipe.shelfLifeDays,
      storageInstructions: recipe.storageInstructions,
      processHtml: recipe.processHtml,
      targetMarginPercent: recipe.targetMarginPercent,
      wastePercent: recipe.wastePercent,
    });
    if (!this.isNew()) {
      this.form.controls.code.disable({ emitEvent: false });
    }
  }

  protected selectTab(value: string | number | undefined): void {
    void this.router.navigate([], { relativeTo: this.route, queryParams: { tab: value }, queryParamsHandling: 'merge', replaceUrl: true });
  }

  // ─── General ───

  protected onNameBlur(): void {
    const code = this.form.controls.code;
    if (this.isNew() && !code.dirty && !code.value) {
      code.setValue(toIamCode(this.form.controls.name.value));
    }
  }

  protected searchYieldUnits(event: AutoCompleteCompleteEvent): void {
    const term = event.query.toLowerCase();
    this.yieldUnitSuggestions.set(YIELD_UNITS.filter((unit) => unit.includes(term)));
  }

  // ─── Fixed costs ───

  protected get fixedCosts(): FormArray<ReturnType<typeof buildFixedCostGroup>> {
    return this.form.controls.fixedCosts;
  }

  protected addFixedCost(): void {
    this.fixedCosts.push(buildFixedCostGroup(this.fb, null, null, null, null));
    this.form.markAsDirty();
  }

  protected removeFixedCost(index: number): void {
    this.fixedCosts.removeAt(index);
    this.form.markAsDirty();
  }

  protected fixedCostOf(index: number): UserFixedCostResponse | undefined {
    const id = this.fixedCosts.at(index).controls.userFixedCostId.value;
    return this.fixedCostCatalog().find((cost) => cost.id === id);
  }

  // ─── Save ───

  private buildRequest(): RecipeRequest {
    const value = this.form.getRawValue();
    return {
      code: value.code,
      name: value.name.trim(),
      categoryId: value.categoryId,
      difficulty: value.difficulty,
      description: value.description?.trim() || null,
      yieldQuantity: value.yieldQuantity ?? 0,
      yieldUnit: value.yieldUnit.trim(),
      prepMinutes: value.prepMinutes,
      bakeMinutes: value.bakeMinutes,
      coolMinutes: value.coolMinutes,
      ovenTemperatureC: value.ovenTemperatureC,
      shelfLifeDays: value.shelfLifeDays,
      storageInstructions: value.storageInstructions?.trim() || null,
      processHtml: stripHtml(value.processHtml) ? value.processHtml : null,
      targetMarginPercent: value.targetMarginPercent,
      wastePercent: value.wastePercent,
      lines: this.lines().map((line, index) => lineToRequest(line, index)),
      fixedCosts: this.fixedCostRequests(),
      ...(this.recipe() ? { version: this.recipe()!.version } : {}),
    };
  }

  private fixedCostRequests(): RecipeFixedCostRequest[] {
    return this.form.controls.fixedCosts
      .getRawValue()
      .filter((row) => !!row.userFixedCostId)
      .map((row) => ({ ...(row.id ? { id: row.id } : {}), userFixedCostId: row.userFixedCostId!, minutes: row.minutes, percentage: row.percentage }));
  }

  private buildPreviewRequest(): RecipeCostPreviewRequest {
    const value = this.formValue();
    return {
      recipeId: this.recipeId(),
      lines: this.lines()
        .filter((line) => (line.quantity ?? 0) > 0 && line.unitId !== null)
        .length === this.lines().length
        ? this.lines().map((line, index) => lineToRequest(line, index))
        : null,
      fixedCosts: this.fixedCostRequests(),
      yieldQuantity: value.yieldQuantity ?? 1,
      wastePercent: value.wastePercent,
      targetMarginPercent: value.targetMarginPercent,
      configuration: null,
    };
  }

  /** Validates everything and jumps to the tab holding the first problem. */
  private validate(): boolean {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      const general = ['name', 'code', 'yieldQuantity', 'yieldUnit', 'prepMinutes', 'bakeMinutes', 'coolMinutes', 'ovenTemperatureC', 'shelfLifeDays', 'description'];
      const tab: StudioTab = general.some((name) => this.form.get(name)?.invalid)
        ? 'general'
        : this.form.controls.processHtml.invalid || this.form.controls.storageInstructions.invalid
          ? 'process'
          : 'costing';
      this.selectTab(tab);
      setTimeout(() => focusFirstInvalidControl(this.formRef()?.nativeElement), 50);
      this.alert.warning(this.language.t('KITCHEN.STUDIO.FIX_ERRORS'));
      return false;
    }
    const missingMinutes = this.fixedCosts.controls.findIndex(
      (row) => this.fixedCostCatalog().find((cost) => cost.id === row.controls.userFixedCostId.value)?.calculationMethod === 'HOURLY_RATE' && !row.controls.minutes.value,
    );
    if (missingMinutes >= 0) {
      this.fixedCosts.at(missingMinutes).controls.minutes.setErrors({ required: true });
      this.fixedCosts.at(missingMinutes).markAllAsTouched();
      this.selectTab('costing');
      this.alert.warning(this.language.t('KITCHEN.STUDIO.MINUTES_REQUIRED'));
      return false;
    }
    if (this.lines().length === 0) {
      this.selectTab('ingredients');
      this.alert.warning(this.language.t('KITCHEN.RECIPES.ERRORS.NO_LINES'));
      return false;
    }
    if (this.lineIssues().length > 0) {
      this.selectTab('ingredients');
      this.alert.warning(this.language.t('KITCHEN.RECIPES.ERRORS.LINES_INVALID', { count: this.lineIssues().length }));
      return false;
    }
    return true;
  }

  protected save(): void {
    if (this.saving() || !this.canWrite() || !this.validate()) {
      return;
    }
    const request = this.buildRequest();
    const current = this.recipe();
    this.saving.set(true);
    const request$ = current ? this.recipeService.update(current.id, request) : this.recipeService.create(request);
    request$.subscribe({
      next: (response) => {
        this.saving.set(false);
        const saved = response.data;
        if (!saved) {
          return;
        }
        this.alert.success(this.language.t(current ? 'KITCHEN.RECIPES.UPDATED' : 'KITCHEN.RECIPES.CREATED', { name: saved.name }));
        if (!current) {
          // Stay on this component instance so queued attachments keep uploading.
          this.recipeId.set(saved.id);
          this.location.replaceState(`/cronos/recetas/${saved.id}`);
        }
        this.hydrate({ ...saved, files: this.files().length > saved.files.length ? this.files() : saved.files });
      },
      error: (error: unknown) => this.onSaveError(error),
    });
  }

  private onSaveError(error: unknown): void {
    this.saving.set(false);
    if (hasCatalogError(error, 'CONCURRENT_MODIFICATION')) {
      this.alert.warning(this.language.t('IAM.COMMON.CONCURRENT_MODIFICATION'));
      this.load();
      return;
    }
    let applied = false;
    for (const detail of catalogErrors(error)) {
      const control = detail.field ? this.form.get(detail.field.replace(/\[(\d+)\]/g, '.$1')) : null;
      if (control) {
        control.setErrors({ ...(control.errors ?? {}), serverValidation: detail.message });
        control.markAsTouched();
        applied = true;
      }
    }
    this.alert.error(applied ? catalogRootMessage(error, this.language.t('COMMON.TOAST.SAVE_FAILED')) : catalogErrorMessage(error, this.language.t('COMMON.TOAST.SAVE_FAILED')));
  }

  protected discard(): void {
    const current = this.recipe();
    if (current) {
      this.hydrate(current);
    }
  }

  // ─── Status & actions ───

  protected openActions(): void {
    const recipe = this.recipe();
    if (!recipe) {
      return;
    }
    const items: MenuItem[] = [
      { label: this.language.t('KITCHEN.STUDIO.ACTIONS.RECALCULATE'), icon: 'pi pi-refresh', command: () => this.recalculate() },
      { label: this.language.t('KITCHEN.STUDIO.ACTIONS.DUPLICATE'), icon: 'pi pi-copy', disabled: !this.authorization.can(PERMISSIONS.RECIPE_CREATE), command: () => this.duplicate() },
    ];
    if (recipe.status !== 'ARCHIVED') {
      items.push({ label: this.language.t('KITCHEN.STUDIO.ACTIONS.ARCHIVE'), icon: 'pi pi-inbox', command: () => void this.changeStatus('ARCHIVED') });
    } else {
      items.push({ label: this.language.t('KITCHEN.STUDIO.ACTIONS.RESTORE'), icon: 'pi pi-replay', command: () => void this.changeStatus('DRAFT') });
    }
    if (this.authorization.can(PERMISSIONS.RECIPE_DELETE)) {
      items.push({ separator: true }, { label: this.language.t('COMMON.DELETE'), icon: 'pi pi-trash', command: () => void this.remove() });
    }
    this.actionsMenu.set(items);
  }

  protected async changeStatus(status: RecipeStatus): Promise<void> {
    const recipe = this.recipe();
    if (!recipe) {
      return;
    }
    if (this.isDirty()) {
      this.alert.warning(this.language.t('KITCHEN.STUDIO.SAVE_FIRST'));
      return;
    }
    if (status === 'ACTIVE') {
      const unpriced = this.cost()?.unpricedLines ?? 0;
      const warnings = [
        ...(unpriced > 0 ? [this.language.t('KITCHEN.STUDIO.PUBLISH_UNPRICED', { count: unpriced })] : []),
        ...(!stripHtml(recipe.processHtml) ? [this.language.t('KITCHEN.STUDIO.PUBLISH_NO_PROCESS')] : []),
      ];
      const confirmed = await this.confirm.confirm({
        title: this.language.t('KITCHEN.STUDIO.PUBLISH_TITLE'),
        message: [this.language.t('KITCHEN.STUDIO.PUBLISH_MESSAGE'), ...warnings].join(' '),
        severity: warnings.length > 0 ? 'danger' : 'primary',
        icon: 'pi pi-check-circle',
      });
      if (!confirmed) {
        return;
      }
    }
    this.recipeService.changeStatus(recipe.id, status, recipe.version).subscribe({
      next: (response) => {
        if (response.data) {
          this.hydrate({ ...response.data, files: this.files() });
        }
        this.alert.success(this.language.t('KITCHEN.STUDIO.STATUS_CHANGED', { status: this.language.t(`KITCHEN.RECIPE_STATUS.${status}`) }));
      },
      error: (error: unknown) => this.onSaveError(error),
    });
  }

  private recalculate(): void {
    const recipe = this.recipe();
    if (!recipe) {
      return;
    }
    this.costing.set(true);
    this.recipeService.recalculate(recipe.id).subscribe({
      next: (response) => {
        this.costing.set(false);
        if (response.data) {
          this.recipe.set({ ...response.data, files: this.files() });
          this.preview.set(null);
        }
        this.alert.success(this.language.t('KITCHEN.STUDIO.RECALCULATED'));
      },
      error: (error: unknown) => {
        this.costing.set(false);
        this.alert.error(catalogErrorMessage(error, this.language.t('KITCHEN.STUDIO.RECALCULATE_FAILED')));
      },
    });
  }

  private duplicate(): void {
    const recipe = this.recipe();
    if (!recipe) {
      return;
    }
    this.recipeService.duplicate(recipe.id, `${recipe.name} (${this.language.t('IAM.ROLES.COPY')})`).subscribe({
      next: (response) => {
        if (response.data) {
          this.alert.success(this.language.t('KITCHEN.STUDIO.DUPLICATED'));
          void this.router.navigate(['/cronos/recetas', response.data.id]);
        }
      },
      error: (error: unknown) => this.alert.error(catalogErrorMessage(error, this.language.t('IAM.COMMON.ACTION_FAILED'))),
    });
  }

  private async remove(): Promise<void> {
    const recipe = this.recipe();
    if (!recipe || !(await this.confirm.confirmDelete(recipe.name, this.language.t('KITCHEN.STUDIO.DELETE_MESSAGE', { name: recipe.name })))) {
      return;
    }
    this.recipeService.delete(recipe.id).subscribe({
      next: () => {
        this.linesDirty.set(false);
        this.form.markAsPristine();
        this.alert.success(this.language.t('KITCHEN.RECIPES.DELETED'));
        void this.router.navigate(['/cronos/recetas']);
      },
      error: (error: unknown) => this.alert.error(catalogErrorMessage(error, this.language.t('COMMON.TOAST.DELETE_FAILED'))),
    });
  }

  protected showError(path: string): boolean {
    const control = this.form.get(path);
    return !!control && control.invalid && (control.touched || control.dirty);
  }

  async canDeactivate(): Promise<boolean> {
    const uploading = this.filesPanel()?.hasPendingUploads() ?? false;
    if (!uploading && !this.isDirty()) {
      return true;
    }
    return this.confirm.confirm({
      title: this.language.t('ACCOUNT.SETTINGS.UNSAVED_TITLE'),
      message: this.language.t(uploading ? 'KITCHEN.STUDIO.LEAVE_UPLOADING' : 'ACCOUNT.SETTINGS.UNSAVED_MESSAGE'),
      acceptLabel: this.language.t('ACCOUNT.SETTINGS.UNSAVED_ACCEPT'),
      severity: 'danger',
    });
  }
}

function buildFixedCostGroup(fb: FormBuilder, id: string | null, userFixedCostId: string | null, minutes: number | null, percentage: number | null) {
  return fb.group({
    id: fb.control<string | null>(id),
    userFixedCostId: fb.control<string | null>(userFixedCostId, Validators.required),
    minutes: fb.control<number | null>(minutes, [Validators.min(1), Validators.max(10_080)]),
    percentage: fb.control<number | null>(percentage, [Validators.min(0), Validators.max(100)]),
  });
}
