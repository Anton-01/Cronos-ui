import { FormControl } from '@angular/forms';

import { phoneInvalidReason, phoneNumberValidator } from './phone.validators';

describe('phoneNumberValidator', () => {
  const validate = phoneNumberValidator();

  it('passes empty values', () => {
    expect(validate(new FormControl(null))).toBeNull();
    expect(validate(new FormControl(''))).toBeNull();
  });

  it('accepts valid E.164 numbers for different countries', () => {
    expect(validate(new FormControl('+525512345678'))).toBeNull();
    expect(validate(new FormControl('+14155552671'))).toBeNull();
  });

  it('reports why a number was rejected', () => {
    expect(phoneInvalidReason(validate(new FormControl('+5255')))).toBe('TOO_SHORT');
    expect(phoneInvalidReason(validate(new FormControl('+5255123456789012')))).toBe('TOO_LONG');
  });

  it('rejects a well-formed length that no numbering plan assigns', () => {
    // US area codes never start with 0 or 1.
    expect(phoneInvalidReason(validate(new FormControl('+10155552671')))).toBe('INVALID');
  });
});
