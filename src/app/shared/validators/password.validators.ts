import { AbstractControl, ValidationErrors, ValidatorFn } from '@angular/forms';

/**
 * Group-level password rules for a change-password form. Errors are also
 * pinned to the control the user must fix, so they render under that field:
 * - `passwordMismatch` on the confirmation when it differs from the new password;
 * - `passwordReuse` on the new password when it equals the current one.
 */
export function passwordChangeValidator(currentKey: string, newKey: string, confirmKey: string): ValidatorFn {
  return (group: AbstractControl): ValidationErrors | null => {
    const current = group.get(currentKey);
    const next = group.get(newKey);
    const confirm = group.get(confirmKey);
    if (!current || !next || !confirm) {
      return null;
    }

    const mismatch = !!confirm.value && confirm.value !== next.value;
    const reuse = !!next.value && next.value === current.value;

    toggleError(confirm, 'passwordMismatch', mismatch);
    toggleError(next, 'passwordReuse', reuse);

    if (!mismatch && !reuse) {
      return null;
    }
    return { ...(mismatch ? { passwordMismatch: true } : {}), ...(reuse ? { passwordReuse: true } : {}) };
  };
}

function toggleError(control: AbstractControl, key: string, active: boolean): void {
  const errors: ValidationErrors = { ...(control.errors ?? {}) };
  if (active) {
    errors[key] = true;
  } else {
    delete errors[key];
  }
  control.setErrors(Object.keys(errors).length > 0 ? errors : null);
}
