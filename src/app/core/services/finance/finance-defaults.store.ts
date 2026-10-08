import { HttpClient } from '@angular/common/http';
import { Injectable, computed, inject, signal } from '@angular/core';
import { Observable, forkJoin, map, of, tap } from 'rxjs';

import { environment } from 'src/environments/environment';
import {
  CurrencyOption,
  FinanceSettings,
  FinanceSettingsRequest,
  TaxRateOption,
} from '../../models/finance.models';
import { ApiEnvelope } from '../../models/unit-catalog.models';
import { CurrencyService } from './currency.service';
import { TaxRateService } from './tax-rate.service';

/** Used only until `/finance/settings` answers, or if it fails: the platform's historical behaviour. */
const FALLBACK_CURRENCY: CurrencyOption = {
  id: 0,
  code: 'MXN',
  name: 'Peso mexicano',
  symbol: '$',
  decimalPlaces: 2,
  symbolPosition: 'BEFORE',
  isDefault: true,
};

/**
 * App-wide cache of the finance defaults every calculation starts from
 * (doc §11). Quote and recipe forms read `defaultCurrency()` /
 * `defaultTaxPercent()` instead of hardcoding `MXN` / `0`.
 *
 * `load()` is idempotent; `refresh()` is called by the finance settings page
 * after a default changes so open forms pick it up without a reload.
 */
@Injectable({ providedIn: 'root' })
export class FinanceDefaultsStore {
  private readonly API = `${environment.apiUrl}/finance/settings`;
  private readonly http = inject(HttpClient);
  private readonly currencyService = inject(CurrencyService);
  private readonly taxRateService = inject(TaxRateService);

  private readonly state = signal<FinanceSettings | null>(null);
  private readonly currencyOptionsState = signal<CurrencyOption[]>([]);
  private readonly taxRateOptionsState = signal<TaxRateOption[]>([]);
  private loaded = false;

  readonly settings = this.state.asReadonly();
  readonly currencyOptions = this.currencyOptionsState.asReadonly();
  readonly taxRateOptions = this.taxRateOptionsState.asReadonly();

  readonly defaultCurrency = computed<CurrencyOption>(() => this.state()?.defaultCurrency ?? FALLBACK_CURRENCY);
  readonly defaultTaxRate = computed<TaxRateOption | null>(() => this.state()?.defaultTaxRate ?? null);
  /** `EXENTO` and "no default" both calculate as 0 %. */
  readonly defaultTaxPercent = computed<number>(() => this.defaultTaxRate()?.ratePercent ?? 0);
  readonly pricesIncludeTax = computed<boolean>(() => this.state()?.pricesIncludeTax ?? false);

  /** Loads settings + picker options once per session. Errors leave the fallbacks in place. */
  load(): Observable<void> {
    if (this.loaded) {
      return of(undefined);
    }
    return this.refresh();
  }

  refresh(): Observable<void> {
    return forkJoin({
      settings: this.http.get<ApiEnvelope<FinanceSettings>>(this.API),
      currencies: this.currencyService.options(),
      taxRates: this.taxRateService.options(),
    }).pipe(
      tap(({ settings, currencies, taxRates }) => {
        this.state.set(settings.data);
        this.currencyOptionsState.set(currencies.data ?? []);
        this.taxRateOptionsState.set(taxRates.data ?? []);
        this.loaded = true;
      }),
      map(() => undefined),
    );
  }

  updateSettings(request: FinanceSettingsRequest): Observable<FinanceSettings | null> {
    return this.http.put<ApiEnvelope<FinanceSettings>>(this.API, request).pipe(
      map((response) => response.data),
      tap((settings) => {
        if (settings) {
          this.state.set(settings);
        }
      }),
    );
  }

  /** Decimal places for a currency code, falling back to the default currency's. */
  decimalsFor(code: string | null | undefined): number {
    const option = this.currencyOptionsState().find((currency) => currency.code === code);
    return option?.decimalPlaces ?? this.defaultCurrency().decimalPlaces;
  }
}
