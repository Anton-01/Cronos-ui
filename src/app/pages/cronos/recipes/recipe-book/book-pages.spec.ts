import { RecipeLine } from 'src/app/core/models/kitchen.models';
import { IngredientRow, ingredientRows, paginateIngredients, paginateProcess, parseProcess, scaleQuantity } from './book-pages';

function line(id: string, section: string | null, displayOrder: number, optional = false): RecipeLine {
  return {
    id,
    ingredientId: `i-${id}`,
    ingredientName: `Ingredient ${id}`,
    section,
    quantity: 100,
    unitId: 1,
    unitCode: 'g',
    optional,
    quoteSelectable: optional,
    notes: null,
    allergens: [],
    lineCost: 1,
    displayOrder,
  };
}

describe('book pages', () => {
  describe('parseProcess', () => {
    it('reads Quill 2 ordered and bullet lists, numbering only ordered items', () => {
      const blocks = parseProcess(
        '<h2>Bizcocho</h2><ol><li data-list="ordered"><span class="ql-ui"></span>Bate los huevos</li><li data-list="bullet">Tip</li><li data-list="ordered">Hornea</li></ol>',
      );
      expect(blocks.map((block) => block.kind)).toEqual(['heading', 'step', 'bullet', 'step']);
      expect(blocks[1].number).toBe(1);
      expect(blocks[3].number).toBe(2);
      expect(blocks[1].html).toBe('Bate los huevos');
    });

    it('treats "1. text" paragraphs as steps and strips the number', () => {
      const blocks = parseProcess('<p>1. Precalienta el horno</p><p>Nota libre</p><p>2) Mezcla</p>');
      expect(blocks.map((block) => block.kind)).toEqual(['step', 'text', 'step']);
      expect(blocks[0].html).toBe('Precalienta el horno');
      expect(blocks[2].number).toBe(2);
    });

    it('skips empty paragraphs and empty input', () => {
      expect(parseProcess('<p><br></p><p> </p>')).toEqual([]);
      expect(parseProcess(null)).toEqual([]);
    });
  });

  describe('ingredientRows', () => {
    it('groups by section with unsectioned lines first and optional lines last', () => {
      const rows = ingredientRows([line('a', 'Masa', 0), line('b', null, 1), line('c', 'Masa', 2, true), line('d', 'Masa', 3)]);
      expect(rows.map((row) => row.section ?? row.line?.id)).toEqual(['b', 'Masa', 'a', 'd', 'c']);
    });
  });

  describe('paginateIngredients', () => {
    it('repeats the section heading as continued on the next page', () => {
      const rows: IngredientRow[] = [{ kind: 'section', section: 'Masa' }, ...['a', 'b', 'c', 'd'].map((id, i) => ({ kind: 'line' as const, line: line(id, 'Masa', i) }))];
      const pages = paginateIngredients(rows, 3);
      expect(pages.length).toBe(2);
      expect(pages[1][0]).toEqual({ kind: 'section', section: 'Masa', continued: true });
    });

    it('never leaves a heading alone at the end of a page', () => {
      const rows: IngredientRow[] = [
        { kind: 'line', line: line('a', null, 0) },
        { kind: 'line', line: line('b', null, 1) },
        { kind: 'section', section: 'Relleno' },
        { kind: 'line', line: line('c', 'Relleno', 2) },
      ];
      const pages = paginateIngredients(rows, 3);
      expect(pages[0].map((row) => row.kind)).toEqual(['line', 'line']);
      expect(pages[1][0].section).toBe('Relleno');
    });
  });

  describe('paginateProcess', () => {
    it('splits by text budget and keeps a heading with the next block', () => {
      const blocks = parseProcess(`<p>${'a'.repeat(500)}</p><h3>Montaje</h3><p>${'b'.repeat(500)}</p>`);
      const pages = paginateProcess(blocks, 900);
      expect(pages.length).toBe(2);
      expect(pages[1].map((block) => block.kind)).toEqual(['heading', 'text']);
    });
  });

  it('scales quantities with sensible rounding', () => {
    expect(scaleQuantity(250, 1.5)).toBe(375);
    expect(scaleQuantity(6, 0.5)).toBe(3);
    expect(scaleQuantity(3.333, 1)).toBe(3.33);
    expect(scaleQuantity(123.456, 1)).toBe(123.5);
  });
});
