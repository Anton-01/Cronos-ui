import { FormControl, FormGroup } from '@angular/forms';

import {
  legalNameValidator,
  mexicanZipCodeValidator,
  rfcValidator,
  taxRegimeMatchesRfcValidator,
  taxpayerTypeOf,
} from './fiscal.validators';

describe('fiscal validators', () => {
  describe('taxpayerTypeOf', () => {
    it('reads a 13-char RFC as an individual and a 12-char RFC as a legal entity', () => {
      expect(taxpayerTypeOf('GODE561231GR8')).toBe('INDIVIDUAL');
      expect(taxpayerTypeOf('abc010203ab9')).toBe('LEGAL_ENTITY');
    });

    it('rejects impossible dates and malformed input', () => {
      expect(taxpayerTypeOf('GODE561331GR8')).toBeNull(); // month 13
      expect(taxpayerTypeOf('GODE560230GR8')).toBeNull(); // Feb 30
      expect(taxpayerTypeOf('GODE5612')).toBeNull();
    });
  });

  describe('rfcValidator', () => {
    const validate = rfcValidator();

    it('passes empty values (required is a separate concern)', () => {
      expect(validate(new FormControl(''))).toBeNull();
    });

    it('flags SAT generic RFCs separately from malformed ones', () => {
      expect(validate(new FormControl('XAXX010101000'))).toEqual({ rfcGeneric: true });
      expect(validate(new FormControl('NOT-AN-RFC'))).toEqual({ rfcFormat: true });
      expect(validate(new FormControl('GODE561231GR8'))).toBeNull();
    });
  });

  it('mexicanZipCodeValidator accepts 5 digits in a real SAT zone only', () => {
    const validate = mexicanZipCodeValidator();
    expect(validate(new FormControl('06600'))).toBeNull();
    expect(validate(new FormControl('00123'))).toEqual({ zipCode: true });
    expect(validate(new FormControl('6600'))).toEqual({ zipCode: true });
  });

  it('legalNameValidator rejects a trailing corporate regime', () => {
    const validate = legalNameValidator();
    expect(validate(new FormControl('PASTELERIA CRONOS S.A. DE C.V.'))).toEqual({ corporateSuffix: true });
    expect(validate(new FormControl('Pasteleria Cronos, S de RL de CV'))).toEqual({ corporateSuffix: true });
    expect(validate(new FormControl('PASTELERIA CRONOS'))).toBeNull();
  });

  describe('taxRegimeMatchesRfcValidator', () => {
    function form(taxId: string, taxRegime: string | null): FormGroup {
      return new FormGroup(
        { taxId: new FormControl(taxId), taxRegime: new FormControl(taxRegime) },
        { validators: taxRegimeMatchesRfcValidator('taxId', 'taxRegime') },
      );
    }

    it('pins regimeMismatch on the regime control when SAT does not allow the pair', () => {
      const group = form('GODE561231GR8', '601'); // individual + legal-entity-only regime
      expect(group.hasError('regimeMismatch')).toBeTrue();
      expect(group.controls['taxRegime'].hasError('regimeMismatch')).toBeTrue();
    });

    it('clears the pinned error once the pair becomes valid', () => {
      const group = form('GODE561231GR8', '601');
      group.controls['taxRegime'].setValue('626'); // RESICO applies to both
      expect(group.valid).toBeTrue();
      expect(group.controls['taxRegime'].errors).toBeNull();
    });
  });
});
