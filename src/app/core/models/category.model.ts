/**
 * Category domain contracts.
 *
 * A category is scoped to a single business dimension — `PRODUCT` (what the
 * bakery sells) or `INGREDIENT` (what it buys) — and to a single owner:
 * `SYSTEM` rows ship with the platform and are immutable for everyone, while
 * `USER` rows belong to the caller. The list endpoints return SYSTEM ∪ the
 * caller's own USER rows, so any `USER` row the UI receives is editable.
 */

/** Business dimension a category classifies. Chosen at creation, immutable after. */
export type CategoryType = 'PRODUCT' | 'INGREDIENT';

/** Who owns the row. `SYSTEM` is read-only for every caller. */
export type CategoryScope = 'SYSTEM' | 'USER';

/** Soft-enable flag shared by every catalog entity in Cronos. */
export type CategoryStatus = 'ACTIVE' | 'INACTIVE';

export interface CategoryResponse {
  id: number;
  name: string;
  description: string | null;
  type: CategoryType;
  scope: CategoryScope;
  status: CategoryStatus;
}

/** POST /category — `type` is only ever sent on create. */
export interface CreateCategoryRequest {
  name: string;
  description?: string;
  type: CategoryType;
}

/** PUT /category/{id} — deliberately has no `type`: it cannot be changed. */
export interface UpdateCategoryRequest {
  name: string;
  description?: string;
}

/** Query string accepted by GET /category and GET /category/system. */
export interface CategoryQuery {
  type?: CategoryType;
  page: number;
  size: number;
  sort?: string;
}

/** One rejected row from POST /category/import. */
export interface CsvImportRowError {
  row: number;
  field: string | null;
  message: string;
}

/**
 * POST /category/import result. `errors` is optional because the backend
 * omits it on a fully successful import.
 */
export interface CsvImportResponse {
  totalRows: number;
  successCount: number;
  failureCount: number;
  errors?: CsvImportRowError[];
}
