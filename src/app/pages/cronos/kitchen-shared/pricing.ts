import { PricingMethod } from 'src/app/core/models/kitchen.models';

/**
 * Pricing arithmetic shared by the recipe studio and the baking-guide
 * calculators. Display-only: every price that is saved or quoted comes from
 * the server (doc kitchen K1); these turn server numbers into the
 * "what does this mean" figures next to them, or power what-if calculators.
 */

/** Price for `cost` at `percent` under `method`; `null` when MARGIN ≥ 100 % (no finite price). */
export function priceFromCost(cost: number, percent: number, method: PricingMethod): number | null {
  if (method === 'MARKUP') {
    return cost * (1 + percent / 100);
  }
  return percent >= 100 ? null : cost / (1 - percent / 100);
}

/** Profit as a share of the price, in % — "margin". `null` when the price is not positive. */
export function effectiveMargin(cost: number, price: number): number | null {
  return price > 0 ? ((price - cost) / price) * 100 : null;
}

/** Profit as a share of the cost, in % — "markup". `null` when the cost is not positive. */
export function effectiveMarkup(cost: number, price: number): number | null {
  return cost > 0 ? ((price - cost) / cost) * 100 : null;
}

/** 150 % markup ⇔ 60 % margin. */
export function markupToMargin(markup: number): number {
  return (markup / (100 + markup)) * 100;
}

/** `null` for margins ≥ 100 %. */
export function marginToMarkup(margin: number): number | null {
  return margin >= 100 ? null : (margin / (100 - margin)) * 100;
}

/** Ingredient (food) cost as a share of the selling price, in %. */
export function foodCostPercent(ingredientCost: number, price: number): number | null {
  return price > 0 ? (ingredientCost / price) * 100 : null;
}

export type RoundingStep = 0 | 0.5 | 1 | 5 | 10;

/** Rounds a price up to the next multiple of `step` (0 = no rounding) — prices are never rounded down below cost. */
export function roundPriceUp(price: number, step: RoundingStep): number {
  if (step === 0) {
    return price;
  }
  // Tolerance keeps 20.000000001 from jumping to the next step.
  return Math.ceil(price / step - 1e-9) * step;
}
