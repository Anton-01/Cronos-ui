# Baking Studio — Backend Handoff and API Contract

> **Audience:** the Claude agent (or engineer) implementing the Cronos backend.
> **Frontend:** `cronos-ui`, branch `claude/elegant-knuth-xgxdur` — already built against this contract.
> **TypeScript mirror of every shape:** `src/app/core/models/kitchen.models.ts` (recipe cover, sections, pricing method, fixed-cost rows), `src/app/core/models/domain.model.ts` (`UserFixedCost*`) and `src/app/core/models/baking-guide.models.ts` (guide). **Change the doc and those files together.**
> **Read first:** `docs/api/iam-and-finance.md` §0–§1 (envelope, error codes, permissions, optimistic locking, audit) and `docs/api/kitchen-catalog-and-recipes.md` (recipes, cost engine, files). Everything there applies here and is not repeated.

---

## 0. Agent brief

### 0.1 Mission

Ship the server side of five features the UI already uses:

1. **Recipe cover** — a dedicated thumbnail-style cover manager in the recipe studio: upload a cropped 4:3 image, pick one of the recipe's images, or clear it (§2).
2. **Recipe sections** — the "Sección" of an ingredient line ("Bizcocho", "Baño", "Cubierta", "Decoración"…) becomes a **per-user catalog of labels** that each pastry chef can add, rename, recolour, reorder, delete and restore (§3).
3. **Fixed costs, reviewed** — active/inactive switch, "apply to new recipes", monthly-figure helper, per-batch quantity for `PER_UNIT` costs, per-row cost breakdown in the live preview, and **seed records of fixed costs for every user** (§4).
4. **Pricing method** — `targetMarginPercent` is today applied as a *markup* (`cost × (1 + p)`) while the UI called it "margin". Recipes get an explicit `pricingMethod` (`MARKUP` | `MARGIN`) so "65 % margin" can really mean 65 % of the price (§5).
5. **Baker's guide** — reference material for pastry chefs: food-safety guides, pan sizes (platform + user's own), volume↔weight conversions, techniques and costing rules (§6). The UI ships a bundled copy of the seed and falls back to it while `/baking-guide` is missing.

The **book view** of a recipe (cookbook-style reading mode) needs no new endpoint, only guarantees on existing ones (§7).

### 0.2 Non-negotiables (in addition to the kitchen doc K1–K8)

| # | Rule |
|---|---|
| B1 | **Backwards compatible on the wire.** Every new response field is additive; every new request field is optional with the documented default. Old clients keep working. |
| B2 | **No silent price change.** Existing recipes migrate to `pricingMethod = MARKUP`, which reproduces today's suggested prices exactly. Only an explicit user change switches a recipe to `MARGIN`. |
| B3 | **Section labels never rewrite recipes.** Lines keep `section` as free text. Renaming or deleting a label changes the catalog only. |
| B4 | **Seeds are idempotent and never resurrect user deletions.** Seeding per user is recorded once (`*_seeded_at`); a user who deletes a seeded fixed cost or section does not get it back on the next login. "Restore defaults" is an explicit action. |
| B5 | **Guide content is structured data, never HTML.** Blocks are validated against the schema in §6.2; the UI renders text only. |
| B6 | **Cover images are verified by content** (magic bytes), EXIF-stripped and re-encoded, like any recipe file (kitchen doc §5.7). |

### 0.3 Definition of done

- [ ] Flyway migrations for §9 (schema) and §10 (seeds), new numbers only.
- [ ] All endpoints of §8 with exact shapes, status codes and error codes.
- [ ] Cost engine updated for `pricingMethod` and `PER_UNIT.quantity` (§4.3, §5.2) with table-driven tests (§11).
- [ ] Per-user lazy seeding of sections and fixed costs (§3.4, §4.6), plus a one-off backfill for existing users.
- [ ] `GET /baking-guide` serving the seed of `src/assets/baking-guide/seed.es-MX.json` (§6.4), localised by `Accept-Language` with `es-MX` fallback.
- [ ] Revisions (kitchen §5.8) written for cover changes and pricing-method changes.
- [ ] ≥ 85 % line coverage on new packages.

### 0.4 Order of work

1. Pricing method + engine changes (smallest, highest value: fixes a wrong label on every price).
2. Fixed costs: columns, status endpoint, `quantity`, preview breakdown, seeds.
3. Recipe sections: table, CRUD, seeds, usage count.
4. Recipe cover endpoints.
5. Baking guide: tables, seed, read endpoint, user pans CRUD, staff content endpoints.

---

## 1. Permissions (add to the IAM catalog)

