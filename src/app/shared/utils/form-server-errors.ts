import { AbstractControl } from '@angular/forms';

import { apiErrors } from 'src/app/core/utils/api-error.util';

/**
 * Pins field-scoped API errors onto the matching controls.
 *
 * `field` is the request-body path the API rejected (`taxId`,
 * `address.zipCode`) — the same dot path `AbstractControl.get()` accepts, so
 * forms whose shape mirrors the request body need no mapping table.
 *
 * @returns true when at least one error landed on a control, i.e. the caller
 *          should show a summary toast instead of the raw message.
 */
export function applyServerErrors(form: AbstractControl, error: unknown): boolean {
  let applied = false;
  for (const detail of apiErrors(error)) {
    if (!detail.field) {
      continue;
    }
    const control = form.get(detail.field);
    if (!control) {
      continue;
    }
    const key = detail.code === 'DUPLICATE_RESOURCE' ? 'duplicate' : 'serverValidation';
    control.setErrors({ ...(control.errors ?? {}), [key]: detail.message ?? true });
    control.markAsTouched();
    applied = true;
  }
  return applied;
}
