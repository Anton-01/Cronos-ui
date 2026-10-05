import { DatePipe, DecimalPipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject, output, signal } from '@angular/core';
import { takeUntilDestroyed, toSignal } from '@angular/core/rxjs-interop';
import { FormBuilder, FormsModule, ReactiveFormsModule, Validators } from '@angular/forms';
import { TranslatePipe } from '@ngx-translate/core';
import { ButtonModule } from 'primeng/button';
import { CardModule } from 'primeng/card';
import { DatePickerModule } from 'primeng/datepicker';
import { DialogModule } from 'primeng/dialog';
import { IconFieldModule } from 'primeng/iconfield';
import { InputIconModule } from 'primeng/inputicon';
import { InputNumberModule } from 'primeng/inputnumber';
import { InputTextModule } from 'primeng/inputtext';
import { MessageModule } from 'primeng/message';
import { SelectButtonModule } from 'primeng/selectbutton';
import { TableModule } from 'primeng/table';
import { TagModule } from 'primeng/tag';
import { TextareaModule } from 'primeng/textarea';
import { TooltipModule } from 'primeng/tooltip';
import { map } from 'rxjs';

import { PERMISSIONS } from 'src/app/core/constants/permissions';
import { TaxFactorType, TaxRateRequest, TaxRateResponse } from 'src/app/core/models/finance.models';
import { AuthorizationService } from 'src/app/core/services/authorization.service';
import { TaxRateService } from 'src/app/core/services/finance/tax-rate.service';
import { LanguageService } from 'src/app/core/services/language.service';
import { catalogErrorMessage, catalogErrors, hasCatalogError } from 'src/app/core/utils/catalog-error.util';
import { FieldErrorComponent } from 'src/app/shared/components/field-error/field-error.component';
import { TableSkeletonRowComponent } from 'src/app/shared/components/table-skeleton-row/table-skeleton-row.component';
import { AlertService } from 'src/app/shared/services/alert.service';
import { ConfirmService } from 'src/app/shared/services/confirm.service';
import {
  FINANCE_NAME_MAX,
  TAX_CODE_PATTERN,
  TAX_RATE_MAX_DECIMALS,
  maxDecimalsValidator,
  validityRangeValidator,
} from 'src/app/shared/validators/finance.validators';
import { fromIsoDate, toIsoDate } from '../../admin/users/user-identity-form';

const PREVIEW_BASE = 1000;

type Validity = 'CURRENT' | 'SCHEDULED' | 'EXPIRED';

