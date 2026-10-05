# Account Settings — Backend API Contract

Frontend: `src/app/pages/cronos/account/account-settings/` (Angular 21 + PrimeNG 21).
TypeScript mirror of every shape below: `src/app/core/models/account.model.ts`,
`src/app/core/models/user.model.ts`. **Change the two together.**

## 0. Conventions (unchanged, restated for completeness)

| Item | Value |
|---|---|
| Base path | `/api/v1` |
| Auth | `Authorization: Bearer <access JWT>` — every endpoint below acts on the JWT subject; there is no `{id}` in the path |
| Locale | `Accept-Language: en` \| `es-MX` — localise every `message` |
| Success envelope | `{ "success": true, "message": string\|null, "data": T, "timestamp": ISO-8601 }` |
| Validation failure | HTTP 400 `{ "meta": { "traceId", "timestamp" }, "status": "ERROR", "message": "Validation Failed", "errors": [ { "code", "field", "message" } ] }` |
| Other failures | Same `errors[]` shape inside the standard envelope |

**`errors[].field` must be the request-body path** (`taxId`, `address.zipCode`,
`phoneNumber`). The UI calls `form.get(field)` with it and renders `message`
under that input — no mapping table exists on the client, so a renamed path
silently degrades to a toast.

Error codes the client understands: `VALIDATION_ERROR`, `VALIDATION_FIELD_ERROR`,
`DUPLICATE_RESOURCE`, `SYSTEM_RESOURCE_CONFLICT`, `UNAUTHORIZED_MODIFICATION`.

---

## 1. Profile

### 1.1 `GET /users/me` — *changed: add `avatarUrl`*

```json
{
  "success": true,
  "message": null,
  "timestamp": "2026-09-26T18:00:00Z",
  "data": {
    "id": "7b1e…",
    "username": "admin_cronos",
    "email": "admin@cronos.com",
    "firstName": "Antón",
    "lastName": "Admin",
    "phoneNumber": "+525512345678",
    "avatarUrl": "https://cdn.cronos.com/avatars/7b1e…/a91f3c.jpg",
    "enabled": true,
    "accountNonLocked": true,
    "twoFactorEnabled": false,
    "failedLoginAttempts": 0,
    "lockedUntil": null,
    "lastLoginAt": "2026-09-26T11:23:00Z",
    "passwordChangedAt": "2026-08-01T09:00:00Z",
    "roles": ["SUPER_ADMIN"],
    "createdAt": "2025-02-10T10:00:00Z",
    "updatedAt": "2026-09-26T18:00:00Z"
  }
}
```

- `avatarUrl`: `string | null`. `null` → UI renders initials. The URL **must change
  whenever the image changes** (content hash or version in the path/query) so
  browsers and the CDN never serve a stale picture.
- `phoneNumber`: E.164. Legacy rows that still hold bare national digits are
  tolerated by the UI (read as Mexico) — please backfill them to E.164.

### 1.2 `PUT /users/me` — *changed: full replace, `null` clears*

Request (`application/json`) — **every field is always sent**:

```json
{
  "username": "admin_cronos",
  "firstName": "Antón",
  "lastName": null,
  "phoneNumber": "+14155552671"
}
```

| Field | Rule |
|---|---|
| `username` | required, 3–50 chars, unique (case-insensitive) → `409 DUPLICATE_RESOURCE`, `field: "username"` |
| `firstName`, `lastName` | nullable, ≤ 100 chars. `null` clears the value |
| `phoneNumber` | nullable. When present: **E.164** (`^\+[1-9]\d{6,14}$`) **and** valid per `com.googlecode.libphonenumber:libphonenumber` → `PhoneNumberUtil.isValidNumber(parse(value, null))`. `null` clears it |

`email` is not accepted here (admin-only change). Ignore it if sent.

Response: `200`, `data` = the updated `UserResponse` (§1.1 shape).

> Behaviour change: previously omitted fields meant "leave unchanged", so a
> user could never remove their phone number. The client now sends the whole
> resource; treat `null` as "clear".