| Code | Risk | Who (seed) | Guards |
|---|---|---|---|
| `RECIPE.RECIPE.UPDATE` *(existing)* | LOW | USER and up | cover upload/clear (§2), recipe sections CRUD (§3) |
| `FINANCE.FIXED_COST.MANAGE` *(if not already modelled; otherwise reuse the current `/user-fixed-cost` guard)* | LOW | USER and up | fixed-cost status (§4.2) |
| `GUIDE.GUIDE.READ` | LOW | everyone authenticated | `GET /baking-guide` |
| `GUIDE.PAN.MANAGE` | LOW | USER and up | own pan sizes CRUD (§6.3) |
| `GUIDE.CONTENT.MANAGE` | MEDIUM | SUPER_ADMIN, ADMIN (platform staff) | SYSTEM articles, pans and conversions (§6.3) |

The UI's `LEGACY_ROLE_PERMISSIONS` does not branch on the guide permissions yet: every authenticated user sees the guide; pan editing is enabled when the API is reachable.

---

## 2. Recipe cover

The studio shows a 4:3 thumbnail above the "Costeo en vivo" panel. The UI crops client-side and uploads one JPEG (`cover.jpg`, 1600 × 1200 max, quality 0.88).

### 2.1 Endpoints

| Method | Path | Body | Response |
|---|---|---|---|
| PUT | `/recipes/{id}/cover` | `multipart/form-data`: `file` (required) | `200 ApiEnvelope<RecipeFile>` — the new file, `isCover: true` |
| DELETE | `/recipes/{id}/cover` | — | `200 ApiEnvelope<null>` |
| PATCH | `/recipes/{id}/files/{fileId}` *(existing)* | `{ description, isCover: true }` | used by "pick from the recipe's images" |

### 2.2 Rules

- `PUT` stores the image **as a recipe file** (it appears in the Files tab) and flags it `isCover = true`, unsetting the previous cover in the same transaction. It counts against the 40-files / 25 MB / tenant quotas (`409 QUOTA_EXCEEDED`, `413`).
- Accept JPEG, PNG, WebP by **magic bytes** (`415` otherwise). Minimum width **600 px** → `400 VALIDATION_ERROR` `field: "file"`. Strip EXIF, re-encode.
- Generate: `thumbnailUrl` = 400 px WebP (existing rule) and a **800 px WebP "card" variant** used as `RecipeSummary.coverImageUrl` (list cards and the book view). Signed URLs, 15 min.
- `DELETE` only clears the flag (`isCover = false` on the current cover) and sets `coverImageUrl = null`. The file stays. Idempotent: no cover → `200`.
- Uploading to a recipe the caller cannot see → `404` (K8). `ARCHIVED` recipes accept cover changes.
- Write a revision (`summary_key: "recipe.cover.changed" | "recipe.cover.cleared"`) and audit `RECIPE_COVER_CHANGED|CLEARED`. Neither changes the cost, so `cost.status` is untouched.
- `POST /recipes/{id}/duplicate` copies the **cover file** (only that file) so the copy keeps its picture.
- A brand-new recipe holds the cropped image client-side and calls `PUT /cover` right after its first `POST /recipes`.

---

## 3. Recipe sections — `/api/v1/recipe-sections`

Lines keep `section: string | null` exactly as today (kitchen doc §5.1). This catalog only feeds the suggestions, ordering and colours of the section picker.

### 3.1 Shape

```ts
RecipeSection { id: UUID, name: string, color: string | null /* #RRGGBB */, displayOrder: int, usageCount: int }
RecipeSectionRequest { name: string, color: string | null }
```

`usageCount` = number of lines in the caller's recipes (non-deleted, any status) whose `section` matches the name under the **section key** (§3.2). Compute with one grouped query; cache per request.

### 3.2 Validation

| Field | Rule |
|---|---|
| `name` | trimmed, internal whitespace collapsed, 1–40 chars, unique per user under the **section key** = lower-case, accents removed (NFD, strip combining marks), whitespace collapsed. Same function as `sectionKey()` in `kitchen-shared/recipe-sections-dialog.component.ts`. Duplicate → `409 DUPLICATE_RESOURCE`, `field: "name"`. |
| `color` | `null` or `^#[0-9a-fA-F]{6}$` → `400 VALIDATION_ERROR` |
| per user | at most **60** sections → `409 QUOTA_EXCEEDED` |

### 3.3 Endpoints

