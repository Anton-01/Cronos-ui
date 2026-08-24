import { CategoryScope, CategoryStatus, CategoryType } from 'src/app/core/models/category.model';

/** A `p-select` / `p-columnFilter` option with a typed value. */
export interface SelectOption<T> {
  label: string;
  value: T;
}

/** PrimeNG's `p-tag` severities, narrowed to the ones this module uses. */
export type TagSeverity = 'success' | 'info' | 'warn' | 'danger' | 'secondary' | 'contrast';

/**
 * Resolves a translation key to display text — `LanguageService.t` bound to a
 * component.
 *
 * The option builders below take one instead of injecting `LanguageService`
 * themselves so this file stays a pure presentation map with no Angular DI,
 * and so every caller re-runs them inside a `computed` that already tracks the
 * active locale.
 */
export type Translator = (key: string) => string;

const TYPE_LABEL_KEYS: Readonly<Record<CategoryType, string>> = {
  PRODUCT: 'CATEGORIES.TYPE.PRODUCT',
  INGREDIENT: 'CATEGORIES.TYPE.INGREDIENT',
};

const SCOPE_LABEL_KEYS: Readonly<Record<CategoryScope, string>> = {
  SYSTEM: 'CATEGORIES.SCOPE.SYSTEM',
  USER: 'CATEGORIES.SCOPE.USER',
};

const STATUS_LABEL_KEYS: Readonly<Record<CategoryStatus, string>> = {
  ACTIVE: 'COMMON.STATUS.ACTIVE',
  INACTIVE: 'COMMON.STATUS.INACTIVE',
};

/**
 * SYSTEM reads as platform-owned and immutable, so it takes the neutral dark
 * `contrast` tag; USER rows are the ones the baker can act on and take the
 * primary-tinted `info`.
 */
const SCOPE_SEVERITIES: Readonly<Record<CategoryScope, TagSeverity>> = {
  SYSTEM: 'contrast',
  USER: 'info',
};

const SCOPE_ICONS: Readonly<Record<CategoryScope, string>> = {
  SYSTEM: 'pi pi-lock',
  USER: 'pi pi-user-edit',
};

/** Display order for the type selector — also the order the API documents. */
const TYPE_VALUES: readonly CategoryType[] = ['PRODUCT', 'INGREDIENT'];
const SCOPE_VALUES: readonly CategoryScope[] = ['SYSTEM', 'USER'];
const STATUS_VALUES: readonly CategoryStatus[] = ['ACTIVE', 'INACTIVE'];

export function categoryTypeOptions(t: Translator): SelectOption<CategoryType>[] {
  return TYPE_VALUES.map((value) => ({ label: t(TYPE_LABEL_KEYS[value]), value }));
}

export function categoryScopeOptions(t: Translator): SelectOption<CategoryScope>[] {
  return SCOPE_VALUES.map((value) => ({ label: t(SCOPE_LABEL_KEYS[value]), value }));
}

export function categoryStatusOptions(t: Translator): SelectOption<CategoryStatus>[] {
  return STATUS_VALUES.map((value) => ({ label: t(STATUS_LABEL_KEYS[value]), value }));
}

export function categoryTypeLabelKey(type: CategoryType): string {
  return TYPE_LABEL_KEYS[type];
}

export function categoryScopeLabelKey(scope: CategoryScope): string {
  return SCOPE_LABEL_KEYS[scope];
}

export function categoryStatusLabelKey(status: CategoryStatus): string {
  return STATUS_LABEL_KEYS[status];
}

export function categoryScopeSeverity(scope: CategoryScope): TagSeverity {
  return SCOPE_SEVERITIES[scope];
}

export function categoryScopeIcon(scope: CategoryScope): string {
  return SCOPE_ICONS[scope];
}

/**
 * The single rule the whole module hangs on: SYSTEM rows are read-only for
 * everyone, and every USER row the list endpoints return already belongs to
 * the caller — so scope alone decides whether the action buttons render.
 */
export function isCategoryEditable(scope: CategoryScope): boolean {
  return scope === 'USER';
}
