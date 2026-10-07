import { AllergenRef } from 'src/app/core/models/kitchen.models';
import { LineDraft, groupBySection, lineToRequest, summarizeAllergens, validateLines } from './recipe-draft';

const GLUTEN: AllergenRef = { id: 1, code: 'GLUTEN', name: 'Gluten' };
const MILK: AllergenRef = { id: 2, code: 'MILK', name: 'Leche' };
const NUTS: AllergenRef = { id: 3, code: 'TREE_NUTS', name: 'Frutos de cáscara' };

function line(partial: Partial<LineDraft>): LineDraft {
  return {
    key: partial.key ?? Math.random().toString(),
    id: null,
    ingredientId: 'i-1',
    ingredientName: 'Harina',
    baseDimension: 'MASS',
    section: null,
    quantity: 100,
    unitId: 1,
    optional: false,
    quoteSelectable: false,
    notes: null,
    ingredientAllergens: [],
    extraAllergens: [],
    dismissedAllergenIds: [],
    substitutedFrom: null,
    ...partial,
  };
}

describe('recipe draft helpers', () => {
  it('separates allergens of the base product from optional-only ones', () => {
    const summary = summarizeAllergens([
      line({ ingredientAllergens: [GLUTEN] }),
      line({ ingredientId: 'i-2', extraAllergens: [{ allergen: MILK, source: 'DETECTED' }] }),
      line({ ingredientId: 'i-3', optional: true, ingredientAllergens: [NUTS, MILK] }),
    ]);
    expect(summary.contains.map((a) => a.code)).toEqual(['GLUTEN', 'MILK']);
    expect(summary.optionalOnly.map((a) => a.code)).toEqual(['TREE_NUTS']);
  });

  it('flags missing quantity/unit and the same ingredient twice in one section', () => {
    const issues = validateLines([
      line({ key: 'a', quantity: 0 }),
      line({ key: 'b', unitId: null }),
      line({ key: 'c', section: 'Masa' }),
      line({ key: 'd', section: ' masa ' }),
      line({ key: 'e', section: 'Relleno' }),
    ]);
    expect(issues.map((issue) => `${issue.key}:${issue.messageKey.split('.').pop()}`)).toEqual([
      'a:QUANTITY',
      'b:UNIT',
      'b:DUPLICATE',
      'd:DUPLICATE',
    ]);
  });

  it('groups by section keeping the unsectioned group first', () => {
    const groups = groupBySection([line({ section: 'Masa' }), line({ section: null }), line({ section: 'Relleno' }), line({ section: 'Masa' })]);
    expect(groups.map((group) => [group.section, group.lines.length])).toEqual([
      [null, 1],
      ['Masa', 2],
      ['Relleno', 1],
    ]);
  });

  it('an optional line is always selectable in quotes and only extra allergens are sent', () => {
    const request = lineToRequest(line({ optional: true, ingredientAllergens: [GLUTEN], extraAllergens: [{ allergen: MILK, source: 'MANUAL' }] }), 3);
    expect(request.quoteSelectable).toBeTrue();
    expect(request.extraAllergens).toEqual([{ allergenId: 2, source: 'MANUAL' }]);
    expect(request.displayOrder).toBe(3);
  });
});