| Method | Path | Body | Response / notes |
|---|---|---|---|
| GET | `/recipe-sections` | — | `ApiEnvelope<RecipeSection[]>` ordered by `displayOrder, name`. Triggers lazy seeding (§3.4). |
| POST | `/recipe-sections` | `RecipeSectionRequest` | `201` the new section, appended (`displayOrder = max + 1`) |
| PUT | `/recipe-sections/{id}` | `RecipeSectionRequest` | `200` updated. Renaming does **not** touch recipe lines (B3). |
| DELETE | `/recipe-sections/{id}` | — | `200 null`. Allowed even when `usageCount > 0` (lines keep their text). |
| PUT | `/recipe-sections/order` | `{ ids: UUID[] }` | `200` full list. Listed ids take `0..n-1`; unknown ids → `400`; ids not listed keep relative order after them. |
| POST | `/recipe-sections/restore-defaults` | `{}` | `200` full list. Re-creates any default (§10.1) whose key is missing; never renames or deletes. |

Audit: none (low-risk personal labels). No optimistic locking needed (last write wins, single owner).

### 3.4 Lazy per-user seeding

On the first `GET /recipe-sections` for a user with `user_kitchen_settings.sections_seeded_at IS NULL`: insert the defaults of §10.1, set `sections_seeded_at = now()`, in one transaction (guard with `SELECT … FOR UPDATE` on the settings row so two tabs do not double-seed). Also add every **distinct section already used** in that user's recipes that is not a default (so existing data shows up as labels). Never seed again (B4).

---

## 4. Fixed costs — `/api/v1/user-fixed-cost`

### 4.1 New fields

```ts
UserFixedCostRequest  += { appliesByDefault?: boolean /* default false */, monthlyAmount?: number | null, monthlyBasis?: number | null }
UserFixedCostResponse += { appliesByDefault: boolean, monthlyAmount: number | null, monthlyBasis: number | null }
```

| Field | Rule |
|---|---|
| `appliesByDefault` | When `true`, the UI pre-fills the cost on every **new** recipe. Purely a preference; the server does not auto-attach. |
| `monthlyAmount`, `monthlyBasis` | Both null or both set. `monthlyAmount ≥ 0`, `monthlyBasis > 0` (`NUMERIC(14,4)`). Not allowed for `PERCENTAGE` (→ `400`). Stored to remember how `defaultAmount` was derived (`defaultAmount ≈ monthlyAmount / monthlyBasis`); **`defaultAmount` stays the authoritative value** used by the engine — the server does not recompute it. Basis meaning: hours/month (`HOURLY_RATE`), units/month (`PER_UNIT`), batches/month (`FIXED_PER_BATCH`). |
| `defaultAmount` | Allow up to 4 decimals (an hourly rate of 0.4375 is legitimate). |

### 4.2 Active switch

`PATCH /user-fixed-cost/{id}/status` body `{ isActive: boolean }` → `200 ApiResponse<UserFixedCostResponse>` (legacy envelope, same as the rest of this resource).

- Deactivating does **not** remove the cost from recipes that already use it: those rows keep being costed. A recipe save that **keeps** an existing row pointing to an inactive cost is accepted; **adding** an inactive cost to a recipe → `400 VALIDATION_ERROR`, `field: "fixedCosts[i].userFixedCostId"`. (Relaxes kitchen doc §5.3 "the caller's ACTIVE fixed cost" for rows already present.)
- Recipes using a cost whose `isActive`, `defaultAmount`, `percentage` or `calculationMethod` changes become `cost.status = STALE` (existing ripple rule).
- `GET /user-fixed-cost` keeps returning active **and** inactive rows (the UI filters).
- `DELETE` on a cost used by any recipe → `409 RESOURCE_IN_USE` with `{ recipes: [{ id, name }] }` in `errors[0].details`; the UI suggests deactivating instead.

### 4.3 `PER_UNIT` quantity per batch

Today `PER_UNIT = defaultAmount × targetYield` — a cake box would be charged **20 times** for a 20-portion cake. Recipe rows gain an optional quantity:

```ts
RecipeFixedCostRequest += { quantity: number | null }   // PER_UNIT only; others must send null
RecipeFixedCost        += { quantity: number | null }
```

Engine (replaces the `PER_UNIT` line of kitchen doc §5.5):

```
PER_UNIT = defaultAmount × (quantity ?? targetYield)                when quantity is null (legacy behaviour)
PER_UNIT = defaultAmount × quantity × batches                       when quantity is set (units per batch)
```

Validation: `0.01 ≤ quantity ≤ 100 000`; non-null on a non-`PER_UNIT` row → `400`. Column `recipe_fixed_costs.quantity NUMERIC(14,4) NULL`.

### 4.4 Per-row breakdown in the live preview

`POST /recipes/cost-preview` response gains:

