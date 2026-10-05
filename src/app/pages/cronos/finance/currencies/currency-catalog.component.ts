import { ChangeDetectionStrategy, Component, computed, inject, output, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { FormBuilder, FormsModule, ReactiveFormsModule, Validators } from '@angular/forms';
import { TranslatePipe } from '@ngx-translate/core';
import { ButtonModule } from 'primeng/button';
import { CardModule } from 'primeng/card';
import { DialogModule } from 'primeng/dialog';
import { IconFieldModule } from 'primeng/iconfield';
import { InputIconModule } from 'primeng/inputicon';
import { InputNumberModule } from 'primeng/inputnumber';
import { InputTextModule } from 'primeng/inputtext';
import { MessageModule } from 'primeng/message';
import { SelectButtonModule } from 'primeng/selectbutton';
import { TableModule } from 'primeng/table';
import { TagModule } from 'primeng/tag';
import { TooltipModule } from 'primeng/tooltip';
import { map } from 'rxjs';

import { PERMISSIONS } from 'src/app/core/constants/permissions';
import { CurrencyRequest, CurrencyResponse, SymbolPosition } from 'src/app/core/models/finance.models';
import { AuthorizationService } from 'src/app/core/services/authorization.service';
import { CurrencyService } from 'src/app/core/services/finance/currency.service';
import { LanguageService } from 'src/app/core/services/language.service';
import { catalogErrorMessage, catalogErrors, hasCatalogError } from 'src/app/core/utils/catalog-error.util';
import { FieldErrorComponent } from 'src/app/shared/components/field-error/field-error.component';
import { TableSkeletonRowComponent } from 'src/app/shared/components/table-skeleton-row/table-skeleton-row.component';
import { AlertService } from 'src/app/shared/services/alert.service';
import { ConfirmService } from 'src/app/shared/services/confirm.service';
import { formatMoney } from 'src/app/shared/utils/money-format.util';
import {
  CURRENCY_CODE_PATTERN,
  CURRENCY_NUMERIC_PATTERN,
  CURRENCY_SYMBOL_MAX,
  FINANCE_NAME_MAX,
} from 'src/app/shared/validators/finance.validators';

const PREVIEW_AMOUNT = 1234567.891;

/** ISO 4217 currency catalog with a single tenant default (doc §9). */
@Component({
  selector: 'app-currency-catalog',
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
    SelectButtonModule,
    TableModule,
    TagModule,
    TooltipModule,
    FieldErrorComponent,
    TableSkeletonRowComponent,
  ],
  templateUrl: './currency-catalog.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CurrencyCatalogComponent {
  private readonly currencyService = inject(CurrencyService);
  private readonly authorization = inject(AuthorizationService);
  private readonly alert = inject(AlertService);
  private readonly confirm = inject(ConfirmService);
  private readonly language = inject(LanguageService);
  private readonly fb = inject(FormBuilder);

  /** Fired after a default change so the shell refreshes the app-wide defaults store. */
  readonly defaultsChanged = output<void>();

  protected readonly skeletonRows = Array.from({ length: 5 });
  protected readonly nameMax = FINANCE_NAME_MAX;
  protected readonly symbolMax = CURRENCY_SYMBOL_MAX;
  protected readonly canManage = computed(() => this.authorization.can(PERMISSIONS.FINANCE_CURRENCY_MANAGE));
  protected readonly canSetDefault = computed(() => this.authorization.can(PERMISSIONS.FINANCE_SETTINGS_UPDATE));

  protected readonly items = signal<CurrencyResponse[]>([]);
  protected readonly loading = signal(true);
  protected readonly search = signal('');
  protected readonly editing = signal<CurrencyResponse | null>(null);
  protected readonly dialogOpen = signal(false);
  protected readonly saving = signal(false);

  protected readonly positionOptions = computed(() => [
    { label: this.language.t('FINANCE.CURRENCIES.POSITION.BEFORE'), value: 'BEFORE' as SymbolPosition },
    { label: this.language.t('FINANCE.CURRENCIES.POSITION.AFTER'), value: 'AFTER' as SymbolPosition },
  ]);

  protected readonly form = this.fb.nonNullable.group({
    code: ['', [Validators.required, Validators.pattern(CURRENCY_CODE_PATTERN)]],
    numericCode: ['', [Validators.required, Validators.pattern(CURRENCY_NUMERIC_PATTERN)]],
    name: ['', [Validators.required, Validators.maxLength(FINANCE_NAME_MAX)]],
    symbol: ['', [Validators.required, Validators.maxLength(CURRENCY_SYMBOL_MAX)]],
    decimalPlaces: [2, [Validators.required, Validators.min(0), Validators.max(4)]],
    symbolPosition: ['BEFORE' as SymbolPosition, Validators.required],
  });

  private readonly formValue = toSignal(this.form.valueChanges.pipe(map(() => this.form.getRawValue())), {
    initialValue: this.form.getRawValue(),
  });
  protected readonly preview = computed(() => {
    const value = this.formValue();
    return formatMoney(
      PREVIEW_AMOUNT,
      { symbol: value.symbol || '¤', decimalPlaces: value.decimalPlaces ?? 2, symbolPosition: value.symbolPosition },
      this.language.current(),
    );
  });

  protected readonly filtered = computed(() => {
    const term = this.search().trim().toLowerCase();
    return this.items().filter(
      (item) => !term || item.code.toLowerCase().includes(term) || item.name.toLowerCase().includes(term),
    );
  });

  constructor() {
    this.load();
  }

  protected load(): void {
    this.loading.set(true);
    this.currencyService.search({ page: 0, size: 200 }).subscribe({
      next: (response) => {
        this.items.set(response.data?.content ?? []);
        this.loading.set(false);
      },
      error: (error: unknown) => {
        this.loading.set(false);
        this.alert.error(catalogErrorMessage(error, this.language.t('FINANCE.CURRENCIES.LOAD_FAILED')));
      },
    });
  }

  protected format(item: CurrencyResponse): string {
    return formatMoney(PREVIEW_AMOUNT, item, this.language.current());
  }

  protected openCreate(): void {
    this.editing.set(null);
    this.form.reset({ code: '', numericCode: '', name: '', symbol: '$', decimalPlaces: 2, symbolPosition: 'BEFORE' });
    this.form.enable();
    this.dialogOpen.set(true);
  }

  protected openEdit(item: CurrencyResponse): void {
    this.editing.set(item);
    this.form.reset({
      code: item.code,
      numericCode: item.numericCode,
      name: item.name,
      symbol: item.symbol,
      decimalPlaces: item.decimalPlaces,
      symbolPosition: item.symbolPosition,
    });
    this.form.enable();
    // Amounts already stored in this currency depend on its code and minor units.
    if (item.inUse) {
      this.form.controls.code.disable();
      this.form.controls.numericCode.disable();
      this.form.controls.decimalPlaces.disable();
    }
    this.dialogOpen.set(true);
  }

  protected uppercase(name: 'code'): void {
    const control = this.form.controls[name];
    control.setValue(control.value.toUpperCase().trim());
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
    const request: CurrencyRequest = {
      code: value.code.toUpperCase(),
      numericCode: value.numericCode,
      name: value.name.trim(),
      symbol: value.symbol.trim(),
      decimalPlaces: value.decimalPlaces,
      symbolPosition: value.symbolPosition,
      ...(current ? { version: current.version } : {}),
    };
    this.saving.set(true);
    const request$ = current ? this.currencyService.update(current.id, request) : this.currencyService.create(request);
    request$.subscribe({
      next: () => {
        this.saving.set(false);
        this.dialogOpen.set(false);
        this.alert.success(this.language.t(current ? 'FINANCE.CURRENCIES.UPDATED' : 'FINANCE.CURRENCIES.CREATED', { code: request.code }));
        this.load();
        if (current?.isDefault) {
          this.defaultsChanged.emit();
        }
      },
      error: (error: unknown) => this.onError(error, true),
    });
  }

  protected async setDefault(item: CurrencyResponse): Promise<void> {
    const confirmed = await this.confirm.confirm({
      title: this.language.t('FINANCE.DEFAULT.CONFIRM_TITLE'),
      message: this.language.t('FINANCE.CURRENCIES.DEFAULT_MESSAGE', { code: item.code, name: item.name }),
      icon: 'pi pi-star',
    });
    if (!confirmed) {
      return;
    }
    this.currencyService.setDefault(item.id, item.version).subscribe({
      next: () => {
        this.alert.success(this.language.t('FINANCE.CURRENCIES.DEFAULT_SET', { code: item.code }));
        this.load();
        this.defaultsChanged.emit();
      },
      error: (error: unknown) => this.onError(error, false),
    });
  }

  protected async toggleStatus(item: CurrencyResponse): Promise<void> {
    const next = item.status === 'ACTIVE' ? 'INACTIVE' : 'ACTIVE';
    const confirmed = await this.confirm.confirm({
      title: this.language.t('COMMON.STATUS_TOGGLE.CONFIRM_TITLE'),
      message: this.language.t('COMMON.STATUS_TOGGLE.CONFIRM_MESSAGE', {
        name: item.code,
        status: this.language.t(next === 'ACTIVE' ? 'COMMON.STATUS.ACTIVE' : 'COMMON.STATUS.INACTIVE'),
      }),
      severity: next === 'INACTIVE' ? 'danger' : 'primary',
    });
    if (!confirmed) {
      return;
    }
    this.currencyService.changeStatus(item.id, next, item.version).subscribe({
      next: () => {
        this.alert.success(this.language.t('COMMON.STATUS_TOGGLE.SUCCESS'));
        this.load();
      },
      error: (error: unknown) => this.onError(error, false),
    });
  }

  protected async remove(item: CurrencyResponse): Promise<void> {
    const confirmed = await this.confirm.confirmDelete(`${item.code} · ${item.name}`);
    if (!confirmed) {
      return;
    }
    this.currencyService.delete(item.id).subscribe({
      next: () => {
        this.alert.success(this.language.t('FINANCE.CURRENCIES.DELETED'));
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