---

## 2. Avatar

### 2.1 `PUT /users/me/avatar` — *new*

Request: `multipart/form-data` with one part:

| Part | Type | Notes |
|---|---|---|
| `file` | `image/jpeg` | filename `avatar.jpg`. Already cropped client-side to **512 × 512**, JPEG q≈0.9, white matte behind transparency |

Server-side rules (never trust the client crop):

- Max size **2 MB** (`spring.servlet.multipart.max-file-size=2MB`) → `413`.
- Verify magic bytes, not just `Content-Type`; accept JPEG/PNG/WebP → otherwise `415`.
- Decode, then **re-encode** to JPEG (strips EXIF/GPS metadata and any payload
  appended after the image). Normalise to ≤ 512 × 512; reject if the shorter
  edge < 128 px → `400 VALIDATION_ERROR`, `field: "file"`.
- Store under a content-addressed key (e.g. `avatars/{userId}/{sha256-prefix}.jpg`),
  delete the previous object after the new one is committed.

Response `200`:

```json
{
  "success": true,
  "message": "Profile picture updated",
  "timestamp": "2026-09-26T18:05:00Z",
  "data": {
    "avatarUrl": "https://cdn.cronos.com/avatars/7b1e…/c42d9e.jpg",
    "updatedAt": "2026-09-26T18:05:00Z"
  }
}
```

### 2.2 `DELETE /users/me/avatar` — *new*

No body. Idempotent: `200` with `data: null` whether or not an avatar existed.
Subsequent `GET /users/me` returns `avatarUrl: null`.

---

## 3. Fiscal data (Mexico — SAT / CFDI 4.0)

One record per user. Only Mexican fiscal data is supported for now
(`address.country` is always `"MEX"`).

### 3.1 `GET /users/me/fiscal` — *new*

- Not registered yet → **`200` with `data: null`** (not `404`: an absent
  record is a normal state and must not trip error handling).
- Registered → `200` with `FiscalDataResponse`:

```json
{
  "success": true,
  "message": null,
  "timestamp": "2026-09-26T18:10:00Z",
  "data": {
    "legalName": "PASTELERIA CRONOS",
    "taxId": "GODE561231GR8",
    "taxRegime": "626",
    "taxpayerType": "INDIVIDUAL",
    "address": {
      "street": "Av. Reforma",
      "exteriorNumber": "222",
      "interiorNumber": null,
      "neighborhood": "Juárez",
      "municipality": "Cuauhtémoc",
      "state": "CMX",
      "zipCode": "06600",
      "country": "MEX"
    },
    "updatedAt": "2026-09-26T18:10:00Z"
  }
}
```

### 3.2 `PUT /users/me/fiscal` — *new, upsert*

Creates on first call, replaces afterwards. Request (`application/json`):

```json
{
  "legalName": "PASTELERIA CRONOS",
  "taxId": "GODE561231GR8",
  "taxRegime": "626",
  "address": {
    "street": "Av. Reforma",
    "exteriorNumber": "222",
    "interiorNumber": null,
    "neighborhood": "Juárez",
    "municipality": "Cuauhtémoc",
    "state": "CMX",
    "zipCode": "06600",
    "country": "MEX"
  }
}
```

Response: `200`, `data` = `FiscalDataResponse` (§3.1). `taxpayerType` is
**derived server-side** from the RFC length and is never accepted as input.

Validation (return every failure at once, each with its `field` path):

