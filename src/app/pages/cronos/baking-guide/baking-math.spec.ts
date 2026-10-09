import { IngredientConversion, PanSize } from 'src/app/core/models/baking-guide.models';
import {
  METRIC_CUP_ML,
  batterVolume,
  celsiusToFahrenheit,
  convertPan,
  fahrenheitToCelsius,
  gasMarkFor,
  gramsPerMeasure,
  gramsToVolume,
  panArea,
  panServings,
  panVolume,
  volumeToGrams,
} from './baking-math';

function pan(partial: Partial<PanSize>): PanSize {
  return {
    id: 'p',
    code: 'P',
    scope: 'SYSTEM',
    shape: 'ROUND',
    name: 'Pan',
    diameterCm: null,
    lengthCm: null,
    widthCm: null,
    heightCm: 7.5,
    volumeMl: null,
    servings: null,
    notes: null,
    ...partial,
  };
}

const round20 = pan({ shape: 'ROUND', diameterCm: 20 });
const round25 = pan({ shape: 'ROUND', diameterCm: 25 });
const square20 = pan({ shape: 'SQUARE', lengthCm: 20, heightCm: 5 });
const muffin = pan({ shape: 'MUFFIN', diameterCm: 7, heightCm: 3, volumeMl: 120, servings: 1 });
const flour: IngredientConversion = { code: 'FLOUR', name: 'Harina', gramsPerCup: 125, gramsPerTablespoon: null, gramsPerTeaspoon: null };
const bakingPowder: IngredientConversion = { code: 'BP', name: 'Polvo para hornear', gramsPerCup: 192, gramsPerTablespoon: 12, gramsPerTeaspoon: 4 };

describe('baking math', () => {
  it('computes areas and volumes per shape', () => {
    expect(panArea(round20)).toBeCloseTo(314.16, 1);
    expect(panArea(square20)).toBe(400);
    expect(panVolume(square20)).toBe(2000);
    expect(panVolume(muffin)).toBe(120);
    expect(panArea(pan({ shape: 'RECTANGULAR', lengthCm: 33 }))).toBeNull();
  });

  it('fills layer pans half way and cavities two thirds', () => {
    expect(batterVolume(square20)).toBe(1000);
    expect(batterVolume(muffin)).toBe(80);
  });

  it('converts between layer pans by area (20 → 25 cm round ≈ ×1.56)', () => {
    const conversion = convertPan(round20, round25);
    expect(conversion?.basis).toBe('AREA');
    expect(conversion?.factor).toBeCloseTo(1.5625, 3);
  });

  it('converts to cavities by batter volume', () => {
    const conversion = convertPan(round20, muffin);
    expect(conversion?.basis).toBe('VOLUME');
    // 2356 ml × 1/2 = 1178 ml of batter; 80 ml per cup → ≈ 14.7 cupcakes worth per cavity factor.
    expect(1 / (conversion?.factor ?? 0)).toBeCloseTo(14.73, 1);
  });

  it('estimates servings from area unless declared', () => {
    expect(panServings(round20, 'EVENT')).toBe(25);
    expect(panServings(round20, 'DESSERT')).toBe(15);
    expect(panServings(muffin, 'EVENT')).toBe(1);
  });

  it('converts temperatures and gas marks', () => {
    expect(celsiusToFahrenheit(180)).toBe(356);
    expect(fahrenheitToCelsius(350)).toBeCloseTo(176.7, 1);
    expect(gasMarkFor(180)).toBe(4);
    expect(gasMarkFor(100)).toBeNull();
  });

  it('converts volume to grams with spoon overrides and the metric cup', () => {
    expect(volumeToGrams(2, flour, 'CUP')).toBe(250);
    expect(gramsPerMeasure(flour, 'TABLESPOON')).toBeCloseTo(7.81, 2);
    expect(gramsPerMeasure(bakingPowder, 'TEASPOON')).toBe(4);
    expect(gramsPerMeasure(flour, 'CUP', METRIC_CUP_ML)).toBeCloseTo(132.1, 1);
    expect(gramsToVolume(250, flour, 'CUP')).toBe(2);
  });
});
