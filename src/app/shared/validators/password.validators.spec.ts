import { FormControl, FormGroup, Validators } from '@angular/forms';

import { passwordChangeValidator } from './password.validators';

describe('passwordChangeValidator', () => {
  function form(current: string, next: string, confirm: string): FormGroup {
    return new FormGroup(
      {
        currentPassword: new FormControl(current),
        newPassword: new FormControl(next, [Validators.minLength(6)]),
        confirmPassword: new FormControl(confirm),
      },
      { validators: passwordChangeValidator('currentPassword', 'newPassword', 'confirmPassword') },
    );
  }

  it('pins passwordMismatch on the confirmation field', () => {
    const group = form('old-secret', 'new-secret', 'new-secreT');
    expect(group.controls['confirmPassword'].hasError('passwordMismatch')).toBeTrue();
  });

  it('pins passwordReuse on the new password field', () => {
    const group = form('same-secret', 'same-secret', 'same-secret');
    expect(group.controls['newPassword'].hasError('passwordReuse')).toBeTrue();
  });

  it('keeps the control’s own errors when clearing its group error', () => {
    const group = form('old-secret', 'short', 'short');
    expect(group.controls['newPassword'].hasError('minlength')).toBeTrue();
    expect(group.controls['newPassword'].hasError('passwordReuse')).toBeFalse();
    expect(group.valid).toBeFalse();
  });

  it('is valid when the new password is distinct and confirmed', () => {
    expect(form('old-secret', 'new-secret', 'new-secret').valid).toBeTrue();
  });
});
