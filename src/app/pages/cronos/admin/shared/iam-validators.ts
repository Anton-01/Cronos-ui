import { Validators } from '@angular/forms';

/** `ROLE_CODE`-style identifiers for roles and permission groups (doc §4.2, §6.2). */
export const IAM_CODE_PATTERN = /^[A-Z][A-Z0-9_]{1,49}$/;
export const IAM_CODE_MAX = 50;
export const IAM_NAME_MAX = 100;
export const IAM_DESCRIPTION_MAX = 500;

export const iamCodeValidators = [Validators.required, Validators.maxLength(IAM_CODE_MAX), Validators.pattern(IAM_CODE_PATTERN)];
export const iamNameValidators = [Validators.required, Validators.maxLength(IAM_NAME_MAX)];

/** Normalises free text typed into a code field: `sales manager` → `SALES_MANAGER`. */
export function toIamCode(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, IAM_CODE_MAX);
}
