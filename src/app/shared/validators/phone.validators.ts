import { AbstractControl, ValidationErrors, ValidatorFn } from '@angular/forms';
import { CountryCode, parsePhoneNumberFromString, validatePhoneNumberLength } from 'libphonenumber-js/max';

/**
 * Why a phone number was rejected. `libphonenumber-js` length verdicts plus
 * `INVALID` for a number of plausible length that matches no numbering plan
 * (e.g. an unassigned Mexican area code).
 */
export type PhoneInvalidReason = 'TOO_SHORT' | 'TOO_LONG' | 'INVALID_LENGTH' | 'INVALID_COUNTRY' | 'NOT_A_NUMBER' | 'INVALID';

export interface PhoneValidationError {
  phoneInvalid: { reason: PhoneInvalidReason; country: CountryCode | null };
}

/**
 * Validates an E.164 string (`+525512345678`) against the full numbering-plan
 * metadata (`libphonenumber-js/max`) — not just length, so a well-formed but
 * unassigned number is rejected too. Empty values pass; pair it with
 * `Validators.required` when the field is mandatory.
 */
export function phoneNumberValidator(): ValidatorFn {
  return (control: AbstractControl): PhoneValidationError | ValidationErrors | null => {
    const value: unknown = control.value;
    if (typeof value !== 'string' || value.trim() === '') {
      return null;
    }

    const lengthVerdict = validatePhoneNumberLength(value);
    const parsed = parsePhoneNumberFromString(value);
    if (lengthVerdict) {
      return { phoneInvalid: { reason: lengthVerdict, country: parsed?.country ?? null } };
    }
    if (!parsed || !parsed.isValid()) {
      return { phoneInvalid: { reason: 'INVALID', country: parsed?.country ?? null } };
    }
    return null;
  };
}

/** Narrows a control's `phoneInvalid` error payload without an `any` cast. */
export function phoneInvalidReason(errors: ValidationErrors | null | undefined): PhoneInvalidReason | null {
  const payload: unknown = errors?.['phoneInvalid'];
  if (typeof payload === 'object' && payload !== null && 'reason' in payload) {
    const reason = (payload as { reason: unknown }).reason;
    return typeof reason === 'string' ? (reason as PhoneInvalidReason) : null;
  }
  return null;
}
