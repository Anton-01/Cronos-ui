import { ChangeDetectionStrategy, Component, OnDestroy, OnInit, computed, effect, inject, signal } from '@angular/core';
import { FormsModule, ReactiveFormsModule, FormBuilder, Validators } from '@angular/forms';
import { Subject } from 'rxjs';
import { takeUntil } from 'rxjs/operators';

import { TranslatePipe } from '@ngx-translate/core';
import { ButtonModule } from 'primeng/button';
import { CardModule } from 'primeng/card';
import { DialogModule } from 'primeng/dialog';
import { IconFieldModule } from 'primeng/iconfield';
import { InputIconModule } from 'primeng/inputicon';
import { InputNumberModule } from 'primeng/inputnumber';
import { InputTextModule } from 'primeng/inputtext';
import { MessageModule } from 'primeng/message';
import { CheckboxModule } from 'primeng/checkbox';
import { SelectModule } from 'primeng/select';
import { TableModule } from 'primeng/table';
import { TagModule } from 'primeng/tag';
import { TextareaModule } from 'primeng/textarea';
import { ToggleSwitchModule } from 'primeng/toggleswitch';
import { TooltipModule } from 'primeng/tooltip';

import { UserFixedCostService } from 'src/app/core/services/domain/user-fixed-cost.service';
import { UserFixedCostRequest, UserFixedCostResponse } from 'src/app/core/models/domain.model';
import { FinanceDefaultsStore } from 'src/app/core/services/finance/finance-defaults.store';
import { catalogErrorMessage } from 'src/app/core/utils/catalog-error.util';
import { KitchenLookupsStore } from '../kitchen-shared/kitchen-lookups.store';
import { LanguageService } from 'src/app/core/services/language.service';
import { PageInfoService } from 'src/app/core/services/page-info.service';
import { AlertService } from 'src/app/shared/services/alert.service';
import { ConfirmService } from 'src/app/shared/services/confirm.service';
import { TableSkeletonRowComponent } from 'src/app/shared/components/table-skeleton-row/table-skeleton-row.component';

interface SelectOption {
  value: string;
  label: string;
}

interface CalculationMethodOption extends SelectOption {
  hint: string;
}

type TagSeverity = 'success' | 'info' | 'warn' | 'danger' | 'secondary' | 'contrast';

/**
 * The API's enum values, in display order. Labels are not stored next to them:
 * each one is looked up as `FIXED_COSTS.TYPES.<value>` at render time so the
 * selector re-labels itself on a language switch.
 */
const COST_TYPE_VALUES: readonly string[] = ['LABOR', 'UTILITY', 'RENT', 'PACKAGING', 'OVERHEAD', 'MARKETING'];

/** Same contract, under `FIXED_COSTS.METHODS.<value>.LABEL` / `.HINT`. */
const CALCULATION_METHOD_VALUES: readonly string[] = [
  'HOURLY_RATE',
  'PER_UNIT',
  'FIXED_PER_BATCH',
  'PERCENTAGE',
];

const METHODS_BY_TYPE: Record<string, string[]> = {
  LABOR: ['HOURLY_RATE'],
  UTILITY: ['HOURLY_RATE'],
  PACKAGING: ['PER_UNIT'],
  RENT: ['FIXED_PER_BATCH'],
  OVERHEAD: ['FIXED_PER_BATCH', 'PERCENTAGE'],
  MARKETING: ['PER_UNIT', 'FIXED_PER_BATCH', 'PERCENTAGE'],
};

const TYPE_TAG_SEVERITY: Record<string, TagSeverity> = {
  LABOR: 'info',
  UTILITY: 'warn',
  RENT: 'secondary',
  PACKAGING: 'success',
  OVERHEAD: 'contrast',
  MARKETING: 'danger',
};

