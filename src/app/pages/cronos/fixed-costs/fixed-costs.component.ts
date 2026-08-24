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
import { SelectModule } from 'primeng/select';
import { TableModule } from 'primeng/table';
import { TagModule } from 'primeng/tag';
import { TextareaModule } from 'primeng/textarea';
import { TooltipModule } from 'primeng/tooltip';

import { UserFixedCostService } from 'src/app/core/services/domain/user-fixed-cost.service';
import { UserFixedCostResponse } from 'src/app/core/models/domain.model';
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
    TooltipModule,
    TableSkeletonRowComponent,
  ],
  templateUrl: './fixed-costs.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class FixedCostsComponent implements OnInit, OnDestroy {
  private readonly fixedCostService = inject(UserFixedCostService);
  private readonly alertService = inject(AlertService);
  private readonly confirmService = inject(ConfirmService);
  private readonly pageInfoService = inject(PageInfoService);
  private readonly language = inject(LanguageService);
  private readonly fb = inject(FormBuilder);
  private readonly destroy$ = new Subject<void>();

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
      return item.percentage + '%';
    }
    return '$' + item.defaultAmount.toFixed(2);
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
    this.form.reset();
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
    const payload = {
      name: this.form.value.name!,
      description: this.form.value.description || undefined,
      type: this.form.value.type!,
      defaultAmount: isPercentage ? undefined : this.form.value.defaultAmount!,
      percentage: isPercentage ? this.form.value.percentage! : undefined,
      calculationMethod: this.form.value.calculationMethod!,
    };

    const request$ = isEdit
      ? this.fixedCostService.update(this.selectedItem()!.id, payload)
      : this.fixedCostService.create(payload);

    request$.subscribe({
      next: () => {
        this.isSaving.set(false);
        this.closeForm();
        this.load();
        this.alertService.success(isEdit ? this.language.t('FIXED_COSTS.TOAST.UPDATED') : this.language.t('FIXED_COSTS.TOAST.CREATED'));
      },
      error: (err) => {
        this.isSaving.set(false);
        this.alertService.error(err?.error?.message || err?.message || this.language.t('COMMON.TOAST.SAVE_FAILED'));
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
        this.alertService.success(this.language.t('FIXED_COSTS.TOAST.DELETED'));
      },
      error: (err) => {
        this.alertService.error(err?.error?.message || err?.message || this.language.t('COMMON.TOAST.DELETE_FAILED'));
      },
    });
  }
}
