/**
 * `errors[].code` values the API is contracted to return. A code outside this
 * union never matches a branch and falls through to the generic error toast,
 * which is the intended behaviour for an unrecognised failure.
 */
export type ApiErrorCode =
  | 'VALIDATION_ERROR'
  | 'VALIDATION_FIELD_ERROR'
  | 'DUPLICATE_RESOURCE'
  | 'SYSTEM_RESOURCE_CONFLICT'
  | 'UNAUTHORIZED_MODIFICATION'
  | 'TWO_FACTOR_ENROLLMENT_REQUIRED';

export interface ApiErrorDetail {
  code: ApiErrorCode;
  /** Form control the error belongs to, when the failure is field-scoped. */
  field?: string | null;
  message?: string | null;
  /** Illustration shown alongside the error on surfaces that render one. */
  imageUrl?: string | null;
}

export interface ApiResponse<T> {
  success: boolean;
  message: string | null;
  data: T;
  timestamp: string;
  /** Present only on failures — the interceptor rethrows this envelope. */
  errors?: ApiErrorDetail[];
}

/** `meta` block on the structured 400 validation envelope. */
export interface ApiErrorMeta {
  traceId: string;
  timestamp: string;
}

/**
 * The structured validation-failure envelope, exactly as the interceptor
 * rethrows it (see `error-interceptor.service.ts`, which unwraps
 * `HttpErrorResponse` and rethrows `error.error`). Distinct from
 * `ApiResponse<T>` — a validation failure carries `meta`/`status` instead of
 * `success`/`data`/`timestamp`.
 */
export interface ApiErrorResponse {
  meta: ApiErrorMeta;
  status: 'ERROR';
  message: string;
  errors: ApiErrorDetail[];
}