| Field | Rule | Client mirror |
|---|---|---|
| `legalName` | required, ≤ 254, stored uppercase, must **not** end in a corporate regime (`S.A. DE C.V.`, `S. DE R.L.`, `S.A.P.I.`, `S.A.S.`, `S.C.`, `A.C.` …) — CFDI 4.0 rejects it | `legalNameValidator` |
| `taxId` | required, uppercase. Individual `^[A-ZÑ&]{4}\d{6}[A-Z\d]{2}[A\d]$` (13), legal entity `^[A-ZÑ&]{3}\d{6}[A-Z\d]{2}[A\d]$` (12); the `YYMMDD` block must be a real date; reject the generic RFCs `XAXX010101000` / `XEXX010101000` | `rfcValidator` |
| `taxRegime` | required, SAT `c_RegimenFiscal` key, **and applicable to the RFC's taxpayer type** (table below) → otherwise `field: "taxRegime"` | `taxRegimeMatchesRfcValidator` |
| `address.street` | required, ≤ 150 | |
| `address.exteriorNumber` | required, ≤ 20 | |
| `address.interiorNumber` | nullable, ≤ 20 | |
| `address.neighborhood` | required, ≤ 100 | |
| `address.municipality` | required, ≤ 100 | |
| `address.state` | required, ISO 3166-2:MX code without prefix (`AGU` … `ZAC`, `CMX` for CDMX) | `MEXICAN_STATES` |
| `address.zipCode` | required, `^(0[1-9]\|[1-9]\d)\d{3}$`. Recommended: check it exists in SAT `c_CodigoPostal` | `mexicanZipCodeValidator` |
| `address.country` | must equal `"MEX"` | |

Regime ↔ taxpayer-type matrix (`src/app/core/constants/sat-catalogs.ts`):

| Regimes | Allowed for |
|---|---|
| 605, 606, 607, 608, 611, 612, 614, 615, 616, 621, 625 | `INDIVIDUAL` only |
| 601, 603, 620, 622, 623, 624 | `LEGAL_ENTITY` only |
| 610, 626 | both |

Not validated client-side (backend's call): the RFC check digit (homoclave
mod-11) and a live SAT *Lista de Contribuyentes Obligados* lookup.

Suggested persistence:

```sql
CREATE TABLE user_fiscal_data (
  user_id          UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  legal_name       VARCHAR(254) NOT NULL,
  tax_id           VARCHAR(13)  NOT NULL,
  taxpayer_type    VARCHAR(12)  NOT NULL CHECK (taxpayer_type IN ('INDIVIDUAL','LEGAL_ENTITY')),
  tax_regime       CHAR(3)      NOT NULL,
  street           VARCHAR(150) NOT NULL,
  exterior_number  VARCHAR(20)  NOT NULL,
  interior_number  VARCHAR(20),
  neighborhood     VARCHAR(100) NOT NULL,
  municipality     VARCHAR(100) NOT NULL,
  state            CHAR(3)      NOT NULL,
  zip_code         CHAR(5)      NOT NULL,
  country          CHAR(3)      NOT NULL DEFAULT 'MEX',
  created_at       TIMESTAMPTZ  NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ  NOT NULL DEFAULT now()
);
```

---

## 4. Security tab — existing endpoints, no change required

| Method | Path | Body |
|---|---|---|
| `POST` | `/auth/change-password` | `{ "currentPassword", "newPassword", "confirmPassword" }` — the UI now also blocks `newPassword == currentPassword`; please enforce it server-side too |
| `POST` | `/auth/2fa/setup` | **superseded** by `/users/me/two-factor/*` (iam-and-finance.md §8.2) |
| `POST` | `/auth/2fa/verify` \| `/auth/2fa/disable` | **superseded** by `/users/me/two-factor/*` |
| `GET` | `/auth/sessions` | → `ActiveSession[]` |
| `GET` | `/auth/login-history` | → `LoginHistoryEntry[]` |

## 5. Endpoint summary

| Method | Path | Status |
|---|---|---|
| `GET` | `/users/me` | changed — add `avatarUrl` |
| `PUT` | `/users/me` | changed — full replace, `null` clears, E.164 phone |
| `PUT` | `/users/me/avatar` | **new** — multipart `file` |
| `DELETE` | `/users/me/avatar` | **new** |
| `GET` | `/users/me/fiscal` | **new** — `data: null` when absent |
| `PUT` | `/users/me/fiscal` | **new** — upsert |
