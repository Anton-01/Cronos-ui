import { HttpParams } from '@angular/common/http';

type QueryValue = string | number | boolean | null | undefined | readonly (string | number)[];

/**
 * Builds `HttpParams` from a flat query object, skipping `null`, `undefined`,
 * `''` and empty arrays so an unset filter never reaches the API as
 * `?status=` (which Spring would bind as an empty enum and reject).
 * Arrays repeat the key (`?statuses=ACTIVE&statuses=LOCKED`).
 */
export function toHttpParams(query: object): HttpParams {
  let params = new HttpParams();
  for (const [key, raw] of Object.entries(query as Record<string, QueryValue>)) {
    if (raw === null || raw === undefined || raw === '') {
      continue;
    }
    if (Array.isArray(raw)) {
      for (const item of raw) {
        params = params.append(key, String(item));
      }
      continue;
    }
    params = params.set(key, String(raw));
  }
  return params;
}
