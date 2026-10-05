import { AbstractControl, ValidationErrors, ValidatorFn } from '@angular/forms';

/** ISO 4217 alpha-3. */
export const CURRENCY_CODE_PATTERN = /^[A-Z]{3}$/;
/** ISO 4217 numeric. */
export const CURRENCY_NUMERIC_PATTERN = /^\d{3}$/;
export const TAX_CODE_PATTERN = /^[A-Z][A-Z0-9_]{1,29}$/;
export const FINANCE_NAME_MAX = 60;
export const CURRENCY_SYMBOL_MAX = 5;
export const TAX_RATE_MAX_DECIMALS = 4;

/** At most `max` digits after the decimal point. */
export function maxDecimalsValidator(max: number): ValidatorFn {
  return (control: AbstractControl): ValidationErrors | null => {
    const value = control.value as number | null;
    if (value === null || value === undefined || Number.isNaN(value)) {
      return null;
    }
    const [, decimals = ''] = String(value).split('.');
    return decimals.length > max ? { maxDecimals: { max } } : null;
  };
}

/** Group validator: `validTo` (when set) must not precede `validFrom`. */
export function validityRangeValidator(fromKey: string, toKey: string): ValidatorFn {
  return (group: AbstractControl): ValidationErrors | null => {
    const from = group.get(fromKey)?.value as Date | null;
    const to = group.get(toKey)?.value as Date | null;
    return from && to && to.getTime() < from.getTime() ? { validityRange: true } : null;
  };
}
