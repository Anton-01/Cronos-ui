/**
 * Kitchen domain contracts — allergens, the ingredient master catalog and
 * recipes. `/api/v1/allergens`, `/api/v1/ingredients`, `/api/v1/recipes`.
 *
 * Mirrors `docs/api/kitchen-catalog-and-recipes.md`. **Change the two together.**
 * V8 envelope (`ApiEnvelope<T>` / `CatalogPage<T>`).
 *
 * Money is returned as decimal numbers in the tenant's default currency
 * unless a `currency` field says otherwise; the server computes every cost
 * (the client only previews).
 */

import { RecordStatus, UnitDimension } from './unit-catalog.models';
import { UserRef } from './iam.models';

/** SYSTEM rows ship with the platform (read-only identity); USER rows belong to the caller. */
export type CatalogScope = 'SYSTEM' | 'USER';

// ─── Allergens ───

export interface AllergenRef {
  id: number;
  code: string;
  name: string;
}

export interface AllergenResponse {
  id: number;
  /** Upper snake, stable across environments (`GLUTEN`, `MILK`, `TREE_NUTS`). */
  code: string;
  name: string;
  description: string | null;
  /** PrimeIcons class used as the allergen's pictogram. */
  icon: string;
  /**
   * Lower-case, accent-free words/phrases that hint an ingredient contains it
   * (`trigo`, `harina`, `cebada`). Drives the "possible allergen" suggestion.
   */
  keywords: string[];
  /** Regulations listing it: `NOM-051` (MX), `EU-1169`, `FDA-FALCPA`. */
  regulations: string[];
  scope: CatalogScope;
  status: RecordStatus;
  ingredientCount: number;
  updatedAt: string | null;
  version: number;
}

export interface AllergenRequest {
  code: string;
  name: string;
  description: string | null;
  icon: string;
  keywords: string[];
  regulations: string[];
  version?: number;
}

// ─── Ingredients ───

/** Where the cost used for calculations comes from. */
export type PriceSource = 'OWN' | 'REFERENCE' | 'NONE';

export interface IngredientPrice {
  /** Purchase presentation, e.g. 1 kg bag / 946 ml bottle / 30 pieces. */
  purchaseQuantity: number;
  purchaseUnitId: number;
  purchaseUnitCode: string;
  price: number;
  currency: string;
  supplier: string | null;
  /** ISO date of the purchase/quote. */
  pricedAt: string;
}

export interface IngredientSummary {
  id: string;
  code: string;
  name: string;
  categoryId: number;
  categoryName: string;
  scope: CatalogScope;
  /** Unit every cost is normalised to: g (MASS), ml (VOLUME), pz (COUNT). */
  baseDimension: UnitDimension;
  baseUnitCode: string;
  /** Usable fraction after cleaning/peeling/sifting, 1–100. */
  yieldPercent: number;
  /** Cost of 1 base unit after yield, in the default currency. `null` when unpriced. */
  costPerBaseUnit: number | null;
  priceSource: PriceSource;
  /** `pricedAt` of the effective price. */
  pricedAt: string | null;
  /** Effective price older than the tenant threshold (default 60 days). */
  priceStale: boolean;
  allergens: AllergenRef[];
  usedInRecipes: number;
  status: RecordStatus;
}

export interface IngredientSubstitute {
  ingredientId: string;
  ingredientName: string;
  /** Quantity of the substitute per 1 unit of the original (same base dimension after density). */
  ratio: number;
  notes: string | null;
  /** Allergens the substitute does NOT contain among the original's. */
  freeOf: AllergenRef[];
  /** Allergens the substitute adds that the original did not have. */
  introduces: AllergenRef[];
}

export interface IngredientDetail extends IngredientSummary {
  description: string | null;
  brand: string | null;
  /** g/ml — required to convert MASS ⇄ VOLUME in recipes. */
  densityGPerMl: number | null;
  /** Platform market reference (SYSTEM ingredients). */
  referencePrice: IngredientPrice | null;
  /** The caller's own latest price, when they registered one. */
  ownPrice: IngredientPrice | null;
  substitutes: IngredientSubstitute[];
  createdAt: string;
  updatedAt: string | null;
  updatedBy: UserRef | null;
  version: number;
}

export interface IngredientQuery {
  page: number;
  size: number;
  sort?: string;
  search?: string;
  categoryIds?: number[];
  allergenIds?: number[];
  /** `true` → only ingredients free of every allergen in `allergenIds`. */
  excludeAllergens?: boolean;
  scope?: CatalogScope;
  priceStale?: boolean;
  status?: RecordStatus;
}

export interface IngredientStats {
  total: number;
  system: number;
  own: number;
  withAllergens: number;
  stalePrices: number;
  unpriced: number;
}

export interface IngredientSubstituteRequest {
  ingredientId: string;
  ratio: number;
  notes: string | null;
}

