/**
 * Baking guide — reference material for pastry chefs (doc
 * `docs/api/baking-studio.md` §6). Content is structured blocks, never HTML,
 * so it renders without trusting markup from the API.
 */

export type GuideCategory = 'FOOD_SAFETY' | 'TECHNIQUES' | 'COSTING';
export type GuideScope = 'SYSTEM' | 'USER';

export type GuideBlock =
  | { type: 'paragraph'; text: string }
  | { type: 'list'; ordered?: boolean; items: string[] }
  | { type: 'table'; columns: string[]; rows: string[][] }
  | { type: 'callout'; tone: 'info' | 'tip' | 'warn'; text: string }
  | { type: 'formula'; expression: string; description: string };

export interface GuideArticle {
  id: string;
  code: string;
  category: GuideCategory;
  title: string;
  summary: string;
  /** PrimeIcons class, e.g. `pi pi-shield`. */
  icon: string;
  tags: string[];
  blocks: GuideBlock[];
  /** Norms or references the article is based on. */
  sources: string[];
  displayOrder: number;
}

export type PanShape = 'ROUND' | 'SQUARE' | 'RECTANGULAR' | 'SHEET' | 'LOAF' | 'BUNDT' | 'SPRINGFORM' | 'MUFFIN';

export interface PanSize {
  id: string;
  code: string;
  scope: GuideScope;
  shape: PanShape;
  name: string;
  /** ROUND / SPRINGFORM / BUNDT / MUFFIN (top). */
  diameterCm: number | null;
  /** SQUARE / RECTANGULAR / SHEET / LOAF. */
  lengthCm: number | null;
  widthCm: number | null;
  heightCm: number;
  /** Explicit capacity for shapes the formula cannot derive (BUNDT, MUFFIN cavity); otherwise computed. */
  volumeMl: number | null;
  /** Explicit servings for shapes sliced differently (BUNDT, MUFFIN = cavities); otherwise computed from area. */
  servings: number | null;
  notes: string | null;
}

export interface PanSizeRequest {
  shape: PanShape;
  name: string;
  diameterCm: number | null;
  lengthCm: number | null;
  widthCm: number | null;
  heightCm: number;
  volumeMl: number | null;
  servings: number | null;
  notes: string | null;
}

/** Volume → mass for common ingredients (US cup = 236.6 ml). */
export interface IngredientConversion {
  code: string;
  name: string;
  gramsPerCup: number;
  /** Overrides `gramsPerCup / 16` when the spoon measure is not proportional (leaveners, salt). */
  gramsPerTablespoon: number | null;
  /** Overrides `gramsPerCup / 48`. */
  gramsPerTeaspoon: number | null;
}

/** `GET /baking-guide` — everything the guide page needs in one call. */
export interface BakingGuide {
  articles: GuideArticle[];
  panSizes: PanSize[];
  conversions: IngredientConversion[];
  /** ISO date of the content revision. */
  revision: string;
}