```ts
RecipeCostPreview += { fixedCosts: { userFixedCostId: UUID, cost: number }[] }
```

One entry per request row (or per stored row in configurator mode), cost at the target yield, rounded like `RecipeFixedCost.cost`. The studio shows it next to each row.

### 4.5 Copy

The calculation-method hints in the UI no longer mention enum codes ("Ideal para LABOR o UTILITY"). If the server localises any method/type label, use: *Tarifa por hora — mano de obra y servicios que dependen del tiempo*; *Costo por unidad — empaque e insumos por pieza*; *Costo fijo por lote — renta, depreciación o gastos generales prorrateados*; *Porcentaje sobre insumos — un % del costo de ingredientes y merma*. (The PERCENTAGE base is `ingredientsCost + wasteCost`, as the engine already computes; the old hint said "total cost of the recipe", which was wrong.)

### 4.6 Seed records of fixed costs (required)

Every user starts with a ready-to-edit set of fixed costs (§10.2), so recipes can be costed with labour, gas and packaging from day one.

- **New users:** seed on account creation, in the same transaction.
- **Existing users:** one-off Flyway Java migration — for every user with `fixed_costs_seeded_at IS NULL`, insert the seed rows whose `seed_code` the user does not have, then set `fixed_costs_seeded_at`. Users who already have fixed costs still receive the seeds, but **inactive** (`is_active = false`), so nothing changes in their current costing.
- **Lazy safety net:** `GET /user-fixed-cost` seeds if `fixed_costs_seeded_at IS NULL` (same lock as §3.4).
- Seeded rows are ordinary rows (editable, deletable). `seed_code` is kept only for idempotency; deleting a seeded row never brings it back (B4).
- Amounts are MXN reference values. If the user's default currency is not MXN, seed them **inactive** with the amounts converted at the configured exchange rate if one exists, else `defaultAmount = 0`.
- Optional endpoint `POST /user-fixed-cost/restore-defaults` (same semantics as sections) — not used by the UI yet.

---

## 5. Pricing method

### 5.1 Shape

```ts
type PricingMethod = 'MARKUP' | 'MARGIN'
RecipeRequest            += { pricingMethod: PricingMethod }   // optional on the wire; default: the stored value, MARKUP for new recipes
RecipeCostPreviewRequest += { pricingMethod: PricingMethod }   // optional; default: the recipe's stored value, else MARKUP
RecipeSummary / RecipeDetail += { pricingMethod: PricingMethod }
RecipeCost               += { pricingMethod: PricingMethod }   // the method actually applied to suggestedUnitPrice
```

The UI labels the suggested price with `cost.pricingMethod` (absent → MARKUP), so the label always matches what the server computed.

### 5.2 Engine (replaces `suggestedUnitPrice` in kitchen doc §5.5)

```
MARKUP: suggestedUnitPrice = costPerUnit × (1 + targetMarginPercent / 100)
MARGIN: suggestedUnitPrice = costPerUnit ÷ (1 − targetMarginPercent / 100)
```

Then round per finance settings, as today.

### 5.3 Validation & migration

- `MARGIN` requires `targetMarginPercent < 100` → `400 VALIDATION_ERROR`, `field: "targetMarginPercent"`. `MARKUP` keeps `0–1000`.
- Migration: `ALTER TABLE recipes ADD COLUMN pricing_method VARCHAR(10) NOT NULL DEFAULT 'MARKUP'` — B2: every existing price is unchanged.
- Changing the method writes a revision (`changes.pricingMethod`) and recalculates `cost` in the same request.
- **Quotes:** the `BELOW_TARGET_MARGIN` warning and `recipesBelowMargin` of the price ripple compare using the recipe's method: under `MARKUP` compare `(price − cost)/cost`, under `MARGIN` compare `(price − cost)/price` against `targetMarginPercent`.

---

## 6. Baker's guide — `/api/v1/baking-guide`

### 6.1 Shapes (mirror `core/models/baking-guide.models.ts`)

