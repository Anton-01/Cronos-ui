import { DecimalPipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, effect, inject, input, model, output, signal, untracked } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { TranslatePipe } from '@ngx-translate/core';
import { ButtonModule } from 'primeng/button';
import { DatePickerModule } from 'primeng/datepicker';
import { DialogModule } from 'primeng/dialog';
import { InputNumberModule } from 'primeng/inputnumber';
import { InputTextModule } from 'primeng/inputtext';
import { MessageModule } from 'primeng/message';
import { SelectModule } from 'primeng/select';
import { map } from 'rxjs';

import { IngredientSummary, PriceImpact } from 'src/app/core/models/kitchen.models';
import { FinanceDefaultsStore } from 'src/app/core/services/finance/finance-defaults.store';
import { IngredientService } from 'src/app/core/services/domain/ingredient.service';
import { LanguageService } from 'src/app/core/services/language.service';
import { catalogErrorMessage, catalogErrors } from 'src/app/core/utils/catalog-error.util';
import { FieldErrorComponent } from 'src/app/shared/components/field-error/field-error.component';
import { AlertService } from 'src/app/shared/services/alert.service';
import { toIsoDate } from '../admin/users/user-identity-form';
import { KitchenLookupsStore, estimateCostPerBaseUnit } from './kitchen-lookups.store';

/** A price jump this large is probably a typo (e.g. 1500 instead of 15.00) — ask before saving. */
const SUSPICIOUS_CHANGE = 0.5;

/**
 * Registers a purchase price for an ingredient. Shows, before saving, the
 * resulting cost per base unit and the change against the current one; after
 * saving, what the price rippled into (recipes recalculated, quotes flagged,
 * recipes now below their margin) — the "never sell at a loss" loop.
 */
@Component({
  selector: 'app-price-dialog',
  standalone: true,
  imports: [
    DecimalPipe,
    ReactiveFormsModule,
    TranslatePipe,
    ButtonModule,
    DatePickerModule,
    DialogModule,
    InputNumberModule,
    InputTextModule,
    MessageModule,
    SelectModule,
    FieldErrorComponent,
  ],
  templateUrl: './price-dialog.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PriceDialogComponent {
  private readonly fb = inject(FormBuilder);
  private readonly ingredients = inject(IngredientService);
  private readonly lookups = inject(KitchenLookupsStore);
  private readonly finance = inject(FinanceDefaultsStore);
  private readonly alert = inject(AlertService);
  private readonly language = inject(LanguageService);

  readonly visible = model(false);
  readonly ingredient = input<IngredientSummary | null>(null);
  readonly densityGPerMl = input<number | null>(null);
  readonly saved = output<PriceImpact>();

  protected readonly today = new Date();
  protected readonly saving = signal(false);
  protected readonly impact = signal<PriceImpact | null>(null);
  protected readonly confirmJump = signal(false);

  protected readonly form = this.fb.group({
    purchaseQuantity: this.fb.control<number | null>(null, [Validators.required, Validators.min(0.0001), Validators.max(1_000_000)]),
    purchaseUnitId: this.fb.control<number | null>(null, Validators.required),
    price: this.fb.control<number | null>(null, [Validators.required, Validators.min(0.01), Validators.max(10_000_000)]),
    currency: this.fb.nonNullable.control('MXN', Validators.required),
    supplier: this.fb.control<string | null>(null, Validators.maxLength(120)),
    pricedAt: this.fb.control<Date | null>(new Date(), Validators.required),
  });

  private readonly value = toSignal(this.form.valueChanges.pipe(map(() => this.form.getRawValue())), {
    initialValue: this.form.getRawValue(),
  });

  protected readonly units = computed(() => {
    const ingredient = this.ingredient();
    return ingredient ? this.lookups.unitsFor(ingredient.baseDimension, !!this.densityGPerMl()) : [];
  });
  protected readonly currencies = computed(() => this.finance.currencyOptions().map((currency) => currency.code));

  protected readonly estimate = computed(() => {
    const ingredient = this.ingredient();
    const value = this.value();
    if (!ingredient) {
      return null;
    }
    const unit = this.units().find((option) => option.id === value.purchaseUnitId);
    return estimateCostPerBaseUnit(value.price, value.purchaseQuantity, unit, ingredient.yieldPercent, ingredient.baseDimension, this.densityGPerMl());
  });

  /** Relative change vs the current cost; `null` when there is nothing to compare. */
  protected readonly change = computed(() => {
    const current = this.ingredient()?.costPerBaseUnit;
    const next = this.estimate();
    return current && next ? (next - current) / current : null;
  });

  protected readonly suspicious = computed(() => Math.abs(this.change() ?? 0) >= SUSPICIOUS_CHANGE);

  /** Cost per kg / L / pz for display — base units are g / ml / pz. */
  protected readonly perDisplayUnit = computed(() => {
    const estimate = this.estimate();
    const dimension = this.ingredient()?.baseDimension;
    if (estimate === null || !dimension) {
      return null;
    }
    return dimension === 'COUNT' ? estimate : estimate * 1000;
  });

  constructor() {
    this.lookups.load().subscribe();
    this.finance.load().subscribe({ error: () => undefined });
    effect(() => {
      if (this.visible()) {
        untracked(() => {
          this.impact.set(null);
          this.confirmJump.set(false);
          this.form.reset({
            purchaseQuantity: null,
            purchaseUnitId: null,
            price: null,
            currency: this.finance.defaultCurrency().code,
            supplier: null,
            pricedAt: new Date(),
          });
        });
      }
    });
  }

  protected save(): void {
    const ingredient = this.ingredient();
    if (!ingredient || this.saving()) {
      return;
    }
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    if (this.suspicious() && !this.confirmJump()) {
      this.confirmJump.set(true);
      return;
    }
    const value = this.form.getRawValue();
    this.saving.set(true);
    this.ingredients
      .registerPrice(ingredient.id, {
        purchaseQuantity: value.purchaseQuantity!,
        purchaseUnitId: value.purchaseUnitId!,
        price: value.price!,
        currency: value.currency,
        supplier: value.supplier?.trim() || null,
        pricedAt: toIsoDate(value.pricedAt)!,
      })
      .subscribe({
        next: (response) => {
          this.saving.set(false);
          if (response.data) {
            this.impact.set(response.data);
            this.saved.emit(response.data);
          }
          this.alert.success(this.language.t('KITCHEN.PRICE.SAVED', { name: ingredient.name }));
        },
        error: (error: unknown) => {
          this.saving.set(false);
          let applied = false;
          for (const detail of catalogErrors(error)) {
            const control = detail.field ? this.form.get(detail.field) : null;
            if (control) {
              control.setErrors({ serverValidation: detail.message });
              control.markAsTouched();
              applied = true;
            }
          }
          if (!applied) {
            this.alert.error(catalogErrorMessage(error, this.language.t('KITCHEN.PRICE.FAILED')));
          }
        },
      });
  }

  protected showError(name: keyof typeof this.form.controls): boolean {
    const control = this.form.controls[name];
    return control.invalid && (control.touched || control.dirty);
  }
}
