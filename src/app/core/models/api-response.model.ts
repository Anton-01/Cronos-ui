/**
 * `errors[].code` values the API is contracted to return. A code outside this
 * union never matches a branch and falls through to the generic error toast,
 * which is the intended behaviour for an unrecognised failure.
 */
export type ApiErrorCode =
  | 'VALIDATION_FIELD_ERROR'
  | 'DUPLICATE_RESOURCE'
  | 'SYSTEM_RESOURCE_CONFLICT'
  | 'UNAUTHORIZED_MODIFICATION';

export interface ApiErrorDetail {
  code: ApiErrorCode;
  /** Form control the error belongs to, when the failure is field-scoped. */
  field?: string | null;
  message?: string | null;
}

export interface ApiResponse<T> {
  success: boolean;
  message: string | null;
  data: T;
  timestamp: string;
  /** Present only on failures — the interceptor rethrows this envelope. */
  errors?: ApiErrorDetail[];
}