@Component({
  selector: 'app-fixed-costs',
  standalone: true,
  imports: [
    FormsModule,
    ReactiveFormsModule,
    TranslatePipe,
    ButtonModule,
    CardModule,
    CheckboxModule,
    DialogModule,
    IconFieldModule,
    InputIconModule,
    InputNumberModule,
    InputTextModule,
    MessageModule,
    SelectModule,
    TableModule,
    TagModule,
    TextareaModule,
    ToggleSwitchModule,
    TooltipModule,
    TableSkeletonRowComponent,
  ],
  templateUrl: './fixed-costs.component.html',
  styleUrl: './fixed-costs.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class FixedCostsComponent implements OnInit, OnDestroy {
  private readonly fixedCostService = inject(UserFixedCostService);
  private readonly alertService = inject(AlertService);
  private readonly confirmService = inject(ConfirmService);
  private readonly pageInfoService = inject(PageInfoService);
  private readonly language = inject(LanguageService);
  private readonly fb = inject(FormBuilder);
  private readonly finance = inject(FinanceDefaultsStore);
  private readonly lookups = inject(KitchenLookupsStore);
  private readonly destroy$ = new Subject<void>();

  /** Currency the amounts are captured in — the finance default, never a hardcoded MXN. */
  protected readonly currency = computed(() => this.finance.defaultCurrency());
  protected readonly locale = computed(() => this.language.current());
  /** Ids whose active flag is being changed. */
  protected readonly togglingIds = signal<ReadonlySet<string>>(new Set());
  protected readonly selectedMethod = signal<string>('');
  /** Monthly figure the amount can be derived from (rent, a salary, a utility bill). */
  protected readonly derivedAmount = signal<number | null>(null);

  readonly items = signal<UserFixedCostResponse[]>([]);
  readonly isLoading = signal(false);
  protected readonly skeletonRows = Array.from({ length: 6 });
  selectedItems: UserFixedCostResponse[] = [];
  readonly showForm = signal(false);
  readonly selectedItem = signal<UserFixedCostResponse | null>(null);
  readonly isSaving = signal(false);
  readonly isPercentageMethod = signal(false);
  /**
   * Which methods the chosen cost type allows. Held as values, not built
   * options, so the rendered list re-translates without being recomputed by
   * whatever last narrowed it.
   */
  private readonly allowedMethodValues = signal<readonly string[]>(CALCULATION_METHOD_VALUES);

  readonly filteredCalculationMethods = computed<CalculationMethodOption[]>(() =>
    this.allowedMethodValues().map((value) => ({
      value,
      label: this.language.t(`FIXED_COSTS.METHODS.${value}.LABEL`),
      hint: this.language.t(`FIXED_COSTS.METHODS.${value}.HINT`),
    })),
  );

  readonly costTypes = computed<SelectOption[]>(() =>
    COST_TYPE_VALUES.map((value) => ({ value, label: this.language.t(`FIXED_COSTS.TYPES.${value}`) })),
  );

  readonly statusFilterOptions = computed<{ label: string; value: boolean }[]>(() => [
    { label: this.language.t('COMMON.STATUS.ACTIVE'), value: true },
    { label: this.language.t('COMMON.STATUS.INACTIVE'), value: false },
  ]);

  readonly form = this.fb.group({
    name: ['', [Validators.required, Validators.minLength(2), Validators.maxLength(100)]],
    description: ['', [Validators.maxLength(255)]],
    type: ['', [Validators.required]],
    defaultAmount: [null as number | null, [Validators.required, Validators.min(0)]],
    calculationMethod: ['', [Validators.required]],
    percentage: [null as number | null],
    appliesByDefault: [false],
    monthlyAmount: [null as number | null, [Validators.min(0)]],
    monthlyBasis: [null as number | null, [Validators.min(0.01)]],
  });

  constructor() {
    // Page chrome re-renders on a language switch; the fetch stays in ngOnInit.
    effect(() => {
      this.pageInfoService.updateTitle(this.language.t('FIXED_COSTS.TITLE'));
      this.pageInfoService.updateDescription(this.language.t('FIXED_COSTS.DESCRIPTION'));
      this.pageInfoService.updateBreadcrumbs([
        { title: this.language.t('BREADCRUMB.HOME'), path: '/dashboard', isActive: false },
        { title: this.language.t('BREADCRUMB.OPERATIONS'), path: '', isActive: false },
        { title: this.language.t('FIXED_COSTS.TITLE'), path: '', isActive: true },
      ]);
    });
  }

  ngOnInit(): void {
    this.load();
    this.finance.load().subscribe({ error: () => undefined });

    this.form.controls.monthlyAmount.valueChanges.pipe(takeUntil(this.destroy$)).subscribe(() => this.updateDerivedAmount());
    this.form.controls.monthlyBasis.valueChanges.pipe(takeUntil(this.destroy$)).subscribe(() => this.updateDerivedAmount());

    this.form.controls.calculationMethod.valueChanges
      .pipe(takeUntil(this.destroy$))
      .subscribe((method) => this.onCalculationMethodChange(method));
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  load(): void {
    this.isLoading.set(true);
    this.fixedCostService.getAll({ page: 0, size: 1000, sort: 'name,asc' }).subscribe({
      next: (res) => {
        this.items.set(res.data.content);
        this.isLoading.set(false);
      },
      error: (err) => {
        this.isLoading.set(false);
        this.alertService.error(err?.error?.message || err?.message || this.language.t('FIXED_COSTS.TOAST.LOAD_FAILED'));
      },
    });
  }

  getTypeLabel(type: string): string {
    return COST_TYPE_VALUES.includes(type) ? this.language.t(`FIXED_COSTS.TYPES.${type}`) : type;
  }

  getTypeSeverity(type: string): TagSeverity {
    return TYPE_TAG_SEVERITY[type] ?? 'secondary';
  }

  getCalculationMethodLabel(method: string): string {
    return CALCULATION_METHOD_VALUES.includes(method)
      ? this.language.t(`FIXED_COSTS.METHODS.${method}.LABEL`)
      : method;
  }

  formatAmountDisplay(item: UserFixedCostResponse): string {
    if (item.calculationMethod === 'PERCENTAGE' && item.percentage != null) {
      return `${item.percentage} %`;
    }
    const currency = this.currency();
    const amount = new Intl.NumberFormat(this.language.current(), {
      minimumFractionDigits: currency.decimalPlaces,
      maximumFractionDigits: currency.decimalPlaces,
    }).format(item.defaultAmount);
    const money = currency.symbolPosition === 'AFTER' ? `${amount} ${currency.symbol}` : `${currency.symbol}${amount}`;
    return money + this.perLabel(item.calculationMethod);
  }

  /** "/ h", "/ unidad", "/ lote" — what one amount buys. */
  perLabel(method: string): string {
    return CALCULATION_METHOD_VALUES.includes(method) && method !== 'PERCENTAGE' ? this.language.t(`FIXED_COSTS.PER.${method}`) : '';
  }

  // ─── Monthly helper ───

  /** HOURLY_RATE spreads over hours, FIXED_PER_BATCH over batches, PER_UNIT over units — per month. */
  protected readonly monthlyBasisKey = computed(() => {
    const method = this.selectedMethod();
    return method && method !== 'PERCENTAGE' ? `FIXED_COSTS.MONTHLY.BASIS.${method}` : null;
  });

  private updateDerivedAmount(): void {
    const { monthlyAmount, monthlyBasis } = this.form.getRawValue();
    this.derivedAmount.set(monthlyAmount != null && monthlyBasis ? Math.round((monthlyAmount / monthlyBasis) * 10_000) / 10_000 : null);
  }

  protected applyDerivedAmount(): void {
    const amount = this.derivedAmount();
    if (amount !== null) {
      this.form.controls.defaultAmount.setValue(Math.round(amount * 100) / 100);
      this.form.controls.defaultAmount.markAsDirty();
    }
  }

  // ─── Active flag ───

  protected toggleActive(item: UserFixedCostResponse, isActive: boolean): void {
    if (this.togglingIds().has(item.id)) {
      return;
    }
    this.togglingIds.update((ids) => new Set(ids).add(item.id));
    // Optimistic: the switch moves at once and rolls back on failure.
    this.items.update((list) => list.map((entry) => (entry.id === item.id ? { ...entry, isActive } : entry)));
    const settle = () =>
      this.togglingIds.update((ids) => {
        const next = new Set(ids);
        next.delete(item.id);
        return next;
      });
    this.fixedCostService.setActive(item.id, isActive).subscribe({
      next: () => {
        settle();
        this.lookups.invalidate();
        this.alertService.success(this.language.t('COMMON.STATUS_TOGGLE.SUCCESS'));
      },
      error: (err: unknown) => {
        settle();
        this.items.update((list) => list.map((entry) => (entry.id === item.id ? { ...entry, isActive: item.isActive } : entry)));
        this.alertService.error(catalogErrorMessage(err, this.language.t('COMMON.STATUS_TOGGLE.FAILED')));
      },
    });
  }

  onTypeChange(): void {
    const type = this.form.value.type ?? '';
    this.form.controls.calculationMethod.setValue('');

    const allowed = METHODS_BY_TYPE[type];
    const methods = allowed
      ? CALCULATION_METHOD_VALUES.filter((value) => allowed.includes(value))
      : CALCULATION_METHOD_VALUES;
    this.allowedMethodValues.set(methods);

    if (methods.length === 1) {
      this.form.controls.calculationMethod.setValue(methods[0]);
    }
  }

  private onCalculationMethodChange(method: string | null): void {
    this.selectedMethod.set(method ?? '');
    const percentageControl = this.form.controls.percentage;
    const defaultAmountControl = this.form.controls.defaultAmount;

    if (method === 'PERCENTAGE') {
      this.isPercentageMethod.set(true);
      percentageControl.setValidators([Validators.required, Validators.min(0.1)]);
      defaultAmountControl.clearValidators();
    } else {
      this.isPercentageMethod.set(false);
      percentageControl.clearValidators();
      defaultAmountControl.setValidators([Validators.required, Validators.min(0)]);
    }

    percentageControl.updateValueAndValidity({ emitEvent: false });
    defaultAmountControl.updateValueAndValidity({ emitEvent: false });
  }

  openCreate(): void {
    this.selectedItem.set(null);
    this.form.reset({ appliesByDefault: false });
    this.derivedAmount.set(null);
    this.isPercentageMethod.set(false);
    this.allowedMethodValues.set(CALCULATION_METHOD_VALUES);
    this.form.controls.defaultAmount.setValidators([Validators.required, Validators.min(0)]);
    this.form.controls.defaultAmount.updateValueAndValidity({ emitEvent: false });
    this.form.controls.percentage.clearValidators();
    this.form.controls.percentage.updateValueAndValidity({ emitEvent: false });
    this.showForm.set(true);
  }

  openEdit(item: UserFixedCostResponse): void {
    this.selectedItem.set(item);
    this.form.patchValue({
      name: item.name,
      description: item.description ?? '',
      type: item.type,
      defaultAmount: item.calculationMethod !== 'PERCENTAGE' ? item.defaultAmount : null,
      percentage: item.percentage ?? null,
      calculationMethod: item.calculationMethod,
      appliesByDefault: item.appliesByDefault ?? false,
      monthlyAmount: item.monthlyAmount ?? null,
      monthlyBasis: item.monthlyBasis ?? null,
    });
    // Trigger type-based filtering, then restore the saved method
    this.onTypeChange();
    this.form.controls.calculationMethod.setValue(item.calculationMethod);
    this.showForm.set(true);
  }

  closeForm(): void {
    this.showForm.set(false);
    this.selectedItem.set(null);
  }

  saveForm(): void {
    if (this.form.invalid || this.isSaving()) {
      this.form.markAllAsTouched();
      return;
    }
    this.isSaving.set(true);
    const isEdit = !!this.selectedItem();
    const isPercentage = this.form.value.calculationMethod === 'PERCENTAGE';
    const payload: UserFixedCostRequest = {
      name: this.form.value.name!,
      description: this.form.value.description || undefined,
      type: this.form.value.type!,
      defaultAmount: isPercentage ? undefined : this.form.value.defaultAmount!,
      percentage: isPercentage ? this.form.value.percentage! : undefined,
      calculationMethod: this.form.value.calculationMethod!,
      appliesByDefault: !!this.form.value.appliesByDefault,
      monthlyAmount: isPercentage ? null : (this.form.value.monthlyAmount ?? null),
      monthlyBasis: isPercentage ? null : (this.form.value.monthlyBasis ?? null),
    };

    const request$ = isEdit
      ? this.fixedCostService.update(this.selectedItem()!.id, payload)
      : this.fixedCostService.create(payload);

    request$.subscribe({
      next: () => {
        this.isSaving.set(false);
        this.closeForm();
        this.load();
        // Recipe screens cache the catalog for the session.
        this.lookups.invalidate();
        this.alertService.success(isEdit ? this.language.t('FIXED_COSTS.TOAST.UPDATED') : this.language.t('FIXED_COSTS.TOAST.CREATED'));
      },
      error: (err: unknown) => {
        this.isSaving.set(false);
        this.alertService.error(catalogErrorMessage(err, this.language.t('COMMON.TOAST.SAVE_FAILED')));
      },
    });
  }

  async confirmDelete(item: UserFixedCostResponse): Promise<void> {
    const confirmed = await this.confirmService.confirmDelete(item.name);
    if (!confirmed) {
      return;
    }
    this.fixedCostService.delete(item.id).subscribe({
      next: () => {
        this.load();
        this.lookups.invalidate();
        this.alertService.success(this.language.t('FIXED_COSTS.TOAST.DELETED'));
      },
      error: (err: unknown) => {
        this.alertService.error(catalogErrorMessage(err, this.language.t('COMMON.TOAST.DELETE_FAILED')));
      },
    });
  }
}