/** USER ingredients only. SYSTEM ingredients take a price via `IngredientPriceRequest`. */
export interface IngredientRequest {
  code: string;
  name: string;
  categoryId: number;
  description: string | null;
  brand: string | null;
  baseDimension: UnitDimension;
  yieldPercent: number;
  densityGPerMl: number | null;
  allergenIds: number[];
  substitutes: IngredientSubstituteRequest[];
  /** Optional first price on create. */
  price: IngredientPriceRequest | null;
  version?: number;
}

export interface IngredientPriceRequest {
  purchaseQuantity: number;
  purchaseUnitId: number;
  price: number;
  currency: string;
  supplier: string | null;
  pricedAt: string;
}

export interface IngredientPriceHistoryEntry {
  id: string;
  price: IngredientPrice;
  /** Cost per base unit this price produced. */
  costPerBaseUnit: number;
  /** % change vs the previous entry; `null` for the first. */
  changePercent: number | null;
  recordedAt: string;
  recordedBy: UserRef | null;
}

/** Result of registering a price: what it rippled into. */
export interface PriceImpact {
  ingredient: IngredientSummary;
  recipesAffected: number;
  /** Open quotes (DRAFT/SENT) whose recipe cost moved; they are flagged for review. */
  quotesFlagged: number;
  /** Recipes whose margin fell below their target after the change. */
  recipesBelowMargin: { id: string; name: string; marginPercent: number }[];
}

// ─── Recipes ───

export type RecipeStatus = 'DRAFT' | 'ACTIVE' | 'ARCHIVED';
export type RecipeDifficulty = 'EASY' | 'MEDIUM' | 'ADVANCED';
export type CostStatus = 'CURRENT' | 'STALE' | 'INCOMPLETE';
export type AllergenSource = 'INGREDIENT' | 'DETECTED' | 'MANUAL';
/**
 * How `targetMarginPercent` turns a cost into a suggested price.
 * `MARKUP`: price = cost × (1 + p/100) — what every server before
 * `pricingMethod` existed computes, so an absent value means MARKUP.
 * `MARGIN`: price = cost ÷ (1 − p/100), p < 100 — the profit is p % of the price.
 */
export type PricingMethod = 'MARKUP' | 'MARGIN';

export interface RecipeLineAllergen {
  allergenId: number;
  code: string;
  name: string;
  /** INGREDIENT = declared on the ingredient; DETECTED = keyword suggestion the user accepted; MANUAL = added by hand. */
  source: AllergenSource;
}

export interface RecipeLine {
  id: string;
  ingredientId: string;
  ingredientName: string;
  /** Free text section, e.g. "Masa", "Relleno", "Cobertura". */
  section: string | null;
  quantity: number;
  unitId: number;
  unitCode: string;
  /** Not required for the base product. */
  optional: boolean;
  /** Shown as a toggle when quoting (customer can add/remove it). */
  quoteSelectable: boolean;
  notes: string | null;
  allergens: RecipeLineAllergen[];
  /** Cost of this line at the recipe's base yield. `null` when the ingredient is unpriced. */
  lineCost: number | null;
  displayOrder: number;
}

/** Same values as the user's fixed-cost catalog (`UserFixedCostResponse.calculationMethod`). */
export type FixedCostMethod = 'HOURLY_RATE' | 'PER_UNIT' | 'FIXED_PER_BATCH' | 'PERCENTAGE';

export interface RecipeFixedCost {
  id: string;
  userFixedCostId: string;
  name: string;
  method: FixedCostMethod;
  minutes: number | null;
  percentage: number | null;
  /** PER_UNIT only: units consumed per batch (e.g. 1 box per cake). `null` = one per yield unit. */
  quantity?: number | null;
  cost: number;
}

export interface RecipeCost {
  ingredientsCost: number;
  /** Extra cost from `wastePercent` on top of ingredient yields. */
  wasteCost: number;
  fixedCosts: number;
  totalCost: number;
  costPerUnit: number;
  /** From `costPerUnit` and `targetMarginPercent` by `pricingMethod`, rounded per finance settings. */
  suggestedUnitPrice: number;
  /** Method the server actually applied. Absent on servers that predate it, which apply MARKUP. */
  pricingMethod?: PricingMethod;
  currency: string;
  status: CostStatus;
  /** Lines without a price (cost is understated while > 0). */
  unpricedLines: number;
  calculatedAt: string;
}

export type RecipeFileKind = 'IMAGE' | 'PDF' | 'DOCUMENT' | 'SPREADSHEET' | 'VIDEO' | 'OTHER';

export interface RecipeFile {
  id: string;
  fileName: string;
  url: string;
  thumbnailUrl: string | null;
  kind: RecipeFileKind;
  mimeType: string;
  sizeBytes: number;
  description: string | null;
  isCover: boolean;
  uploadedAt: string;
  uploadedBy: UserRef | null;
}

export interface RecipeSummary {
  id: string;
  code: string;
  name: string;
  categoryId: number | null;
  categoryName: string | null;
  difficulty: RecipeDifficulty;
  yieldQuantity: number;
  yieldUnit: string;
  status: RecipeStatus;
  allergens: AllergenRef[];
  coverImageUrl: string | null;
  costPerUnit: number | null;
  suggestedUnitPrice: number | null;
  targetMarginPercent: number;
  pricingMethod?: PricingMethod;
  costStatus: CostStatus;
  costCalculatedAt: string | null;
  totalMinutes: number;
  updatedAt: string | null;
}