/** IVA rates (SAT `c_Impuesto` 002) with validity windows and a single default (doc §10). */
@Component({
  selector: 'app-tax-rate-catalog',
  standalone: true,
  imports: [
    DatePipe,
    DecimalPipe,
    FormsModule,
    ReactiveFormsModule,
    TranslatePipe,
    ButtonModule,
    CardModule,
    DatePickerModule,
    DialogModule,
    IconFieldModule,
    InputIconModule,
    InputNumberModule,
    InputTextModule,
    MessageModule,
    SelectButtonModule,
    TableModule,
    TagModule,
    TextareaModule,
    TooltipModule,
    FieldErrorComponent,
    TableSkeletonRowComponent,
  ],
  templateUrl: './tax-rate-catalog.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class TaxRateCatalogComponent {
  private readonly taxRateService = inject(TaxRateService);
  private readonly authorization = inject(AuthorizationService);
  private readonly alert = inject(AlertService);
  private readonly confirm = inject(ConfirmService);
  private readonly language = inject(LanguageService);
  private readonly fb = inject(FormBuilder);

  readonly defaultsChanged = output<void>();

  protected readonly skeletonRows = Array.from({ length: 4 });
  protected readonly nameMax = FINANCE_NAME_MAX;
  protected readonly maxDecimals = TAX_RATE_MAX_DECIMALS;
  protected readonly previewBase = PREVIEW_BASE;
  protected readonly canManage = computed(() => this.authorization.can(PERMISSIONS.FINANCE_TAX_MANAGE));
  protected readonly canSetDefault = computed(() => this.authorization.can(PERMISSIONS.FINANCE_SETTINGS_UPDATE));

  protected readonly items = signal<TaxRateResponse[]>([]);
  protected readonly loading = signal(true);
  protected readonly search = signal('');
  protected readonly editing = signal<TaxRateResponse | null>(null);
  protected readonly dialogOpen = signal(false);
  protected readonly saving = signal(false);

  protected readonly factorOptions = computed(() => [
    { label: this.language.t('FINANCE.TAX_RATES.FACTOR.TASA'), value: 'TASA' as TaxFactorType },
    { label: this.language.t('FINANCE.TAX_RATES.FACTOR.EXENTO'), value: 'EXENTO' as TaxFactorType },
  ]);

  protected readonly form = this.fb.group(
    {
      code: this.fb.nonNullable.control('', [Validators.required, Validators.pattern(TAX_CODE_PATTERN)]),
      name: this.fb.nonNullable.control('', [Validators.required, Validators.maxLength(FINANCE_NAME_MAX)]),
      description: this.fb.control<string | null>(null, Validators.maxLength(250)),
      factorType: this.fb.nonNullable.control<TaxFactorType>('TASA', Validators.required),
      ratePercent: this.fb.control<number | null>(16, [
        Validators.min(0),
        Validators.max(100),
        maxDecimalsValidator(TAX_RATE_MAX_DECIMALS),
      ]),
      validFrom: this.fb.control<Date | null>(new Date(), Validators.required),
      validTo: this.fb.control<Date | null>(null),
    },
    { validators: [validityRangeValidator('validFrom', 'validTo')] },
  );

  private readonly factor = toSignal(this.form.controls.factorType.valueChanges, { initialValue: this.form.controls.factorType.value });
  private readonly rate = toSignal(this.form.controls.ratePercent.valueChanges.pipe(map((value) => value ?? 0)), { initialValue: 16 });
  protected readonly isExempt = computed(() => this.factor() === 'EXENTO');
  protected readonly previewTax = computed(() => (this.isExempt() ? 0 : (PREVIEW_BASE * this.rate()) / 100));

  protected readonly filtered = computed(() => {
    const term = this.search().trim().toLowerCase();
    return this.items().filter((item) => !term || item.code.toLowerCase().includes(term) || item.name.toLowerCase().includes(term));
  });

  constructor() {
    this.form.controls.factorType.valueChanges.pipe(takeUntilDestroyed()).subscribe(() => this.syncRateControl());
    this.load();
  }

  /** EXENTO carries no rate: clear and lock it. TASA requires one, unless the row is in use (locked). */
  private syncRateControl(): void {
    const rate = this.form.controls.ratePercent;
    const exempt = this.form.controls.factorType.value === 'EXENTO';
    if (exempt) {
      rate.setValue(null, { emitEvent: false });
      rate.removeValidators(Validators.required);
      rate.disable({ emitEvent: false });
    } else {
      rate.addValidators(Validators.required);
      if (this.editing()?.inUse) {
        rate.disable({ emitEvent: false });
      } else {
        rate.enable({ emitEvent: false });
      }
    }
    rate.updateValueAndValidity({ emitEvent: false });
  }

  protected load(): void {
    this.loading.set(true);
    this.taxRateService.search({ page: 0, size: 200 }).subscribe({
      next: (response) => {
        this.items.set(response.data?.content ?? []);
        this.loading.set(false);
      },
      error: (error: unknown) => {
        this.loading.set(false);
        this.alert.error(catalogErrorMessage(error, this.language.t('FINANCE.TAX_RATES.LOAD_FAILED')));
      },
    });
  }

  protected validity(item: TaxRateResponse): Validity {
    const today = toIsoDate(new Date())!;
    if (item.validFrom > today) {
      return 'SCHEDULED';
    }
    return item.validTo !== null && item.validTo < today ? 'EXPIRED' : 'CURRENT';
  }

  protected openCreate(): void {
    this.editing.set(null);
    this.form.enable();
    this.form.reset({ code: '', name: '', description: null, factorType: 'TASA', ratePercent: 16, validFrom: new Date(), validTo: null });
    this.syncRateControl();
    this.dialogOpen.set(true);
  }

  protected openEdit(item: TaxRateResponse): void {
    this.editing.set(item);
    this.form.enable();
    this.form.reset({
      code: item.code,
      name: item.name,
      description: item.description,
      factorType: item.factorType,
      ratePercent: item.ratePercent,
      validFrom: fromIsoDate(item.validFrom),
      validTo: fromIsoDate(item.validTo),
    });
    // A rate already applied to documents is immutable — close it with validTo and create a new one.
    if (item.inUse) {
      this.form.controls.code.disable();
      this.form.controls.factorType.disable();
      this.form.controls.ratePercent.disable();
      this.form.controls.validFrom.disable();
    }
    this.syncRateControl();
    this.dialogOpen.set(true);
  }

  protected uppercaseCode(): void {
    const control = this.form.controls.code;
    control.setValue(control.value.toUpperCase().replace(/[^A-Z0-9_]/g, '_'));
  }

  protected save(): void {
    if (this.saving() || !this.canManage()) {
      return;
    }
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    const value = this.form.getRawValue();
    const current = this.editing();
    const request: TaxRateRequest = {
      code: value.code,
      name: value.name.trim(),
      description: value.description?.trim() || null,
      factorType: value.factorType,
      ratePercent: value.factorType === 'EXENTO' ? null : value.ratePercent,
      validFrom: toIsoDate(value.validFrom)!,
      validTo: toIsoDate(value.validTo),
      ...(current ? { version: current.version } : {}),
    };
    this.saving.set(true);
    const request$ = current ? this.taxRateService.update(current.id, request) : this.taxRateService.create(request);
    request$.subscribe({
      next: () => {
        this.saving.set(false);
        this.dialogOpen.set(false);
        this.alert.success(this.language.t(current ? 'FINANCE.TAX_RATES.UPDATED' : 'FINANCE.TAX_RATES.CREATED', { name: request.name }));
        this.load();
        if (current?.isDefault) {
          this.defaultsChanged.emit();
        }
      },
      error: (error: unknown) => this.onError(error, true),
    });
  }

  protected async setDefault(item: TaxRateResponse): Promise<void> {
    const confirmed = await this.confirm.confirm({
      title: this.language.t('FINANCE.DEFAULT.CONFIRM_TITLE'),
      message: this.language.t('FINANCE.TAX_RATES.DEFAULT_MESSAGE', { name: item.name }),
      icon: 'pi pi-star',
    });
    if (!confirmed) {
      return;
    }
    this.taxRateService.setDefault(item.id, item.version).subscribe({
      next: () => {
        this.alert.success(this.language.t('FINANCE.TAX_RATES.DEFAULT_SET', { name: item.name }));
        this.load();
        this.defaultsChanged.emit();
      },
      error: (error: unknown) => this.onError(error, false),
    });
  }

  protected async toggleStatus(item: TaxRateResponse): Promise<void> {
    const next = item.status === 'ACTIVE' ? 'INACTIVE' : 'ACTIVE';
    const confirmed = await this.confirm.confirm({
      title: this.language.t('COMMON.STATUS_TOGGLE.CONFIRM_TITLE'),
      message: this.language.t('COMMON.STATUS_TOGGLE.CONFIRM_MESSAGE', {
        name: item.name,
        status: this.language.t(next === 'ACTIVE' ? 'COMMON.STATUS.ACTIVE' : 'COMMON.STATUS.INACTIVE'),
      }),
      severity: next === 'INACTIVE' ? 'danger' : 'primary',
    });
    if (!confirmed) {
      return;
    }
    this.taxRateService.changeStatus(item.id, next, item.version).subscribe({
      next: () => {
        this.alert.success(this.language.t('COMMON.STATUS_TOGGLE.SUCCESS'));
        this.load();
      },
      error: (error: unknown) => this.onError(error, false),
    });
  }

  protected async remove(item: TaxRateResponse): Promise<void> {
    const confirmed = await this.confirm.confirmDelete(item.name);
    if (!confirmed) {
      return;
    }
    this.taxRateService.delete(item.id).subscribe({
      next: () => {
        this.alert.success(this.language.t('FINANCE.TAX_RATES.DELETED'));
        this.load();
      },
      error: (error: unknown) => this.onError(error, false),
    });
  }

  private onError(error: unknown, inForm: boolean): void {
    this.saving.set(false);
    if (hasCatalogError(error, 'CONCURRENT_MODIFICATION')) {
      this.alert.warning(this.language.t('IAM.COMMON.CONCURRENT_MODIFICATION'));
      this.dialogOpen.set(false);
      this.load();
      return;
    }
    let applied = false;
    if (inForm) {
      for (const detail of catalogErrors(error)) {
        const control = detail.field ? this.form.get(detail.field) : null;
        if (control) {
          control.setErrors({ serverValidation: detail.message });
          control.markAsTouched();
          applied = true;
        }
      }
    }
    if (!applied) {
      this.alert.error(catalogErrorMessage(error, this.language.t('COMMON.TOAST.SAVE_FAILED')));
    }
  }

  protected showError(name: keyof typeof this.form.controls): boolean {
    const control = this.form.controls[name];
    return control.invalid && (control.touched || control.dirty);
  }
}
