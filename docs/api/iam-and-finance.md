# IAM & Finance Settings — Backend Handoff and API Contract

> **Audience:** the Claude agent (or engineer) implementing the Cronos backend.
> **Frontend:** `cronos-system-ui`, branch `feature/iam-and-finance-settings` — already built against this contract.
> **TypeScript mirror of every shape below:** `src/app/core/models/iam.models.ts` and `src/app/core/models/finance.models.ts`. **Change the doc and those two files together.**

---

## 0. Agent brief — read this first

### 0.1 Mission

Implement, in the existing Cronos backend (Spring Boot + JPA + Flyway, PostgreSQL — confirm by reading the repo before writing code), two modules:

1. **IAM (Identity & Access Management)** — users lifecycle, roles, a code-defined permission catalog, permission groups, per-user grants/denials, effective-permission resolution, segregation-of-duties (SoD) checks, security policy, sessions, sign-in history and an immutable audit log.
2. **Finance settings** — ISO 4217 currency catalog, IVA (VAT) rate catalog aligned with SAT CFDI 4.0, a single tenant default for each, and calculation settings (prices-include-tax, rounding mode) that every amount calculation must use.

The UI is finished and calls exactly the endpoints in this document. When this doc and the UI disagree, the TypeScript models win — tell the frontend owner instead of silently diverging.

### 0.2 Non-negotiables

| # | Rule |
|---|---|
| N1 | **Every endpoint is authorized server-side** by permission code (§1.4). The UI hiding a button is never the security boundary. |
| N2 | **Validate everything server-side** with Bean Validation + domain validation in the service layer. Return **all** field errors in one response (§1.3), each with the exact request-body `field` path. |
| N3 | **Optimistic locking** on every mutable aggregate (`@Version`). A stale `version` → `409 CONCURRENT_MODIFICATION`. Never last-write-wins. |
| N4 | **Every state-changing call writes an audit event in the same transaction** (§7). If the audit insert fails, the business change rolls back. |
| N5 | **No credentials ever leave the server**: no password, temporary password, reset token, TOTP secret or hash in any response or log. |
| N6 | **Money and rates are `BigDecimal`** (`NUMERIC` in SQL). Never `double`/`float`. Rounding is explicit (§11.3). |
| N7 | **Times are UTC instants** (`TIMESTAMPTZ`, ISO-8601 with `Z`). Calendar dates (`validFrom`, `accessExpiresAt`) are `LocalDate` interpreted in the tenant timezone `America/Mexico_City`. |
| N8 | **Localised messages** via `Accept-Language` (`es-MX` \| `en`) using `MessageSource`. Error `code`s are stable and never localised. |
| N9 | **Soft lifecycle, not hard delete**, for users. Roles, groups, currencies and tax rates may be hard-deleted only when unreferenced (otherwise `409 RESOURCE_IN_USE`). |
| N10 | **Thin controllers** → application services (transactions, authorization, audit) → domain (invariants) → repositories. DTOs ≠ entities (MapStruct or explicit mappers). No entity is ever serialised. |

### 0.3 Definition of done

- [ ] Flyway migrations (`V9__iam.sql`, `V10__finance.sql`, `V11__iam_seed.sql`, `V12__finance_seed.sql` — next free numbers in the repo) create schema + seeds (§12, §13).
- [ ] All endpoints in §15 implemented with the exact paths, verbs, bodies, status codes and error codes.
- [ ] Permission checks on every endpoint (§1.4 table) and on the **existing** business endpoints (recipes, quotes, catalogs…) per §5.2 — keep the legacy role checks working during the transition (§1.4.4).
- [ ] JWT carries `permissions` (§1.4.3); access changes invalidate affected sessions/tokens (§1.4.5).
- [ ] Effective-permission resolver + SoD evaluator are pure, deterministic and unit-tested (§1.4.2, §3.7).
- [ ] Audit log is append-only at the database level (§7.4).
- [ ] Quotes (and any other document that prices things) **snapshot** currency + tax at creation (§11.4).
- [ ] Tests: unit (domain + resolver + validators), slice (`@WebMvcTest` per controller: auth, validation, error envelope), integration (Testcontainers PostgreSQL: concurrency, constraints, audit atomicity). Target ≥ 85 % line coverage on the new packages.
- [ ] OpenAPI (springdoc) annotations generate a spec equivalent to this doc.
- [ ] No `TODO`, no commented-out code, no `@SuppressWarnings` without a one-line reason.

### 0.4 Suggested order of work

1. Read the repo: security config, JWT filter, existing `users`/`roles` tables, error handler, V8 envelope classes (`/unit-type` uses them — reuse, do not duplicate).
2. Permission catalog as **code** (enum/registry) + seed + resolver + JWT claim (§5, §1.4).
3. Audit infrastructure (§7) — everything after this writes events.
4. Users (§3), then roles (§4), groups (§6), SoD (§3.7), security policy (§8).
5. Finance (§9–§11) and the quote snapshot integration (§11.4).
6. Retrofit permission checks onto existing endpoints (§5.2).
7. Deprecate the legacy admin endpoints (§14).

---

## 1. Cross-cutting conventions

### 1.1 Base path, envelope, pagination

| Item | Value |
|---|---|
| Base path | `/api/v1` |
| Auth | `Authorization: Bearer <access JWT>` |
| Locale | `Accept-Language: es-MX` \| `en` (exact tags). Default `es-MX`. |
| Content type | `application/json; charset=UTF-8` unless stated (multipart, CSV) |

**Every endpoint in this document uses the V8 envelope** (same classes `/unit-type` already returns):

```json
{
  "meta": { "traceId": "4f1c2a9e7b", "timestamp": "2026-10-04T18:00:00Z" },
  "status": "SUCCESS",
  "message": null,
  "data": { }
}
```

Paged lists return `data` as a `CatalogPage`:

```json
{ "content": [], "pageNumber": 0, "pageSize": 10, "totalElements": 0, "totalPages": 0, "last": true }
```

- `page` is **0-based**; `size` ∈ [1, 100] (clamp, do not error); `sort=field,asc|desc` with a **whitelist** per endpoint (unknown field → `400 VALIDATION_ERROR`, `field: "sort"`).
- Multi-value filters repeat the key: `?statuses=ACTIVE&statuses=LOCKED`.

### 1.2 HTTP status usage

| Status | When |
|---|---|
| 200 | Read / update / action succeeded |
| 201 | Resource created (`POST` create). Include `Location` header. |
| 204 | Never — always return the envelope (the UI reads `data`). |
| 400 | Validation failure (`VALIDATION_ERROR`) |
| 401 | Missing/invalid/expired token |
| 403 | Authenticated but lacks permission (`ACCESS_DENIED`) or a guarded self-action (`SELF_MODIFICATION_FORBIDDEN`) or `PRIVILEGE_ESCALATION` |
| 404 | `RESOURCE_NOT_FOUND` |
| 409 | `CONCURRENT_MODIFICATION`, `DUPLICATE_RESOURCE`, `RESOURCE_IN_USE`, `INVALID_STATE_TRANSITION`, `SOD_CONFLICT`, `DEFAULT_LOCKED` |
| 413 / 415 | Upload too large / unsupported media |
| 422 | Never (use 400/409) |
| 429 | Rate limited (`RATE_LIMITED`, include `Retry-After`) |

### 1.3 Error envelope and codes

```json
{
  "meta": { "traceId": "4f1c2a9e7b", "timestamp": "2026-10-04T18:00:00Z" },
  "status": "ERROR",
  "message": "La solicitud contiene errores de validación",
  "data": null,
  "errors": [
    { "code": "VALIDATION_ERROR", "field": "email", "message": "Ingresa un correo electrónico válido" },
    { "code": "DUPLICATE_RESOURCE", "field": "username", "message": "El nombre de usuario ya está registrado" }
  ]
}
```

- `field` is the **request-body path** (`username`, `address.zipCode`, `permissions[3]`), or `null` for non-field errors. The UI calls `form.get(field)` with it — a wrong path silently degrades to a toast.
- `message` is localised and safe to show to end users. Never include stack traces, SQL, class names or internal ids.
- On 5xx: `errors: [{ code: "INTERNAL_ERROR", field: null, message: "…" }]` and log with the `traceId`.

**Error code catalog** (stable, upper snake):

| Code | HTTP | Meaning |
|---|---|---|
| `VALIDATION_ERROR` | 400 | Bean/domain validation failure on a field |
| `RESOURCE_NOT_FOUND` | 404 | Id does not exist (or is not visible to the caller) |
| `DUPLICATE_RESOURCE` | 409 | Unique key clash (username, email, code…) |
| `CONCURRENT_MODIFICATION` | 409 | `version` mismatch |
| `RESOURCE_IN_USE` | 409 | Delete/deactivate blocked by references |
| `INVALID_STATE_TRANSITION` | 409 | Lifecycle transition not allowed (§3.3) |
| `SELF_MODIFICATION_FORBIDDEN` | 403 | Admin acting on their own account where forbidden (§3.4) |
| `PRIVILEGE_ESCALATION` | 403 | Granting a permission the actor does not hold (§1.4.6) |
| `SOD_CONFLICT` | 409 | A BLOCKING SoD rule would be violated (§3.7) |
| `SYSTEM_RESOURCE_CONFLICT` | 409 | Modifying an immutable system role/group attribute |
| `DEFAULT_LOCKED` | 409 | Deactivating/deleting the default currency/tax rate |
| `ACCESS_DENIED` | 403 | Missing permission |
| `RATE_LIMITED` | 429 | Too many requests |
| `INTERNAL_ERROR` | 500 | Unexpected |

### 1.4 Authorization model

#### 1.4.1 Concepts

- **Permission** — a code-defined capability `MODULE.RESOURCE.ACTION` (e.g. `IAM.USER.RESET_CREDENTIALS`). Seeded from source; **not creatable via API**. Has `risk` and `dependsOn`.
- **Role** — named set of permissions + permission groups. Users get many roles.
- **Permission group** — reusable bundle of permissions; can be attached to roles **and** directly to users.
- **Direct grant** — a permission attached to one user.
- **Explicit denial** — a permission removed from one user regardless of source. **Denial always wins.**
- **SUPER_ADMIN** — root system role: always holds every permission, cannot be edited (except description), cannot be deleted, must always have ≥ 1 ACTIVE member.

#### 1.4.2 Effective-permission resolution (deterministic, pure function)

```
effective(user) =
  if user has ACTIVE role SUPER_ADMIN → ALL catalog codes
  else
    ( ⋃ perms(r)      for r in user.roles  where r.status = ACTIVE
    ∪ ⋃ perms(g)      for g in groups(r)   where r.status = ACTIVE and g.status = ACTIVE
    ∪ ⋃ perms(g)      for g in user.groups where g.status = ACTIVE
    ∪ user.grants )
    − user.denials
  then close over dependsOn: a permission whose dependencies are not all effective is NOT effective.
```

The resolver must also return, per code, every **source** (`ROLE`, `ROLE_GROUP` with `viaName`, `USER_GROUP`, `DIRECT_GRANT`) — the UI displays them (§3.6). Implement it as a pure class with no I/O (`EffectivePermissionResolver`), fed by a loaded snapshot; unit-test it exhaustively.

Cache the effective set per user (Caffeine, key = userId + `accessVersion`) and **evict** on any change to: the user's roles/groups/grants/denials, any of their roles' permissions/groups/status, any of their groups' permissions/status.

#### 1.4.3 JWT claims

```json
{ "sub": "<user uuid>", "roles": ["ROLE_ADMIN"], "permissions": ["IAM.USER.READ", "…"], "pv": 17, "iat": 0, "exp": 0 }
```

- `permissions` = effective set (§1.4.2). The UI treats it as **authoritative** when present.
- `pv` = the user's `access_version` at mint time (monotonic integer on `users`).
- If the set grows beyond ~150 codes, keep the claim (the UI needs it) but make sure the access token stays < 8 KB; never drop the claim silently.

#### 1.4.4 Transition from role checks

Existing endpoints use role checks (`SUPER_ADMIN`, `ADMIN`) and one permission (`MANAGE_CATALOGS`). During the transition:
- Keep `MANAGE_CATALOGS` in the JWT for users who hold `CATALOG.*.MANAGE` (alias) until the frontend drops it.
- Seed `ADMIN`/`MANAGER`/`USER` with permissions equivalent to their current capabilities (§13.2) so nobody loses access on deploy.

#### 1.4.5 Revocation on access change

