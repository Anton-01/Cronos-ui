import { CostStatus, PriceSource, RecipeDifficulty, RecipeFileKind, RecipeStatus } from 'src/app/core/models/kitchen.models';
import { SelectOption, Translator } from 'src/app/shared/i18n/catalog-options';

export type TagSeverity = 'success' | 'info' | 'warn' | 'danger' | 'secondary' | 'contrast';

export const RECIPE_STATUS_PILL: Readonly<Record<RecipeStatus, string>> = {
  DRAFT: 'status-pill-info',
  ACTIVE: 'status-pill-active',
  ARCHIVED: 'status-pill-inactive',
};

export const COST_STATUS_SEVERITY: Readonly<Record<CostStatus, TagSeverity>> = {
  CURRENT: 'success',
  STALE: 'warn',
  INCOMPLETE: 'danger',
};

export const COST_STATUS_ICON: Readonly<Record<CostStatus, string>> = {
  CURRENT: 'pi pi-check-circle',
  STALE: 'pi pi-clock',
  INCOMPLETE: 'pi pi-exclamation-circle',
};

export const PRICE_SOURCE_SEVERITY: Readonly<Record<PriceSource, TagSeverity>> = {
  OWN: 'success',
  REFERENCE: 'info',
  NONE: 'danger',
};

export const DIFFICULTY_ICON: Readonly<Record<RecipeDifficulty, string>> = {
  EASY: 'pi pi-star',
  MEDIUM: 'pi pi-star-half',
  ADVANCED: 'pi pi-star-fill',
};

export const FILE_KIND_ICON: Readonly<Record<RecipeFileKind, string>> = {
  IMAGE: 'pi pi-image',
  PDF: 'pi pi-file-pdf',
  DOCUMENT: 'pi pi-file-word',
  SPREADSHEET: 'pi pi-file-excel',
  VIDEO: 'pi pi-video',
  OTHER: 'pi pi-file',
};

const DIFFICULTIES: readonly RecipeDifficulty[] = ['EASY', 'MEDIUM', 'ADVANCED'];
const RECIPE_STATUSES: readonly RecipeStatus[] = ['ACTIVE', 'DRAFT', 'ARCHIVED'];

export function difficultyOptions(t: Translator): SelectOption<RecipeDifficulty>[] {
  return DIFFICULTIES.map((value) => ({ value, label: t(`KITCHEN.DIFFICULTY.${value}`) }));
}

export function recipeStatusOptions(t: Translator): SelectOption<RecipeStatus>[] {
  return RECIPE_STATUSES.map((value) => ({ value, label: t(`KITCHEN.RECIPE_STATUS.${value}`) }));
}

/** Total minutes as "2 h 15 min". */
export function formatMinutes(total: number, t: Translator): string {
  if (!total) {
    return '—';
  }
  const hours = Math.floor(total / 60);
  const minutes = total % 60;
  if (hours === 0) {
    return `${minutes} ${t('KITCHEN.UNITS.MIN')}`;
  }
  return minutes === 0 ? `${hours} ${t('KITCHEN.UNITS.H')}` : `${hours} ${t('KITCHEN.UNITS.H')} ${minutes} ${t('KITCHEN.UNITS.MIN')}`;
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) {
    return `${bytes} B`;
  }
  if (bytes < 1024 * 1024) {
    return `${(bytes / 1024).toFixed(1)} KB`;
  }
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
