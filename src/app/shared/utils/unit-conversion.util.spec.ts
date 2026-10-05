import { convertLinear, formatWithoutScientificNotation } from './unit-conversion.util';

describe('unit-conversion util', () => {
  describe('convertLinear', () => {
    it('2.5 kg -> g (kg multiplier 1000, g multiplier 1)', () => {
      expect(convertLinear(2.5, 1000, 1)).toBe(2500);
    });

    it('3 cups -> tablespoons (cup multiplier 16, tbsp multiplier 1)', () => {
      expect(convertLinear(3, 16, 1)).toBe(48);
    });

    it('0.5 mg -> kg (mg multiplier 0.001, kg multiplier 1000)', () => {
      expect(convertLinear(0.5, 0.001, 1000)).toBeCloseTo(0.0000005, 10);
    });

    it('is IDENTITY when both multipliers match', () => {
      expect(convertLinear(7, 1, 1)).toBe(7);
    });
  });

  describe('formatWithoutScientificNotation', () => {
    it('never emits exponential notation for a very small result', () => {
      const text = formatWithoutScientificNotation(convertLinear(0.5, 0.001, 1000));
      expect(text).toBe('0.0000005');
      expect(text).not.toContain('e');
    });

    it('trims trailing zeros without leaving a dangling decimal point', () => {
      expect(formatWithoutScientificNotation(2500)).toBe('2500');
      expect(formatWithoutScientificNotation(48)).toBe('48');
    });

    it('keeps significant trailing digits', () => {
      expect(formatWithoutScientificNotation(1.25)).toBe('1.25');
    });
  });
});