Whenever a user's effective set **shrinks** (role/group removed, denial added, role/group deactivated or its permissions reduced) or their status leaves `ACTIVE`:
1. Increment `users.access_version`.
2. Revoke their refresh tokens / sessions (statuses SUSPENDED, LOCKED, DEACTIVATED: always; permission shrink: revoke refresh tokens so the next refresh mints a new claim).
3. The JWT filter rejects access tokens whose `pv` < current `access_version` (cheap lookup, cache with short TTL ≤ 30 s).

For a role/group change, do this for **every affected user** (batch update `access_version = access_version + 1 WHERE id IN (…)`).

#### 1.4.6 Privilege-escalation guard

An actor may only grant (to a role, group or user, directly or via membership) permissions **they themselves hold**, unless they are SUPER_ADMIN. Violations → `403 PRIVILEGE_ESCALATION` with `field` pointing at the first offending entry (`permissions[i]`, `roleIds[i]`, `permissionGroupIds[i]`, `grants[i]`, `addRoleIds[i]`). Only SUPER_ADMIN can assign the SUPER_ADMIN role.

#### 1.4.7 Endpoint → permission table (new endpoints)

| Endpoint group | Permission |
|---|---|
| `GET /iam/users`, `/stats`, `/{id}`, `/{id}/access`, `/availability` | `IAM.USER.READ` |
| `POST /iam/users` | `IAM.USER.CREATE` |
| `PUT /iam/users/{id}`, avatar PUT/DELETE | `IAM.USER.UPDATE` |
| `POST /iam/users/{id}/status`, `POST /iam/users/bulk/status` | `IAM.USER.CHANGE_STATUS` |
| `password-reset`, `require-password-change`, `two-factor/reset`, `invitation/resend` | `IAM.USER.RESET_CREDENTIALS` |
| `PUT /{id}/access`, `POST /{id}/access/preview`, `POST /bulk/roles` | `IAM.USER.MANAGE_ACCESS` |
| `GET/DELETE /{id}/sessions…`, `GET /{id}/login-history` | `IAM.USER.MANAGE_SESSIONS` |
| `GET /iam/users/export` | `IAM.USER.EXPORT` |
| `GET /iam/roles…`, `GET /iam/roles/{id}/members` | `IAM.ROLE.READ` |
| `POST /iam/roles`, `POST /iam/roles/{id}/clone` | `IAM.ROLE.CREATE` |
| `PUT /iam/roles/{id}`, `PATCH …/status` | `IAM.ROLE.UPDATE` |
| `DELETE /iam/roles/{id}` | `IAM.ROLE.DELETE` |
| `POST /iam/roles/{id}/members`, `…/members/remove` | `IAM.ROLE.MANAGE_MEMBERS` |
| `GET /iam/permissions` | any authenticated user holding `IAM.ROLE.READ` **or** `IAM.PERMISSION_GROUP.READ` **or** `IAM.USER.READ` |
| `GET /iam/permission-groups…` | `IAM.PERMISSION_GROUP.READ` |
| `POST/PUT/PATCH/DELETE /iam/permission-groups…` | `IAM.PERMISSION_GROUP.CREATE` / `UPDATE` / `UPDATE` / `DELETE` |
| `GET /iam/audit-events` / `export` | `IAM.AUDIT.READ` / `IAM.AUDIT.EXPORT` |
| `GET` / `PUT /iam/security-policy` | `IAM.SECURITY_POLICY.READ` / `UPDATE` |
| `GET /finance/currencies…`, `/catalog` | `FINANCE.CURRENCY.READ` (`/catalog`: any authenticated user — pickers in quotes) |
| `POST/PUT/PATCH status/DELETE /finance/currencies…` | `FINANCE.CURRENCY.MANAGE` |
| `GET /finance/tax-rates…`, `/catalog` | `FINANCE.TAX_RATE.READ` (`/catalog`: any authenticated user) |
| `POST/PUT/PATCH status/DELETE /finance/tax-rates…` | `FINANCE.TAX_RATE.MANAGE` |
| `PATCH …/{id}/default` (both catalogs), `PUT /finance/settings` | `FINANCE.SETTINGS.UPDATE` |
| `GET /finance/settings` | any authenticated user |

Use `@PreAuthorize("hasAuthority('IAM.USER.READ')")` (map each permission code to a `GrantedAuthority` from the JWT). Keep authorization in one place per endpoint — no ad-hoc `if (user.isAdmin())` inside services, except the object-level rules in §3.4.

### 1.5 Business justification ("reason")

Privileged changes require a free-text justification stored on the audit event:

| Call | Field | Rule |
|---|---|---|
| `PUT /iam/users/{id}/access` | `reason` | required, trimmed length 10–500 |
| `POST /iam/users/bulk/roles` | `reason` | required, 10–500 |
| `POST /iam/roles/{id}/members`, `/members/remove` | `reason` | required, 10–500 |
| `POST /iam/users/{id}/two-factor/reset` | `reason` | required, 10–500 |
| `POST /iam/users/{id}/status`, bulk status | `reason` (enum) + `comment` | `comment` required (10–500) when `reason = OTHER`, else optional ≤ 500 |

Strip control characters; reject strings that are only whitespace.

### 1.6 Rate limiting & abuse controls

| Endpoint | Limit |
|---|---|
| `GET /iam/users/availability` | 30 req/min per actor |
| `POST …/password-reset`, `…/invitation/resend` | 5 req/hour per **target user** |
| `GET …/export` (users, audit) | 5 req/10 min per actor; stream, never buffer whole result |
| `POST …/access/preview` | 60 req/min per actor |

---

## 2. Shared shapes

```ts
RoleRef            { id: number, code: string, name: string, color: string|null }
PermissionGroupRef { id: number, code: string, name: string }
UserRef            { id: string(uuid), username: string, displayName: string, avatarUrl: string|null }
FieldChange        { from: unknown|null, to: unknown|null }
```

`displayName` = `trim(firstName + " " + lastName)`, falling back to `username`.

---

## 3. Users — `/api/v1/iam/users`

### 3.1 Read model

`IamUserSummary` (list rows):

```json
{
  "id": "7b1e2c4a-…",
  "username": "mlopez",
  "email": "maria.lopez@cronos.mx",
  "firstName": "María",
  "lastName": "López",
  "displayName": "María López",
  "avatarUrl": null,
  "jobTitle": "Gerente comercial",
  "department": "Ventas",
  "status": "ACTIVE",
  "roles": [{ "id": 3, "code": "SALES_MANAGER", "name": "Gerente de ventas", "color": "#2563eb" }],
  "twoFactorEnabled": true,
  "mustChangePassword": false,
  "lastLoginAt": "2026-10-03T16:20:00Z",
  "statusUntil": null,
  "accessExpiresAt": null,
  "createdAt": "2026-05-10T10:00:00Z"
}
```

`IamUserDetail` = summary + :

```json
{
  "phoneNumber": "+525512345678",
  "employeeNumber": "EMP-0042",
  "locale": "es-MX",
  "emailVerified": true,
  "failedLoginAttempts": 0,
  "passwordChangedAt": "2026-08-01T09:00:00Z",
  "statusReason": null,
  "statusComment": null,
  "statusChangedAt": null,
  "statusChangedBy": null,
  "invitationExpiresAt": null,
  "createdBy": { "id": "…", "username": "aortiz", "displayName": "Antonio Ortiz", "avatarUrl": null },
  "updatedAt": "2026-10-02T10:00:00Z",
  "updatedBy": null,
  "version": 3
}
```

### 3.2 Field rules (shared by create and update)

| Field | Rule | Client mirror |
|---|---|---|
| `username` | required; 3–50; `^[a-zA-Z0-9](?:[a-zA-Z0-9._-]{1,48})[a-zA-Z0-9]$`; no two consecutive `.` `_` `-`; unique **case-insensitive** (`citext` or `lower()` unique index); reserved words rejected (`admin`, `root`, `system`, `support`, `null`, `undefined`) | `USERNAME_PATTERN` |
| `email` | required; ≤ 254; RFC 5322 (Hibernate `@Email` + domain has a dot); stored lowercase; unique case-insensitive | `Validators.email` |
| `firstName`, `lastName` | required; trimmed 1–100; letters (Unicode `\p{L}`), spaces, `'`, `-`, `.`; collapse internal whitespace | `NAME_MAX` |
| `phoneNumber` | nullable; E.164 `^\+[1-9]\d{6,14}$` **and** `PhoneNumberUtil.isValidNumber` (libphonenumber) | `app-phone-input` |
| `jobTitle`, `department` | nullable; ≤ 100 | |
| `employeeNumber` | nullable; ≤ 30; `^[A-Za-z0-9-]+$`; unique when not null | `EMPLOYEE_NUMBER_PATTERN` |
| `locale` | required; `es-MX` \| `en` | |
| `accessExpiresAt` | nullable `LocalDate`; must be **> today** (tenant TZ) on create and when changed | `minDate` |
| `roleIds` | each must exist and be ACTIVE; no duplicates; escalation guard (§1.4.6) | |
| `permissionGroupIds` | each must exist and be ACTIVE; no duplicates; escalation guard | |

Trim every string; turn blank optional strings into `null`.

### 3.3 Lifecycle state machine

```
PENDING_ACTIVATION ──activate/accept invitation──► ACTIVE
PENDING_ACTIVATION ──────────────────────────────► DEACTIVATED
ACTIVE ──► SUSPENDED | LOCKED | DEACTIVATED
SUSPENDED ──► ACTIVE | DEACTIVATED
LOCKED ──► ACTIVE | DEACTIVATED
DEACTIVATED ──► ACTIVE   (reactivation; requires a fresh password reset)
```

- Anything else → `409 INVALID_STATE_TRANSITION`, `field: "status"`.
- `until` (instant) allowed only for SUSPENDED/LOCKED; must be in the future and ≤ 365 days ahead. A scheduler (every minute, `ShedLock`) reverts expired ones to ACTIVE and writes an audit event with `actor = null`.
- Automatic LOCK on `maxFailedAttempts` (§8) sets `until = now + lockoutMinutes`, `statusReason = SECURITY_INCIDENT`, comment `"AUTO_LOCKOUT"`.
- `accessExpiresAt` reached → scheduler sets DEACTIVATED with reason `OFFBOARDING`, comment `"ACCESS_EXPIRED"`.
- Leaving ACTIVE → revoke sessions + bump `access_version` (§1.4.5).
- DEACTIVATED users: excluded from login, keep all data and history; username/email remain reserved.

### 3.4 Object-level rules (self-protection & root protection)

| Rule | Error |
|---|---|
| An actor cannot change their **own** status, access, credentials (reset/2FA reset/force change) or sessions via `/iam/users/{self}` (they use `/users/me` and `/auth/*`) | `403 SELF_MODIFICATION_FORBIDDEN` |
| The last ACTIVE member of SUPER_ADMIN cannot be suspended/locked/deactivated or lose the role | `409 SYSTEM_RESOURCE_CONFLICT` |
| Only SUPER_ADMIN may modify a user who holds SUPER_ADMIN | `403 ACCESS_DENIED` |
| Bulk operations skip the actor and report them in `failed[]` with `SELF_MODIFICATION_FORBIDDEN` | — |

### 3.5 Endpoints

#### `GET /iam/users` → `CatalogPage<IamUserSummary>`

Query: `page`, `size`, `sort` (whitelist: `displayName`, `username`, `email`, `status`, `lastLoginAt`, `createdAt`; default `createdAt,desc`), `search` (case/accent-insensitive `ILIKE unaccent()` on username, email, first/last name, employeeNumber; min 2 chars after trim, else ignored), `statuses[]`, `roleIds[]`, `twoFactorEnabled`.
Index: `GIN (to_tsvector)` or trigram on the searched columns when the table grows.

#### `GET /iam/users/stats` → `UserStats`

```json
{ "total": 42, "byStatus": { "PENDING_ACTIVATION": 3, "ACTIVE": 34, "SUSPENDED": 1, "LOCKED": 2, "DEACTIVATED": 2 },
  "twoFactorEnabled": 20, "neverLoggedIn": 5, "dormant": 4, "expiringSoon": 1 }
```
`dormant` = ACTIVE with `last_login_at < now() - 90 days` (or null and created > 90 days ago). `expiringSoon` = `access_expires_at` within 30 days. Every status key is always present (0 when none).

#### `GET /iam/users/availability?username=&email=&excludeId=` → `UserAvailability`

