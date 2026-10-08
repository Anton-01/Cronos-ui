import { FormControl, FormGroup } from '@angular/forms';

import { CURRENCY_CODE_PATTERN, TAX_CODE_PATTERN, maxDecimalsValidator, validityRangeValidator } from './finance.validators';

describe('finance validators', () => {
  it('maxDecimalsValidator accepts up to N decimals', () => {
    const validate = maxDecimalsValidator(4);
    expect(validate(new FormControl(16))).toBeNull();
    expect(validate(new FormControl(10.6667))).toBeNull();
    expect(validate(new FormControl(null))).toBeNull();
    expect(validate(new FormControl(10.66667))).toEqual({ maxDecimals: { max: 4 } });
  });

  it('validityRangeValidator rejects an end date before the start date', () => {
    const validate = validityRangeValidator('from', 'to');
    const group = (from: Date | null, to: Date | null) =>
      new FormGroup({ from: new FormControl(from), to: new FormControl(to) });

    expect(validate(group(new Date(2026, 0, 1), null))).toBeNull();
    expect(validate(group(new Date(2026, 0, 1), new Date(2026, 0, 1)))).toBeNull();
    expect(validate(group(new Date(2026, 0, 2), new Date(2026, 0, 1)))).toEqual({ validityRange: true });
  });

  it('code patterns follow ISO 4217 and UPPER_SNAKE', () => {
    expect(CURRENCY_CODE_PATTERN.test('MXN')).toBeTrue();
    expect(CURRENCY_CODE_PATTERN.test('mxn')).toBeFalse();
    expect(CURRENCY_CODE_PATTERN.test('MXNN')).toBeFalse();
    expect(TAX_CODE_PATTERN.test('IVA_16')).toBeTrue();
    expect(TAX_CODE_PATTERN.test('16_IVA')).toBeFalse();
  });
});
