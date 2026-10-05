/**
 * Client-side mirror of `UnitConversionService`'s LINEAR path (same
 * dimension, same-system units) — for an instant preview while the user is
 * still typing, before the round trip to `POST /measurement-unit/convert`
 * confirms it. IDENTITY and DENSITY stay server-only: DENSITY needs a raw
 * material's density rule the client never holds, and IDENTITY is just this
 * function called with `fromMultiplierToBase === toMultiplierToBase`.
 */

/**
 * `quantity` expressed in `fromUnit`, converted to `toUnit` — both given as
 * their `multiplierToBase` (the backend's definition: `quantity_in_base =
 * quantity * multiplierToBase`).
 */
export function convertLinear(quantity: number, fromMultiplierToBase: number, toMultiplierToBase: number): number {
  return (quantity * fromMultiplierToBase) / toMultiplierToBase;
}

/**
 * `value` as a fixed-notation decimal string, never `"5e-7"` — JS's own
 * `toString()` switches to scientific notation below 1e-6, which is exactly
 * the range a mg→kg conversion lands in. Trailing zeros are trimmed, matching
 * the backend's "round only for display" rule.
 */
export function formatWithoutScientificNotation(value: number, maxDecimals = 10): string {
  if (!Number.isFinite(value)) {
    return String(value);
  }
  const fixed = value.toFixed(maxDecimals);
  return fixed.includes('.') ? fixed.replace(/0+$/, '').replace(/\.$/, '') : fixed;
}