`{ "usernameAvailable": true|false|null, "emailAvailable": true|false|null }` — `null` for the parameter not sent. Same normalisation as create (trim, lowercase email, case-insensitive). Never reveal anything else about the matching account.

#### `POST /iam/users` → `201 IamUserDetail`

`multipart/form-data`:

| Part | Type | Notes |
|---|---|---|
| `user` | `application/json` | `CreateUserRequest` |
| `avatar` | `image/jpeg` | optional; same rules as §3.5 avatar |

```json
{
  "username": "cmendoza",
  "email": "carla.mendoza@cronos.mx",
  "firstName": "Carla",
  "lastName": "Mendoza",
  "phoneNumber": "+525511223344",
  "jobTitle": "Analista",
  "department": "Finanzas",
  "employeeNumber": "EMP-0101",
  "locale": "es-MX",
  "roleIds": [3],
  "permissionGroupIds": [10],
  "accessExpiresAt": "2027-03-31",
  "activationMode": "INVITATION",
  "requireTwoFactor": true
}
```

- Status starts at `PENDING_ACTIVATION`; `mustChangePassword = true` for `TEMPORARY_PASSWORD`.
- `INVITATION`: create a single-use token (32 random bytes, store **SHA-256 hash only**), TTL = `invitationTtlHours` (§8); email the link `…/auth/activate?token=…` in the user's `locale`. On acceptance the user sets a password that satisfies the policy → ACTIVE.
- `TEMPORARY_PASSWORD`: generate a policy-compliant random password (SecureRandom, ≥ max(policy min, 14) chars), hash with the existing encoder (BCrypt/Argon2), email it, set `mustChangePassword = true`; the first login forces the change → ACTIVE on success. **Never** return or log it.
- `requireTwoFactor = true` → user must enrol TOTP before reaching any other endpoint (also enforced when one of their roles is in `twoFactorRequiredRoleIds`).
- Email sending happens **after commit** (`@TransactionalEventListener(phase = AFTER_COMMIT)`), with retry/outbox; a mail failure must not roll back the user but must be visible (audit `INVITATION_DELIVERY_FAILED`, WARNING).
- Audit: `USER_CREATED` (changes = all fields, roles, groups; never secrets).

#### `GET /iam/users/{id}` → `IamUserDetail`

#### `PUT /iam/users/{id}` → `IamUserDetail`

Full replace of profile fields (`UpdateUserRequest`: same fields as create minus access/activation, plus `version`). `null` clears optional fields.
- Email change → `emailVerified = false`, send verification to the **new** address and a notice to the **old** one; audit `USER_EMAIL_CHANGED` (NOTICE).
- Username change → audit `USER_RENAMED`.
- Audit `USER_UPDATED` with a per-field diff (`changes`).

#### `POST /iam/users/{id}/status` → `IamUserDetail`

```json
{ "status": "SUSPENDED", "reason": "LEAVE_OF_ABSENCE", "comment": "Incapacidad médica", "until": "2026-10-20T06:00:00Z", "revokeSessions": true, "version": 3 }
```
`reason` ∈ `SECURITY_INCIDENT | POLICY_VIOLATION | OFFBOARDING | LEAVE_OF_ABSENCE | ROLE_CHANGE | ADMIN_REQUEST | OTHER`. Persist `status_reason`, `status_comment`, `status_changed_at/by`, `status_until`. Activating from LOCKED resets `failed_login_attempts`. Reactivating from DEACTIVATED additionally triggers an EMAIL_LINK password reset. Audit `USER_STATUS_CHANGED` (severity: LOCKED/DEACTIVATED → WARNING, others NOTICE).

#### `PUT /iam/users/{id}/avatar` (multipart `file`) → `{ avatarUrl, updatedAt }` · `DELETE /iam/users/{id}/avatar` → `data: null`

Same server rules as `/users/me/avatar` in `account-settings.md` §2 (≤ 2 MB, magic bytes JPEG/PNG/WebP, decode + re-encode to JPEG to strip metadata, shorter edge ≥ 128 px, content-addressed key, delete previous object after commit). Reuse that service — do not duplicate it. DELETE is idempotent.

#### Credentials

| Endpoint | Body | Behaviour |
|---|---|---|
| `POST /{id}/password-reset` | `{ "mode": "EMAIL_LINK"\|"TEMPORARY_PASSWORD", "revokeSessions": true }` | Only for ACTIVE/LOCKED users. Link TTL 60 min, single use, previous tokens invalidated. Response `{ mode, deliveredTo: "c***@cronos.mx", expiresAt }`. Audit `USER_PASSWORD_RESET_ISSUED`. |
| `POST /{id}/require-password-change` | `{}` | Sets `mustChangePassword = true` → `IamUserDetail`. Audit. |
| `POST /{id}/two-factor/reset` | `{ "reason": "…" }` | Deletes TOTP secret + recovery codes, `twoFactorEnabled = false`, revokes sessions. Audit `USER_2FA_RESET` (WARNING). |
| `POST /{id}/invitation/resend` | `{}` | Only PENDING_ACTIVATION. New token, old invalidated, TTL from policy → `IamUserDetail` (with new `invitationExpiresAt`). |

Masking rule for `deliveredTo`: first char of local part + `***` + `@` + domain.

### 3.6 Access

#### `GET /iam/users/{id}/access` → `UserAccess`

```json
{
  "roles": [{ "id": 3, "code": "SALES_MANAGER", "name": "Gerente de ventas", "color": "#2563eb" }],
  "permissionGroups": [{ "id": 10, "code": "FINANCE_READ", "name": "Consulta financiera" }],
  "grants": ["IAM.AUDIT.READ"],
  "denials": ["QUOTE.QUOTE.APPROVE"],
  "effective": [
    { "code": "QUOTE.QUOTE.READ", "granted": true, "deniedExplicitly": false,
      "sources": [{ "type": "ROLE", "id": 3, "name": "Gerente de ventas", "viaName": null }] },
    { "code": "QUOTE.QUOTE.APPROVE", "granted": false, "deniedExplicitly": true,
      "sources": [{ "type": "ROLE", "id": 3, "name": "Gerente de ventas", "viaName": null }] },
    { "code": "FINANCE.TAX_RATE.READ", "granted": true, "deniedExplicitly": false,
      "sources": [{ "type": "ROLE_GROUP", "id": 10, "name": "Consulta financiera", "viaName": "Gerente de ventas" }] }
  ],
  "sodConflicts": [],
  "version": 3
}
```
`effective` lists every code that has ≥ 1 source **or** is denied. `version` is the user's version.

#### `POST /iam/users/{id}/access/preview` → `AccessPreview` (nothing persisted)

Body: `{ roleIds, permissionGroupIds, grants, denials }`. Response: `{ effective, sodConflicts, added: string[], removed: string[] }` where `added/removed` compare the **granted** codes of the proposal vs the current state. Run the same validations as the save (unknown ids/codes → 400) but **not** the escalation guard (preview is informative).

#### `PUT /iam/users/{id}/access` → `UserAccess`

```json
{ "roleIds": [3], "permissionGroupIds": [10], "grants": ["IAM.AUDIT.READ"], "denials": [], "reason": "Promoción a gerente comercial", "version": 3 }
```
Validation: codes exist in the catalog; no code in both `grants` and `denials`; a grant already provided by a role/group is accepted but stored (it survives role removal — that is the point of a grant); escalation guard (§1.4.6); SoD (§3.7); self-modification (§3.4).
Side effects: bump `version` and (if anything was removed) `access_version` + revoke refresh tokens. Audit `USER_ACCESS_CHANGED` with `changes = { roles: {from,to}, permissionGroups: {from,to}, grants: {from,to}, denials: {from,to}, effectiveAdded: [...], effectiveRemoved: [...] }`, severity NOTICE (WARNING if any CRITICAL permission was added).

### 3.7 Segregation of duties (SoD)

Rules are configuration, seeded by migration (§13.3), read by an evaluator:

```
SodRule { code, name(es/en), description(es/en), severity: WARNING|BLOCKING, permissionSets: string[][] }
conflict when the subject's effective set contains ≥ 1 code from EVERY set in permissionSets
```

- Evaluate for users (access save/preview, bulk roles, role member add) and for roles (role save — report in `IamRoleDetail.sodConflicts`).
- `WARNING` → returned in `sodConflicts`, save allowed; the audit event records the conflict and the justification.
- `BLOCKING` → `409 SOD_CONFLICT`, `field: null`, message names the rule. SUPER_ADMIN is exempt (but still reported).
- Expose read-only `GET /iam/sod-rules` (permission `IAM.ROLE.READ`) for future UI; not used by the current UI.

### 3.8 Sessions & sign-in history

