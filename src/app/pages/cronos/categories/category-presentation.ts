import { CategoryScope, CategoryStatus, CategoryType } from 'src/app/core/models/category.model';
import { SelectOption, Translator, statusLabelKey, statusOptions } from 'src/app/shared/i18n/catalog-options';

export type { SelectOption, Translator };

/** PrimeNG's `p-tag` severities, narrowed to the ones this module uses. */
export type TagSeverity = 'success' | 'info' | 'warn' | 'danger' | 'secondary' | 'contrast';

const TYPE_LABEL_KEYS: Readonly<Record<CategoryType, string>> = {
  PRODUCT: 'CATEGORIES.TYPE.PRODUCT',
  INGREDIENT: 'CATEGORIES.TYPE.INGREDIENT',
};

const SCOPE_LABEL_KEYS: Readonly<Record<CategoryScope, string>> = {
  SYSTEM: 'CATEGORIES.SCOPE.SYSTEM',
  USER: 'CATEGORIES.SCOPE.USER',
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

export function categoryTypeOptions(t: Translator): SelectOption<CategoryType>[] {
  return TYPE_VALUES.map((value) => ({ label: t(TYPE_LABEL_KEYS[value]), value }));
}

export function categoryScopeOptions(t: Translator): SelectOption<CategoryScope>[] {
  return SCOPE_VALUES.map((value) => ({ label: t(SCOPE_LABEL_KEYS[value]), value }));
}

/** Status is common to every catalog entity, so it comes from the shared map. */
export const categoryStatusOptions = statusOptions;

export function categoryTypeLabelKey(type: CategoryType): string {
  return TYPE_LABEL_KEYS[type];
}

export function categoryScopeLabelKey(scope: CategoryScope): string {
  return SCOPE_LABEL_KEYS[scope];
}

export function categoryStatusLabelKey(status: CategoryStatus): string {
  return statusLabelKey(status);
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
