import { AllergenResponse } from 'src/app/core/models/kitchen.models';
import { detectAllergens, normalizeForMatch } from './allergen-detection';

function allergen(id: number, code: string, keywords: string[]): AllergenResponse {
  return {
    id,
    code,
    name: code,
    description: null,
    icon: 'pi pi-exclamation-triangle',
    keywords,
    regulations: [],
    scope: 'SYSTEM',
    status: 'ACTIVE',
    ingredientCount: 0,
    updatedAt: null,
    version: 0,
  };
}

const CATALOG = [
  allergen(1, 'GLUTEN', ['trigo', 'harina de trigo', 'cebada', 'centeno']),
  allergen(2, 'MILK', ['leche', 'mantequilla', 'queso', 'crema']),
  allergen(3, 'TREE_NUTS', ['nuez', 'almendra', 'avellana']),
];

describe('allergen detection', () => {
  it('normalises accents, case and punctuation', () => {
    expect(normalizeForMatch('  Harina  de TRIGO, 000 ')).toBe('harina de trigo 000');
    expect(normalizeForMatch('Crème brûlée')).toBe('creme brulee');
  });

  it('matches whole words and reports the most specific keyword', () => {
    const [match] = detectAllergens('Harina de trigo para pastel', CATALOG);
    expect(match.allergen.code).toBe('GLUTEN');
    expect(match.keyword).toBe('harina de trigo');
  });

  it('does not match inside other words', () => {
    // "leche" must not fire on "lechuga", nor "crema" on "cremallera".
    expect(detectAllergens('Lechuga orejona', CATALOG)).toEqual([]);
    expect(detectAllergens('Cremallera', CATALOG)).toEqual([]);
  });

  it('finds several allergens and skips already-linked ones', () => {
    const codes = detectAllergens('Pastel de almendra con crema', CATALOG).map((m) => m.allergen.code);
    expect(codes).toEqual(['MILK', 'TREE_NUTS']);
    expect(detectAllergens('Pastel de almendra con crema', CATALOG, new Set([2])).map((m) => m.allergen.code)).toEqual(['TREE_NUTS']);
  });
});
