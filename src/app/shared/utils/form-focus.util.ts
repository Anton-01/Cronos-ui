/**
 * Moves focus to the first invalid control inside `formElement` — called
 * after `markAllAsTouched()` on a rejected submit, so a screen-reader user
 * (and anyone who scrolled past the field) lands exactly where the fix is
 * needed instead of on a dialog that just silently stopped saving.
 */
export function focusFirstInvalidControl(formElement: HTMLFormElement | null | undefined): void {
  const firstInvalid = formElement?.querySelector<HTMLElement>('.ng-invalid[formcontrolname], .ng-invalid input, .ng-invalid');
  firstInvalid?.focus();
}
