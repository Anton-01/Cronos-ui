import { AbstractControl, ValidationErrors, ValidatorFn } from '@angular/forms';

/**
 * Validators for the unit-type / measurement-unit forms. Each returns a
 * single, named error key so templates can map it to one translated message.
 */

/** Unicode letter/digit, then letters/digits/`._-`, no spaces. Shared by both `codeIdentity` fields. */
export const CODE_IDENTITY_PATTERN = /^[\p{L}\p{N}][\p{L}\p{N}._-]*$/u;

export const CODE_IDENTITY_MAX_LENGTH = 20;

export function codeIdentityValidator(): ValidatorFn {
  return (control: AbstractControl): ValidationErrors | null => {
    const value: unknown = control.value;
    if (typeof value !== 'string' || value.length === 0) {
      return null;
    }
    return CODE_IDENTITY_PATTERN.test(value) ? null : { codeIdentityPattern: true };
  };
}

/**
 * At most `maxIntegerDigits` digits before the point and `maxDecimalDigits`
 * after it. Deliberately not `Math.abs(value).toString()`: below 1e-6 that
 * switches to exponential notation ("1e-11"), which has no decimal part to
 * count at all — `toFixed` keeps every magnitude in plain decimal.
 */
function exceedsPrecision(value: number, maxIntegerDigits: number, maxDecimalDigits: number): boolean {
  const [integerPart, decimalPart = ''] = Math.abs(value).toFixed(20).split('.');
  const significantDecimals = decimalPart.replace(/0+$/, '');
  return integerPart.length > maxIntegerDigits || significantDecimals.length > maxDecimalDigits;
}

/**
 * `multiplierToBase`: strictly positive, at most 10 integer and 10 decimal
 * digits. `Validators.min` alone would accept `0`, which the backend rejects.
 */
export function multiplierPrecisionValidator(): ValidatorFn {
  return (control: AbstractControl): ValidationErrors | null => {
    const value: unknown = control.value;
    if (value === null || value === undefined || value === '') {
      return null;
    }
    const num = typeof value === 'number' ? value : Number(value);
    if (Number.isNaN(num)) {
      return null;
    }
    if (num <= 0) {
      return { multiplierPositive: true };
    }
    return exceedsPrecision(num, 10, 10) ? { multiplierPrecision: true } : null;
  };
}

/**
 * Cross-field: a base unit's factor is fixed at `1` — pins the error on the
 * multiplier control so it renders next to the field the user needs to fix,
 * the same convention `taxRegimeMatchesRfcValidator` uses.
 */
export function baseUnitMultiplierValidator(isBaseControlName: string, multiplierControlName: string): ValidatorFn {
  return (group: AbstractControl): ValidationErrors | null => {
    const isBase: unknown = group.get(isBaseControlName)?.value;
    const multiplierControl = group.get(multiplierControlName);
    if (!multiplierControl) {
      return null;
    }

    const otherErrors = withoutKey(multiplierControl.errors, 'baseUnitMultiplier');
    if (isBase === true && multiplierControl.value !== 1) {
      multiplierControl.setErrors({ ...otherErrors, baseUnitMultiplier: true });
      return { baseUnitMultiplier: true };
    }

    multiplierControl.setErrors(Object.keys(otherErrors).length > 0 ? otherErrors : null);
    return null;
  };
}

function withoutKey(errors: ValidationErrors | null, key: string): ValidationErrors {
  if (!errors) {
    return {};
  }
  const { [key]: _removed, ...rest } = errors;
  return rest;
}
