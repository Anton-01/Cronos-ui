import { CategoryScope, CategoryStatus, CategoryType } from 'src/app/core/models/category.model';

/** A `p-select` / `p-columnFilter` option with a typed value. */
export interface SelectOption<T> {
  label: string;
  value: T;
}

/** PrimeNG's `p-tag` severities, narrowed to the ones this module uses. */
export type TagSeverity = 'success' | 'info' | 'warn' | 'danger' | 'secondary' | 'contrast';

const TYPE_LABELS: Readonly<Record<CategoryType, string>> = {
  PRODUCT: 'Producto',
  INGREDIENT: 'Ingrediente',
};

const SCOPE_LABELS: Readonly<Record<CategoryScope, string>> = {
  SYSTEM: 'Sistema',
  USER: 'Personalizada',
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

export const CATEGORY_TYPE_OPTIONS: SelectOption<CategoryType>[] = [
  { label: TYPE_LABELS.PRODUCT, value: 'PRODUCT' },
  { label: TYPE_LABELS.INGREDIENT, value: 'INGREDIENT' },
];

export const CATEGORY_SCOPE_OPTIONS: SelectOption<CategoryScope>[] = [
  { label: SCOPE_LABELS.SYSTEM, value: 'SYSTEM' },
  { label: SCOPE_LABELS.USER, value: 'USER' },
];

export const CATEGORY_STATUS_OPTIONS: SelectOption<CategoryStatus>[] = [
  { label: 'Activo', value: 'ACTIVE' },
  { label: 'Inactivo', value: 'INACTIVE' },
];

export function categoryTypeLabel(type: CategoryType): string {
  return TYPE_LABELS[type];
}

export function categoryScopeLabel(scope: CategoryScope): string {
  return SCOPE_LABELS[scope];
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