```ts
GuideCategory = 'FOOD_SAFETY' | 'TECHNIQUES' | 'COSTING'
GuideBlock =
  | { type: 'paragraph', text }
  | { type: 'list', ordered: boolean, items: string[] }
  | { type: 'table', columns: string[], rows: string[][] }
  | { type: 'callout', tone: 'info' | 'tip' | 'warn', text }
  | { type: 'formula', expression, description }
GuideArticle { id, code, category, title, summary, icon /* "pi pi-…" */, tags: string[], blocks: GuideBlock[], sources: string[], displayOrder }

PanShape = 'ROUND' | 'SPRINGFORM' | 'SQUARE' | 'RECTANGULAR' | 'SHEET' | 'LOAF' | 'BUNDT' | 'MUFFIN'
PanSize { id, code, scope: 'SYSTEM' | 'USER', shape, name, diameterCm, lengthCm, widthCm, heightCm, volumeMl, servings, notes }
PanSizeRequest { shape, name, diameterCm, lengthCm, widthCm, heightCm, volumeMl, servings, notes }

IngredientConversion { code, name, gramsPerCup /* US cup 236.6 ml */, gramsPerTablespoon, gramsPerTeaspoon }

BakingGuide { articles: GuideArticle[], panSizes: PanSize[], conversions: IngredientConversion[], revision: string /* ISO date */ }
```

### 6.2 Validation

| Item | Rule |
|---|---|
| Block text fields | plain text, ≤ 2 000 chars; reject `<` followed by a letter or `/` (B5) |
| `table` | 1–8 columns; every row has exactly `columns.length` cells; ≤ 60 rows |
| `list` | 1–40 items |
| Article | `code` `^[A-Z][A-Z0-9_]{2,49}$` unique; `title` ≤ 120; `summary` ≤ 300; ≤ 40 blocks; `icon` `^pi pi-[a-z0-9-]+$` |
| Pan | `name` 1–80; shape-specific size: `ROUND/SPRINGFORM/BUNDT/MUFFIN` need `diameterCm`, others `lengthCm` (+ `widthCm` unless `SQUARE`, where `widthCm = lengthCm`); `1 ≤ size ≤ 120` cm; `0.5 ≤ heightCm ≤ 40`; `volumeMl` 1–100 000 or null; `servings` 1–1000 or null; `notes` ≤ 200. Unused dimensions are stored null. |
| User pans | ≤ 50 per user → `409 QUOTA_EXCEEDED`; name unique per user (case-insensitive) → `409 DUPLICATE_RESOURCE` |

### 6.3 Endpoints

| Method | Path | Permission | Notes |
|---|---|---|---|
| GET | `/baking-guide` | `GUIDE.GUIDE.READ` | Whole guide: SYSTEM articles + conversions, SYSTEM ∪ caller's USER pans (SYSTEM first by `display_order`, then USER by name). Localised (§6.5). `ETag` = hash of `revision` + caller's pans `max(updated_at)`; honour `If-None-Match` → `304`. `Cache-Control: private, max-age=300`. |
| POST | `/baking-guide/pan-sizes` | `GUIDE.PAN.MANAGE` | Creates a USER pan → `201 PanSize` |
| PUT | `/baking-guide/pan-sizes/{id}` | `GUIDE.PAN.MANAGE` | Own USER pans only; SYSTEM → `403`, foreign → `404` |
| DELETE | `/baking-guide/pan-sizes/{id}` | `GUIDE.PAN.MANAGE` | Own USER pans only |
| GET/POST/PUT/DELETE | `/baking-guide/admin/articles[/{id}]` | `GUIDE.CONTENT.MANAGE` | Staff CRUD of SYSTEM articles (+ `translations` map, §6.5). Bumps `revision`. Audit `GUIDE_ARTICLE_*`. |
| GET/POST/PUT/DELETE | `/baking-guide/admin/pan-sizes[/{id}]`, `/baking-guide/admin/conversions[/{code}]` | `GUIDE.CONTENT.MANAGE` | Staff CRUD of SYSTEM pans and conversions |

The UI does not call the admin endpoints yet (content is seeded); build them so platform staff can maintain it without a migration.

### 6.4 Seed

`src/assets/baking-guide/seed.es-MX.json` **is the seed** — 22 articles (6 food safety, 10 techniques, 6 costing), 30 pan sizes, 30 conversions. Load it verbatim in a Flyway migration (`V…__baking_guide_seed.sql` generated from the file, or a Java migration reading a copy under `src/main/resources/db/seed/`). Ids are stable UUIDv5 values — keep them, so the UI's offline copy and the API agree. Upsert by `code` (`ON CONFLICT (code) DO UPDATE`), never delete user data.

When staff edit content later, the UI's bundled copy is only a fallback; the API wins whenever it answers.

### 6.5 Localisation

- Content is authored in `es-MX`. Store translations in a `translations JSONB` column per row: `{ "en": { "title": …, "summary": …, "tags": […], "blocks": […] } }`.
- `GET /baking-guide` picks the best match for `Accept-Language` (exact tag, then language, then `es-MX`). Pan `name`/`notes` and conversion `name` follow the same rule.
- No English translation is required for launch; the fallback is `es-MX`.

