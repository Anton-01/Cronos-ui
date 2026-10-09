import { RecipeDetail, RecipeLine } from 'src/app/core/models/kitchen.models';

/** One block of the recipe process as the book shows it. `html` is the server-sanitised fragment. */
export interface ProcessBlock {
  kind: 'step' | 'heading' | 'bullet' | 'text';
  html: string;
  /** Step number (1-based) for `step` blocks; 0 otherwise. */
  number: number;
  /** Plain-text length, used to fill pages. */
  length: number;
}

export interface IngredientRow {
  kind: 'section' | 'line';
  /** Section name for `section` rows (`continued` when a section spills onto the next page). */
  section?: string;
  continued?: boolean;
  line?: RecipeLine;
}

export type BookPage =
  | { kind: 'cover' }
  | { kind: 'ingredients'; rows: IngredientRow[]; first: boolean }
  | { kind: 'process'; blocks: ProcessBlock[]; first: boolean }
  | { kind: 'notes' };

/** Rows per ingredients page and text per process page — tuned for the fixed page height at the default type size. */
export const INGREDIENT_ROWS_PER_PAGE = 13;
export const PROCESS_CHARS_PER_PAGE = 900;
const BLOCK_OVERHEAD = 90;
const STEP_PREFIX = /^\s*(\d{1,3})\s*[.)\-–]\s+/;

/**
 * Splits the process HTML into steps. Understands Quill 2 lists
 * (`<ol><li data-list="ordered|bullet">`), plain `<ol>/<ul>`, headings, and
 * paragraphs written as "1. Do this" (numbered as steps).
 */
export function parseProcess(html: string | null, parser: DOMParser = new DOMParser()): ProcessBlock[] {
  if (!html?.trim()) {
    return [];
  }
  const body = parser.parseFromString(html, 'text/html').body;
  body.querySelectorAll('.ql-ui').forEach((node) => node.remove());
  const blocks: ProcessBlock[] = [];
  let step = 0;
  const push = (kind: ProcessBlock['kind'], element: Element, htmlOverride?: string) => {
    const text = (element.textContent ?? '').replace(/\s+/g, ' ').trim();
    if (!text) {
      return;
    }
    blocks.push({ kind, html: htmlOverride ?? element.innerHTML.trim(), number: kind === 'step' ? ++step : 0, length: text.length });
  };
  for (const element of Array.from(body.children)) {
    const tag = element.tagName.toLowerCase();
    if (tag === 'ol' || tag === 'ul') {
      for (const item of Array.from(element.children).filter((child) => child.tagName.toLowerCase() === 'li')) {
        const list = item.getAttribute('data-list');
        const ordered = list ? list === 'ordered' : tag === 'ol';
        push(ordered ? 'step' : 'bullet', item);
      }
    } else if (/^h[1-6]$/.test(tag)) {
      push('heading', element);
    } else if (tag === 'p' && STEP_PREFIX.test(element.textContent ?? '')) {
      push('step', element, element.innerHTML.replace(STEP_PREFIX, '').trim());
    } else {
      push('text', element);
    }
  }
  return blocks;
}

/** Ingredient rows grouped by section (first-appearance order, no section first), optional lines last within their group. */
export function ingredientRows(lines: readonly RecipeLine[]): IngredientRow[] {
  const ordered = lines.slice().sort((a, b) => a.displayOrder - b.displayOrder);
  const groups: { section: string | null; lines: RecipeLine[] }[] = [];
  for (const line of ordered) {
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
  const rows: IngredientRow[] = [];
  for (const group of groups) {
    if (group.section) {
      rows.push({ kind: 'section', section: group.section });
    }
    const sorted = [...group.lines.filter((line) => !line.optional), ...group.lines.filter((line) => line.optional)];
    rows.push(...sorted.map((line) => ({ kind: 'line' as const, line })));
  }
  return rows;
}

/** Fills ingredient pages; a section that spills over repeats its heading as "continued", and a heading is never left alone at a page end. */
export function paginateIngredients(rows: readonly IngredientRow[], perPage = INGREDIENT_ROWS_PER_PAGE): IngredientRow[][] {
  const pages: IngredientRow[][] = [];
  let current: IngredientRow[] = [];
  let section: string | null = null;
  for (const row of rows) {
    if (row.kind === 'section') {
      section = row.section ?? null;
    }
    const needsRoom = row.kind === 'section' ? 2 : 1;
    if (current.length + needsRoom > perPage && current.length > 0) {
      pages.push(current);
      current = row.kind === 'line' && section ? [{ kind: 'section', section, continued: true }] : [];
    }
    current.push(row);
  }
  if (current.length > 0) {
    pages.push(current);
  }
  return pages;
}

/** Fills process pages by text length; a heading moves with the block after it. */
export function paginateProcess(blocks: readonly ProcessBlock[], budget = PROCESS_CHARS_PER_PAGE): ProcessBlock[][] {
  const pages: ProcessBlock[][] = [];
  let current: ProcessBlock[] = [];
  let used = 0;
  blocks.forEach((block, index) => {
    const next = blocks[index + 1];
    const cost = block.length + BLOCK_OVERHEAD + (block.kind === 'heading' && next ? next.length + BLOCK_OVERHEAD : 0);
    if (used + cost > budget && current.length > 0) {
      pages.push(current);
      current = [];
      used = 0;
    }
    current.push(block);
    used += block.length + BLOCK_OVERHEAD;
  });
  if (current.length > 0) {
    pages.push(current);
  }
  return pages;
}

/** The whole book: cover, ingredients, process (or one "no process yet" page), notes. */
export function buildBook(recipe: RecipeDetail, parser?: DOMParser): BookPage[] {
  const pages: BookPage[] = [{ kind: 'cover' }];
  const ingredientPages = paginateIngredients(ingredientRows(recipe.lines));
  (ingredientPages.length > 0 ? ingredientPages : [[]]).forEach((rows, index) => pages.push({ kind: 'ingredients', rows, first: index === 0 }));
  const processPages = paginateProcess(parseProcess(recipe.processHtml, parser));
  (processPages.length > 0 ? processPages : [[]]).forEach((blocks, index) => pages.push({ kind: 'process', blocks, first: index === 0 }));
  pages.push({ kind: 'notes' });
  return pages;
}

/** Quantity × scale for display: up to 2 decimals for g/ml-scale numbers, 1 decimal above 100. */
export function scaleQuantity(quantity: number, scale: number): number {
  const value = quantity * scale;
  return value >= 100 ? Math.round(value * 10) / 10 : Math.round(value * 100) / 100;
}
