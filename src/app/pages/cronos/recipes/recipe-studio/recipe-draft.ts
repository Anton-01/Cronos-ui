import {
  AllergenRef,
  AllergenSource,
  IngredientSummary,
  RecipeLine,
  RecipeLineAllergen,
  RecipeLineRequest,
} from 'src/app/core/models/kitchen.models';
import { UnitDimension } from 'src/app/core/models/unit-catalog.models';

/** A recipe line while it is being edited — keyed client-side so new lines can be costed before they have an id. */
export interface LineDraft {
  key: string;
  id: string | null;
  ingredientId: string;
  ingredientName: string;
  baseDimension: UnitDimension;
  section: string | null;
  quantity: number | null;
  unitId: number | null;
  optional: boolean;
  quoteSelectable: boolean;
  notes: string | null;
  /** Declared on the ingredient — always linked, not removable here. */
  ingredientAllergens: AllergenRef[];
  /** Accepted keyword suggestions and manual additions. */
  extraAllergens: { allergen: AllergenRef; source: Exclude<AllergenSource, 'INGREDIENT'> }[];
  /** Suggestions the user explicitly ignored for this line. */
  dismissedAllergenIds: number[];
  /** Set when the line replaced another ingredient (traceability in notes/history). */
  substitutedFrom: string | null;
}

let sequence = 0;

export function newLineKey(): string {
  sequence += 1;
  return `line-${Date.now().toString(36)}-${sequence}`;
}

export function lineFromIngredient(
  ingredient: IngredientSummary,
  quantity: number,
  unitId: number,
  section: string | null,
): LineDraft {
  return {
    key: newLineKey(),
    id: null,
    ingredientId: ingredient.id,
    ingredientName: ingredient.name,
    baseDimension: ingredient.baseDimension,
    section,
    quantity,
    unitId,
    optional: false,
    quoteSelectable: false,
    notes: null,
    ingredientAllergens: ingredient.allergens,
    extraAllergens: [],
    dismissedAllergenIds: [],
    substitutedFrom: null,
  };
}

export function lineFromServer(line: RecipeLine, baseDimension: UnitDimension): LineDraft {
  const asRef = (allergen: RecipeLineAllergen): AllergenRef => ({ id: allergen.allergenId, code: allergen.code, name: allergen.name });
  return {
    key: line.id,
    id: line.id,
    ingredientId: line.ingredientId,
    ingredientName: line.ingredientName,
    baseDimension,
    section: line.section,
    quantity: line.quantity,
    unitId: line.unitId,
    optional: line.optional,
    quoteSelectable: line.quoteSelectable,
    notes: line.notes,
    ingredientAllergens: line.allergens.filter((allergen) => allergen.source === 'INGREDIENT').map(asRef),
    extraAllergens: line.allergens
      .filter((allergen) => allergen.source !== 'INGREDIENT')
      .map((allergen) => ({ allergen: asRef(allergen), source: allergen.source as Exclude<AllergenSource, 'INGREDIENT'> })),
    dismissedAllergenIds: [],
    substitutedFrom: null,
  };
}

export function lineToRequest(line: LineDraft, displayOrder: number): RecipeLineRequest {
  return {
    ...(line.id ? { id: line.id } : {}),
    ingredientId: line.ingredientId,
    section: line.section?.trim() || null,
    quantity: line.quantity ?? 0,
    unitId: line.unitId ?? 0,
    optional: line.optional,
    quoteSelectable: line.quoteSelectable || line.optional,
    notes: line.notes?.trim() || null,
    extraAllergens: line.extraAllergens.map((extra) => ({ allergenId: extra.allergen.id, source: extra.source })),
    displayOrder,
  };
}

/** Every allergen a line carries, declared first. */
export function lineAllergens(line: LineDraft): AllergenRef[] {
  const seen = new Set<number>();
  const result: AllergenRef[] = [];
  for (const allergen of [...line.ingredientAllergens, ...line.extraAllergens.map((extra) => extra.allergen)]) {
    if (!seen.has(allergen.id)) {
      seen.add(allergen.id);
      result.push(allergen);
    }
  }
  return result;
}

export interface AllergenSummary {
  /** In the base product (required lines). */
  contains: AllergenRef[];
  /** Only through optional lines — "may contain depending on the configuration". */
  optionalOnly: AllergenRef[];
}

export function summarizeAllergens(lines: readonly LineDraft[]): AllergenSummary {
  const required = new Map<number, AllergenRef>();
  const optional = new Map<number, AllergenRef>();
  for (const line of lines) {
    for (const allergen of lineAllergens(line)) {
      (line.optional ? optional : required).set(allergen.id, allergen);
    }
  }
  const byName = (a: AllergenRef, b: AllergenRef) => a.name.localeCompare(b.name);
  return {
    contains: [...required.values()].sort(byName),
    optionalOnly: [...optional.values()].filter((allergen) => !required.has(allergen.id)).sort(byName),
  };
}

export interface LineIssue {
  key: string;
  messageKey: string;
}

/** Client-side validation of the lines; the server repeats all of it (doc §5.3). */
export function validateLines(lines: readonly LineDraft[]): LineIssue[] {
  const issues: LineIssue[] = [];
  const seen = new Map<string, string>();
  for (const line of lines) {
    if (line.quantity === null || line.quantity <= 0) {
      issues.push({ key: line.key, messageKey: 'KITCHEN.RECIPES.ERRORS.QUANTITY' });
    } else if (line.quantity > 1_000_000) {
      issues.push({ key: line.key, messageKey: 'KITCHEN.RECIPES.ERRORS.QUANTITY_MAX' });
    }
    if (line.unitId === null) {
      issues.push({ key: line.key, messageKey: 'KITCHEN.RECIPES.ERRORS.UNIT' });
    }
    const identity = `${line.ingredientId}|${(line.section ?? '').trim().toLowerCase()}`;
    if (seen.has(identity)) {
      issues.push({ key: line.key, messageKey: 'KITCHEN.RECIPES.ERRORS.DUPLICATE' });
    }
    seen.set(identity, line.key);
  }
  return issues;
}

/** Sections in first-appearance order; `null` (no section) first. */
export function groupBySection(lines: readonly LineDraft[]): { section: string | null; lines: LineDraft[] }[] {
  const groups: { section: string | null; lines: LineDraft[] }[] = [];
  for (const line of lines) {
    const name = line.section?.trim() || null;
    let group = groups.find((entry) => entry.section === name);
    if (!group) {
      group = { section: name, lines: [] };
      if (name === null) {
        groups.unshift(group);
      } else {
        groups.push(group);
      }
    }
    group.lines.push(line);
  }
  return groups;
}
