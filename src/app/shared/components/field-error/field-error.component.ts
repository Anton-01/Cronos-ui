import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { ValidationErrors } from '@angular/forms';

import { TranslatePipe } from '@ngx-translate/core';

import { phoneInvalidReason } from '../../validators/phone.validators';

type TranslationParams = Record<string, string | number>;

interface ResolvedError {
  /** Translation key, or null when `text` carries server-supplied copy. */
  key: string | null;
  params: TranslationParams;
  text: string | null;
}

/**
 * Error keys → translation keys, in priority order: the first key present on
 * the control wins, so a required field never shows "invalid format" too.
 */
const ERROR_KEYS: readonly (readonly [string, string])[] = [
  ['required', 'FORM_ERRORS.REQUIRED'],
  ['minlength', 'FORM_ERRORS.MIN_LENGTH'],
  ['maxlength', 'FORM_ERRORS.MAX_LENGTH'],
  ['email', 'FORM_ERRORS.EMAIL'],
  ['rfcGeneric', 'FORM_ERRORS.RFC_GENERIC'],
  ['rfcFormat', 'FORM_ERRORS.RFC_FORMAT'],
  ['corporateSuffix', 'FORM_ERRORS.CORPORATE_SUFFIX'],
  ['regimeMismatch', 'FORM_ERRORS.REGIME_MISMATCH'],
  ['zipCode', 'FORM_ERRORS.ZIP_CODE'],
  ['duplicate', 'FORM_ERRORS.DUPLICATE'],
];

function lengthParam(errors: ValidationErrors, key: string): TranslationParams {
  const detail: unknown = errors[key];
  if (typeof detail === 'object' && detail !== null && 'requiredLength' in detail) {
    const length = (detail as { requiredLength: unknown }).requiredLength;
    return typeof length === 'number' ? { length } : {};
  }
  return {};
}

function resolve(errors: ValidationErrors): ResolvedError | null {
  // Server-side messages are already localised by the API (Accept-Language).
  for (const serverKey of ['serverValidation', 'duplicate']) {
    const message: unknown = errors[serverKey];
    if (typeof message === 'string' && message.length > 0) {
      return { key: null, params: {}, text: message };
    }
  }

  const phoneReason = phoneInvalidReason(errors);
  if (phoneReason) {
    return { key: `PHONE_INPUT.ERRORS.${phoneReason}`, params: {}, text: null };
  }

  for (const [errorKey, translationKey] of ERROR_KEYS) {
    if (errors[errorKey]) {
      return { key: translationKey, params: lengthParam(errors, errorKey), text: null };
    }
  }
  return { key: 'FORM_ERRORS.INVALID', params: {}, text: null };
}

/**
 * The one message under a form field. Takes the `errors` object rather than
 * the control so OnPush re-renders it: Angular builds a new errors object on
 * every validation run, which is a new input reference.
 */
@Component({
  selector: 'app-field-error',
  standalone: true,
  imports: [TranslatePipe],
  template: `
    @if (visible() && resolved(); as error) {
      <small class="p-error block text-red-500" [attr.id]="id()" role="alert">
        {{ error.text ?? (error.key! | translate: error.params) }}
      </small>
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class FieldErrorComponent {
  readonly errors = input<ValidationErrors | null | undefined>(null);
  /** Usually `control.invalid && (control.touched || control.dirty)`. */
  readonly visible = input(false);
  /** For `aria-describedby` on the field. */
  readonly id = input<string | null>(null);

  protected readonly resolved = computed(() => {
    const errors = this.errors();
    return errors ? resolve(errors) : null;
  });
}
