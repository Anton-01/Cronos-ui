import { effectiveMargin, effectiveMarkup, foodCostPercent, marginToMarkup, markupToMargin, priceFromCost, roundPriceUp } from './pricing';

describe('pricing', () => {
  it('prices by markup the way the legacy server does (12.40 at 65 % → 20.46)', () => {
    expect(priceFromCost(12.4, 65, 'MARKUP')).toBeCloseTo(20.46, 2);
  });

  it('prices by margin on the selling price (12.40 at 65 % → 35.43)', () => {
    expect(priceFromCost(12.4, 65, 'MARGIN')).toBeCloseTo(35.43, 2);
  });

  it('has no finite price at a 100 % margin', () => {
    expect(priceFromCost(10, 100, 'MARGIN')).toBeNull();
  });

  it('reports the real margin and markup of a price', () => {
    expect(effectiveMargin(12.4, 20.46)).toBeCloseTo(39.39, 1);
    expect(effectiveMarkup(12.4, 20.46)).toBeCloseTo(65, 1);
    expect(effectiveMargin(5, 0)).toBeNull();
    expect(effectiveMarkup(0, 5)).toBeNull();
  });

  it('converts between markup and margin', () => {
    expect(markupToMargin(150)).toBeCloseTo(60, 6);
    expect(marginToMarkup(60)).toBeCloseTo(150, 6);
    expect(marginToMarkup(100)).toBeNull();
  });

  it('computes food cost %', () => {
    expect(foodCostPercent(30, 100)).toBe(30);
    expect(foodCostPercent(30, 0)).toBeNull();
  });

  it('rounds prices up to the step', () => {
    expect(roundPriceUp(20.46, 0)).toBe(20.46);
    expect(roundPriceUp(20.46, 1)).toBe(21);
    expect(roundPriceUp(20.46, 5)).toBe(25);
    expect(roundPriceUp(20, 5)).toBe(20);
    expect(roundPriceUp(20.01, 0.5)).toBe(20.5);
  });
});
