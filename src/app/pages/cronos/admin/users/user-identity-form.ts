import { AbstractControl, AsyncValidatorFn, FormBuilder, ValidationErrors, Validators } from '@angular/forms';
import { Observable, catchError, map, of, switchMap, timer } from 'rxjs';

import { AppLocale } from 'src/app/core/models/iam.models';
import { IamUserService } from 'src/app/core/services/iam/iam-user.service';

/** Mirrors the server rules in doc §3.2 — keep the two in sync. */
export const USERNAME_PATTERN = /^[a-zA-Z0-9](?:[a-zA-Z0-9._-]{1,48})[a-zA-Z0-9]$/;
export const USERNAME_MIN = 3;
export const USERNAME_MAX = 50;
export const NAME_MAX = 100;
export const EMAIL_MAX = 254;
export const JOB_FIELD_MAX = 100;
export const EMPLOYEE_NUMBER_MAX = 30;
export const EMPLOYEE_NUMBER_PATTERN = /^[A-Za-z0-9-]+$/;

const AVAILABILITY_DEBOUNCE_MS = 400;

/**
 * Async uniqueness check against `GET /iam/users/availability`. Debounced via
 * `timer` (Angular re-runs async validators on every keystroke and cancels the
 * previous one). Network errors resolve as valid — the server re-checks on
 * submit and answers 409 DUPLICATE_RESOURCE, which lands on the field anyway.
 */
export function availabilityValidator(
  service: IamUserService,
  field: 'username' | 'email',
  excludeId: () => string | undefined,
): AsyncValidatorFn {
  return (control: AbstractControl): Observable<ValidationErrors | null> => {
    const value = typeof control.value === 'string' ? control.value.trim() : '';
    if (!value || control.hasError('pattern') || control.hasError('email')) {
      return of(null);
    }
    return timer(AVAILABILITY_DEBOUNCE_MS).pipe(
      switchMap(() =>
        service.checkAvailability(field === 'username' ? value : null, field === 'email' ? value : null, excludeId()),
      ),
      map((response) => {
        const available = field === 'username' ? response.data?.usernameAvailable : response.data?.emailAvailable;
        return available === false ? { taken: true } : null;
      }),
      catchError(() => of(null)),
    );
  };
}

/** Optional text: trims and turns `''` into `null` for the request body. */
export function blankToNull(value: string | null | undefined): string | null {
  const trimmed = value?.trim() ?? '';
  return trimmed.length > 0 ? trimmed : null;
}

/** The identity fields shared by the create wizard and the profile editor. */
export function buildIdentityForm(fb: FormBuilder, service: IamUserService, excludeId: () => string | undefined = () => undefined) {
  return fb.group({
    firstName: fb.nonNullable.control('', [Validators.required, Validators.maxLength(NAME_MAX)]),
    lastName: fb.nonNullable.control('', [Validators.required, Validators.maxLength(NAME_MAX)]),
    username: fb.nonNullable.control('', {
      validators: [
        Validators.required,
        Validators.minLength(USERNAME_MIN),
        Validators.maxLength(USERNAME_MAX),
        Validators.pattern(USERNAME_PATTERN),
      ],
      asyncValidators: [availabilityValidator(service, 'username', excludeId)],
    }),
    email: fb.nonNullable.control('', {
      validators: [Validators.required, Validators.email, Validators.maxLength(EMAIL_MAX)],
      asyncValidators: [availabilityValidator(service, 'email', excludeId)],
    }),
    phoneNumber: fb.control<string | null>(null),
    jobTitle: fb.control<string | null>(null, Validators.maxLength(JOB_FIELD_MAX)),
    department: fb.control<string | null>(null, Validators.maxLength(JOB_FIELD_MAX)),
    employeeNumber: fb.control<string | null>(null, [
      Validators.maxLength(EMPLOYEE_NUMBER_MAX),
      Validators.pattern(EMPLOYEE_NUMBER_PATTERN),
    ]),
    locale: fb.nonNullable.control<AppLocale>('es-MX', Validators.required),
    accessExpiresAt: fb.control<Date | null>(null),
  });
}

export type IdentityForm = ReturnType<typeof buildIdentityForm>;

/** `Date` → `YYYY-MM-DD` in local time (the API reads it as a calendar date). */
export function toIsoDate(date: Date | null): string | null {
  if (!date) {
    return null;
  }
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${date.getFullYear()}-${month}-${day}`;
}

/** `YYYY-MM-DD` → local `Date` (avoids the UTC shift `new Date('2026-10-04')` causes). */
export function fromIsoDate(value: string | null): Date | null {
  if (!value) {
    return null;
  }
  const [year, month, day] = value.slice(0, 10).split('-').map(Number);
  return new Date(year, month - 1, day);
}
