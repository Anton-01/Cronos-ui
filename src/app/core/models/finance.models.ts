/**
 * Finance settings contracts — `/api/v1/finance/**`.
 *
 * Mirrors `docs/api/iam-and-finance.md` §9–§11. **Change the two together.**
 * V8 envelope (`ApiEnvelope<T>` / `CatalogPage<T>`).
 *
 * Exactly one ACTIVE currency and one ACTIVE tax rate are flagged
 * `isDefault`; every amount the platform calculates (recipes, quotes,
 * fixed costs) uses them unless the document overrides them explicitly.
 */

import { UserRef } from './iam.models';

export type FinanceRecordStatus = 'ACTIVE' | 'INACTIVE';

// ─── Currencies (ISO 4217) ───

export type SymbolPosition = 'BEFORE' | 'AFTER';

export interface CurrencyResponse {
  id: number;
  /** ISO 4217 alpha-3, uppercase (`MXN`). Immutable once in use. */
  code: string;
  /** ISO 4217 numeric, 3 digits (`484`). */
  numericCode: string;
  name: string;
  symbol: string;
  /** Minor units, 0–4 (MXN 2, JPY 0, CLF 4). */
  decimalPlaces: number;
  symbolPosition: SymbolPosition;
  isDefault: boolean;
  /** Referenced by at least one quote/recipe/cost: code and decimals are locked. */
  inUse: boolean;
  status: FinanceRecordStatus;
  createdAt: string;
  updatedAt: string | null;
  updatedBy: UserRef | null;
  version: number;
}

export interface CurrencyRequest {
  code: string;
  numericCode: string;
  name: string;
  symbol: string;
  decimalPlaces: number;
  symbolPosition: SymbolPosition;
  version?: number;
}

/** `GET /finance/currencies/catalog` — ACTIVE rows only, for pickers. */
export interface CurrencyOption {
  id: number;
  code: string;
  name: string;
  symbol: string;
  decimalPlaces: number;
  symbolPosition: SymbolPosition;
  isDefault: boolean;
}

// ─── Tax rates (IVA — SAT CFDI 4.0) ───

/** SAT `c_TipoFactor`. `EXENTO` carries no rate. */
export type TaxFactorType = 'TASA' | 'EXENTO';

export interface TaxRateResponse {
  id: number;
  /** Upper snake, e.g. `IVA_16`. */
  code: string;
  name: string;
  description: string | null;
  /** SAT `c_Impuesto` — always `002` (IVA) for this catalog. */
  satTaxCode: string;
  factorType: TaxFactorType;
  /** Percent, 0–100, up to 4 decimals. `null` iff `factorType === 'EXENTO'`. */
  ratePercent: number | null;
  /** ISO date. */
  validFrom: string;
  /** ISO date, inclusive. `null` = open-ended. */
  validTo: string | null;
  isDefault: boolean;
  inUse: boolean;
  status: FinanceRecordStatus;
  createdAt: string;
  updatedAt: string | null;
  updatedBy: UserRef | null;
  version: number;
}

export interface TaxRateRequest {
  code: string;
  name: string;
  description: string | null;
  factorType: TaxFactorType;
  ratePercent: number | null;
  validFrom: string;
  validTo: string | null;
  version?: number;
}

export interface TaxRateOption {
  id: number;
  code: string;
  name: string;
  factorType: TaxFactorType;
  ratePercent: number | null;
  isDefault: boolean;
}

// ─── Calculation settings (singleton) ───

export type RoundingMode = 'HALF_UP' | 'HALF_EVEN' | 'UP' | 'DOWN';

export interface FinanceSettings {
  defaultCurrency: CurrencyOption;
  defaultTaxRate: TaxRateOption;
  /** `true` = entered prices already include tax and the tax is broken out of them. */
  pricesIncludeTax: boolean;
  roundingMode: RoundingMode;
  updatedAt: string | null;
  updatedBy: UserRef | null;
  version: number;
}

export interface FinanceSettingsRequest {
  pricesIncludeTax: boolean;
  roundingMode: RoundingMode;
  version: number;
}

export interface FinanceCatalogQuery {
  page: number;
  size: number;
  sort?: string;
  search?: string;
  status?: FinanceRecordStatus;
}

export interface SetDefaultRequest {
  version: number;
}