export interface RecipeDetail extends RecipeSummary {
  description: string | null;
  /** Sanitised HTML (server-side allow-list). */
  processHtml: string | null;
  storageInstructions: string | null;
  shelfLifeDays: number | null;
  prepMinutes: number | null;
  bakeMinutes: number | null;
  coolMinutes: number | null;
  ovenTemperatureC: number | null;
  wastePercent: number;
  lines: RecipeLine[];
  fixedCosts: RecipeFixedCost[];
  files: RecipeFile[];
  cost: RecipeCost;
  createdAt: string;
  createdBy: UserRef | null;
  updatedBy: UserRef | null;
  version: number;
}

export interface RecipeLineRequest {
  /** Omit for new lines. */
  id?: string;
  ingredientId: string;
  section: string | null;
  quantity: number;
  unitId: number;
  optional: boolean;
  quoteSelectable: boolean;
  notes: string | null;
  /** DETECTED / MANUAL allergens only — INGREDIENT ones are derived server-side. */
  extraAllergens: { allergenId: number; source: Exclude<AllergenSource, 'INGREDIENT'> }[];
  displayOrder: number;
}

export interface RecipeFixedCostRequest {
  id?: string;
  userFixedCostId: string;
  minutes: number | null;
  percentage: number | null;
  /** PER_UNIT only; see `RecipeFixedCost.quantity`. */
  quantity: number | null;
}

/** Whole-aggregate save (POST create / PUT update). */
export interface RecipeRequest {
  code: string;
  name: string;
  categoryId: number | null;
  difficulty: RecipeDifficulty;
  description: string | null;
  yieldQuantity: number;
  yieldUnit: string;
  prepMinutes: number | null;
  bakeMinutes: number | null;
  coolMinutes: number | null;
  ovenTemperatureC: number | null;
  shelfLifeDays: number | null;
  storageInstructions: string | null;
  processHtml: string | null;
  targetMarginPercent: number;
  pricingMethod: PricingMethod;
  wastePercent: number;
  lines: RecipeLineRequest[];
  fixedCosts: RecipeFixedCostRequest[];
  version?: number;
}

export interface RecipeQuery {
  page: number;
  size: number;
  sort?: string;
  search?: string;
  categoryIds?: number[];
  statuses?: RecipeStatus[];
  /** Recipes free of every listed allergen. */
  freeOfAllergenIds?: number[];
  costStatus?: CostStatus;
}

export interface RecipeStats {
  total: number;
  active: number;
  drafts: number;
  staleCost: number;
  belowMargin: number;
}

/** A product configuration: which lines are in, which are swapped, how much is made. */
export interface RecipeConfiguration {
  /** Lines (optional or quote-selectable) left out. */
  excludedLineIds: string[];
  substitutions: { lineId: string; ingredientId: string }[];
  /** Units to produce; defaults to the recipe yield. */
  yieldQuantity: number;
}

/** `POST /recipes/cost-preview` — unsaved draft or saved recipe + configuration. */
export interface RecipeCostPreviewRequest {
  recipeId: string | null;
  lines: RecipeLineRequest[] | null;
  fixedCosts: RecipeFixedCostRequest[] | null;
  yieldQuantity: number;
  wastePercent: number;
  targetMarginPercent: number;
  pricingMethod: PricingMethod;
  configuration: RecipeConfiguration | null;
}

export interface RecipeCostPreview {
  lines: { lineKey: string; ingredientId: string; lineCost: number | null; priceSource: PriceSource }[];
  /** Cost of each fixed-cost row; absent on servers that predate it. */
  fixedCosts?: { userFixedCostId: string; cost: number }[];
  cost: RecipeCost;
  allergens: AllergenRef[];
}

export interface RecipeRevision {
  version: number;
  changedAt: string;
  changedBy: UserRef | null;
  /** Localised one-liner ("Se cambió la cantidad de Mantequilla de 200 g a 250 g"). */
  summary: string;
  changes: Record<string, { from: unknown; to: unknown }>;
  costPerUnit: number | null;
}

export interface RecipeFileUpdateRequest {
  description: string | null;
  isCover: boolean;
}

// ─── Recipe sections (ingredient group labels) ───

/**
 * A reusable label for grouping recipe lines ("Bizcocho", "Baño", "Decoración").
 * Owned by the user: seeded with defaults, then freely renamed, reordered or
 * removed. Lines keep the section as text, so deleting a label never touches
 * a saved recipe.
 */
export interface RecipeSection {
  id: string;
  name: string;
  /** Hex colour (`#RRGGBB`) for the group heading, or `null` for the default. */
  color: string | null;
  displayOrder: number;
  /** Lines in the user's recipes that use this name (case-insensitive). */
  usageCount: number;
}

export interface RecipeSectionRequest {
  name: string;
  color: string | null;
}
