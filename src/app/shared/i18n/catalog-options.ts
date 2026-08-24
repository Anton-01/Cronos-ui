/**
 * Presentation helpers shared by every catalog grid.
 *
 * The catalog pages (unit types, measurement units, allergens, ingredients,
 * categories, …) all render the same status filter and the same option shape,
 * so the labels are defined once here rather than re-declared per component —
 * a second copy is how one page ends up still saying "Activo" in English.
 */

/** A `p-select` / `p-columnFilter` option with a typed value. */
export interface SelectOption<T> {
  label: string;
  value: T;
}

/**
 * Resolves a translation key to display text — `LanguageService.t` bound to a
 * component. Taken as a parameter so this file stays free of Angular DI and so
 * callers run it inside a `computed` that already tracks the active locale.
 */
export type Translator = (key: string) => string;

/** The soft-enable flag shared by every catalog entity in Cronos. */
export type EntityStatus = 'ACTIVE' | 'INACTIVE';

const STATUS_LABEL_KEYS: Readonly<Record<EntityStatus, string>> = {
  ACTIVE: 'COMMON.STATUS.ACTIVE',
  INACTIVE: 'COMMON.STATUS.INACTIVE',
};

const STATUS_VALUES: readonly EntityStatus[] = ['ACTIVE', 'INACTIVE'];

export function statusLabelKey(status: EntityStatus): string {
  return STATUS_LABEL_KEYS[status];
}

/** Options for the "Estado / Status" column filter. */
export function statusOptions(t: Translator): SelectOption<EntityStatus>[] {
  return STATUS_VALUES.map((value) => ({ label: t(STATUS_LABEL_KEYS[value]), value }));
}
