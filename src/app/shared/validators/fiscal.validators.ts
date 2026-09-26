import { AbstractControl, ValidationErrors, ValidatorFn } from '@angular/forms';

import { findTaxRegime } from 'src/app/core/constants/sat-catalogs';
import { TaxpayerType } from 'src/app/core/models';

/**
 * Validators for Mexican fiscal data (SAT / CFDI 4.0). Each returns a single,
 * named error key so templates can map it to one translated message.
 */

// Persona física: 4 letters + YYMMDD + 3-char homoclave (last one digit or 'A').
const RFC_INDIVIDUAL = /^[A-ZÑ&]{4}(\d{2})(\d{2})(\d{2})[A-Z\d]{2}[A\d]$/;
// Persona moral: 3 letters + YYMMDD + homoclave.
const RFC_LEGAL_ENTITY = /^[A-ZÑ&]{3}(\d{2})(\d{2})(\d{2})[A-Z\d]{2}[A\d]$/;

/** SAT generic RFCs — valid on a receipt for the public, never as someone's own fiscal identity. */
const GENERIC_RFCS: ReadonlySet<string> = new Set(['XAXX010101000', 'XEXX010101000']);

/** Five digits, first two a real SAT zone (01–99). */
const MX_ZIP_CODE = /^(0[1-9]|[1-9]\d)\d{3}$/;

/**
 * CFDI 4.0 requires the legal name exactly as on the Constancia de Situación
 * Fiscal, which omits the corporate regime ("S.A. DE C.V.", "S. DE R.L.", …).
 */
const CORPORATE_REGIME_SUFFIX =
  /[\s,]+(S\.?\s*A\.?\s*P?\.?\s*I?\.?(\s*DE\s+C\.?\s*V\.?)?|S\.?\s*DE\s+R\.?\s*L\.?(\s*DE\s+C\.?\s*V\.?)?|S\.?\s*A\.?\s*S\.?|S\.?\s*C\.?|A\.?\s*C\.?|S\.?\s*C\.?\s*DE\s+R\.?\s*L\.?)\s*$/i;

function normalizedRfc(value: unknown): string {
  return typeof value === 'string' ? value.trim().toUpperCase() : '';
}

function isRealDate(yy: string, mm: string, dd: string): boolean {
  const month = Number(mm);
  const day = Number(dd);
  if (month < 1 || month > 12 || day < 1) {
    return false;
  }
  // Two-digit year: century is ambiguous, but a year divisible by 4 is a leap
  // year in both 19xx and 20xx except 1900, which no living taxpayer has.
  const year = 2000 + Number(yy);
  return day <= new Date(year, month, 0).getDate();
}

/** The taxpayer type an RFC encodes, or null when it matches neither shape. */
export function taxpayerTypeOf(rfc: unknown): TaxpayerType | null {
  const value = normalizedRfc(rfc);
  const individual = RFC_INDIVIDUAL.exec(value);
  if (individual && isRealDate(individual[1], individual[2], individual[3])) {
    return 'INDIVIDUAL';
  }
  const legalEntity = RFC_LEGAL_ENTITY.exec(value);
  if (legalEntity && isRealDate(legalEntity[1], legalEntity[2], legalEntity[3])) {
    return 'LEGAL_ENTITY';
  }
  return null;
}

/** `rfcFormat` for a malformed RFC, `rfcGeneric` for the SAT public-sale placeholders. */
export function rfcValidator(): ValidatorFn {
  return (control: AbstractControl): ValidationErrors | null => {
    const value = normalizedRfc(control.value);
    if (!value) {
      return null;
    }
    if (GENERIC_RFCS.has(value)) {
      return { rfcGeneric: true };
    }
    return taxpayerTypeOf(value) ? null : { rfcFormat: true };
  };
}

export function mexicanZipCodeValidator(): ValidatorFn {
  return (control: AbstractControl): ValidationErrors | null => {
    const value = typeof control.value === 'string' ? control.value.trim() : '';
    return !value || MX_ZIP_CODE.test(value) ? null : { zipCode: true };
  };
}

export function legalNameValidator(): ValidatorFn {
  return (control: AbstractControl): ValidationErrors | null => {
    const value = typeof control.value === 'string' ? control.value.trim() : '';
    return value && CORPORATE_REGIME_SUFFIX.test(value) ? { corporateSuffix: true } : null;
  };
}

/**
 * Group-level: the chosen regime must be one SAT allows for the taxpayer type
 * the RFC encodes. The error is also pinned onto the regime control so it
 * renders under the field that has to change.
 */
export function taxRegimeMatchesRfcValidator(taxIdKey: string, taxRegimeKey: string): ValidatorFn {
  return (group: AbstractControl): ValidationErrors | null => {
    const taxIdControl = group.get(taxIdKey);
    const regimeControl = group.get(taxRegimeKey);
    if (!taxIdControl || !regimeControl) {
      return null;
    }

    const taxpayerType = taxpayerTypeOf(taxIdControl.value);
    const regime = findTaxRegime(regimeControl.value as string | null);
    const mismatch = taxpayerType !== null && regime !== undefined && !regime.appliesTo.includes(taxpayerType);

    const { regimeMismatch: _stale, ...otherErrors } = regimeControl.errors ?? {};
    if (mismatch) {
      regimeControl.setErrors({ ...otherErrors, regimeMismatch: true });
      return { regimeMismatch: true };
    }
    regimeControl.setErrors(Object.keys(otherErrors).length > 0 ? otherErrors : null);
    return null;
  };
}