- `GET /{id}/sessions` → `UserSession[]` (`id, ipAddress, browser, os, device, location, createdAt, lastActivityAt, expiresAt`) — only non-expired, non-revoked.
- `DELETE /{id}/sessions/{sessionId}` → `data: null` (404 if not the user's). Audit `USER_SESSION_REVOKED`.
- `DELETE /{id}/sessions` → `{ "revoked": 3 }`. Audit.
- `GET /{id}/login-history?page&size` → `CatalogPage<LoginAttempt>` newest first: `id, occurredAt, outcome (SUCCESS|FAILURE|LOCKED|TWO_FACTOR_FAILED), failureReason (localised, generic — never "user not found" vs "bad password"), ipAddress, browser, os, location`.
- Parse UA with a library (e.g. `ua-parser`); geo-IP optional (city, country) — `null` when unavailable.

### 3.9 Bulk

`POST /iam/users/bulk/status`:
```json
{ "userIds": ["…"], "status": "SUSPENDED", "reason": "ADMIN_REQUEST", "comment": null }
```
`POST /iam/users/bulk/roles`:
```json
{ "userIds": ["…"], "addRoleIds": [3], "removeRoleIds": [5], "reason": "Reestructura del área comercial" }
```
→ `BulkResult { succeeded: string[], failed: [{ id, code, message }] }`.
- `userIds`: 1–200, unique.
- Per-user processing in **its own transaction** (partial success is expected and reported), each with its own audit event, plus one summary event `USER_BULK_OPERATION`.
- `addRoleIds ∩ removeRoleIds = ∅` → 400.

### 3.10 Export

`GET /iam/users/export?{same filters as search}` → `text/csv; charset=UTF-8` with BOM, `Content-Disposition: attachment; filename*=UTF-8''usuarios-2026-10-04.csv`. Columns: id, username, email, firstName, lastName, status, roles (pipe-separated codes), twoFactorEnabled, lastLoginAt, createdAt, accessExpiresAt. Stream rows (`StreamingResponseBody` + JDBC fetch size). Neutralise CSV injection: prefix cells starting with `= + - @ \t \r` with `'`. Audit `USER_EXPORT` (NOTICE) with filter summary and row count.

---

## 4. Roles — `/api/v1/iam/roles`

### 4.1 Shapes

`IamRoleSummary`: `id, code, name, description, color, system, status (ACTIVE|INACTIVE), userCount, permissionCount, permissionGroupCount, updatedAt`.
`IamRoleDetail` = summary + `permissions: string[]` (direct), `permissionGroups: PermissionGroupRef[]`, `effectivePermissions: string[]` (direct ∪ groups, closed over dependsOn), `sodConflicts`, `createdAt`, `createdBy`, `updatedBy`, `version`.
`userCount` counts users with the role in any status except DEACTIVATED.

### 4.2 Rules

| Field | Rule |
|---|---|
| `code` | required; `^[A-Z][A-Z0-9_]{1,49}$`; unique; **immutable** for `system` roles (→ `409 SYSTEM_RESOURCE_CONFLICT`); `ROLE_` prefix forbidden (Spring adds it) |
| `name` | required; trimmed 1–100; unique case-insensitive |
| `description` | nullable; ≤ 500 |
| `color` | nullable; `^#[0-9A-Fa-f]{6}$` |
| `permissions` | each code exists; no duplicates; store the **dependsOn closure** (auto-add, do not reject) |
| `permissionGroupIds` | exist; ACTIVE; no duplicates |
| at least one permission or group | else `400`, `field: "permissions"` |
| SUPER_ADMIN | only `description` and `color` editable; permissions are implicit (ALL) |
| escalation guard | §1.4.6 |

### 4.3 Endpoints

| Method | Path | Body → Response | Notes |
|---|---|---|---|
| GET | `/iam/roles?search=&status=` | → `IamRoleSummary[]` (unpaged, sorted by name) | |
| GET | `/iam/roles/{id}` | → `IamRoleDetail` | |
| POST | `/iam/roles` | `RoleRequest` → `201 IamRoleDetail` | audit `ROLE_CREATED` |
| PUT | `/iam/roles/{id}` | `RoleRequest` (+`version`) → `IamRoleDetail` | audit `ROLE_UPDATED` with permission diff; if permissions shrank → bump `access_version` of all members (§1.4.5); WARNING if a CRITICAL permission was added |
| PATCH | `/iam/roles/{id}/status` | `{ status, version }` → `IamRoleDetail` | system roles cannot be deactivated (`409 SYSTEM_RESOURCE_CONFLICT`); deactivation revokes members' tokens |
| POST | `/iam/roles/{id}/clone` | `{ code, name }` → `201 IamRoleDetail` | copies permissions + groups + description + color, `system = false`, no members |
| DELETE | `/iam/roles/{id}` | → `data: null` | only `!system && userCount == 0` → else `409 RESOURCE_IN_USE` / `SYSTEM_RESOURCE_CONFLICT`; also remove it from `twoFactorRequiredRoleIds` |
| GET | `/iam/roles/{id}/members?page&size&search` | → `CatalogPage<IamUserSummary>` | |
| POST | `/iam/roles/{id}/members` | `{ userIds (1–200), reason }` → `{ added }` | idempotent per user (already-members are skipped, not errors); role must be ACTIVE; escalation + SoD + self rules; audit per user `USER_ACCESS_CHANGED` |
| POST | `/iam/roles/{id}/members/remove` | `{ userIds, reason }` → `{ removed }` | last-SUPER_ADMIN rule; revoke removed users' tokens |

---

## 5. Permission catalog — `GET /api/v1/iam/permissions`

### 5.1 Shape

```json
[
  {
    "code": "IAM.USER.RESET_CREDENTIALS",
    "module": "IAM", "resource": "USER", "action": "RESET_CREDENTIALS",
    "moduleName": "Identidad y accesos", "resourceName": "Usuarios",
    "name": "Restablecer credenciales",
    "description": "Enviar restablecimiento de contraseña, forzar cambio, reiniciar 2FA y reenviar invitaciones",
    "risk": "HIGH",
    "dependsOn": ["IAM.USER.READ"]
  }
]
```

- Defined **in code** (one registry/enum is the single source of truth) and synchronised to the `permissions` table at startup (insert new, update names/risk/dependsOn, mark removed as `deprecated` — never delete rows referenced by roles). Localised names via message bundles keyed by code.
- Sorted by module, resource, then a canonical action order: READ, CREATE, UPDATE, DELETE, then alphabetical.
- `dependsOn` must form a DAG (fail fast at startup otherwise).
- `Cache-Control: private, max-age=300`; the UI caches per locale.

### 5.2 Seed catalog

Risk: L = LOW, M = MEDIUM, H = HIGH, C = CRITICAL. Every non-READ action depends on its resource's `READ`. Names below are es-MX; provide `en` too.

| Code | Name (es-MX) | Risk | dependsOn (besides own READ) |
|---|---|---|---|
| `DASHBOARD.HOME.READ` | Ver tablero | L | |
| `RECIPE.RECIPE.READ` / `CREATE` / `UPDATE` / `DELETE` / `SHARE` | Recetas | L/L/L/M/M | |
| `QUOTE.QUOTE.READ` / `CREATE` / `UPDATE` / `DELETE` / `SHARE` / `APPROVE` | Cotizaciones | L/L/L/M/M/H | |
| `INGREDIENT.INGREDIENT.READ` / `CREATE` / `UPDATE` / `DELETE` | Ingredientes | L/L/L/M | |
| `FIXED_COST.FIXED_COST.READ` / `MANAGE` | Costos fijos | L/M | |
| `CATALOG.UNIT_TYPE.READ` / `MANAGE` | Tipos de unidad | L/M | |
| `CATALOG.MEASUREMENT_UNIT.READ` / `MANAGE` | Unidades de medida | L/M | |
| `CATALOG.CATEGORY.READ` / `MANAGE` | Categorías | L/M | |
| `CATALOG.ALLERGEN.READ` / `MANAGE` | Alérgenos | L/M | |
| `CATALOG.IMPORT.READ` / `EXECUTE` | Importaciones de catálogos | M/H | `EXECUTE` → the `MANAGE` of the target catalog is checked at call time |
| `FINANCE.CURRENCY.READ` / `MANAGE` | Monedas | L/M | |
| `FINANCE.TAX_RATE.READ` / `MANAGE` | Tipos de IVA | L/H | |
| `FINANCE.SETTINGS.UPDATE` | Predeterminados y reglas de cálculo | H | `FINANCE.CURRENCY.READ`, `FINANCE.TAX_RATE.READ` |
| `IAM.USER.READ` | Consultar usuarios | M | |
| `IAM.USER.CREATE` | Dar de alta usuarios | H | |
| `IAM.USER.UPDATE` | Editar perfil de usuarios | M | |
| `IAM.USER.CHANGE_STATUS` | Suspender, bloquear, dar de baja | H | |
| `IAM.USER.RESET_CREDENTIALS` | Restablecer credenciales | H | |
| `IAM.USER.MANAGE_ACCESS` | Asignar roles, grupos y permisos | C | `IAM.ROLE.READ`, `IAM.PERMISSION_GROUP.READ` |
| `IAM.USER.MANAGE_SESSIONS` | Ver y cerrar sesiones | H | |
| `IAM.USER.EXPORT` | Exportar usuarios | M | |
| `IAM.ROLE.READ` / `CREATE` / `UPDATE` / `DELETE` / `MANAGE_MEMBERS` | Roles | M/H/C/H/C | `MANAGE_MEMBERS` → `IAM.USER.READ` |
| `IAM.PERMISSION_GROUP.READ` / `CREATE` / `UPDATE` / `DELETE` | Grupos de permisos | M/H/C/H | |
| `IAM.AUDIT.READ` / `EXPORT` | Bitácora de auditoría | M/M | |
| `IAM.SECURITY_POLICY.READ` / `UPDATE` | Política de seguridad | M/C | |

Retrofit the existing controllers with these codes (keep the current role checks as an OR during the transition, see §1.4.4).

---

## 6. Permission groups — `/api/v1/iam/permission-groups`

`PermissionGroupSummary`: `id, code, name, description, system, status, permissionCount, roleCount, userCount, updatedAt`.
`PermissionGroupDetail` = summary + `permissions: string[]`, `roles: RoleRef[]` (roles that include it), `version`.

| Method | Path | Notes |
|---|---|---|
| GET | `/iam/permission-groups` | unpaged, sorted by name |
| GET | `/iam/permission-groups/{id}` | |
| POST | `/iam/permission-groups` | `{ code, name, description, permissions }` → `201`; ≥ 1 permission; dependsOn closure stored; escalation guard |
| PUT | `/iam/permission-groups/{id}` | + `version`; `system` groups are read-only (`409 SYSTEM_RESOURCE_CONFLICT`); shrink → bump `access_version` of every affected user (direct holders + members of roles that include it) |
| PATCH | `/iam/permission-groups/{id}/status` | `{ status, version }`; deactivation = shrink for affected users |
| DELETE | `/iam/permission-groups/{id}` | only when `roleCount + userCount == 0` → else `409 RESOURCE_IN_USE` |

Same `code`/`name`/`description` rules as roles (§4.2).

---

## 7. Audit log — `/api/v1/iam/audit-events`

### 7.1 Event shape

```json
{
  "id": "01J9Z…",
  "occurredAt": "2026-10-04T15:12:00Z",
  "category": "ACCESS_CONTROL",
  "action": "USER_ACCESS_CHANGED",
  "outcome": "SUCCESS",
  "severity": "NOTICE",
  "actor": { "id": "…", "username": "aortiz", "displayName": "Antonio Ortiz", "avatarUrl": null },
  "target": { "type": "USER", "id": "…", "label": "María López" },
  "summary": "Antonio Ortiz modificó los accesos de María López",
  "reason": "Promoción a gerente comercial",
  "changes": { "roles": { "from": ["Vendedor"], "to": ["Gerente de ventas"] } },
  "ipAddress": "201.141.10.4",
  "userAgent": "Chrome 140 / macOS",
  "traceId": "a1b2c3"
}
```

- `category` ∈ `AUTHENTICATION | USER_ADMINISTRATION | ACCESS_CONTROL | SECURITY | CONFIGURATION | DATA`; `outcome` ∈ `SUCCESS | FAILURE | DENIED`; `severity` ∈ `INFO | NOTICE | WARNING | CRITICAL`.
- `summary` is rendered at **read time** from `action` + stored params in the requester's locale (store the params, not the sentence).
- `actor = null` for system jobs. Store actor/target **labels as of the event** (snapshot) so renamed/deleted entities still read correctly.
- `changes`: only changed fields; secrets never appear (mask as `"***"` if a secret field is touched).
- ID: ULID/UUIDv7 (time-ordered).

### 7.2 Action catalog (minimum)

`AUTHENTICATION`: `LOGIN_SUCCEEDED`, `LOGIN_FAILED`, `LOGOUT`, `TOKEN_REFRESHED` (INFO, optional/sampled), `TWO_FACTOR_FAILED`, `PASSWORD_CHANGED`, `PASSWORD_RESET_COMPLETED`, `INVITATION_ACCEPTED`.
`USER_ADMINISTRATION`: `USER_CREATED`, `USER_UPDATED`, `USER_RENAMED`, `USER_EMAIL_CHANGED`, `USER_STATUS_CHANGED`, `USER_AVATAR_CHANGED`, `USER_EXPORT`, `USER_BULK_OPERATION`, `INVITATION_RESENT`, `INVITATION_DELIVERY_FAILED`.
`ACCESS_CONTROL`: `USER_ACCESS_CHANGED`, `ROLE_CREATED`, `ROLE_UPDATED`, `ROLE_STATUS_CHANGED`, `ROLE_DELETED`, `ROLE_CLONED`, `PERMISSION_GROUP_CREATED|UPDATED|STATUS_CHANGED|DELETED`, `ACCESS_DENIED` (every 403, DENIED outcome), `PRIVILEGE_ESCALATION_BLOCKED` (CRITICAL), `SOD_CONFLICT_ACCEPTED` (WARNING).
`SECURITY`: `USER_LOCKED` (auto, CRITICAL), `USER_UNLOCKED`, `USER_PASSWORD_RESET_ISSUED`, `USER_2FA_RESET`, `USER_SESSION_REVOKED`, `USER_SESSIONS_REVOKED`, `SECURITY_POLICY_UPDATED` (WARNING when weakened).
`CONFIGURATION`: `CURRENCY_*`, `TAX_RATE_*`, `FINANCE_DEFAULT_CHANGED` (WARNING), `FINANCE_SETTINGS_UPDATED`.
`DATA`: `AUDIT_EXPORT`.

### 7.3 Query

`GET /iam/audit-events?page&size&search&categories[]&outcomes[]&severities[]&actorId&targetType&targetId&from&to` → `CatalogPage<AuditEvent>`, newest first (fixed sort). `from/to` inclusive ISO instants; max range 366 days (→ 400 `field: "from"`). `search` matches action, actor username/display name, target label, traceId, IP. The user detail page calls it with `actorId=` (actions by the user) or `targetType=USER&targetId=` (changes to the user).

`GET /iam/audit-events/export?{same filters}` → streamed CSV (same CSV rules as §3.10), max 100 000 rows (→ 400 asking to narrow the range). The export itself is audited (`AUDIT_EXPORT`).

### 7.4 Integrity

- Table is **append-only**: the application DB role has `INSERT, SELECT` only on `audit_events` (no `UPDATE`, `DELETE`, `TRUNCATE`); add a trigger that raises on UPDATE/DELETE as defence in depth.
- Optional but recommended: hash chain (`prev_hash`, `hash = sha256(prev_hash || canonical_json)`) and a nightly verification job.
- Retention: ≥ 5 years (Mexican fiscal record-keeping horizon); partition by month (`PARTITION BY RANGE (occurred_at)`).
- Writes happen in the business transaction (N4). For login events (no business tx), write synchronously before responding.
- PII: store IP and UA (legitimate interest for security); never passwords, tokens, TOTP secrets, full card data.

---

## 8. Security policy — `/api/v1/iam/security-policy`

Singleton (one row). `GET` → `SecurityPolicy`; `PUT` with `SecurityPolicyRequest` (`SecurityPolicy` minus `updatedAt`/`updatedBy`, with `version`).

| Field | Range | Default |
|---|---|---|
| `passwordMinLength` | 8–128 | 12 |
| `passwordRequireUppercase` / `Lowercase` / `Digit` / `Symbol` | bool | true |
| `passwordHistory` | 0–24 | 5 |
| `passwordMaxAgeDays` | 0–365 (0 = never) | 90 |
| `maxFailedAttempts` | 3–20 | 5 |
| `lockoutMinutes` | 1–1440 | 15 |
| `sessionIdleMinutes` | 5–480 | 30 |
| `sessionAbsoluteHours` | 1–720 | 12 |
| `maxConcurrentSessions` | 1–20 | 3 (oldest session is revoked on overflow) |
| `invitationTtlHours` | 1–336 | 72 |
| `twoFactorRequiredRoleIds` | existing roles **except SUPER_ADMIN** (→ 400 `field: "twoFactorRequiredRoleIds[i]"`, code `VALIDATION_ERROR`) | ADMIN |

Cross-field: `sessionIdleMinutes ≤ sessionAbsoluteHours × 60` → else 400 `field: "sessionIdleMinutes"`.
Enforcement points: password set/change/reset (complexity, history via stored hashes, also reject passwords containing the username/email local part and the top-10k breached list), login (lockout), session issuance (idle/absolute/concurrency), invitation creation (TTL), and a 2FA gate filter.
Audit `SECURITY_POLICY_UPDATED` — severity WARNING when any control is weakened (lower min length/history, higher attempts, any complexity flag turned off).

### 8.1 Two-factor enrollment gate

When a user must have 2FA (`require_two_factor = true` or holds a role in `twoFactorRequiredRoleIds`) and has not enrolled, every protected endpoint answers:

```json
{ "status": "ERROR", "message": "…", "data": null,
  "errors": [{ "code": "TWO_FACTOR_ENROLLMENT_REQUIRED", "field": null, "message": "…" }] }
```
with **HTTP 403**. The UI redirects to Account Settings → Security (`?tab=security&enroll2fa=1`) and opens the QR setup.

**The gate must allowlist everything the user needs to enrol** — otherwise the account is deadlocked (observed 2026-10-05: `POST /auth/2fa/setup` itself returned 403):

| Allowed while not enrolled | Why |
|---|---|
| `GET /users/me/two-factor`, `POST /users/me/two-factor/enrollment`, `POST /users/me/two-factor/enrollment/confirm` | the enrolment itself (§8.2) |
| `POST /auth/refresh`, `POST /auth/logout` | the UI swaps the token right after enrolling |
| `GET /users/me` | the settings page shows the user from it |
| `GET /auth/sessions`, `GET /auth/login-history` | rendered on the same Security tab |
| `GET /finance/settings`, `GET /finance/*/catalog` | read by the app shell (optional; harmless) |

Implement the allowlist as an explicit `RequestMatcher` list next to the gate filter, with a test that walks it — not as scattered `if (path.startsWith(...))`.

Rules:
- Evaluate the gate from the **database** (or the cache evicted on enrolment), not from the access token's `2faEnabled` claim — otherwise the token minted before enrolment keeps the user blocked until it expires.
- Enrolment confirmation (§8.2) must bump `access_version` if you rely on claims; the UI calls `POST /auth/refresh` immediately after enrolling and expects the new token to pass the gate.
- Disabling 2FA (`POST /users/me/two-factor/disable`) must be **rejected** with `409 TWO_FACTOR_REQUIRED_BY_ROLE` for users whose role requires it.
- Login response: add `"requiresTwoFactorEnrollment": true|false` so the UI can route straight to setup after sign-in (optional, recommended).

### 8.2 Self-service 2FA (TOTP) — `/api/v1/users/me/two-factor`

> **Observed 2026-10-05:** the UI called `POST /auth/2fa/setup` and got `404 ROUTE_NOT_FOUND` — the endpoint does not exist. The UI now uses the contract below (V8 envelope). The old `/auth/2fa/setup|verify|disable` calls were removed from the frontend; drop or redirect them on the backend.

All endpoints act on the JWT subject, require authentication only (no IAM permission) and are **in the enrolment-gate allowlist** (§8.1) except `disable` and `recovery-codes`.

#### `GET /users/me/two-factor` → `TwoFactorStatus`
```json
{ "enabled": false, "required": true, "requiredBy": ["Administrador"], "method": null, "enrolledAt": null, "recoveryCodesRemaining": 0 }
```
`required` = `users.require_two_factor` OR the user holds an ACTIVE role in `twoFactorRequiredRoleIds`. `requiredBy` = display names of those roles.

#### `POST /users/me/two-factor/enrollment` → `TwoFactorEnrollment`
```json
{
  "enrollmentId": "6c1d…",
  "secret": "JBSWY3DPEHPK3PXPJBSWY3DPEHPK3PXP",
  "otpauthUri": "otpauth://totp/Cronos:admin%40cronos.com?secret=JBSW…&issuer=Cronos&algorithm=SHA1&digits=6&period=30",
  "qrCodeDataUri": "data:image/png;base64,iVBORw0KGgo…",
  "issuer": "Cronos",
  "accountName": "admin@cronos.com",
  "digits": 6,
  "periodSeconds": 30,
  "expiresAt": "2026-10-05T19:24:00Z"
}
```
- Secret: 20 random bytes (`SecureRandom`) → Base32 (160-bit, RFC 4226 recommendation). SHA1 / 6 digits / 30 s for maximum app compatibility.
- Store the pending secret **encrypted** (AES-GCM with a key from the secret store, never the DB) in `two_factor_enrollments(id, user_id, secret_enc, expires_at, consumed_at)`; TTL **10 minutes**. Starting a new enrolment invalidates previous pending ones for that user.
- Render the QR **server-side** (ZXing, 240×240 PNG, error correction M) as a data URI. Never use a third-party QR URL: the secret would leave our infrastructure. The UI only binds `data:image/png;base64,…` or `data:image/svg+xml;base64,…`.
- If 2FA is already enabled → `409 TWO_FACTOR_ALREADY_ENABLED`.
- Rate limit: 10 enrolments/hour per user.
- Response headers: `Cache-Control: no-store`. Never log the body.

#### `POST /users/me/two-factor/enrollment/confirm` → `TwoFactorRecoveryCodes`
Body: `{ "enrollmentId": "6c1d…", "code": "123456" }`.
- `code`: `^\d{6}$` → else 400 `field: "code"`.
- Unknown/consumed enrolment → `404 RESOURCE_NOT_FOUND`; expired → `409 ENROLLMENT_EXPIRED`.
- Verify with a ±1 step window (clock drift) and **reject reuse** of the same time-step (store `last_used_step`). Wrong code → `400 INVALID_TOTP_CODE`, `field: "code"`. After 5 failures the enrolment is consumed (user must restart).
- On success, in one transaction: move the secret to `user_two_factor(user_id, secret_enc, enrolled_at, last_used_step)`, set `users.two_factor_enabled = true`, mark the enrolment consumed, generate **10 recovery codes** (`XXXX-XXXX`, Crockford Base32 without ambiguous chars), store only their **hashes** (BCrypt or Argon2), bump `access_version`, evict the gate cache, audit `USER_2FA_ENABLED` (NOTICE).
- Response (codes shown **once**):
```json
{ "recoveryCodes": ["7KQ4-M2XD", "…"], "status": { "enabled": true, "required": true, "requiredBy": ["Administrador"], "method": "TOTP", "enrolledAt": "2026-10-05T19:15:00Z", "recoveryCodesRemaining": 10 } }
```
- After this call the UI immediately calls `POST /auth/refresh`; the new access token must pass the gate (§8.1 rules).

#### `POST /users/me/two-factor/disable` → `TwoFactorStatus`
Body: `{ "password": "…", "code": "123456" | "7KQ4-M2XD" }`.
- Wrong password → `400 INVALID_PASSWORD`, `field: "password"`; wrong code → `400 INVALID_TOTP_CODE` / `INVALID_RECOVERY_CODE`, `field: "code"`. A recovery code used here is consumed.
- `required = true` → `409 TWO_FACTOR_REQUIRED_BY_ROLE`.
- On success: delete the secret and recovery codes, revoke **all other** sessions, bump `access_version`, audit `USER_2FA_DISABLED` (WARNING), email a security notice.

#### `POST /users/me/two-factor/recovery-codes` → `TwoFactorRecoveryCodes`
Body: `{ "code": "123456" | "7KQ4-M2XD" }`. Replaces all recovery codes (old ones invalid immediately). Audit `USER_2FA_RECOVERY_CODES_REGENERATED` (NOTICE).

#### Login with 2FA
`POST /auth/login` with `twoFactorCode` must accept either a 6-digit TOTP or an unused recovery code (consumed on use; audit `LOGIN_WITH_RECOVERY_CODE`, WARNING; notify the user by email).

#### New error codes
| Code | HTTP |
|---|---|
| `TWO_FACTOR_ENROLLMENT_REQUIRED` | 403 |
| `TWO_FACTOR_ALREADY_ENABLED` | 409 |
| `TWO_FACTOR_REQUIRED_BY_ROLE` | 409 |
| `ENROLLMENT_EXPIRED` | 409 |
| `INVALID_TOTP_CODE`, `INVALID_RECOVERY_CODE`, `INVALID_PASSWORD` | 400 (with `field`) |

#### Tables
```sql
CREATE TABLE two_factor_enrollments (
  id           UUID PRIMARY KEY,
  user_id      UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  secret_enc   BYTEA       NOT NULL,
  failed_tries SMALLINT    NOT NULL DEFAULT 0,
  expires_at   TIMESTAMPTZ NOT NULL,
  consumed_at  TIMESTAMPTZ,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE user_two_factor (
  user_id         UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  secret_enc      BYTEA       NOT NULL,
  last_used_step  BIGINT,
  enrolled_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE user_recovery_codes (
  id         BIGSERIAL PRIMARY KEY,
  user_id    UUID         NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  code_hash  VARCHAR(255) NOT NULL,
  used_at    TIMESTAMPTZ
);
CREATE INDEX ix_recovery_codes_user ON user_recovery_codes (user_id) WHERE used_at IS NULL;
```
If the backend already stores a TOTP secret on `users`, migrate it into `user_two_factor` (encrypted) and drop the plaintext column.

### 8.3 SUPER_ADMIN is never 2FA-mandatory (break-glass rule)

Making SUPER_ADMIN 2FA-mandatory deadlocks the platform when enrolment fails: every SUPER_ADMIN is gated, and the only screens that can relax the policy are behind the same gate (this happened on 2026-10-05). Therefore:

1. **Validation:** `PUT /iam/security-policy` rejects a `twoFactorRequiredRoleIds` containing SUPER_ADMIN → `400 VALIDATION_ERROR`, `field: "twoFactorRequiredRoleIds[i]"`. (The UI no longer offers it.)
2. **Gate:** the enrolment gate never blocks a user *because of* SUPER_ADMIN; `required` for SUPER_ADMIN members comes only from their own `require_two_factor` flag.
3. **Seed:** `twoFactorRequiredRoleIds = [ADMIN]` (§13.4).
4. **Data fix — new Flyway migration** (do not edit already-applied migrations):

```sql
-- V__n__remove_super_admin_from_2fa_required_roles.sql
DELETE FROM security_policy_2fa_roles
 WHERE role_id = (SELECT id FROM roles WHERE code = 'SUPER_ADMIN');

UPDATE security_policy SET version = version + 1, updated_at = now() WHERE id = 1;

INSERT INTO audit_events (id, occurred_at, category, action, outcome, severity, actor_id, actor_label,
                          target_type, target_id, target_label, params, reason, changes)
VALUES (gen_random_uuid(), now(), 'CONFIGURATION', 'SECURITY_POLICY_UPDATED', 'SUCCESS', 'WARNING',
        NULL, 'System migration', 'SECURITY_POLICY', '1', 'Security policy', '{}'::jsonb,
        'SUPER_ADMIN removed from 2FA-required roles (break-glass rule, doc §8.3)',
        '{"twoFactorRequiredRoleIds": {"from": ["SUPER_ADMIN"], "to": []}}'::jsonb);
```
   Then evict the policy/gate caches (restart is enough if they are in-memory).
5. SUPER_ADMIN members are still **encouraged** to enable 2FA voluntarily; consider a dashboard reminder.

---

## 9. Currencies — `/api/v1/finance/currencies`

### 9.1 Shape

```json
{
  "id": 1, "code": "MXN", "numericCode": "484", "name": "Peso mexicano", "symbol": "$",
  "decimalPlaces": 2, "symbolPosition": "BEFORE", "isDefault": true, "inUse": true,
  "status": "ACTIVE", "createdAt": "…", "updatedAt": null, "updatedBy": null, "version": 1
}
```
`CurrencyOption` (picker): `id, code, name, symbol, decimalPlaces, symbolPosition, isDefault`.

### 9.2 Rules

| Field | Rule |
|---|---|
| `code` | required; `^[A-Z]{3}$`; unique; should exist in ISO 4217 (validate against `java.util.Currency.getAvailableCurrencies()`; reject unknown) ; **immutable when `inUse`** |
| `numericCode` | required; `^\d{3}$`; unique; must match the ISO numeric for `code` when the JDK knows it; immutable when `inUse` |
| `name` | required; 1–60; unique case-insensitive |
| `symbol` | required; 1–5 |
| `decimalPlaces` | 0–4; immutable when `inUse` |
| `symbolPosition` | `BEFORE` \| `AFTER` |

`inUse` = referenced by any quote, recipe, ingredient price, fixed cost (any document storing a currency code). Compute with `EXISTS` queries (or a maintained counter) — not by loading collections.

### 9.3 Endpoints

| Method | Path | Notes |
|---|---|---|
| GET | `/finance/currencies?page&size&sort&search&status` | sort whitelist: `code`, `name`, `status`; default `code,asc` |
| GET | `/finance/currencies/catalog` | ACTIVE only, default first then by code; unpaged |
| POST | `/finance/currencies` | → 201 |
| PUT | `/finance/currencies/{id}` | + `version` |
| PATCH | `/finance/currencies/{id}/status` | `{ status, version }`; the default cannot be deactivated → `409 DEFAULT_LOCKED` |
| PATCH | `/finance/currencies/{id}/default` | `{ version }`; target must be ACTIVE; atomically unset the previous default (single statement or row lock on the settings row); audit `FINANCE_DEFAULT_CHANGED` |
| DELETE | `/finance/currencies/{id}` | only `!isDefault && !inUse` → else `DEFAULT_LOCKED` / `RESOURCE_IN_USE` |

Exactly one default at all times: enforce with a partial unique index (`WHERE is_default`) **and** in the service.

---

## 10. IVA rates — `/api/v1/finance/tax-rates`

### 10.1 Shape

```json
{
  "id": 1, "code": "IVA_16", "name": "IVA general 16%", "description": "Tasa general nacional",
  "satTaxCode": "002", "factorType": "TASA", "ratePercent": 16.0000,
  "validFrom": "2010-01-01", "validTo": null, "isDefault": true, "inUse": true,
  "status": "ACTIVE", "createdAt": "…", "updatedAt": null, "updatedBy": null, "version": 1
}
```
`TaxRateOption`: `id, code, name, factorType, ratePercent, isDefault`.

### 10.2 Rules (SAT CFDI 4.0 aligned)

| Field | Rule |
|---|---|
| `code` | required; `^[A-Z][A-Z0-9_]{1,29}$`; unique; immutable when `inUse` |
| `name` | required; 1–60; unique case-insensitive |
| `description` | nullable; ≤ 250 |
| `satTaxCode` | server-set to `002` (IVA, `c_Impuesto`); not accepted as input |
| `factorType` | `TASA` \| `EXENTO` (`c_TipoFactor`; `CUOTA` does not apply to IVA) |
| `ratePercent` | `TASA`: required, `0 ≤ x ≤ 100`, scale ≤ 4 (`NUMERIC(7,4)`). `EXENTO`: must be `null`. Store as given; the CFDI `TasaOCuota` is `ratePercent / 100` with 6 decimals (`0.160000`). Optionally warn (not block) when a TASA rate is not one of SAT's IVA values (0, 8, 16). |
| `validFrom` | required `LocalDate` |
| `validTo` | nullable; `≥ validFrom` → else 400 `field: "validTo"` |
| in use | `factorType`, `ratePercent`, `validFrom`, `code` immutable when `inUse` (an applied rate is history). Only `name`, `description`, `validTo` (closing it) may change. To change a rate: close the old one with `validTo`, create a new one. |
| overlap | two ACTIVE rates with the same `code` cannot exist (code is unique anyway); overlapping validity across *different* codes is allowed (e.g. border 8 % and general 16 %) |

### 10.3 Endpoints

Same shape as currencies: `GET` (sort whitelist `name`, `ratePercent`, `validFrom`, `status`; default `ratePercent,desc`), `GET /catalog` (ACTIVE **and currently valid**: `validFrom ≤ today ≤ coalesce(validTo, ∞)`, default first), `POST`, `PUT`, `PATCH /status`, `PATCH /{id}/default` (target must be ACTIVE and currently valid), `DELETE`. Default rules identical to §9.3.

A daily job (00:05 tenant TZ): if the default tax rate has expired (`validTo < today`), keep it as default but emit `FINANCE_DEFAULT_EXPIRED` (WARNING) — never silently switch the default.

---

## 11. Finance settings & calculation rules — `/api/v1/finance/settings`

### 11.1 Shape

`GET /finance/settings` → 
```json
{
  "defaultCurrency": { "id": 1, "code": "MXN", "name": "Peso mexicano", "symbol": "$", "decimalPlaces": 2, "symbolPosition": "BEFORE", "isDefault": true },
  "defaultTaxRate": { "id": 1, "code": "IVA_16", "name": "IVA general 16%", "factorType": "TASA", "ratePercent": 16.0, "isDefault": true },
  "pricesIncludeTax": false,
  "roundingMode": "HALF_UP",
  "updatedAt": null, "updatedBy": null, "version": 1
}
```
`PUT /finance/settings` body: `{ "pricesIncludeTax": false, "roundingMode": "HALF_UP", "version": 1 }` (`roundingMode` ∈ `HALF_UP | HALF_EVEN | UP | DOWN` → `java.math.RoundingMode`). Defaults are changed only through the catalogs' `PATCH …/default`.

### 11.2 Single calculation service

Create one `PricingCalculator` (pure, unit-tested) used by **every** module that computes money (quotes, recipes costing, fixed-cost prorating). No other class may multiply by a tax rate.

### 11.3 Formulas (BigDecimal, scale = currency `decimalPlaces`, mode = `roundingMode`)

```
rate = ratePercent / 100            (EXENTO → 0)
if pricesIncludeTax:
  lineNet   = round(lineGross / (1 + rate))
  lineTax   = lineGross − lineNet                 (so net + tax == gross exactly)
else:
  lineNet   = round(qty × unitPrice)
  lineTax   = round(lineNet × rate)
subtotal = Σ lineNet ; tax = Σ lineTax           (round per line, then sum — CFDI style)
total    = subtotal + tax + deliveryFee + extraFee
```
Intermediate math at scale 10, `HALF_EVEN`; round only at the points above. Document and unit-test edge cases: 0 %, EXENTO, `decimalPlaces = 0` (JPY-like), large quantities, negative rejected.

### 11.4 Snapshot on documents

When a quote (and any future invoice-like document) is created:
- If the request omits `currency` / `taxRate`, use the defaults.
- **Persist a snapshot**: `currency_code`, `currency_decimal_places`, `tax_rate_id` (nullable), `tax_rate_percent`, `tax_factor_type`, `prices_include_tax`, `rounding_mode`. Recalculations of that document always use its snapshot, never the current defaults — changing a default must not alter existing quotes.
- Validate `currency` against ACTIVE catalog codes (existing quotes keep theirs even if later deactivated). Validate `taxRate` 0–100, scale ≤ 4.
- The quote API keeps accepting `taxRate` (number) and `currency` (code) as today; add optional `taxRateId` so the UI can send the catalog id when the user picks a preset (backwards compatible).

---

## 12. Data model (PostgreSQL — adapt names to the repo's conventions)

```sql
-- ─── IAM ───────────────────────────────────────────────────────────────
CREATE EXTENSION IF NOT EXISTS citext;
CREATE EXTENSION IF NOT EXISTS unaccent;

ALTER TABLE users
  ADD COLUMN job_title              VARCHAR(100),
  ADD COLUMN department             VARCHAR(100),
  ADD COLUMN employee_number        VARCHAR(30),
  ADD COLUMN locale                 VARCHAR(5)  NOT NULL DEFAULT 'es-MX' CHECK (locale IN ('es-MX','en')),
  ADD COLUMN status                 VARCHAR(20) NOT NULL DEFAULT 'ACTIVE'
        CHECK (status IN ('PENDING_ACTIVATION','ACTIVE','SUSPENDED','LOCKED','DEACTIVATED')),
  ADD COLUMN status_reason          VARCHAR(30),
  ADD COLUMN status_comment         VARCHAR(500),
  ADD COLUMN status_until           TIMESTAMPTZ,
  ADD COLUMN status_changed_at      TIMESTAMPTZ,
  ADD COLUMN status_changed_by      UUID REFERENCES users(id),
  ADD COLUMN access_expires_at      DATE,
  ADD COLUMN email_verified         BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN must_change_password   BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN require_two_factor     BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN access_version         BIGINT  NOT NULL DEFAULT 0,
  ADD COLUMN version                BIGINT  NOT NULL DEFAULT 0,
  ADD COLUMN created_by             UUID REFERENCES users(id),
  ADD COLUMN updated_by             UUID REFERENCES users(id);
-- Backfill status from the legacy enabled/account_non_locked flags, then drop or keep them derived.
CREATE UNIQUE INDEX ux_users_username_ci ON users (lower(username));
CREATE UNIQUE INDEX ux_users_email_ci    ON users (lower(email));
CREATE UNIQUE INDEX ux_users_employee_no ON users (employee_number) WHERE employee_number IS NOT NULL;
CREATE INDEX ix_users_status            ON users (status);
CREATE INDEX ix_users_last_login        ON users (last_login_at);

CREATE TABLE permissions (
  code        VARCHAR(100) PRIMARY KEY,
  module      VARCHAR(40)  NOT NULL,
  resource    VARCHAR(40)  NOT NULL,
  action      VARCHAR(40)  NOT NULL,
  risk        VARCHAR(10)  NOT NULL CHECK (risk IN ('LOW','MEDIUM','HIGH','CRITICAL')),
  deprecated  BOOLEAN      NOT NULL DEFAULT FALSE
);
CREATE TABLE permission_dependencies (
  code        VARCHAR(100) REFERENCES permissions(code),
  depends_on  VARCHAR(100) REFERENCES permissions(code),
  PRIMARY KEY (code, depends_on),
  CHECK (code <> depends_on)
);

-- roles: extend the existing table
ALTER TABLE roles
  ADD COLUMN code        VARCHAR(50),
  ADD COLUMN color       CHAR(7) CHECK (color ~ '^#[0-9A-Fa-f]{6}$'),
  ADD COLUMN system      BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN status      VARCHAR(10) NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE','INACTIVE')),
  ADD COLUMN version     BIGINT NOT NULL DEFAULT 0,
  ADD COLUMN created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  ADD COLUMN created_by  UUID REFERENCES users(id),
  ADD COLUMN updated_at  TIMESTAMPTZ,
  ADD COLUMN updated_by  UUID REFERENCES users(id);
-- backfill code from name, then:
ALTER TABLE roles ALTER COLUMN code SET NOT NULL;
CREATE UNIQUE INDEX ux_roles_code    ON roles (code);
CREATE UNIQUE INDEX ux_roles_name_ci ON roles (lower(name));

CREATE TABLE role_permissions (
  role_id          BIGINT       REFERENCES roles(id) ON DELETE CASCADE,
  permission_code  VARCHAR(100) REFERENCES permissions(code),
  PRIMARY KEY (role_id, permission_code)
);

CREATE TABLE permission_groups (
  id          BIGSERIAL PRIMARY KEY,
  code        VARCHAR(50)  NOT NULL UNIQUE,
  name        VARCHAR(100) NOT NULL,
  description VARCHAR(500),
  system      BOOLEAN      NOT NULL DEFAULT FALSE,
  status      VARCHAR(10)  NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE','INACTIVE')),
  version     BIGINT       NOT NULL DEFAULT 0,
  created_at  TIMESTAMPTZ  NOT NULL DEFAULT now(),
  created_by  UUID REFERENCES users(id),
  updated_at  TIMESTAMPTZ,
  updated_by  UUID REFERENCES users(id)
);
CREATE UNIQUE INDEX ux_permission_groups_name_ci ON permission_groups (lower(name));
CREATE TABLE permission_group_permissions (
  group_id         BIGINT REFERENCES permission_groups(id) ON DELETE CASCADE,
  permission_code  VARCHAR(100) REFERENCES permissions(code),
  PRIMARY KEY (group_id, permission_code)
);
CREATE TABLE role_permission_groups (
  role_id  BIGINT REFERENCES roles(id) ON DELETE CASCADE,
  group_id BIGINT REFERENCES permission_groups(id),
  PRIMARY KEY (role_id, group_id)
);
CREATE TABLE user_permission_groups (
  user_id  UUID   REFERENCES users(id) ON DELETE CASCADE,
  group_id BIGINT REFERENCES permission_groups(id),
  PRIMARY KEY (user_id, group_id)
);
CREATE TABLE user_permission_overrides (
  user_id          UUID         REFERENCES users(id) ON DELETE CASCADE,
  permission_code  VARCHAR(100) REFERENCES permissions(code),
  effect           VARCHAR(5)   NOT NULL CHECK (effect IN ('GRANT','DENY')),
  created_at       TIMESTAMPTZ  NOT NULL DEFAULT now(),
  created_by       UUID REFERENCES users(id),
  PRIMARY KEY (user_id, permission_code)          -- a code cannot be both granted and denied
);
-- user_roles already exists (user_id, role_id); add created_at/created_by if absent.

CREATE TABLE sod_rules (
  code        VARCHAR(60) PRIMARY KEY,
  severity    VARCHAR(10) NOT NULL CHECK (severity IN ('WARNING','BLOCKING')),
  active      BOOLEAN     NOT NULL DEFAULT TRUE
);
CREATE TABLE sod_rule_sets (
  rule_code        VARCHAR(60)  REFERENCES sod_rules(code) ON DELETE CASCADE,
  set_index        SMALLINT     NOT NULL,
  permission_code  VARCHAR(100) REFERENCES permissions(code),
  PRIMARY KEY (rule_code, set_index, permission_code)
);

CREATE TABLE user_tokens (                          -- invitations, password resets, email verification
  id          UUID PRIMARY KEY,
  user_id     UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  purpose     VARCHAR(20) NOT NULL CHECK (purpose IN ('INVITATION','PASSWORD_RESET','EMAIL_VERIFICATION')),
  token_hash  CHAR(64)    NOT NULL UNIQUE,          -- sha256 hex
  expires_at  TIMESTAMPTZ NOT NULL,
  used_at     TIMESTAMPTZ,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX ix_user_tokens_user_purpose ON user_tokens (user_id, purpose) WHERE used_at IS NULL;

CREATE TABLE password_history (
  user_id     UUID REFERENCES users(id) ON DELETE CASCADE,
  hash        VARCHAR(255) NOT NULL,
  created_at  TIMESTAMPTZ  NOT NULL DEFAULT now()
);
CREATE INDEX ix_password_history_user ON password_history (user_id, created_at DESC);

CREATE TABLE security_policy (
  id                         SMALLINT PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  password_min_length        SMALLINT NOT NULL CHECK (password_min_length BETWEEN 8 AND 128),
  password_require_uppercase BOOLEAN  NOT NULL,
  password_require_lowercase BOOLEAN  NOT NULL,
  password_require_digit     BOOLEAN  NOT NULL,
  password_require_symbol    BOOLEAN  NOT NULL,
  password_history           SMALLINT NOT NULL CHECK (password_history BETWEEN 0 AND 24),
  password_max_age_days      SMALLINT NOT NULL CHECK (password_max_age_days BETWEEN 0 AND 365),
  max_failed_attempts        SMALLINT NOT NULL CHECK (max_failed_attempts BETWEEN 3 AND 20),
  lockout_minutes            SMALLINT NOT NULL CHECK (lockout_minutes BETWEEN 1 AND 1440),
  session_idle_minutes       SMALLINT NOT NULL CHECK (session_idle_minutes BETWEEN 5 AND 480),
  session_absolute_hours     SMALLINT NOT NULL CHECK (session_absolute_hours BETWEEN 1 AND 720),
  max_concurrent_sessions    SMALLINT NOT NULL CHECK (max_concurrent_sessions BETWEEN 1 AND 20),
  invitation_ttl_hours       SMALLINT NOT NULL CHECK (invitation_ttl_hours BETWEEN 1 AND 336),
  version                    BIGINT   NOT NULL DEFAULT 0,
  updated_at                 TIMESTAMPTZ,
  updated_by                 UUID REFERENCES users(id),
  CHECK (session_idle_minutes <= session_absolute_hours * 60)
);
CREATE TABLE security_policy_2fa_roles (
  role_id BIGINT PRIMARY KEY REFERENCES roles(id) ON DELETE CASCADE
);

CREATE TABLE audit_events (
  id            UUID         NOT NULL,
  occurred_at   TIMESTAMPTZ  NOT NULL DEFAULT now(),
  category      VARCHAR(30)  NOT NULL,
  action        VARCHAR(60)  NOT NULL,
  outcome       VARCHAR(10)  NOT NULL,
  severity      VARCHAR(10)  NOT NULL,
  actor_id      UUID,
  actor_label   VARCHAR(200),
  actor_username VARCHAR(50),
  target_type   VARCHAR(40),
  target_id     VARCHAR(64),
  target_label  VARCHAR(200),
  params        JSONB        NOT NULL DEFAULT '{}'::jsonb,   -- summary template params
  reason        VARCHAR(500),
  changes       JSONB        NOT NULL DEFAULT '{}'::jsonb,
  ip_address    INET,
  user_agent    VARCHAR(400),
  trace_id      VARCHAR(64),
  prev_hash     CHAR(64),
  hash          CHAR(64),
  PRIMARY KEY (id, occurred_at)
) PARTITION BY RANGE (occurred_at);
CREATE INDEX ix_audit_occurred  ON audit_events (occurred_at DESC);
CREATE INDEX ix_audit_actor     ON audit_events (actor_id, occurred_at DESC);
CREATE INDEX ix_audit_target    ON audit_events (target_type, target_id, occurred_at DESC);
CREATE INDEX ix_audit_category  ON audit_events (category, occurred_at DESC);
-- create monthly partitions (pg_partman or a scheduled job); REVOKE UPDATE, DELETE, TRUNCATE ON audit_events FROM app_role;

-- login_attempts / sessions: extend the existing tables with browser, os, device, location, outcome as needed.

-- ─── Finance ───────────────────────────────────────────────────────────
CREATE TABLE currencies (
  id               BIGSERIAL PRIMARY KEY,
  code             CHAR(3)     NOT NULL UNIQUE CHECK (code ~ '^[A-Z]{3}$'),
  numeric_code     CHAR(3)     NOT NULL UNIQUE CHECK (numeric_code ~ '^[0-9]{3}$'),
  name             VARCHAR(60) NOT NULL,
  symbol           VARCHAR(5)  NOT NULL,
  decimal_places   SMALLINT    NOT NULL CHECK (decimal_places BETWEEN 0 AND 4),
  symbol_position  VARCHAR(6)  NOT NULL CHECK (symbol_position IN ('BEFORE','AFTER')),
  is_default       BOOLEAN     NOT NULL DEFAULT FALSE,
  status           VARCHAR(10) NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE','INACTIVE')),
  version          BIGINT      NOT NULL DEFAULT 0,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by       UUID REFERENCES users(id),
  updated_at       TIMESTAMPTZ,
  updated_by       UUID REFERENCES users(id),
  CHECK (NOT is_default OR status = 'ACTIVE')
);
CREATE UNIQUE INDEX ux_currencies_name_ci ON currencies (lower(name));
CREATE UNIQUE INDEX ux_currencies_single_default ON currencies (is_default) WHERE is_default;

CREATE TABLE tax_rates (
  id            BIGSERIAL PRIMARY KEY,
  code          VARCHAR(30)  NOT NULL UNIQUE CHECK (code ~ '^[A-Z][A-Z0-9_]{1,29}$'),
  name          VARCHAR(60)  NOT NULL,
  description   VARCHAR(250),
  sat_tax_code  CHAR(3)      NOT NULL DEFAULT '002',
  factor_type   VARCHAR(6)   NOT NULL CHECK (factor_type IN ('TASA','EXENTO')),
  rate_percent  NUMERIC(7,4) CHECK (rate_percent BETWEEN 0 AND 100),
  valid_from    DATE         NOT NULL,
  valid_to      DATE,
  is_default    BOOLEAN      NOT NULL DEFAULT FALSE,
  status        VARCHAR(10)  NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE','INACTIVE')),
  version       BIGINT       NOT NULL DEFAULT 0,
  created_at    TIMESTAMPTZ  NOT NULL DEFAULT now(),
  created_by    UUID REFERENCES users(id),
  updated_at    TIMESTAMPTZ,
  updated_by    UUID REFERENCES users(id),
  CHECK ((factor_type = 'EXENTO' AND rate_percent IS NULL) OR (factor_type = 'TASA' AND rate_percent IS NOT NULL)),
  CHECK (valid_to IS NULL OR valid_to >= valid_from),
  CHECK (NOT is_default OR status = 'ACTIVE')
);
CREATE UNIQUE INDEX ux_tax_rates_name_ci ON tax_rates (lower(name));
CREATE UNIQUE INDEX ux_tax_rates_single_default ON tax_rates (is_default) WHERE is_default;

CREATE TABLE finance_settings (
  id                  SMALLINT PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  prices_include_tax  BOOLEAN     NOT NULL DEFAULT FALSE,
  rounding_mode       VARCHAR(10) NOT NULL DEFAULT 'HALF_UP' CHECK (rounding_mode IN ('HALF_UP','HALF_EVEN','UP','DOWN')),
  version             BIGINT      NOT NULL DEFAULT 0,
  updated_at          TIMESTAMPTZ,
  updated_by          UUID REFERENCES users(id)
);

-- Quote snapshot (§11.4)
ALTER TABLE quotes
  ADD COLUMN currency_decimal_places SMALLINT,
  ADD COLUMN tax_rate_id             BIGINT REFERENCES tax_rates(id),
  ADD COLUMN tax_factor_type         VARCHAR(6),
  ADD COLUMN prices_include_tax      BOOLEAN,
  ADD COLUMN rounding_mode           VARCHAR(10);
-- backfill: decimal_places 2, factor 'TASA', prices_include_tax false, rounding 'HALF_UP'
```

JPA notes: `@Version Long version`; `@Enumerated(EnumType.STRING)`; `BigDecimal` with `@Column(precision = 7, scale = 4)`; `Set<…>` for join tables with `@BatchSize`/`EntityGraph` to avoid N+1; read models via projections/`@Query` for the list endpoints (never load full aggregates to render a page).

---

## 13. Seed data

### 13.1 Permission catalog
From the code registry (§5.2) — synchronised at startup, not hardcoded in SQL.

### 13.2 Roles (system)

| code | name es-MX / en | color | permissions |
|---|---|---|---|
| `SUPER_ADMIN` | Super administrador / Super administrator | `#0f172a` | ALL (implicit) |
| `ADMIN` | Administrador / Administrator | `#dc2626` | all `IAM.USER.*`, `IAM.ROLE.READ`, `IAM.PERMISSION_GROUP.READ`, `IAM.AUDIT.READ`, all `CATALOG.*`, `FINANCE.*.READ`, all business modules |
| `MANAGER` | Gerente / Manager | `#2563eb` | business modules (incl. `QUOTE.QUOTE.APPROVE`), `CATALOG.*.READ`, `FINANCE.*.READ` |
| `USER` | Usuario / User | `#16a34a` | `DASHBOARD.HOME.READ`, own business modules (`RECIPE.*`, `QUOTE.*` except APPROVE, `INGREDIENT.*`, `FIXED_COST.*`), `CATALOG.*.READ`, `FINANCE.*.READ` |

Map existing users' legacy roles 1:1. Create a SUPER_ADMIN membership for the current super admin(s).

### 13.3 SoD rules

| code | severity | sets | description |
|---|---|---|---|
| `SOD_QUOTE_CREATE_APPROVE` | WARNING | {`QUOTE.QUOTE.CREATE`} × {`QUOTE.QUOTE.APPROVE`} | Una misma persona no debería crear y aprobar sus propias cotizaciones |
| `SOD_ACCESS_ADMIN_AUDIT_EXPORT` | WARNING | {`IAM.USER.MANAGE_ACCESS`, `IAM.ROLE.UPDATE`} × {`IAM.AUDIT.EXPORT`} | Quien administra accesos no debería poder extraer la evidencia de auditoría |
| `SOD_POLICY_AND_ACCESS` | BLOCKING | {`IAM.SECURITY_POLICY.UPDATE`} × {`IAM.USER.MANAGE_ACCESS`} × {`IAM.USER.RESET_CREDENTIALS`} | Debilitar controles, otorgar accesos y emitir credenciales concentrados en una sola persona |
| `SOD_TAX_AND_DEFAULTS` | WARNING | {`FINANCE.TAX_RATE.MANAGE`} × {`FINANCE.SETTINGS.UPDATE`} | Definir y activar tasas fiscales sin revisión |

### 13.4 Security policy
One row with the defaults of §8; `twoFactorRequiredRoleIds = [ADMIN]`. **Never SUPER_ADMIN** (see §8.3).

### 13.5 Currencies

| code | numeric | name es-MX | symbol | decimals | position | default |
|---|---|---|---|---|---|---|
| MXN | 484 | Peso mexicano | `$` | 2 | BEFORE | ✔ |
| USD | 840 | Dólar estadounidense | `US$` | 2 | BEFORE | |
| EUR | 978 | Euro | `€` | 2 | AFTER | |

(Keep any other codes already used by existing quotes as ACTIVE rows — `COP`, `ARS`, `CLP` (0 decimals), `PEN`, `GTQ` — so historical data stays valid.)

### 13.6 IVA rates

| code | name es-MX | factor | rate | validFrom | validTo | default |
|---|---|---|---|---|---|---|
| `IVA_16` | IVA general 16% | TASA | 16 | 2010-01-01 | — | ✔ |
| `IVA_8_FRONTERA` | IVA región fronteriza 8% | TASA | 8 | 2019-01-01 | 2026-12-31 (decree horizon; adjust if extended) | |
| `IVA_0` | IVA tasa 0% | TASA | 0 | 2010-01-01 | — | |
| `IVA_EXENTO` | Exento de IVA | EXENTO | — | 2010-01-01 | — | |

### 13.7 Finance settings
`prices_include_tax = false`, `rounding_mode = HALF_UP`.

---

## 14. Legacy endpoints

The new UI no longer calls: `GET/POST/PUT /admin/users…`, `POST /admin/users/register`, `POST /admin/users/{id}/block|unblock`, `PUT /admin/users/{id}/roles`, `GET/POST/PUT/DELETE /admin/roles…`, `GET /admin/roles/permissions…`.
Keep them for one release returning `Deprecation: true` and `Sunset: <date>` headers, delegating to the new services (so their writes are audited and permission-checked), then remove them.
`/users/me`, `/auth/*` and the account-settings endpoints are unchanged — but `/auth/login` must now honour `status` (only ACTIVE may log in; PENDING_ACTIVATION gets a generic error), `mustChangePassword`, `require_two_factor`, lockout policy and `access_version`.

---

## 15. Endpoint summary

| Method | Path | Permission | Status |
|---|---|---|---|
| GET | `/iam/users` | IAM.USER.READ | new |
| GET | `/iam/users/stats` | IAM.USER.READ | new |
| GET | `/iam/users/availability` | IAM.USER.READ | new |
| GET | `/iam/users/export` | IAM.USER.EXPORT | new |
| POST | `/iam/users` (multipart) | IAM.USER.CREATE | new |
| GET | `/iam/users/{id}` | IAM.USER.READ | new |
| PUT | `/iam/users/{id}` | IAM.USER.UPDATE | new |
| POST | `/iam/users/{id}/status` | IAM.USER.CHANGE_STATUS | new |
| PUT | `/iam/users/{id}/avatar` | IAM.USER.UPDATE | new |
| DELETE | `/iam/users/{id}/avatar` | IAM.USER.UPDATE | new |
| POST | `/iam/users/{id}/password-reset` | IAM.USER.RESET_CREDENTIALS | new |
| POST | `/iam/users/{id}/require-password-change` | IAM.USER.RESET_CREDENTIALS | new |
| POST | `/iam/users/{id}/two-factor/reset` | IAM.USER.RESET_CREDENTIALS | new |
| POST | `/iam/users/{id}/invitation/resend` | IAM.USER.RESET_CREDENTIALS | new |
| GET | `/iam/users/{id}/access` | IAM.USER.READ | new |
| POST | `/iam/users/{id}/access/preview` | IAM.USER.MANAGE_ACCESS | new |
| PUT | `/iam/users/{id}/access` | IAM.USER.MANAGE_ACCESS | new |
| GET | `/iam/users/{id}/sessions` | IAM.USER.MANAGE_SESSIONS | new |
| DELETE | `/iam/users/{id}/sessions/{sessionId}` | IAM.USER.MANAGE_SESSIONS | new |
| DELETE | `/iam/users/{id}/sessions` | IAM.USER.MANAGE_SESSIONS | new |
| GET | `/iam/users/{id}/login-history` | IAM.USER.MANAGE_SESSIONS | new |
| POST | `/iam/users/bulk/status` | IAM.USER.CHANGE_STATUS | new |
| POST | `/iam/users/bulk/roles` | IAM.USER.MANAGE_ACCESS | new |
| GET | `/iam/roles` | IAM.ROLE.READ | new |
| GET | `/iam/roles/{id}` | IAM.ROLE.READ | new |
| POST | `/iam/roles` | IAM.ROLE.CREATE | new |
| PUT | `/iam/roles/{id}` | IAM.ROLE.UPDATE | new |
| PATCH | `/iam/roles/{id}/status` | IAM.ROLE.UPDATE | new |
| POST | `/iam/roles/{id}/clone` | IAM.ROLE.CREATE | new |
| DELETE | `/iam/roles/{id}` | IAM.ROLE.DELETE | new |
| GET | `/iam/roles/{id}/members` | IAM.ROLE.READ | new |
| POST | `/iam/roles/{id}/members` | IAM.ROLE.MANAGE_MEMBERS | new |
| POST | `/iam/roles/{id}/members/remove` | IAM.ROLE.MANAGE_MEMBERS | new |
| GET | `/iam/permissions` | see §1.4.7 | new |
| GET | `/iam/sod-rules` | IAM.ROLE.READ | new (not yet used by UI) |
| GET | `/iam/permission-groups` | IAM.PERMISSION_GROUP.READ | new |
| GET | `/iam/permission-groups/{id}` | IAM.PERMISSION_GROUP.READ | new |
| POST | `/iam/permission-groups` | IAM.PERMISSION_GROUP.CREATE | new |
| PUT | `/iam/permission-groups/{id}` | IAM.PERMISSION_GROUP.UPDATE | new |
| PATCH | `/iam/permission-groups/{id}/status` | IAM.PERMISSION_GROUP.UPDATE | new |
| DELETE | `/iam/permission-groups/{id}` | IAM.PERMISSION_GROUP.DELETE | new |
| GET | `/iam/audit-events` | IAM.AUDIT.READ | new |
| GET | `/iam/audit-events/export` | IAM.AUDIT.EXPORT | new |
| GET | `/iam/security-policy` | IAM.SECURITY_POLICY.READ | new |
| PUT | `/iam/security-policy` | IAM.SECURITY_POLICY.UPDATE | new |
| GET | `/users/me/two-factor` | authenticated (gate-exempt) | new |
| POST | `/users/me/two-factor/enrollment` | authenticated (gate-exempt) | new |
| POST | `/users/me/two-factor/enrollment/confirm` | authenticated (gate-exempt) | new |
| POST | `/users/me/two-factor/disable` | authenticated | new |
| POST | `/users/me/two-factor/recovery-codes` | authenticated | new |
| GET | `/finance/currencies` | FINANCE.CURRENCY.READ | new |
| GET | `/finance/currencies/catalog` | authenticated | new |
| POST | `/finance/currencies` | FINANCE.CURRENCY.MANAGE | new |
| PUT | `/finance/currencies/{id}` | FINANCE.CURRENCY.MANAGE | new |
| PATCH | `/finance/currencies/{id}/status` | FINANCE.CURRENCY.MANAGE | new |
| PATCH | `/finance/currencies/{id}/default` | FINANCE.SETTINGS.UPDATE | new |
| DELETE | `/finance/currencies/{id}` | FINANCE.CURRENCY.MANAGE | new |
| GET | `/finance/tax-rates` | FINANCE.TAX_RATE.READ | new |
| GET | `/finance/tax-rates/catalog` | authenticated | new |
| POST | `/finance/tax-rates` | FINANCE.TAX_RATE.MANAGE | new |
| PUT | `/finance/tax-rates/{id}` | FINANCE.TAX_RATE.MANAGE | new |
| PATCH | `/finance/tax-rates/{id}/status` | FINANCE.TAX_RATE.MANAGE | new |
| PATCH | `/finance/tax-rates/{id}/default` | FINANCE.SETTINGS.UPDATE | new |
| DELETE | `/finance/tax-rates/{id}` | FINANCE.TAX_RATE.MANAGE | new |
| GET | `/finance/settings` | authenticated | new |
| PUT | `/finance/settings` | FINANCE.SETTINGS.UPDATE | new |
| POST/PUT | `/quotes…` | existing | changed — snapshot (§11.4), optional `taxRateId` |

---

## 16. Testing checklist (minimum cases)

**Resolver / SoD (unit)** — role only; role + role-group; user group; grant; denial overrides every source; inactive role/group ignored; dependsOn closure drops orphaned codes; SUPER_ADMIN = all; source attribution; SoD WARNING vs BLOCKING; SUPER_ADMIN exemption.

**Users (integration)** — create with each activation mode (no secret in response/logs — assert with a log appender); duplicate username/email (case variants) → 409 with `field`; availability excludes `excludeId`; every legal and illegal status transition; `until` validation; auto-unlock job; self-modification blocked on every guarded endpoint; last SUPER_ADMIN protection; access save: escalation blocked, BLOCKING SoD blocked, WARNING allowed + audited, `access_version` bumped and old token rejected; concurrent update → one 200, one 409; bulk partial success; CSV injection neutralised; export streaming (large dataset, constant memory).

**Roles/groups** — system role code immutable; SUPER_ADMIN permissions immutable; delete blocked when in use; clone copies permissions not members; group shrink revokes affected users' tokens.

**Audit** — every write produces exactly one event with correct category/severity/changes; failure to write audit rolls back the change; UPDATE/DELETE on `audit_events` fails at the DB level; summary localised per `Accept-Language`.

**Finance** — single default enforced under concurrency (two parallel `PATCH …/default` → exactly one default); default cannot be deactivated/deleted; in-use immutability; EXENTO ⇔ null rate; `validTo ≥ validFrom`; `/catalog` excludes expired/scheduled; `PricingCalculator` table-driven tests for both `pricesIncludeTax` modes, every rounding mode, 0/4 decimals; quote snapshot unaffected by later default changes.

**Security** — every endpoint returns 401 without token and 403 without its permission (parameterised test over the §15 table); rate limits return 429 with `Retry-After`.

---

## 17. Frontend map (for reference)

| Area | Path |
|---|---|
| Contracts | `src/app/core/models/iam.models.ts`, `finance.models.ts` |
| HTTP services | `src/app/core/services/iam/*.service.ts`, `src/app/core/services/finance/*` |
| Permission codes the UI checks | `src/app/core/constants/permissions.ts` (+ transitional `LEGACY_ROLE_PERMISSIONS`) |
| Authorization | `core/services/authorization.service.ts`, `core/guards/permission.guard.ts`, `shared/directives/can.directive.ts` |
| Screens | `pages/cronos/admin/{users,roles,permission-groups,audit-log,security-policy}`, `pages/cronos/finance` |
| Finance defaults consumer | `core/services/finance/finance-defaults.store.ts` → quote create/edit |

## 18. Open decisions (confirm with the product owner)

1. Geo-IP provider for sessions/sign-in history (MaxMind GeoLite2 offline DB recommended).
2. Email provider/templates for invitation, reset, email-change notices (es-MX + en).
3. Whether `IVA_8_FRONTERA` should be auto-scoped by the client's ZIP code (border-region catalog) in quotes — out of scope for this iteration.
4. Exchange rates between currencies (multi-currency totals/reporting) — out of scope; quotes are single-currency.
