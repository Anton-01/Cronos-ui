import { DatePipe, DecimalPipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, ElementRef, computed, effect, inject, signal, untracked, viewChild } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { FormArray, FormBuilder, FormsModule, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { TranslatePipe } from '@ngx-translate/core';
import { AutoCompleteCompleteEvent, AutoCompleteModule } from 'primeng/autocomplete';
import { ButtonModule } from 'primeng/button';
import { CardModule } from 'primeng/card';
import { DatePickerModule } from 'primeng/datepicker';
import { InputNumberModule } from 'primeng/inputnumber';
import { InputTextModule } from 'primeng/inputtext';
import { MessageModule } from 'primeng/message';
import { MultiSelectModule } from 'primeng/multiselect';
import { SelectModule } from 'primeng/select';
import { SliderModule } from 'primeng/slider';
import { TableLazyLoadEvent, TableModule } from 'primeng/table';
import { TabsModule } from 'primeng/tabs';
import { TagModule } from 'primeng/tag';
import { TextareaModule } from 'primeng/textarea';
import { TooltipModule } from 'primeng/tooltip';
import { catchError, forkJoin, map, of } from 'rxjs';

import { HasUnsavedChanges } from 'src/app/core/guards/unsaved-changes.guard';
import { PERMISSIONS } from 'src/app/core/constants/permissions';
import {
  AllergenRef,
  AllergenResponse,
  IngredientDetail,
  IngredientPriceHistoryEntry,
  IngredientRequest,
  IngredientSummary,
  PriceImpact,
} from 'src/app/core/models/kitchen.models';
import { UnitDimension } from 'src/app/core/models/unit-catalog.models';
import { AuthorizationService } from 'src/app/core/services/authorization.service';
import { AllergenService } from 'src/app/core/services/domain/allergen.service';
import { IngredientService } from 'src/app/core/services/domain/ingredient.service';
import { FinanceDefaultsStore } from 'src/app/core/services/finance/finance-defaults.store';
import { LanguageService } from 'src/app/core/services/language.service';
import { PageInfoService } from 'src/app/core/services/page-info.service';
import { catalogErrorMessage, catalogErrors, catalogRootMessage, hasCatalogError } from 'src/app/core/utils/catalog-error.util';
import { DetailSkeletonComponent } from 'src/app/shared/components/detail-skeleton/detail-skeleton.component';
import { FieldErrorComponent } from 'src/app/shared/components/field-error/field-error.component';
import { TableSkeletonRowComponent } from 'src/app/shared/components/table-skeleton-row/table-skeleton-row.component';
import { AlertService } from 'src/app/shared/services/alert.service';
import { ConfirmService } from 'src/app/shared/services/confirm.service';
import { focusFirstInvalidControl } from 'src/app/shared/utils/form-focus.util';
import { IAM_CODE_PATTERN, toIamCode } from '../../admin/shared/iam-validators';
import { toIsoDate } from '../../admin/users/user-identity-form';
import { AllergenBadgesComponent } from '../../kitchen-shared/allergen-badges.component';
import { AllergenMatch, detectAllergens } from '../../kitchen-shared/allergen-detection';
import { KitchenLookupsStore, estimateCostPerBaseUnit } from '../../kitchen-shared/kitchen-lookups.store';
import { PriceDialogComponent } from '../../kitchen-shared/price-dialog.component';

type EditorTab = 'data' | 'prices' | 'usage';

const DIMENSIONS: readonly UnitDimension[] = ['MASS', 'VOLUME', 'COUNT'];
const BASE_UNIT: Readonly<Record<UnitDimension, string>> = { MASS: 'g', VOLUME: 'ml', COUNT: 'pz', LENGTH: 'cm' };

function buildSubstituteGroup(fb: FormBuilder, ingredientId: string | null, name: string | null, ratio: number, notes: string | null) {
  return fb.group({
    ingredient: fb.control<{ id: string; name: string } | null>(ingredientId ? { id: ingredientId, name: name ?? '' } : null, Validators.required),
    ratio: fb.nonNullable.control(ratio, [Validators.required, Validators.min(0.01), Validators.max(10)]),
    notes: fb.control<string | null>(notes, Validators.maxLength(200)),
  });
}

type SubstituteGroup = ReturnType<typeof buildSubstituteGroup>;

@Component({
  selector: 'app-ingredient-editor',
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
    DatePickerModule,
    InputNumberModule,
    InputTextModule,
    MessageModule,
    MultiSelectModule,
    SelectModule,
    SliderModule,
    TableModule,
    TabsModule,
    TagModule,
    TextareaModule,
    TooltipModule,
    DetailSkeletonComponent,
    FieldErrorComponent,
    TableSkeletonRowComponent,
    AllergenBadgesComponent,
    PriceDialogComponent,
  ],
  templateUrl: './ingredient-editor.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class IngredientEditorComponent implements HasUnsavedChanges {
  private readonly fb = inject(FormBuilder);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly ingredientService = inject(IngredientService);
  private readonly allergenService = inject(AllergenService);
  private readonly authorization = inject(AuthorizationService);
  private readonly lookups = inject(KitchenLookupsStore);
  private readonly finance = inject(FinanceDefaultsStore);
  private readonly alert = inject(AlertService);
  private readonly confirm = inject(ConfirmService);
  private readonly language = inject(LanguageService);
  private readonly pageInfo = inject(PageInfoService);

  private readonly formRef = viewChild<ElementRef<HTMLFormElement>>('ingredientFormEl');

  protected readonly ingredientId = this.route.snapshot.paramMap.get('id');
  protected readonly isNew = this.ingredientId === null;
  protected readonly today = new Date();

  protected readonly loadState = signal<'loading' | 'ready' | 'error'>('loading');
  protected readonly ingredient = signal<IngredientDetail | null>(null);
  protected readonly allergenCatalog = signal<AllergenResponse[]>([]);
  protected readonly saving = signal(false);
  protected readonly dismissedSuggestions = signal<ReadonlySet<number>>(new Set());
  protected readonly substituteSuggestions = signal<IngredientSummary[]>([]);
  /** Allergens of the substitutes picked in this session, keyed by ingredient id. */
  private readonly substituteAllergens = signal<ReadonlyMap<string, AllergenRef[]>>(new Map());
  protected readonly priceOpen = signal(false);
  private saved = false;

  // Price history & usage
  protected readonly history = signal<IngredientPriceHistoryEntry[]>([]);
  protected readonly historyTotal = signal(0);
  protected readonly historyLoading = signal(false);
  protected readonly usage = signal<{ id: string; name: string; quantity: number; unitCode: string }[]>([]);
  protected readonly usageLoading = signal(false);

  private readonly tabParam = toSignal(this.route.queryParamMap.pipe(map((params) => params.get('tab'))), {
    initialValue: this.route.snapshot.queryParamMap.get('tab'),
  });
  protected readonly activeTab = computed<EditorTab>(() => {
    const tab = this.tabParam();
    return !this.isNew && (tab === 'prices' || tab === 'usage') ? tab : 'data';
  });

  protected readonly form = this.fb.group({
    name: this.fb.nonNullable.control('', [Validators.required, Validators.minLength(2), Validators.maxLength(120)]),
    code: this.fb.nonNullable.control('', [Validators.required, Validators.maxLength(50), Validators.pattern(IAM_CODE_PATTERN)]),
    categoryId: this.fb.control<number | null>(null, Validators.required),
    brand: this.fb.control<string | null>(null, Validators.maxLength(80)),
    description: this.fb.control<string | null>(null, Validators.maxLength(500)),
    baseDimension: this.fb.nonNullable.control<UnitDimension>('MASS', Validators.required),
    yieldPercent: this.fb.nonNullable.control(100, [Validators.required, Validators.min(1), Validators.max(100)]),
    densityGPerMl: this.fb.control<number | null>(null, [Validators.min(0.1), Validators.max(3)]),
    allergenIds: this.fb.nonNullable.control<number[]>([]),
    substitutes: this.fb.array<SubstituteGroup>([]),
    // Optional first price (create only)
    price: this.fb.group({
      purchaseQuantity: this.fb.control<number | null>(null, [Validators.min(0.0001)]),
      purchaseUnitId: this.fb.control<number | null>(null),
      price: this.fb.control<number | null>(null, [Validators.min(0.01)]),
      currency: this.fb.nonNullable.control('MXN'),
      supplier: this.fb.control<string | null>(null, Validators.maxLength(120)),
      pricedAt: this.fb.control<Date | null>(new Date()),
    }),
  });

  private readonly value = toSignal(this.form.valueChanges.pipe(map(() => this.form.getRawValue())), {
    initialValue: this.form.getRawValue(),
  });
  private readonly dirty = toSignal(this.form.valueChanges.pipe(map(() => this.form.dirty)), { initialValue: false });

  protected readonly isSystem = computed(() => this.ingredient()?.scope === 'SYSTEM');
  protected readonly canEditData = computed(() => {
    const current = this.ingredient();
    if (!current) {
      return this.authorization.can(PERMISSIONS.INGREDIENT_CREATE);
    }
    return current.scope === 'USER'
      ? this.authorization.can(PERMISSIONS.INGREDIENT_UPDATE)
      : this.authorization.can(PERMISSIONS.CATALOG_INGREDIENT_MANAGE);
  });
  protected readonly isDirty = computed(() => this.dirty() && this.canEditData());
  protected readonly dimensionLocked = computed(() => (this.ingredient()?.usedInRecipes ?? 0) > 0);

  protected readonly dimensionOptions = computed(() =>
    DIMENSIONS.map((value) => ({ value, label: `${this.language.t(`CATALOG.DIMENSIONS.${value}`)} (${BASE_UNIT[value]})` })),
  );
  protected readonly categoryOptions = computed(() => this.lookups.snapshot().ingredientCategories);
  protected readonly allergenOptions = computed(() => this.allergenCatalog().map((allergen) => ({ label: allergen.name, value: allergen.id, icon: allergen.icon })));
  protected readonly needsDensity = computed(() => this.value().baseDimension !== 'COUNT');
  protected readonly priceUnits = computed(() => this.lookups.unitsFor(this.value().baseDimension, !!this.value().densityGPerMl));
  protected readonly currencies = computed(() => this.finance.currencyOptions().map((currency) => currency.code));

  protected readonly selectedAllergens = computed<AllergenRef[]>(() => {
    const ids = new Set(this.value().allergenIds);
    return this.allergenCatalog().filter((allergen) => ids.has(allergen.id)).map(({ id, code, name }) => ({ id, code, name }));
  });

  /** Keyword matches on name + description not yet linked nor dismissed. */
  protected readonly suggestions = computed<AllergenMatch[]>(() => {
    const { name, description, allergenIds } = this.value();
    const exclude = new Set([...allergenIds, ...this.dismissedSuggestions()]);
    return detectAllergens(`${name} ${description ?? ''}`, this.allergenCatalog(), exclude);
  });

  protected readonly initialCostEstimate = computed(() => {
    const value = this.value();
    const unit = this.priceUnits().find((option) => option.id === value.price.purchaseUnitId);
    const estimate = estimateCostPerBaseUnit(value.price.price, value.price.purchaseQuantity, unit, value.yieldPercent, value.baseDimension, value.densityGPerMl);
    return estimate === null ? null : value.baseDimension === 'COUNT' ? estimate : estimate * 1000;
  });

  protected readonly displayUnit = computed(() => {
    const dimension = this.value().baseDimension;
    return dimension === 'COUNT' ? 'pz' : dimension === 'MASS' ? 'kg' : 'L';
  });

  protected readonly summaryForPrice = computed<IngredientSummary | null>(() => this.ingredient());

  constructor() {
    effect(() => {
      const title = this.isNew ? this.language.t('KITCHEN.INGREDIENTS.CREATE') : (this.ingredient()?.name ?? this.language.t('KITCHEN.INGREDIENTS.TITLE'));
      this.pageInfo.updateTitle(title);
      this.pageInfo.updateDescription(this.language.t('KITCHEN.INGREDIENTS.EDITOR_DESCRIPTION'));
      this.pageInfo.updateBreadcrumbs([
        { title: this.language.t('BREADCRUMB.HOME'), path: '/dashboard', isActive: false },
        { title: this.language.t('KITCHEN.INGREDIENTS.TITLE'), path: '/cronos/ingredientes', isActive: false },
        { title, path: '', isActive: true },
      ]);
    });
    effect(() => {
      const editable = this.canEditData();
      untracked(() => (editable ? this.form.enable({ emitEvent: false }) : this.form.disable({ emitEvent: false })));
      untracked(() => this.applyLocks());
    });
    effect(() => {
      const tab = this.activeTab();
      untracked(() => {
        if (tab === 'usage' && this.usage().length === 0) {
          this.loadUsage();
        }
      });
    });
    this.load();
  }

  private substituteGroup(ingredientId: string | null = null, name: string | null = null, ratio = 1, notes: string | null = null): SubstituteGroup {
    return buildSubstituteGroup(this.fb, ingredientId, name, ratio, notes);
  }

  protected get substitutes(): FormArray<SubstituteGroup> {
    return this.form.controls.substitutes;
  }

  // ─── Load ───

  protected load(): void {
    this.loadState.set('loading');
    forkJoin({
      lookups: this.lookups.load(),
      allergens: this.allergenService.active().pipe(catchError(() => of([]))),
      finance: this.finance.load().pipe(catchError(() => of(undefined))),
      ingredient: this.ingredientId ? this.ingredientService.getById(this.ingredientId) : of(null),
    }).subscribe({
      next: ({ allergens, ingredient }) => {
        this.allergenCatalog.set(allergens);
        if (ingredient?.data) {
          this.hydrate(ingredient.data);
        } else {
          this.form.controls.price.controls.currency.setValue(this.finance.defaultCurrency().code);
        }
        this.loadState.set('ready');
      },
      error: (error: unknown) => {
        this.loadState.set('error');
        this.alert.error(catalogErrorMessage(error, this.language.t('KITCHEN.INGREDIENTS.LOAD_FAILED')));
      },
    });
  }

  private hydrate(detail: IngredientDetail): void {
    this.ingredient.set(detail);
    this.substitutes.clear({ emitEvent: false });
    for (const substitute of detail.substitutes) {
      this.substitutes.push(this.substituteGroup(substitute.ingredientId, substitute.ingredientName, substitute.ratio, substitute.notes), { emitEvent: false });
    }
    this.form.reset({
      name: detail.name,
      code: detail.code,
      categoryId: detail.categoryId,
      brand: detail.brand,
      description: detail.description,
      baseDimension: detail.baseDimension,
      yieldPercent: detail.yieldPercent,
      densityGPerMl: detail.densityGPerMl,
      allergenIds: detail.allergens.map((allergen) => allergen.id),
    });
    this.applyLocks();
  }

  private applyLocks(): void {
    if (!this.isNew) {
      this.form.controls.code.disable({ emitEvent: false });
    }
    if (this.dimensionLocked()) {
      this.form.controls.baseDimension.disable({ emitEvent: false });
    }
  }

  protected selectTab(value: string | number | undefined): void {
    void this.router.navigate([], { relativeTo: this.route, queryParams: { tab: value === 'data' ? null : value }, queryParamsHandling: 'merge', replaceUrl: true });
  }

  // ─── Allergens ───

  protected acceptSuggestion(match: AllergenMatch): void {
    const control = this.form.controls.allergenIds;
    control.setValue([...control.value, match.allergen.id]);
    control.markAsDirty();
  }

  protected dismissSuggestion(match: AllergenMatch): void {
    this.dismissedSuggestions.update((set) => new Set([...set, match.allergen.id]));
  }

  // ─── Substitutes ───

  protected addSubstitute(): void {
    this.substitutes.push(this.substituteGroup());
    this.form.markAsDirty();
  }

  protected removeSubstitute(index: number): void {
    this.substitutes.removeAt(index);
    this.form.markAsDirty();
  }

  protected searchSubstitutes(event: AutoCompleteCompleteEvent): void {
    this.ingredientService
      .search({ page: 0, size: 12, search: event.query, status: 'ACTIVE' })
      .pipe(catchError(() => of(null)))
      .subscribe((response) => {
        const taken = new Set([this.ingredientId, ...this.substitutes.getRawValue().map((row) => row.ingredient?.id)]);
        const results = (response?.data?.content ?? []).filter((item) => !taken.has(item.id));
        this.substituteAllergens.update((map) => new Map([...map, ...results.map((item) => [item.id, item.allergens] as const)]));
        this.substituteSuggestions.set(results);
      });
  }

  /** Which of the original's allergens the substitute avoids / adds — computed for rows picked this session. */
  protected substituteImpact(index: number): { freeOf: AllergenRef[]; introduces: AllergenRef[] } | null {
    const id = this.substitutes.at(index).controls.ingredient.value?.id;
    const saved = this.ingredient()?.substitutes.find((substitute) => substitute.ingredientId === id);
    if (saved) {
      return { freeOf: saved.freeOf, introduces: saved.introduces };
    }
    const allergens = id ? this.substituteAllergens().get(id) : undefined;
    if (!allergens) {
      return null;
    }
    const mine = this.selectedAllergens();
    const theirs = new Set(allergens.map((allergen) => allergen.id));
    const own = new Set(mine.map((allergen) => allergen.id));
    return { freeOf: mine.filter((allergen) => !theirs.has(allergen.id)), introduces: allergens.filter((allergen) => !own.has(allergen.id)) };
  }

  protected names(allergens: readonly AllergenRef[]): string {
    return allergens.map((allergen) => allergen.name).join(', ');
  }

  // ─── Save ───

  protected onNameBlur(): void {
    const code = this.form.controls.code;
    if (this.isNew && !code.dirty && !code.value) {
      code.setValue(toIamCode(this.form.controls.name.value));
    }
  }

  protected save(): void {
    if (this.saving() || !this.canEditData()) {
      return;
    }
    const priceGroup = this.form.controls.price;
    const price = priceGroup.getRawValue();
    const priceStarted = this.isNew && (price.price !== null || price.purchaseQuantity !== null || price.purchaseUnitId !== null);
    if (priceStarted && (price.price === null || price.purchaseQuantity === null || price.purchaseUnitId === null)) {
      priceGroup.markAllAsTouched();
      this.alert.warning(this.language.t('KITCHEN.INGREDIENTS.PRICE_INCOMPLETE'));
      return;
    }
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      focusFirstInvalidControl(this.formRef()?.nativeElement);
      return;
    }
    const value = this.form.getRawValue();
    const substitutes = value.substitutes.filter((row) => row.ingredient !== null);
    const duplicate = new Set(substitutes.map((row) => row.ingredient!.id)).size !== substitutes.length;
    if (duplicate) {
      this.alert.warning(this.language.t('KITCHEN.INGREDIENTS.SUBSTITUTE_DUPLICATE'));
      return;
    }
    const current = this.ingredient();
    const request: IngredientRequest = {
      code: value.code,
      name: value.name.trim(),
      categoryId: value.categoryId!,
      description: value.description?.trim() || null,
      brand: value.brand?.trim() || null,
      baseDimension: value.baseDimension,
      yieldPercent: value.yieldPercent,
      densityGPerMl: value.baseDimension === 'COUNT' ? null : value.densityGPerMl,
      allergenIds: value.allergenIds,
      substitutes: substitutes.map((row) => ({ ingredientId: row.ingredient!.id, ratio: row.ratio, notes: row.notes?.trim() || null })),
      price: priceStarted
        ? {
            purchaseQuantity: price.purchaseQuantity!,
            purchaseUnitId: price.purchaseUnitId!,
            price: price.price!,
            currency: price.currency,
            supplier: price.supplier?.trim() || null,
            pricedAt: toIsoDate(price.pricedAt)!,
          }
        : null,
      ...(current ? { version: current.version } : {}),
    };

    this.saving.set(true);
    const request$ = current ? this.ingredientService.update(current.id, request) : this.ingredientService.create(request);
    request$.subscribe({
      next: (response) => {
        this.saving.set(false);
        this.alert.success(this.language.t(current ? 'KITCHEN.INGREDIENTS.UPDATED' : 'KITCHEN.INGREDIENTS.CREATED', { name: request.name }));
        if (!current && response.data) {
          this.saved = true;
          void this.router.navigate(['/cronos/ingredientes', response.data.id], { replaceUrl: true });
          return;
        }
        if (response.data) {
          this.hydrate(response.data);
        }
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
    const current = this.ingredient();
    if (current) {
      this.hydrate(current);
    }
  }

  // ─── Prices & usage ───

  protected onPriceSaved(impact: PriceImpact): void {
    const current = this.ingredient();
    if (current) {
      this.ingredient.set({ ...current, ...impact.ingredient });
    }
    this.loadHistory({ first: 0, rows: 10 });
  }

  protected loadHistory(event: TableLazyLoadEvent): void {
    if (!this.ingredientId) {
      return;
    }
    const size = event.rows ?? 10;
    this.historyLoading.set(true);
    this.ingredientService.priceHistory(this.ingredientId, Math.floor((event.first ?? 0) / size), size).subscribe({
      next: (response) => {
        this.history.set(response.data?.content ?? []);
        this.historyTotal.set(response.data?.totalElements ?? 0);
        this.historyLoading.set(false);
      },
      error: () => this.historyLoading.set(false),
    });
  }

  private loadUsage(): void {
    if (!this.ingredientId) {
      return;
    }
    this.usageLoading.set(true);
    this.ingredientService.usage(this.ingredientId).subscribe({
      next: (response) => {
        this.usage.set(response.data ?? []);
        this.usageLoading.set(false);
      },
      error: () => this.usageLoading.set(false),
    });
  }

  protected showError(path: string): boolean {
    const control = this.form.get(path);
    return !!control && control.invalid && (control.touched || control.dirty);
  }

  async canDeactivate(): Promise<boolean> {
    if (this.saved || !this.isDirty()) {
      return true;
    }
    return this.confirm.confirm({
      title: this.language.t('ACCOUNT.SETTINGS.UNSAVED_TITLE'),
      message: this.language.t('ACCOUNT.SETTINGS.UNSAVED_MESSAGE'),
      acceptLabel: this.language.t('ACCOUNT.SETTINGS.UNSAVED_ACCEPT'),
      severity: 'danger',
    });
  }
}
