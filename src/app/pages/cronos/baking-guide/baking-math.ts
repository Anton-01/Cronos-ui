import { IngredientConversion, PanShape, PanSize } from 'src/app/core/models/baking-guide.models';

/**
 * Reference arithmetic for the baking guide. Approximations by nature — the
 * UI labels every result "≈" and explains the assumption next to it.
 */

/** US customary cup; recipes from Mexico often mean a 250 ml metric cup. */
export const US_CUP_ML = 236.588;
export const METRIC_CUP_ML = 250;

/** Shapes whose top-down area does not drive the conversion (tube, cavities): compare batter volume instead. */
const VOLUME_SHAPES: readonly PanShape[] = ['BUNDT', 'MUFFIN'];
/** Batter fill: half the depth for layer and sheet pans, two thirds for loaf, tube and cavities. */
const FILL_TWO_THIRDS: readonly PanShape[] = ['LOAF', 'BUNDT', 'MUFFIN'];

export type PortionStyle = 'EVENT' | 'DESSERT';
/** Footprint of one portion in cm²: event slice 2.5 × 5 cm (tall cakes), dessert slice 4 × 5 cm. */
export const PORTION_AREA_CM2: Record<PortionStyle, number> = { EVENT: 12.5, DESSERT: 20 };

/** Top-down area in cm², or `null` when the dimensions are missing. */
export function panArea(pan: Pick<PanSize, 'shape' | 'diameterCm' | 'lengthCm' | 'widthCm' | 'heightCm' | 'volumeMl'>): number | null {
  switch (pan.shape) {
    case 'ROUND':
    case 'SPRINGFORM':
    case 'MUFFIN':
      return pan.diameterCm ? Math.PI * (pan.diameterCm / 2) ** 2 : null;
    case 'SQUARE':
      return pan.lengthCm ? pan.lengthCm * (pan.widthCm ?? pan.lengthCm) : null;
    case 'BUNDT':
      // A tube pan's useful area is its volume spread over its height.
      return pan.volumeMl && pan.heightCm ? pan.volumeMl / pan.heightCm : null;
    default:
      return pan.lengthCm && pan.widthCm ? pan.lengthCm * pan.widthCm : null;
  }
}

/** Capacity in ml: the declared volume, else area × height. */
export function panVolume(pan: Pick<PanSize, 'shape' | 'diameterCm' | 'lengthCm' | 'widthCm' | 'heightCm' | 'volumeMl'>): number | null {
  if (pan.volumeMl) {
    return pan.volumeMl;
  }
  const area = panArea(pan);
  return area && pan.heightCm ? area * pan.heightCm : null;
}

/** Usual batter volume for the pan (half or two-thirds full). */
export function batterVolume(pan: Pick<PanSize, 'shape' | 'diameterCm' | 'lengthCm' | 'widthCm' | 'heightCm' | 'volumeMl'>): number | null {
  const volume = panVolume(pan);
  return volume === null ? null : volume * (FILL_TWO_THIRDS.includes(pan.shape) ? 2 / 3 : 1 / 2);
}

export interface PanConversion {
  /** Multiply every ingredient by this. */
  factor: number;
  basis: 'AREA' | 'VOLUME';
}

/**
 * How much to scale a recipe written for `from` to fill `to`. Same batter
 * depth (area ratio) between layer/sheet/loaf pans; batter-volume ratio when
 * either pan is a tube or a cavity.
 */
export function convertPan(from: PanSize, to: PanSize): PanConversion | null {
  if (VOLUME_SHAPES.includes(from.shape) || VOLUME_SHAPES.includes(to.shape)) {
    const source = batterVolume(from);
    const target = batterVolume(to);
    return source && target ? { factor: target / source, basis: 'VOLUME' } : null;
  }
  const source = panArea(from);
  const target = panArea(to);
  return source && target ? { factor: target / source, basis: 'AREA' } : null;
}

/** Portions a pan yields: the declared count, else area ÷ portion footprint. */
export function panServings(pan: PanSize, style: PortionStyle): number | null {
  if (pan.servings) {
    return pan.servings;
  }
  const area = panArea(pan);
  return area ? Math.max(1, Math.floor(area / PORTION_AREA_CM2[style])) : null;
}

// ─── Temperatures ───

export function celsiusToFahrenheit(celsius: number): number {
  return (celsius * 9) / 5 + 32;
}

export function fahrenheitToCelsius(fahrenheit: number): number {
  return ((fahrenheit - 32) * 5) / 9;
}

/** Gas mark → °C, the usual UK oven table. */
export const GAS_MARKS: readonly { mark: number; celsius: number }[] = [
  { mark: 1, celsius: 140 },
  { mark: 2, celsius: 150 },
  { mark: 3, celsius: 170 },
  { mark: 4, celsius: 180 },
  { mark: 5, celsius: 190 },
  { mark: 6, celsius: 200 },
  { mark: 7, celsius: 220 },
  { mark: 8, celsius: 230 },
  { mark: 9, celsius: 240 },
];

/** Closest gas mark to a temperature, or `null` outside the 130–250 °C range ovens mark. */
export function gasMarkFor(celsius: number): number | null {
  if (celsius < 130 || celsius > 250) {
    return null;
  }
  return GAS_MARKS.reduce((best, entry) => (Math.abs(entry.celsius - celsius) < Math.abs(best.celsius - celsius) ? entry : best)).mark;
}

/** Fan (convection) ovens bake hotter: lower the conventional temperature by about 20 °C. */
export const CONVECTION_OFFSET_C = 20;

// ─── Volume ↔ weight ───

export type VolumeMeasure = 'CUP' | 'HALF_CUP' | 'THIRD_CUP' | 'QUARTER_CUP' | 'TABLESPOON' | 'TEASPOON';

/** Grams in one `measure` of the ingredient. `cupMl` picks the US (236.6 ml) or metric (250 ml) cup. */
export function gramsPerMeasure(conversion: IngredientConversion, measure: VolumeMeasure, cupMl = US_CUP_ML): number {
  const cup = conversion.gramsPerCup * (cupMl / US_CUP_ML);
  switch (measure) {
    case 'CUP':
      return cup;
    case 'HALF_CUP':
      return cup / 2;
    case 'THIRD_CUP':
      return cup / 3;
    case 'QUARTER_CUP':
      return cup / 4;
    // Spoons are the same size everywhere (15 / 5 ml): they never follow the cup choice.
    case 'TABLESPOON':
      return conversion.gramsPerTablespoon ?? conversion.gramsPerCup / 16;
    case 'TEASPOON':
      return conversion.gramsPerTeaspoon ?? conversion.gramsPerCup / 48;
  }
}

export function volumeToGrams(amount: number, conversion: IngredientConversion, measure: VolumeMeasure, cupMl = US_CUP_ML): number {
  return amount * gramsPerMeasure(conversion, measure, cupMl);
}

export function gramsToVolume(grams: number, conversion: IngredientConversion, measure: VolumeMeasure, cupMl = US_CUP_ML): number {
  const per = gramsPerMeasure(conversion, measure, cupMl);
  return per > 0 ? grams / per : 0;
}
