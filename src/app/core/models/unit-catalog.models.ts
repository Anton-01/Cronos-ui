/**
 * Unit catalog contracts — the V8-redesigned `/unit-type` and
 * `/measurement-unit`, on-the-fly `/measurement-unit/convert`, and the
 * `.xlsx` bulk import pipeline (`/unit-type/import`, `/measurement-unit/import`,
 * `/data-imports`).
 *
 * These endpoints answer with a different envelope/page shape than the rest
 * of the API (`ApiEnvelope`/`CatalogPage` here vs. `ApiResponse`/`Page` in
 * `api-response.model.ts` / `pagination.model.ts`) — the redesign changed
 * both. Do not mix the two: a service built against one envelope reading the
 * other's field names compiles (both carry a `data`/`content`-ish shape) but
 * silently reads `undefined`.
 */

// ─── Envelope & pagination (this feature's own shape) ───

export interface ApiError {
  code: string;
  message: string;
  field: string | null;
  imageUrl?: string;
}

export interface ApiEnvelope<T> {
  meta: { traceId: string; timestamp: string };
  status: 'SUCCESS' | 'ERROR';
  message: string | null;
  data: T | null;
  errors?: ApiError[];
}

/** Named apart from `pagination.model.ts`'s `Page<T>` — different field names, same role. */
export interface CatalogPage<T> {
  content: T[];
  pageNumber: number;
  pageSize: number;
  totalElements: number;
  totalPages: number;
  last: boolean;
}

// ─── Enums ───

/** Complete — the backend normalizes to exactly these four after V8. */
export type UnitDimension = 'MASS' | 'VOLUME' | 'COUNT' | 'LENGTH';

export type RecordStatus = 'ACTIVE' | 'INACTIVE' | 'ARCHIVED';

// ─── Unit types ───

export interface UnitTypeRequest {
  codeIdentity: string;
  name: string;
  dimension: UnitDimension;
}

export interface UnitTypeResponse {
  id: number;
  codeIdentity: string;
  name: string;
  dimension: UnitDimension;
  status: RecordStatus;
  createdAt: string;
  createdBy: string | null;
  updatedAt: string | null;
  updatedBy: string | null;
}

// ─── Measurement units ───

export interface MeasurementUnitRequest {
  codeIdentity: string;
  name: string;
  namePlural: string;
  unitTypeId: number;
  multiplierToBase: number;
  isBaseUnit: boolean;
}

export interface MeasurementUnitResponse {
  id: number;
  codeIdentity: string;
  name: string;
  namePlural: string;
  unitTypeId: number;
  unitTypeCode: string;
  unitType: string;
  dimension: UnitDimension;
  multiplierToBase: number;
  isBaseUnit: boolean;
  isSystemDefault: boolean;
  /** `true` ⇒ `unitTypeId`/`multiplierToBase`/`isBaseUnit` are locked and the row cannot be deleted. */
  inUse: boolean;
  status: RecordStatus;
  createdAt: string;
  createdBy: string | null;
  updatedAt: string | null;
  updatedBy: string | null;
}

/** `GET /measurement-unit/catalog` — unpaged options for a unit picker. */
export interface MeasurementUnitOptionResponse {
  id: number;
  codeIdentity: string;
  name: string;
  namePlural: string;
  unitTypeId: number;
  unitTypeCode: string;
  unitType: string;
  dimension: UnitDimension;
  multiplierToBase: number;
  isBaseUnit: boolean;
}

export interface ChangeStatusRequest {
  status: RecordStatus;
}

// ─── On-the-fly conversion ───

export type ConversionPath = 'IDENTITY' | 'LINEAR' | 'DENSITY';

export interface UnitConversionRequest {
  quantity: number;
  fromUnitId: number;
  toUnitId: number;
  /** UUID — only used for MASS⇄VOLUME, and must be one of the caller's own raw materials. */
  rawMaterialId?: string;
}

export interface UnitConversionResponse {
  quantity: number;
  fromUnitId: number;
  fromUnitCode: string;
  toUnitId: number;
  toUnitCode: string;
  /** Up to 10 decimals — round only for display. */
  result: number;
  path: ConversionPath;
  densityRuleId: number | null;
  rawMaterialId: string | null;
}

// ─── .xlsx import ───

export type ImportResource = 'UNIT_TYPE' | 'MEASUREMENT_UNIT';
export type ImportStatus = 'VALIDATED' | 'COMMITTED' | 'REJECTED' | 'FAILED';
export type ImportAction = 'CREATE' | 'UPDATE' | 'UNCHANGED';
export type ImportIssueSeverity = 'ERROR' | 'WARNING';

export interface ImportIssue {
  /** Excel row (header = 1); `null` = a file-level problem, not a row. */
  row: number | null;
  column: string | null;
  severity: ImportIssueSeverity;
  /** Stable i18n key, e.g. `"import.cell.decimalComma"`. */
  code: string;
  /** Already translated per `Accept-Language`. */
  message: string;
}

/** `null` from = absent/deleted on that side. */
export interface FieldChange {
  from: unknown;
  to: unknown;
}

export interface ImportRowResult {
  row: number;
  /** The row's `codeIdentity`. */
  key: string;
  action: ImportAction;
  /** Filled in only once `status === 'COMMITTED'`. */
  recordId: number | null;
  /** `{}` when `action === 'UNCHANGED'`. */
  changes: Record<string, FieldChange>;
}

export interface ImportReport {
  batchId: string;
  resource: ImportResource;
  status: ImportStatus;
  dryRun: boolean;
  fileName: string;
  fileSizeBytes: number;
  fileSha256: string;
  totalRows: number;
  created: number;
  updated: number;
  unchanged: number;
  rejectedRows: number;
  errorCount: number;
  warningCount: number;
  /** At most 500 issues are kept — the counters above stay accurate regardless. */
  issuesTruncated: boolean;
  issues: ImportIssue[];
  /** Valid rows only; on `REJECTED` this shows what *would* have happened. */
  rows: ImportRowResult[];
  actorUsername: string;
  traceId: string | null;
  startedAt: string;
  finishedAt: string;
  durationMs: number;
}

export interface ImportBatchSummary {
  batchId: string;
  resource: ImportResource;
  status: ImportStatus;
  dryRun: boolean;
  fileName: string;
  fileSizeBytes: number;
  fileSha256: string;
  totalRows: number;
  created: number;
  updated: number;
  unchanged: number;
  rejectedRows: number;
  errorCount: number;
  warningCount: number;
  actorUsername: string;
  traceId: string | null;
  startedAt: string;
  finishedAt: string;
}

export interface ImportBatchQuery {
  resource?: ImportResource;
  status?: ImportStatus;
  page: number;
  size: number;
}