### 6.6 What the UI computes (no endpoint needed)

Price & margin, pan conversion (area ratio, or batter-volume ratio for BUNDT/MUFFIN), servings (`area ÷ 12.5 cm²` event slice, `÷ 20 cm²` dessert slice, unless `servings` is set), °C/°F/gas mark, volume→grams. All in `pages/cronos/baking-guide/baking-math.ts` and `kitchen-shared/pricing.ts`, with specs. They are labelled "≈" and never saved or quoted (K1 still holds).

---

## 7. Book view (cookbook reading mode)

Route `/cronos/recetas/:id/libro` (full-screen, outside the app shell), opened from every recipe card and from the studio header. It reads `GET /recipes/{id}` only. Requirements on existing endpoints:

1. **Permission:** `RECIPE.RECIPE.READ` is enough; no write permission needed.
2. **`RecipeDetail.coverImageUrl`** must be populated (not only on the summary) — it is the book's cover (§2.2 card variant).
3. **Sanitiser allow-list for `processHtml`** (kitchen doc K5) must keep what Quill 2 produces, or the book cannot split the method into numbered steps: `p, br, strong, em, u, s, a[href], h1, h2, h3, ol, ul, li[data-list]` (values `ordered`, `bullet`), `blockquote`, `span[class=ql-ui]` (may be dropped). The book numbers `li[data-list=ordered]` and paragraphs written as `1. …`.
4. **Line `notes`** and **`optional`** are shown (optional ingredients are listed last, marked "(opcional)").
5. Scaling (`?scale=1.5` or a target yield) is client-side display arithmetic only; nothing is persisted.

---

## 8. Endpoint summary

| Method | Path | § |
|---|---|---|
| PUT | `/recipes/{id}/cover` | 2 |
| DELETE | `/recipes/{id}/cover` | 2 |
| GET | `/recipe-sections` | 3 |
| POST | `/recipe-sections` | 3 |
| PUT | `/recipe-sections/{id}` | 3 |
| DELETE | `/recipe-sections/{id}` | 3 |
| PUT | `/recipe-sections/order` | 3 |
| POST | `/recipe-sections/restore-defaults` | 3 |
| PATCH | `/user-fixed-cost/{id}/status` | 4.2 |
| POST | `/user-fixed-cost/restore-defaults` *(optional)* | 4.6 |
| *(changed)* POST/PUT | `/user-fixed-cost[/{id}]` — `appliesByDefault`, `monthlyAmount`, `monthlyBasis` | 4.1 |
| *(changed)* POST/PUT | `/recipes[/{id}]` — `pricingMethod`, `fixedCosts[].quantity` | 4.3, 5 |
| *(changed)* POST | `/recipes/cost-preview` — request `pricingMethod`, response `fixedCosts[]`, `cost.pricingMethod` | 4.4, 5 |
| GET | `/baking-guide` | 6 |
| POST/PUT/DELETE | `/baking-guide/pan-sizes[/{id}]` | 6 |
| CRUD | `/baking-guide/admin/**` | 6 |

### Errors (additions)

No new codes. Reuses `VALIDATION_ERROR` (400), `DUPLICATE_RESOURCE` (409), `QUOTA_EXCEEDED` (409), `RESOURCE_IN_USE` (409), `415`, `413`.

---

## 9. Data model (PostgreSQL)

