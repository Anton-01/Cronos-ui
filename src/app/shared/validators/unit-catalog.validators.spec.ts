import { FormControl, FormGroup } from '@angular/forms';

import { baseUnitMultiplierValidator, codeIdentityValidator, multiplierPrecisionValidator } from './unit-catalog.validators';

describe('unit-catalog validators', () => {
  describe('codeIdentityValidator', () => {
    const validate = codeIdentityValidator();

    it('passes empty values (required is a separate concern)', () => {
      expect(validate(new FormControl(''))).toBeNull();
    });

    it('accepts a leading letter or digit followed by letters/digits/._-', () => {
      expect(validate(new FormControl('KG'))).toBeNull();
      expect(validate(new FormControl('unit_02.a-b'))).toBeNull();
      expect(validate(new FormControl('Ñandú'))).toBeNull();
    });

    it('rejects spaces and a leading separator', () => {
      expect(validate(new FormControl('K G'))).toEqual({ codeIdentityPattern: true });
      expect(validate(new FormControl('_KG'))).toEqual({ codeIdentityPattern: true });
      expect(validate(new FormControl('-KG'))).toEqual({ codeIdentityPattern: true });
    });

    it('is case-sensitive: T and t are different codes, both valid', () => {
      expect(validate(new FormControl('T'))).toBeNull();
      expect(validate(new FormControl('t'))).toBeNull();
    });
  });

  describe('multiplierPrecisionValidator', () => {
    const validate = multiplierPrecisionValidator();

    it('passes empty values (required is a separate concern)', () => {
      expect(validate(new FormControl(null))).toBeNull();
    });

    it('rejects zero and negative factors', () => {
      expect(validate(new FormControl(0))).toEqual({ multiplierPositive: true });
      expect(validate(new FormControl(-1))).toEqual({ multiplierPositive: true });
    });

    it('accepts up to 10 integer and 10 decimal digits', () => {
      expect(validate(new FormControl(1234567890))).toBeNull();
      expect(validate(new FormControl(0.0000000001))).toBeNull();
    });

    it('rejects more than 10 integer or 10 decimal digits', () => {
      expect(validate(new FormControl(12345678901))).toEqual({ multiplierPrecision: true });
      expect(validate(new FormControl(0.00000000001))).toEqual({ multiplierPrecision: true });
    });
  });

  describe('baseUnitMultiplierValidator', () => {
    function form(isBase: boolean, multiplier: number): FormGroup {
      return new FormGroup(
        { isBase: new FormControl(isBase), multiplier: new FormControl(multiplier) },
        { validators: baseUnitMultiplierValidator('isBase', 'multiplier') },
      );
    }

    it('requires exactly 1 when isBase is true', () => {
      const group = form(true, 2.5);
      expect(group.hasError('baseUnitMultiplier')).toBeTrue();
      expect(group.controls['multiplier'].hasError('baseUnitMultiplier')).toBeTrue();
    });

    it('passes when isBase is true and the multiplier is exactly 1', () => {
      const group = form(true, 1);
      expect(group.valid).toBeTrue();
      expect(group.controls['multiplier'].errors).toBeNull();
    });

    it('does not constrain the multiplier when isBase is false', () => {
      const group = form(false, 2.5);
      expect(group.valid).toBeTrue();
    });

    it('clears the pinned error once isBase flips back to false', () => {
      const group = form(true, 2.5);
      expect(group.controls['multiplier'].hasError('baseUnitMultiplier')).toBeTrue();
      group.controls['isBase'].setValue(false);
      group.updateValueAndValidity();
      expect(group.controls['multiplier'].errors).toBeNull();
    });
  });
});
