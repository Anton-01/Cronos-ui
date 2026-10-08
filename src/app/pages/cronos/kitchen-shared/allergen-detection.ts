import { AllergenResponse } from 'src/app/core/models/kitchen.models';

export interface AllergenMatch {
  allergen: AllergenResponse;
  /** The catalog keyword that matched — shown so the suggestion is explainable. */
  keyword: string;
}

/** Lower-case, accent-free, single-spaced — the form allergen keywords are stored in. */
export function normalizeForMatch(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9ñ ]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Allergens whose keywords appear in `text` as whole words/phrases
 * ("harina de trigo" → GLUTEN via "trigo"; "mantequilla" → MILK).
 *
 * This only *suggests*: the user confirms each match before it is linked,
 * and the server repeats the same detection on save (doc §3.3), so the
 * client list never becomes the source of truth.
 */
export function detectAllergens(text: string, catalog: readonly AllergenResponse[], exclude: ReadonlySet<number> = new Set()): AllergenMatch[] {
  const haystack = ` ${normalizeForMatch(text)} `;
  if (haystack.trim().length === 0) {
    return [];
  }
  const matches: AllergenMatch[] = [];
  for (const allergen of catalog) {
    if (exclude.has(allergen.id)) {
      continue;
    }
    const keyword = allergen.keywords
      .map((entry) => normalizeForMatch(entry))
      .filter((entry) => entry.length > 0)
      // Longest first so the explanation names the most specific phrase.
      .sort((a, b) => b.length - a.length)
      .find((entry) => haystack.includes(` ${entry} `));
    if (keyword) {
      matches.push({ allergen, keyword });
    }
  }
  return matches;
}