```sql
-- §2 cover: no new table; recipe_files.is_cover already exists. Card variant:
ALTER TABLE recipe_files ADD COLUMN card_storage_key VARCHAR(300);

-- §3 sections
CREATE TABLE recipe_sections (
  id UUID PRIMARY KEY,
  owner_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name VARCHAR(40) NOT NULL,
  name_key VARCHAR(40) NOT NULL,            -- section key (§3.2)
  color CHAR(7),
  display_order INT NOT NULL DEFAULT 0,
  seed_code VARCHAR(40),                    -- set on seeded rows
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (owner_id, name_key)
);
CREATE INDEX ix_recipe_lines_section_key ON recipe_lines (lower(unaccent(trim(section))));  -- for usageCount

CREATE TABLE user_kitchen_settings (
  user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  sections_seeded_at TIMESTAMPTZ,
  fixed_costs_seeded_at TIMESTAMPTZ
);

-- §4 fixed costs
ALTER TABLE user_fixed_costs
  ADD COLUMN applies_by_default BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN monthly_amount NUMERIC(14,4),
  ADD COLUMN monthly_basis NUMERIC(14,4),
  ADD COLUMN seed_code VARCHAR(40),
  ALTER COLUMN default_amount TYPE NUMERIC(14,4),
  ADD CONSTRAINT ck_monthly_pair CHECK ((monthly_amount IS NULL) = (monthly_basis IS NULL)),
  ADD CONSTRAINT uq_fixed_cost_seed UNIQUE (user_id, seed_code);
ALTER TABLE recipe_fixed_costs ADD COLUMN quantity NUMERIC(14,4);

-- §5 pricing method
ALTER TABLE recipes ADD COLUMN pricing_method VARCHAR(10) NOT NULL DEFAULT 'MARKUP'
  CHECK (pricing_method IN ('MARKUP','MARGIN'));

-- §6 guide
CREATE TABLE guide_articles (
  id UUID PRIMARY KEY, code VARCHAR(50) NOT NULL UNIQUE,
  category VARCHAR(20) NOT NULL CHECK (category IN ('FOOD_SAFETY','TECHNIQUES','COSTING')),
  title VARCHAR(120) NOT NULL, summary VARCHAR(300) NOT NULL, icon VARCHAR(40) NOT NULL,
  tags JSONB NOT NULL DEFAULT '[]', blocks JSONB NOT NULL, sources JSONB NOT NULL DEFAULT '[]',
  translations JSONB NOT NULL DEFAULT '{}', display_order INT NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT true, updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE guide_pan_sizes (
  id UUID PRIMARY KEY, code VARCHAR(50), owner_id UUID REFERENCES users(id) ON DELETE CASCADE,  -- NULL = SYSTEM
  shape VARCHAR(12) NOT NULL, name VARCHAR(80) NOT NULL,
  diameter_cm NUMERIC(6,2), length_cm NUMERIC(6,2), width_cm NUMERIC(6,2), height_cm NUMERIC(6,2) NOT NULL,
  volume_ml NUMERIC(10,2), servings INT, notes VARCHAR(200), translations JSONB NOT NULL DEFAULT '{}',
  display_order INT NOT NULL DEFAULT 0, updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (code)
);
CREATE UNIQUE INDEX uq_user_pan_name ON guide_pan_sizes (owner_id, lower(name)) WHERE owner_id IS NOT NULL;
CREATE TABLE guide_conversions (
  code VARCHAR(40) PRIMARY KEY, name VARCHAR(80) NOT NULL,
  grams_per_cup NUMERIC(8,2) NOT NULL, grams_per_tablespoon NUMERIC(8,2), grams_per_teaspoon NUMERIC(8,2),
  translations JSONB NOT NULL DEFAULT '{}', display_order INT NOT NULL DEFAULT 0
);
CREATE TABLE guide_meta (id SMALLINT PRIMARY KEY DEFAULT 1, revision DATE NOT NULL);
```

---

## 10. Seed data

### 10.1 Default recipe sections (per user, in this order)

| seed_code | name |
|---|---|
| `BASE` | Base |
| `SPONGE` | Bizcocho |
| `DOUGH` | Masa |
| `FILLING` | Relleno |
| `SOAK` | Baño / almíbar |
| `CREAM` | Crema / betún |
| `COVERING` | Cubierta |
| `GLAZE` | Glaseado |
| `DECORATION` | Decoración |
| `ASSEMBLY` | Montaje |

All with `color = null`.

### 10.2 Default fixed costs (per user, MXN reference amounts)

| seed_code | name | type | calculationMethod | defaultAmount | percentage | monthlyAmount / monthlyBasis | appliesByDefault | isActive (new users) |
|---|---|---|---|---|---|---|---|---|
| `LABOR_BAKER` | Mano de obra (repostero) | LABOR | HOURLY_RATE | 75.00 | — | 12 000 / 160 h | **true** | true |
| `LABOR_ASSISTANT` | Ayudante de cocina | LABOR | HOURLY_RATE | 50.00 | — | 8 000 / 160 h | false | true |
| `OVEN_GAS` | Gas del horno | UTILITY | HOURLY_RATE | 15.00 | — | 900 / 60 h | false | true |
| `ELECTRICITY` | Luz (batidora, refrigeración) | UTILITY | HOURLY_RATE | 6.00 | — | 600 / 100 h | false | true |
| `WATER_CLEANING` | Agua y limpieza | UTILITY | FIXED_PER_BATCH | 3.00 | — | 600 / 200 lotes | false | true |
| `RENT` | Renta prorrateada | RENT | FIXED_PER_BATCH | 40.00 | — | 8 000 / 200 lotes | false | true |
| `EQUIPMENT` | Depreciación de equipo | OVERHEAD | FIXED_PER_BATCH | 10.00 | — | 2 000 / 200 lotes | false | true |
| `ADMIN` | Gastos administrativos | OVERHEAD | PERCENTAGE | 0 | 5 | — | false | true |
| `MARKETING` | Publicidad y redes | MARKETING | PERCENTAGE | 0 | 3 | — | false | true |
| `CAKE_BOX` | Caja para pastel | PACKAGING | PER_UNIT | 18.00 | — | — | false | true |
| `CAKE_BOARD` | Base de cartón para pastel | PACKAGING | PER_UNIT | 6.00 | — | — | false | true |
| `DOME` | Domo / contenedor individual | PACKAGING | PER_UNIT | 4.50 | — | — | false | true |
| `CUPCAKE_LINER` | Capacillo | PACKAGING | PER_UNIT | 0.40 | — | — | false | true |
| `LABEL` | Etiqueta con ingredientes | PACKAGING | PER_UNIT | 1.50 | — | — | false | true |

Descriptions (optional, `description` column): "Monto de referencia; ajústalo a tu operación." on every seeded row. Existing users get these **inactive** (§4.6).

`LABOR_BAKER` is the only default-applied cost: a new recipe opens with it and the UI asks for the minutes (it offers "use the recipe's prep + bake + cool time").

### 10.3 Baking guide

See §6.4 — the JSON file is the seed.

---

## 11. Testing checklist

- **Engine:** table-driven — MARKUP vs MARGIN at 0 %, 65 %, 99.9 %; MARGIN 100 % rejected; PER_UNIT with `quantity` null (legacy) vs set, at scale 0.5 / 1 / 2.4 (batches 3); rounding per finance settings; `cost.pricingMethod` echoed.
- **Migration:** every pre-existing recipe has `pricing_method = MARKUP` and an unchanged `suggestedUnitPrice`.
- **Quotes:** BELOW_TARGET_MARGIN under both methods.
- **Fixed costs:** status toggle; deactivated cost kept on save, rejected on add; delete in use → 409 with recipe list; monthly pair validation; 4-decimal amounts; preview `fixedCosts[]` matches stored row costs.
- **Seeding:** concurrent first requests seed once; deleted seeded rows are not resurrected; existing users get inactive seeds; restore-defaults is idempotent; existing line sections become labels.
- **Sections:** duplicate under accent/case variants ("Baño" vs "bano") → 409; reorder with unknown id → 400; usageCount after rename (old name's usage moves to "unsaved" in the UI, the label's count drops to 0).
- **Cover:** magic bytes; < 600 px rejected; previous cover unset atomically; DELETE idempotent; duplicate copies the cover; revision + audit rows.
- **Guide:** seed loads with the JSON's ids; `Accept-Language: en` falls back to es-MX; ETag/304; user pans isolated per tenant (foreign id → 404); SYSTEM pan PUT → 403; block validation rejects HTML-looking text.

---

## 12. Frontend map

| Feature | Path |
|---|---|
| Cover thumbnail + crop dialog | `pages/cronos/recipes/recipe-studio/recipe-cover.component.*` |
| Section labels dialog | `pages/cronos/kitchen-shared/recipe-sections-dialog.component.*`; picker in `recipe-studio/recipe-lines-editor.component.*` |
| Section catalog cache | `kitchen-shared/kitchen-lookups.store.ts` (`recipeSections`, `setRecipeSections`) |
| Pricing method & fixed-cost rows | `recipe-studio/recipe-studio.component.*`; arithmetic in `kitchen-shared/pricing.ts` |
| Fixed costs page | `pages/cronos/fixed-costs/fixed-costs.component.*` |
| Book view | `pages/cronos/recipes/recipe-book/` (`book-pages.ts` = pagination/step parsing) |
| Baker's guide | `pages/cronos/baking-guide/` (`baking-math.ts`, calculators, pans, articles) |
| Services | `core/services/domain/recipe-section.service.ts`, `baking-guide.service.ts`, `recipe.service.ts` (`uploadCover`, `clearCover`), `user-fixed-cost.service.ts` (`setActive`) |
| Bundled guide seed | `src/assets/baking-guide/seed.es-MX.json` |

---

## 13. Open decisions

1. **Default pricing method for new recipes** — the UI defaults to `MARKUP` (matches today). Switching new recipes to `MARGIN` is a product call; it only changes the form default.
2. **Tenant vs. user ownership** of sections, fixed costs and pans: this doc says per user (matching `/user-fixed-cost`). If tenants share a kitchen, move `owner_id` to the tenant and keep the same endpoints.
3. **Server-side scaling** (`GET /recipes/{id}?scale=`) for printing scaled recipes as PDF — not needed for the book view; consider with a future "export PDF".
