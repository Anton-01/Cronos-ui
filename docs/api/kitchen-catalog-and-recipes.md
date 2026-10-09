# Kitchen Catalog & Recipe Studio — Backend Handoff and API Contract

> **Audience:** the Claude agent (or engineer) implementing the Cronos backend.
> **Frontend:** `cronos-system-ui`, branch `feature/catalog-and-recipe-studio` — already built against this contract.
> **TypeScript mirror of every shape:** `src/app/core/models/kitchen.models.ts` (allergens, ingredients, recipes) and the quote additions in `src/app/core/models/domain.model.ts`. **Change the doc and those files together.**
> **Amended by:** `docs/api/baking-studio.md` — `pricingMethod` (replaces the `suggestedUnitPrice` formula of §5.5), `PER_UNIT` `quantity`, fixed-cost status/seeds, recipe cover and section endpoints.
> **Read first:** `docs/api/iam-and-finance.md` §0–§1 (envelope, error codes, permissions, optimistic locking, audit). Everything there applies here and is not repeated.

---

## 0. Agent brief

### 0.1 Mission

Rebuild the kitchen domain so that:

1. The platform ships a **master catalog** (SYSTEM) of the allergens, ingredient categories, product categories and the most common baking ingredients, each with a market **reference price**, yield and density. Every tenant uses it from day one and adds its own (USER) ingredients.
2. Every ingredient has an **effective cost** (own purchase price, else reference price) and a **price history**. Registering a price **recalculates every recipe that uses it**, flags open quotes, and reports recipes that fell below their target margin. Nothing is ever costed with a silently missing price.
3. **Allergens are detected**: ingredients declare allergens; allergen keywords suggest undeclared ones; recipes aggregate them per line with provenance (INGREDIENT / DETECTED / MANUAL) and distinguish "contains" from "may contain (optional lines)".
4. **Substitutes**: an ingredient lists its substitutes with a quantity ratio; the API answers "substitutes of X free of allergens Y" with what each one removes and introduces.
5. **Recipes** are saved as one aggregate (lines, fixed costs, process, margins) with optimistic locking and a **revision history**; the process is **sanitised rich text**; recipes carry **N attachments**.
6. **Quotes** reference a recipe **configuration** (which selectable lines are in, which are swapped, how much is made); the server prices it and snapshots cost and allergens on the quote line.
7. Seed: 14 allergens, ingredient & product categories, ≥ 120 common ingredients with reference prices, substitutes, and **10 recipes (5 simple, 5 large)** for a demo tenant/the SYSTEM library.

### 0.2 Non-negotiables (in addition to IAM doc §0.2)

| # | Rule |
|---|---|
| K1 | **The server is the only cost authority.** Every cost the UI shows comes from the API (`cost-preview`, `recipe.cost`, `ingredient.costPerBaseUnit`). The UI's estimates are previews only. |
| K2 | **Money/quantities are `BigDecimal`**: prices `NUMERIC(14,4)`, quantities `NUMERIC(14,4)`, cost per base unit `NUMERIC(18,8)`, percentages `NUMERIC(7,4)`. Intermediate scale 10, `HALF_EVEN`; round only at the points in §5.5 using finance settings. |
| K3 | **Never cost with a missing price as zero without saying so.** Unpriced lines produce `lineCost: null`, `unpricedLines > 0` and `costStatus: INCOMPLETE`. |
| K4 | **Price changes ripple synchronously for the caller's data** (recipes recalculated in the same request, up to 500 recipes; beyond that enqueue and return `recipesAffected` with `status: PENDING`). |
| K5 | **Rich text is sanitised server-side** with an allow-list (OWASP Java HTML Sanitizer). Never trust the client's HTML. |
| K6 | **Files are verified by content** (magic bytes), size-limited, stored outside the web root with random keys, served through signed URLs or an authorised proxy, and (recommended) virus-scanned. |
| K7 | **SYSTEM rows are immutable for tenants** (identity, allergens, reference price). Tenants only add an own price, extra detection keywords (allergens) or their own rows. Platform staff edit SYSTEM rows with `CATALOG.*.MANAGE`. |
| K8 | **Tenant isolation**: USER rows, prices, recipes, files and quotes are always filtered by owner/tenant; a foreign id answers `404`, never `403` (no existence leaks). |

### 0.3 Definition of done

- [ ] Flyway migrations for schema (§9) and seed (§10) — new numbers, never editing applied ones; seeds idempotent (`ON CONFLICT (code) DO NOTHING/UPDATE`).
- [ ] All endpoints of §11 with exact shapes, status codes and error codes.
- [ ] Cost engine (§5.5) as a pure, table-driven-tested component reused by recipes, cost preview, quotes and the price ripple.
- [ ] Allergen detection (§3.3) server-side, same algorithm as the UI; returned as suggestions, never auto-linked.
- [ ] Revision history (§5.8) written on every recipe change and every cost recalculation.
- [ ] Tests per §12; ≥ 85 % line coverage on the new packages.
- [ ] Legacy endpoints (§13) deprecated, delegating to the new services.

### 0.4 Order of work

1. Catalog tables + seeds: allergens, categories, ingredients (SYSTEM) with reference prices.
2. Unit conversion (reuse `/measurement-unit` + density) and the cost engine.
3. Ingredients API incl. prices, history, ripple, substitutes, usage, stats.
4. Recipes aggregate API, cost preview, recalculation, revisions, files (+ keep shares).
5. Quotes: configuration, re-pricing, snapshot, flags.
6. Demo recipes seed; legacy endpoint deprecation.

---

## 1. Permissions (add to the IAM catalog, `docs/api/iam-and-finance.md` §5.2)

| Code | Risk | Who (seed) | Guards |
|---|---|---|---|
| `CATALOG.ALLERGEN.READ` | LOW | everyone | `GET /allergens` |
| `CATALOG.ALLERGEN.MANAGE` | MEDIUM | SUPER_ADMIN, ADMIN | create/update/status/delete allergens; adding keywords to SYSTEM allergens |
| `CATALOG.INGREDIENT.MANAGE` | HIGH | SUPER_ADMIN, ADMIN (platform staff) | edit **SYSTEM** ingredients (identity, allergens, reference price, substitutes) |
| `INGREDIENT.INGREDIENT.READ` / `CREATE` / `UPDATE` / `DELETE` | LOW/LOW/LOW/MEDIUM | USER and up | own (USER) ingredients; `UPDATE` also allows registering own prices on any ingredient |
| `RECIPE.RECIPE.READ` / `CREATE` / `UPDATE` / `DELETE` / `SHARE` | LOW/LOW/LOW/MEDIUM/MEDIUM | USER and up | recipes, files, history, cost preview |

The UI's transitional `LEGACY_ROLE_PERMISSIONS` grants these to ADMIN/MANAGER/USER until every token carries the claim.

---

## 2. Domain concepts & invariants

| Concept | Rule |
|---|---|
| **Scope** | `SYSTEM` = platform catalog (`owner_id IS NULL`), read-only for tenants. `USER` = owned by the caller's tenant. Lists return SYSTEM ∪ own USER rows. |
| **Base dimension** | Every ingredient is costed per base unit: `g` (MASS), `ml` (VOLUME), `pz` (COUNT). Immutable once the ingredient is used in a recipe (`409 RESOURCE_IN_USE`, `field: "baseDimension"`). |
| **Yield %** | Usable share after cleaning/peeling/sifting, `1 ≤ yield ≤ 100`. Cost per usable unit = price ÷ (purchased base quantity × yield/100). |
| **Density** | g/ml, `0.1 ≤ d ≤ 3`. Required to use a VOLUME unit for a MASS ingredient (or vice versa); otherwise `400 UNIT_INCOMPATIBLE`. |
| **Effective price** | Tenant's latest own price if any, else the SYSTEM reference price, else none. `priceSource` = `OWN` / `REFERENCE` / `NONE`. |
| **Stale price** | Effective price older than `STALE_PRICE_DAYS` (default **60**, tenant setting later). |
| **Allergen provenance** | On a recipe line: `INGREDIENT` (declared on the ingredient — derived, never stored on the line), `DETECTED` (keyword suggestion the user accepted), `MANUAL` (added by hand). |
| **Optional / quote-selectable** | `optional` lines are excluded from the base product and the base cost; `quoteSelectable` (always true when optional) lines can be toggled per quote. |
| **Cost status** | `CURRENT` (all lines priced, computed after the last relevant price change), `STALE` (a price or fixed cost changed since `calculatedAt`), `INCOMPLETE` (≥ 1 unpriced required line). |
| **Revision** | Every successful save or recalculation increments `version` and writes a `recipe_revisions` row. |

---

## 3. Allergens — `/api/v1/allergens`

### 3.1 Shape (`AllergenResponse`)

```json
{ "id": 1, "code": "GLUTEN", "name": "Cereales con gluten", "description": "Trigo, centeno, cebada, avena…",
  "icon": "pi pi-sun", "keywords": ["trigo", "harina de trigo", "cebada", "centeno", "avena", "espelta", "semola", "galleta", "pan molido"],
  "regulations": ["NOM-051", "EU-1169", "FDA-FALCPA"], "scope": "SYSTEM", "status": "ACTIVE", "ingredientCount": 37, "updatedAt": null, "version": 1 }
```
`name`, `description` and `keywords` are localised per `Accept-Language` (store keywords per locale: `allergen_keywords(allergen_id, locale, keyword)`; detection uses **both** locales). `ingredientCount` counts ingredients visible to the caller that declare it.

### 3.2 Endpoints & rules

| Method | Path | Body | Notes |
|---|---|---|---|
| GET | `/allergens?status=` | — | unpaged, sorted by name |
| POST | `/allergens` | `AllergenRequest` | creates a USER allergen |
| PUT | `/allergens/{id}` | `AllergenRequest` + `version` | USER: all fields except `code`. SYSTEM: **only `keywords`** may grow (tenant keywords stored separately, never removing platform keywords); other fields ignored → if changed `409 SYSTEM_RESOURCE_CONFLICT` |
| PATCH | `/allergens/{id}/status` | `{ status, version }` | SYSTEM → `409 SYSTEM_RESOURCE_CONFLICT` |
| DELETE | `/allergens/{id}` | — | only USER with `ingredientCount = 0` (and not referenced by any recipe line) → else `409 RESOURCE_IN_USE` |

| Field | Rule |
|---|---|
| `code` | `^[A-Z][A-Z0-9_]{1,49}$`, unique per tenant ∪ SYSTEM, immutable |
| `name` | 1–80, unique case-insensitive among visible rows |
| `description` | ≤ 500 |
| `icon` | one of the allowed PrimeIcons list (`pi pi-exclamation-triangle`, `pi pi-ban`, `pi pi-shield`, `pi pi-heart`, `pi pi-sun`, `pi pi-bolt`, `pi pi-circle`, `pi pi-circle-fill`, `pi pi-star`, `pi pi-flag`, `pi pi-tag`) |
| `keywords` | 1–60 items; each normalised (§3.3) to 1–40 chars; duplicates removed; must not be a stop word (`de`, `la`, `con`, `y`, `sin`, `para`, `the`, `of`, `and`) |
| `regulations` | subset of `NOM-051`, `EU-1169`, `FDA-FALCPA`, `CODEX` |

### 3.3 Detection algorithm (must match `kitchen-shared/allergen-detection.ts`)

```
normalize(s) = lower(stripAccents(s)) → replace [^a-z0-9ñ ]+ with ' ' → collapse spaces → trim
matches(text, allergen) = any keyword k where (' ' + normalize(text) + ' ') contains (' ' + normalize(k) + ' ')
```
Whole-word/phrase only (`leche` ≠ `lechuga`). Report the **longest** matching keyword. Detection runs on ingredient `name` (+ `description`) and on recipe line `notes`. It returns **suggestions only**; persistence happens when the user sends the allergen (`allergenIds` on ingredients, `extraAllergens` with `source: DETECTED` on recipe lines).

Expose it for other clients: `POST /allergens/detect { "text": "…", "excludeIds": [1] }` → `[{ allergenId, code, name, keyword }]`.

---

## 4. Ingredients — `/api/v1/ingredients`

### 4.1 Shapes

`IngredientSummary`: `id (uuid), code, name, categoryId, categoryName, scope, baseDimension, baseUnitCode, yieldPercent, costPerBaseUnit|null, priceSource, pricedAt|null, priceStale, allergens: AllergenRef[], usedInRecipes, status`.

`IngredientDetail` = summary + `description, brand, densityGPerMl, referencePrice: IngredientPrice|null, ownPrice: IngredientPrice|null, substitutes: IngredientSubstitute[], createdAt, updatedAt, updatedBy, version`.

`IngredientPrice`: `purchaseQuantity, purchaseUnitId, purchaseUnitCode, price, currency, supplier, pricedAt (date)`.

`IngredientSubstitute`: `ingredientId, ingredientName, ratio, notes, freeOf: AllergenRef[], introduces: AllergenRef[]` — `freeOf` = original's allergens absent from the substitute; `introduces` = substitute's allergens absent from the original.

`costPerBaseUnit` is expressed in the tenant's **default currency** (finance settings). Prices in other currencies are converted only if an exchange rate exists; otherwise `400 CURRENCY_NOT_SUPPORTED` on registration (multi-currency costing is out of scope — accept only the default currency for now).

### 4.2 Endpoints

| Method | Path | Notes |
|---|---|---|
| GET | `/ingredients?page&size&sort&search&categoryIds[]&allergenIds[]&excludeAllergens&scope&priceStale&status` | sort whitelist `name`, `costPerBaseUnit`, `pricedAt`, `usedInRecipes`; `allergenIds` + `excludeAllergens=false` → contains ANY; `true` → free of ALL; `search` accent-insensitive on name, code, brand, category |
| GET | `/ingredients/stats` | `{ total, system, own, withAllergens, stalePrices, unpriced }` (visible rows, ACTIVE) |
| GET | `/ingredients/{id}` | detail |
| POST | `/ingredients` | `IngredientRequest` (always creates USER); optional first `price` |
| PUT | `/ingredients/{id}` | + `version`; USER rows need `INGREDIENT.UPDATE`; SYSTEM rows need `CATALOG.INGREDIENT.MANAGE` |
| PATCH | `/ingredients/{id}/status` | deactivating keeps recipes intact but flags them `STALE` and hides the ingredient from pickers |
| DELETE | `/ingredients/{id}` | USER only, `usedInRecipes = 0` → else `409 RESOURCE_IN_USE` |
| POST | `/ingredients/{id}/prices` | `IngredientPriceRequest` → `PriceImpact` (§4.5). Allowed on SYSTEM ingredients (creates the tenant's own price) |
| GET | `/ingredients/{id}/prices?page&size` | `CatalogPage<IngredientPriceHistoryEntry>` newest first; own prices + reference price changes |
| GET | `/ingredients/{id}/substitutes?freeOfAllergenIds[]` | substitutes declared **on `{id}`** (platform ∪ tenant), keeping only those whose allergens ∩ `freeOfAllergenIds` = ∅; sorted by fewest `introduces`, then name |
| GET | `/ingredients/{id}/usage` | `[{ id, name, quantity, unitCode }]` of the caller's recipes using it |

### 4.3 Validation (`IngredientRequest`)

| Field | Rule |
|---|---|
| `code` | `^[A-Z][A-Z0-9_]{1,49}$`, unique per tenant (USER) and globally among SYSTEM; immutable |
| `name` | 2–120, unique case/accent-insensitive among the caller's visible rows (a USER ingredient may not shadow a SYSTEM name → `409 DUPLICATE_RESOURCE` with a message pointing to the SYSTEM row) |
| `categoryId` | ACTIVE `INGREDIENT` category visible to the caller |
| `description` ≤ 500 · `brand` ≤ 80 | |
| `baseDimension` | `MASS` \| `VOLUME` \| `COUNT`; immutable when used |
| `yieldPercent` | 1–100, scale ≤ 1 |
| `densityGPerMl` | null or 0.1–3, scale ≤ 3; must be null for COUNT |
| `allergenIds` | ACTIVE, visible, unique |
| `substitutes[]` | ≤ 10; `ingredientId` visible & ACTIVE, ≠ self, unique; `ratio` 0.01–10 scale ≤ 3; `notes` ≤ 200; substitute's base dimension must equal the original's, or both MASS/VOLUME with densities → else `400 UNIT_INCOMPATIBLE` (`field: "substitutes[i].ingredientId"`) |
| `price` | optional; same rules as §4.4 |

Server also runs §3.3 detection on name/description and returns `suggestedAllergens: AllergenRef[]` (not yet linked) in the response detail — the UI shows them too.

### 4.4 Price registration (`IngredientPriceRequest`)

| Field | Rule |
|---|---|
| `purchaseQuantity` | > 0, ≤ 1 000 000, scale ≤ 4 |
| `purchaseUnitId` | ACTIVE measurement unit compatible with `baseDimension` (or MASS/VOLUME with density) |
| `price` | 0.01–10 000 000, scale ≤ 2 (or the currency's decimals) |
| `currency` | ACTIVE catalog currency; for now must equal the default currency |
| `supplier` | ≤ 120 |
| `pricedAt` | date ≤ today (tenant TZ) and ≥ today − 5 years |

Plausibility guard (do **not** block, but return `warnings[]`): change > ±50 % vs current effective cost → `{ code: "PRICE_JUMP", message }`. The UI already confirms before sending; the server records it on the audit event.

Formula:
```
baseQty   = purchaseQuantity × unit.multiplierToBase                       (in the unit's dimension base: g / ml / pz)
if unit.dimension ≠ ingredient.baseDimension:  baseQty = VOLUME→MASS ? baseQty × density : baseQty ÷ density
costPerBaseUnit = price ÷ (baseQty × yieldPercent / 100)                   scale 8, HALF_EVEN
```

### 4.5 Ripple (`PriceImpact`)

In the same transaction as the new price:
1. Insert `ingredient_prices` row (append-only; history never edited).
2. Recompute every **caller's** recipe that uses the ingredient (cost engine §5.5); write a revision per recipe (`summary`: "Costo recalculado por cambio de precio de {ingredient}").
3. Flag the caller's open quotes (`DRAFT`, `SENT`) whose lines reference those recipes: set `quote_items.price_review_required = true` and `quotes.price_review_required = true`.
4. Return:
```json
{ "ingredient": { …IngredientSummary… }, "recipesAffected": 7, "quotesFlagged": 2,
  "recipesBelowMargin": [ { "id": "…", "name": "Pastel de tres leches", "marginPercent": 41.2 } ] }
```
`marginPercent` = margin the recipe now achieves at its **reference selling price** under the new cost: `(referencePrice − newCostPerUnit) / newCostPerUnit × 100`, where `referencePrice` = the unit price of the most recent ACCEPTED quote line for that recipe, or — if never quoted — the suggested price **before** this change. A recipe is listed when `marginPercent < targetMarginPercent`.
5. Reference-price changes on SYSTEM ingredients (platform staff) ripple to **every tenant without an own price**; run it as a background job (outbox) and mark affected recipes `STALE` until processed.

Audit: `INGREDIENT_PRICE_REGISTERED` (category DATA, NOTICE; WARNING when `PRICE_JUMP`).

---

## 5. Recipes — `/api/v1/recipes`

### 5.1 Shapes

`RecipeSummary`: `id, code, name, categoryId, categoryName, difficulty (EASY|MEDIUM|ADVANCED), yieldQuantity, yieldUnit, status (DRAFT|ACTIVE|ARCHIVED), allergens (contains only), coverImageUrl, costPerUnit, suggestedUnitPrice, targetMarginPercent, costStatus, costCalculatedAt, totalMinutes, updatedAt`.

`RecipeDetail` = summary + `description, processHtml, storageInstructions, shelfLifeDays, prepMinutes, bakeMinutes, coolMinutes, ovenTemperatureC, wastePercent, lines: RecipeLine[], fixedCosts: RecipeFixedCost[], files: RecipeFile[], cost: RecipeCost, createdAt, createdBy, updatedBy, version`.

`RecipeLine`: `id, ingredientId, ingredientName, section, quantity, unitId, unitCode, optional, quoteSelectable, notes, allergens: [{ allergenId, code, name, source }], lineCost|null, displayOrder`.

`RecipeFixedCost`: `id, userFixedCostId, name, method (HOURLY_RATE|PER_UNIT|FIXED_PER_BATCH|PERCENTAGE), minutes, percentage, cost`.

`RecipeCost`: `ingredientsCost, wasteCost, fixedCosts, totalCost, costPerUnit, suggestedUnitPrice, currency, status, unpricedLines, calculatedAt`.

### 5.2 Endpoints

| Method | Path | Notes |
|---|---|---|
| GET | `/recipes?page&size&sort&search&categoryIds[]&statuses[]&freeOfAllergenIds[]&costStatus` | sort whitelist `updatedAt`, `name`, `costPerUnit`; `freeOfAllergenIds` checks **contains** allergens only |
| GET | `/recipes/stats` | `{ total, active, drafts, staleCost, belowMargin }` |
| GET | `/recipes/{id}` | detail |
| POST | `/recipes` | `RecipeRequest` → `201 RecipeDetail` (status DRAFT) |
| PUT | `/recipes/{id}` | full aggregate replace + `version` |
| PATCH | `/recipes/{id}/status` | `{ status, version }`; transitions DRAFT→ACTIVE, ACTIVE→ARCHIVED, ARCHIVED→DRAFT, ACTIVE→DRAFT. **Publish (→ACTIVE) requires ≥ 1 line and `yieldQuantity > 0`**; unpriced lines and empty process are allowed but returned as `warnings[]` |
| POST | `/recipes/{id}/duplicate` | `{ name }` → new DRAFT copy (lines, fixed costs, process; not files, history, shares); code = `{code}_COPY[_n]` |
| DELETE | `/recipes/{id}` | soft delete (`deleted_at`); quotes keep their snapshot; files purged after 30 days |
| POST | `/recipes/cost-preview` | §5.6 |
| POST | `/recipes/{id}/recalculate` | recompute with today's prices, revision, return detail |
| GET | `/recipes/{id}/history?page&size` | `CatalogPage<RecipeRevision>` newest first |
| POST | `/recipes/{id}/files` | multipart, one file per request (§5.7) |
| PATCH | `/recipes/{id}/files/{fileId}` | `{ description, isCover }` |
| DELETE | `/recipes/{id}/files/{fileId}` | |
| GET | `/recipes/simple?search=` | (existing, used by the quote search) ACTIVE recipes only: `{ id, name, description, totalCost, costPerUnit, yieldUnit }` |
| shares | `/recipes/{id}/shares…` | unchanged legacy envelope (keep) |

### 5.3 Validation (`RecipeRequest`)

| Field | Rule |
|---|---|
| `code` | `^[A-Z][A-Z0-9_]{1,49}$`, unique per tenant, immutable |
| `name` | 3–120, unique per tenant (case/accent-insensitive) among non-deleted |
| `categoryId` | null or ACTIVE `PRODUCT` category visible |
| `difficulty` | enum |
| `description` ≤ 1000 · `storageInstructions` ≤ 1000 | |
| `yieldQuantity` | 0.01–100 000, scale ≤ 2 |
| `yieldUnit` | 1–30 chars, trimmed |
| `prepMinutes`, `bakeMinutes`, `coolMinutes` | null or 0–10 080 |
| `ovenTemperatureC` | null or 30–320 |
| `shelfLifeDays` | null or 0–730 |
| `processHtml` | null or ≤ 100 000 chars **after** sanitisation; allow-list: `p, br, strong, b, em, i, u, s, h1–h3, ol, ul, li, blockquote, code, pre, a[href(http/https/mailto), target=_blank, rel=noopener noreferrer], span[class ql-*]`; strip everything else (scripts, styles, event handlers, `data:` URLs, iframes). Empty after stripping tags → store null |
| `targetMarginPercent` | 0–1000, scale ≤ 2 |
| `wastePercent` | 0–50, scale ≤ 2 |
| `lines` | 1–150, also for DRAFT |
| `lines[i].ingredientId` | visible, ACTIVE (inactive allowed only if already on the line before this save) |
| `lines[i].quantity` | > 0, ≤ 1 000 000, scale ≤ 4 |
| `lines[i].unitId` | compatible with the ingredient (dimension, or MASS/VOLUME with density) → `400 UNIT_INCOMPATIBLE` |
| `lines[i].section` | null or ≤ 40 |
| `lines[i].notes` | ≤ 200 |
| `lines[i].optional` → `quoteSelectable` forced true | |
| duplicates | same ingredient twice in the same section (case-insensitive trimmed) → `400`, `field: "lines[i].ingredientId"` |
| `lines[i].extraAllergens[]` | ACTIVE visible allergens, `source ∈ {DETECTED, MANUAL}`, not already declared by the ingredient (silently drop if so), unique |
| `lines[i].id` | when present must belong to this recipe; omitted = new line; lines not sent are deleted |
| `fixedCosts[]` | ≤ 20; `userFixedCostId` the caller's ACTIVE fixed cost, unique; `HOURLY_RATE` requires `minutes` 1–10 080; `PERCENTAGE` optional `percentage` 0–100 override; others must have both null |

Return every error at once with `field` paths exactly as above (`lines[3].quantity`).

### 5.4 Recipe allergens

```
lineAllergens(line) = ingredient.allergens (INGREDIENT) ∪ line.extraAllergens (DETECTED|MANUAL)
recipe.contains     = ⋃ lineAllergens(line) for line where !optional
recipe.mayContain   = ⋃ lineAllergens(line) for optional lines − contains        (returned by cost-preview as part of allergens of a configuration)
```
`RecipeSummary.allergens` = `contains`. When an ingredient's declared allergens change, recipes' allergens change automatically (they are derived) — write a revision ("Alérgenos actualizados por cambio en {ingredient}") and flag open quotes.

### 5.5 Cost engine (pure; reused everywhere)

Inputs: lines (with ingredient effective `costPerBaseUnit`, `baseDimension`, density), unit catalog, fixed costs (method, defaultAmount, percentage), `baseYield`, `targetYield` (= base unless configured), `wastePercent`, `targetMarginPercent`, finance settings (currency decimals, rounding mode), optional configuration.

```
scale = targetYield / baseYield
for each included line (not optional unless configuration includes it; excluded lines skipped; substitutions applied):
   ingredient = substitution?.ingredient ?? line.ingredient
   qty        = line.quantity × (substitution ? substitute.ratio : 1) × scale
   baseQty    = qty × unit.multiplierToBase, converted by density when dimensions differ
   lineCost   = ingredient.costPerBaseUnit == null ? null : baseQty × ingredient.costPerBaseUnit
ingredientsCost = Σ lineCost (nulls skipped; unpricedLines = count of nulls)
wasteCost       = ingredientsCost × wastePercent/100
batches         = ceil(scale)            (production runs needed)
fixed:
   HOURLY_RATE     = defaultAmount × minutes/60 × batches
   PER_UNIT        = defaultAmount × targetYield
   FIXED_PER_BATCH = defaultAmount × batches
   PERCENTAGE      = (percentage ?? userFixedCost.percentage)/100 × (ingredientsCost + wasteCost)
totalCost   = ingredientsCost + wasteCost + Σ fixed
costPerUnit = totalCost / targetYield
suggestedUnitPrice = costPerUnit × (1 + targetMarginPercent/100)
```
Rounding: keep scale 10 internally; round `lineCost`, the three subtotals, `totalCost`, `costPerUnit` and `suggestedUnitPrice` to the currency decimals with the tenant `roundingMode` (finance settings) — round per line, then sum (CFDI style).
`status`: `INCOMPLETE` if `unpricedLines > 0`; else `STALE` if any input changed after `calculatedAt` (stored recipes); else `CURRENT`.

Table-driven tests must cover: COUNT/MASS/VOLUME, MASS⇄VOLUME via density, yield < 100, 0 % and 50 % waste, every fixed-cost method, scale 0.5 / 1 / 2.4 (batches = 3), unpriced lines, substitution ratio, exclusion of selectable lines, 0- and 4-decimal currencies, every rounding mode.

### 5.6 `POST /recipes/cost-preview`

```json
{
  "recipeId": "…|null",
  "lines": [ RecipeLineRequest… ] | null,
  "fixedCosts": [ RecipeFixedCostRequest… ] | null,
  "yieldQuantity": 12,
  "wastePercent": 3,
  "targetMarginPercent": 60,
  "configuration": { "excludedLineIds": ["…"], "substitutions": [{ "lineId": "…", "ingredientId": "…" }], "yieldQuantity": 24 } | null
}
```
- Editor mode: `lines` given (unsaved draft; `recipeId` only to authorise/compare). Configurator mode: `lines: null`, `recipeId` required, `configuration` given → uses stored lines.
- The configuration is explicit: a line is included **iff it is not in `excludedLineIds`**. `excludedLineIds` may only contain `quoteSelectable` lines (→ else `400`, `field: "configuration.excludedLineIds[i]"`). The UI pre-fills optional lines as excluded. Without a configuration (editor mode), optional lines are excluded from the base cost.
- `substitutions[].ingredientId` must be a declared substitute of that line's ingredient → else `400`.
- Response `RecipeCostPreview`:
```json
{ "lines": [ { "lineKey": "0", "ingredientId": "…", "lineCost": 18.42, "priceSource": "OWN" } ],
  "cost": { …RecipeCost… },
  "allergens": [ AllergenRef… ] }
```
`lineKey` = the request line's `displayOrder` as a string (editor mode) or the stored line id (configurator mode). `allergens` = allergens of the **configured** product (included lines, after substitutions).
- Rate limit 120/min per user; never persists anything; no audit.

### 5.7 Files

- `POST /recipes/{id}/files` multipart: `file` (required), `description` (optional ≤ 200). One file per request.
- Limits: **25 MB** per file, **40 files** per recipe, total 500 MB per tenant (→ `413` / `409 QUOTA_EXCEEDED`).
- Allowed by **magic bytes**: JPEG, PNG, WebP (IMAGE); PDF; DOC/DOCX, TXT (DOCUMENT); XLS/XLSX (SPREADSHEET); MP4 (VIDEO). Everything else → `415`.
- Sanitise the file name (strip path, control chars; keep ≤ 150 chars); store under `recipes/{tenant}/{recipe}/{uuid}.{ext}`.
- Images: strip EXIF, generate `thumbnailUrl` (400 px webp). First image becomes cover if none.
- Optional AV scan (ClamAV) before marking the file available; until then `status: SCANNING` (not exposed to UI yet — just delay the 201).
- `RecipeFile`: `id, fileName, url (signed, 15 min), thumbnailUrl, kind, mimeType, sizeBytes, description, isCover, uploadedAt, uploadedBy`.
- `isCover = true` unsets the previous cover in the same transaction. Only IMAGE can be cover → `400`.
- Audit `RECIPE_FILE_UPLOADED|DELETED`; a revision row too.

### 5.8 Revisions (`RecipeRevision`)

On every create/update/status change/recalculation/allergen derivation change: insert `{ version, changedAt, changedBy, summary (localised at read time from params), changes (field diff, lines diffed by id: added/removed/quantity/unit/section/flags), costPerUnit }`. Keep forever (they are the recipe's audit trail).

---

## 6. Quotes integration

### 6.1 Request/response additions

`QuoteItemRequest.recipeConfiguration: RecipeConfiguration | null` (only when `recipeId` is set). `QuoteItemDetailResponse` adds `recipeConfiguration` and `allergens: AllergenRef[]`.

### 6.2 Server rules

1. When an item has `recipeId`: **re-price** it with the cost engine (configuration applied) and store the server `unitCost` (ignore the client's `unitCost` if it differs by > 0.01; return the server value).
2. Snapshot on `quote_items`: `recipe_configuration (jsonb)`, `unit_cost`, `allergens (jsonb)`, `recipe_version`, `cost_calculated_at`. Later recipe changes never alter an issued quote.
3. **Loss guard:** `unitPrice < unitCost` → `400 PRICE_BELOW_COST` (`field: "items[i].unitPrice"`) unless the request sets `"allowBelowCost": true` on the item and the user has `QUOTE.QUOTE.APPROVE`; audit `QUOTE_BELOW_COST_APPROVED` (WARNING). Price below `unitCost × (1 + recipe.targetMarginPercent/100)` → accepted with `warnings[]: [{ code: "BELOW_TARGET_MARGIN", field: "items[i].unitPrice" }]`.
4. `price_review_required` flags (§4.5) are shown in the quote list/detail; editing and saving the quote re-prices and clears the flag.
5. Public quote view shows the allergen declaration per product ("Contiene: …") — legal requirement in NOM-051 for packaged food; keep it.

---

## 7. Units

Reuse `/measurement-unit` (V8). Required SYSTEM units (seed if absent): `g`, `kg`, `mg`, `ml`, `L`, `taza` (240 ml), `cda` (15 ml), `cdta` (5 ml), `oz` (28.3495 g), `lb` (453.592 g), `fl_oz` (29.5735 ml), `pz` (1), `docena` (12 pz).

---

## 8. Errors (additions)

| Code | HTTP | When |
|---|---|---|
| `UNIT_INCOMPATIBLE` | 400 | unit dimension ≠ ingredient's and no density |
| `CURRENCY_NOT_SUPPORTED` | 400 | price in a non-default currency without exchange rate |
| `QUOTA_EXCEEDED` | 409 | file/recipe quotas |
| `PRICE_BELOW_COST` | 400 | §6.2 |
| `INVALID_SUBSTITUTION` | 400 | substitution not declared for that line |

Warnings (non-blocking) are returned in a top-level `warnings: [{ code, field, message }]` array of the success envelope: `PRICE_JUMP`, `BELOW_TARGET_MARGIN`, `UNPRICED_LINES`, `EMPTY_PROCESS`.

---

## 9. Data model (PostgreSQL)

```sql
CREATE TABLE allergens (
  id           BIGSERIAL PRIMARY KEY,
  code         VARCHAR(50) NOT NULL,
  owner_id     UUID,                                   -- NULL = SYSTEM
  icon         VARCHAR(40) NOT NULL,
  regulations  VARCHAR(20)[] NOT NULL DEFAULT '{}',
  status       VARCHAR(10) NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE','INACTIVE')),
  version      BIGINT NOT NULL DEFAULT 0,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(), updated_at TIMESTAMPTZ, updated_by UUID
);
CREATE UNIQUE INDEX ux_allergens_code ON allergens (coalesce(owner_id, '00000000-0000-0000-0000-000000000000'::uuid), code);
CREATE TABLE allergen_i18n (
  allergen_id BIGINT REFERENCES allergens(id) ON DELETE CASCADE, locale VARCHAR(5),
  name VARCHAR(80) NOT NULL, description VARCHAR(500), PRIMARY KEY (allergen_id, locale)
);
CREATE TABLE allergen_keywords (
  allergen_id BIGINT REFERENCES allergens(id) ON DELETE CASCADE,
  owner_id    UUID,                                    -- NULL = platform keyword; tenant extensions carry the tenant
  locale      VARCHAR(5) NOT NULL,
  keyword     VARCHAR(40) NOT NULL,                    -- stored normalised
  PRIMARY KEY (allergen_id, coalesce_owner(owner_id), locale, keyword)   -- use a generated column for coalesce
);

CREATE TABLE ingredients (
  id               UUID PRIMARY KEY,
  code             VARCHAR(50) NOT NULL,
  owner_id         UUID,                               -- NULL = SYSTEM
  category_id      BIGINT NOT NULL REFERENCES categories(id),
  base_dimension   VARCHAR(6) NOT NULL CHECK (base_dimension IN ('MASS','VOLUME','COUNT')),
  yield_percent    NUMERIC(5,1) NOT NULL CHECK (yield_percent BETWEEN 1 AND 100),
  density_g_per_ml NUMERIC(6,3) CHECK (density_g_per_ml BETWEEN 0.1 AND 3),
  brand            VARCHAR(80),
  status           VARCHAR(10) NOT NULL DEFAULT 'ACTIVE',
  version          BIGINT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(), updated_at TIMESTAMPTZ, updated_by UUID,
  CHECK (base_dimension <> 'COUNT' OR density_g_per_ml IS NULL)
);
CREATE UNIQUE INDEX ux_ingredients_code ON ingredients (coalesce(owner_id, '00000000-0000-0000-0000-000000000000'::uuid), code);
CREATE TABLE ingredient_i18n (ingredient_id UUID REFERENCES ingredients(id) ON DELETE CASCADE, locale VARCHAR(5), name VARCHAR(120) NOT NULL, description VARCHAR(500), PRIMARY KEY (ingredient_id, locale));
CREATE INDEX ix_ingredient_i18n_name ON ingredient_i18n USING gin (unaccent_immutable(lower(name)) gin_trgm_ops);
CREATE TABLE ingredient_allergens (ingredient_id UUID REFERENCES ingredients(id) ON DELETE CASCADE, allergen_id BIGINT REFERENCES allergens(id), PRIMARY KEY (ingredient_id, allergen_id));
CREATE TABLE ingredient_substitutes (
  ingredient_id UUID REFERENCES ingredients(id) ON DELETE CASCADE,
  substitute_id UUID REFERENCES ingredients(id),
  owner_id      UUID,                                  -- NULL = platform suggestion
  ratio         NUMERIC(7,3) NOT NULL CHECK (ratio BETWEEN 0.01 AND 10),
  notes         VARCHAR(200),
  PRIMARY KEY (ingredient_id, substitute_id), CHECK (ingredient_id <> substitute_id)
);
CREATE TABLE ingredient_prices (                         -- append-only
  id                UUID PRIMARY KEY,
  ingredient_id     UUID NOT NULL REFERENCES ingredients(id),
  owner_id          UUID,                              -- NULL = reference price
  purchase_quantity NUMERIC(14,4) NOT NULL CHECK (purchase_quantity > 0),
  purchase_unit_id  BIGINT NOT NULL REFERENCES measurement_units(id),
  price             NUMERIC(14,4) NOT NULL CHECK (price > 0),
  currency          CHAR(3) NOT NULL,
  supplier          VARCHAR(120),
  priced_at         DATE NOT NULL,
  cost_per_base_unit NUMERIC(18,8) NOT NULL,
  recorded_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  recorded_by       UUID
);
CREATE INDEX ix_ingredient_prices_latest ON ingredient_prices (ingredient_id, owner_id, priced_at DESC, recorded_at DESC);

CREATE TABLE recipes (
  id UUID PRIMARY KEY, owner_id UUID NOT NULL, code VARCHAR(50) NOT NULL, name VARCHAR(120) NOT NULL,
  category_id BIGINT REFERENCES categories(id), difficulty VARCHAR(8) NOT NULL,
  description VARCHAR(1000), process_html TEXT, storage_instructions VARCHAR(1000),
  yield_quantity NUMERIC(12,2) NOT NULL CHECK (yield_quantity > 0), yield_unit VARCHAR(30) NOT NULL,
  prep_minutes INT, bake_minutes INT, cool_minutes INT, oven_temperature_c INT, shelf_life_days INT,
  target_margin_percent NUMERIC(7,2) NOT NULL DEFAULT 60, waste_percent NUMERIC(5,2) NOT NULL DEFAULT 3,
  status VARCHAR(10) NOT NULL DEFAULT 'DRAFT',
  -- cached cost (refreshed by the engine)
  ingredients_cost NUMERIC(14,4), waste_cost NUMERIC(14,4), fixed_costs NUMERIC(14,4), total_cost NUMERIC(14,4),
  cost_per_unit NUMERIC(14,4), suggested_unit_price NUMERIC(14,4), unpriced_lines INT NOT NULL DEFAULT 0,
  cost_status VARCHAR(10) NOT NULL DEFAULT 'INCOMPLETE', cost_calculated_at TIMESTAMPTZ,
  version BIGINT NOT NULL DEFAULT 0, deleted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(), created_by UUID, updated_at TIMESTAMPTZ, updated_by UUID
);
CREATE UNIQUE INDEX ux_recipes_code ON recipes (owner_id, code) WHERE deleted_at IS NULL;
CREATE UNIQUE INDEX ux_recipes_name ON recipes (owner_id, lower(name)) WHERE deleted_at IS NULL;
CREATE TABLE recipe_lines (
  id UUID PRIMARY KEY, recipe_id UUID NOT NULL REFERENCES recipes(id) ON DELETE CASCADE,
  ingredient_id UUID NOT NULL REFERENCES ingredients(id), section VARCHAR(40),
  quantity NUMERIC(14,4) NOT NULL CHECK (quantity > 0), unit_id BIGINT NOT NULL REFERENCES measurement_units(id),
  optional BOOLEAN NOT NULL DEFAULT FALSE, quote_selectable BOOLEAN NOT NULL DEFAULT FALSE,
  notes VARCHAR(200), display_order INT NOT NULL, line_cost NUMERIC(14,4),
  CHECK (NOT optional OR quote_selectable)
);
CREATE INDEX ix_recipe_lines_ingredient ON recipe_lines (ingredient_id);
CREATE TABLE recipe_line_allergens (line_id UUID REFERENCES recipe_lines(id) ON DELETE CASCADE, allergen_id BIGINT REFERENCES allergens(id), source VARCHAR(8) NOT NULL CHECK (source IN ('DETECTED','MANUAL')), PRIMARY KEY (line_id, allergen_id));
CREATE TABLE recipe_fixed_costs (id UUID PRIMARY KEY, recipe_id UUID REFERENCES recipes(id) ON DELETE CASCADE, user_fixed_cost_id UUID NOT NULL, minutes INT, percentage NUMERIC(5,2), cost NUMERIC(14,4), UNIQUE (recipe_id, user_fixed_cost_id));
CREATE TABLE recipe_files (id UUID PRIMARY KEY, recipe_id UUID REFERENCES recipes(id) ON DELETE CASCADE, storage_key VARCHAR(300) NOT NULL, file_name VARCHAR(150) NOT NULL, kind VARCHAR(12) NOT NULL, mime_type VARCHAR(100) NOT NULL, size_bytes BIGINT NOT NULL, sha256 CHAR(64) NOT NULL, description VARCHAR(200), is_cover BOOLEAN NOT NULL DEFAULT FALSE, thumbnail_key VARCHAR(300), uploaded_at TIMESTAMPTZ NOT NULL DEFAULT now(), uploaded_by UUID);
CREATE UNIQUE INDEX ux_recipe_files_cover ON recipe_files (recipe_id) WHERE is_cover;
CREATE TABLE recipe_revisions (recipe_id UUID REFERENCES recipes(id) ON DELETE CASCADE, version BIGINT NOT NULL, changed_at TIMESTAMPTZ NOT NULL DEFAULT now(), changed_by UUID, summary_key VARCHAR(80) NOT NULL, summary_params JSONB NOT NULL DEFAULT '{}', changes JSONB NOT NULL DEFAULT '{}', cost_per_unit NUMERIC(14,4), PRIMARY KEY (recipe_id, version));

ALTER TABLE quote_items ADD COLUMN recipe_configuration JSONB, ADD COLUMN allergens JSONB NOT NULL DEFAULT '[]',
  ADD COLUMN recipe_version BIGINT, ADD COLUMN cost_calculated_at TIMESTAMPTZ, ADD COLUMN price_review_required BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE quotes ADD COLUMN price_review_required BOOLEAN NOT NULL DEFAULT FALSE;
```
Migrate the legacy `raw_materials` / `recipe_ingredients` data into `ingredients` (USER) / `recipe_lines`, mapping existing allergens and densities (`gramsPerCup / 240 → density`). Keep the old tables read-only for one release.

---

## 10. Seed data

All seed rows are SYSTEM (`owner_id NULL`), `code` stable, names in es-MX and en. Reference prices are **MXN, CDMX retail/mayoreo, Oct-2026** — mark them `supplier = 'Referencia Cronos'`, `priced_at = '2026-10-01'`; the platform team should refresh them quarterly.

### 10.1 Allergens (14 — NOM-051 / EU 1169 / FALCPA)

| code | es-MX | en | icon | keywords (es) | keywords (en) |
|---|---|---|---|---|---|
| GLUTEN | Cereales con gluten | Cereals containing gluten | pi pi-sun | trigo, harina de trigo, harina, cebada, centeno, avena, espelta, kamut, semola, salvado, malta, galleta, pan molido, pan, pasta | wheat, flour, barley, rye, oat, oats, spelt, semolina, malt, breadcrumbs, cookie, biscuit |
| CRUSTACEANS | Crustáceos | Crustaceans | pi pi-flag | camaron, langosta, cangrejo, jaiba, langostino | shrimp, prawn, lobster, crab |
| EGG | Huevo | Egg | pi pi-circle-fill | huevo, huevos, clara, yema, merengue, albumina | egg, eggs, egg white, yolk, meringue, albumen |
| FISH | Pescado | Fish | pi pi-flag | pescado, atun, salmon, anchoa, bacalao | fish, tuna, salmon, anchovy, cod |
| PEANUT | Cacahuate | Peanut | pi pi-circle | cacahuate, cacahuete, mani, crema de cacahuate | peanut, peanuts, peanut butter, groundnut |
| SOY | Soya | Soy | pi pi-tag | soya, soja, lecitina de soya, tofu | soy, soya, soy lecithin, tofu |
| MILK | Leche y derivados | Milk | pi pi-heart | leche, mantequilla, crema, queso, yogur, nata, suero de leche, lactosa, caseina, leche condensada, lechera, leche evaporada, requeson, ghee | milk, butter, cream, cheese, yogurt, whey, lactose, casein, condensed milk, evaporated milk, buttermilk |
| TREE_NUTS | Frutos de cáscara | Tree nuts | pi pi-star | nuez, nueces, almendra, avellana, pistache, pistacho, nuez de la india, macadamia, pecana, pecan | walnut, almond, hazelnut, pistachio, cashew, macadamia, pecan, praline |
| CELERY | Apio | Celery | pi pi-bolt | apio | celery |
| MUSTARD | Mostaza | Mustard | pi pi-bolt | mostaza | mustard |
| SESAME | Ajonjolí | Sesame | pi pi-circle | ajonjoli, sesamo, tahini | sesame, tahini |
| SULPHITES | Sulfitos | Sulphites | pi pi-exclamation-triangle | sulfito, sulfitos, metabisulfito, vino | sulphite, sulfite, metabisulfite, wine |
| LUPIN | Altramuz | Lupin | pi pi-circle | altramuz, lupino | lupin |
| MOLLUSCS | Moluscos | Molluscs | pi pi-flag | almeja, mejillon, ostion, pulpo, calamar | clam, mussel, oyster, octopus, squid |

### 10.2 Categories

**INGREDIENT** (code · es-MX): `FLOURS` Harinas y almidones · `SUGARS` Azúcares y endulzantes · `DAIRY` Lácteos · `EGGS` Huevo · `FATS` Grasas y aceites · `LEAVENING` Leudantes · `CHOCOLATE` Chocolate y cacao · `NUTS_SEEDS` Frutos secos y semillas · `FRUITS` Frutas · `FLAVORINGS` Esencias y saborizantes · `SPICES` Especias · `THICKENERS` Espesantes y gelificantes · `DECORATION` Decoración · `COLORANTS` Colorantes · `PACKAGING` Empaque · `OTHER` Otros.

**PRODUCT**: `CAKES` Pasteles · `CUPCAKES` Cupcakes y panquelitos · `COOKIES` Galletas · `BREADS` Panes · `PIES_TARTS` Pays y tartas · `INDIVIDUAL_DESSERTS` Postres individuales · `GELATINS` Gelatinas y flanes · `CHEESECAKES` Cheesecakes · `PASTRIES` Repostería fina · `SEASONAL` Temporada.

### 10.3 Ingredients (SYSTEM, 122)

Columns: code · es-MX name · category · dim · yield % · density g/ml · allergens · reference price (MXN / presentation). en names are the obvious translations.

**Harinas y almidones (FLOURS)**
| code | name | dim | yield | dens. | allergens | ref. price |
|---|---|---|---|---|---|---|
| WHEAT_FLOUR_AP | Harina de trigo multiusos | MASS | 98 | 0.53 | GLUTEN | 26 / 1 kg |
| CAKE_FLOUR | Harina de trigo para pastel | MASS | 98 | 0.50 | GLUTEN | 38 / 1 kg |
| BREAD_FLOUR | Harina de fuerza para pan | MASS | 98 | 0.55 | GLUTEN | 34 / 1 kg |
| WHOLE_WHEAT_FLOUR | Harina integral de trigo | MASS | 98 | 0.51 | GLUTEN | 42 / 1 kg |
| ALMOND_FLOUR | Harina de almendra | MASS | 99 | 0.41 | TREE_NUTS | 320 / 1 kg |
| RICE_FLOUR | Harina de arroz | MASS | 99 | 0.62 | — | 48 / 1 kg |
| CORNSTARCH | Fécula de maíz | MASS | 100 | 0.54 | — | 52 / 1 kg |
| OAT_FLOUR | Harina de avena | MASS | 98 | 0.39 | GLUTEN | 70 / 1 kg |
| OATS_ROLLED | Avena en hojuelas | MASS | 100 | 0.38 | GLUTEN | 45 / 1 kg |
| GF_FLOUR_BLEND | Harina sin gluten (mezcla) | MASS | 98 | 0.55 | — | 140 / 1 kg |
| COCONUT_FLOUR | Harina de coco | MASS | 99 | 0.47 | — | 180 / 1 kg |
| SEMOLINA | Sémola de trigo | MASS | 100 | 0.67 | GLUTEN | 45 / 1 kg |

**Azúcares y endulzantes (SUGARS)**
| code | name | dim | yield | dens. | allergens | ref. price |
|---|---|---|---|---|---|---|
| SUGAR_WHITE | Azúcar refinada | MASS | 100 | 0.85 | — | 32 / 1 kg |
| SUGAR_BROWN | Azúcar morena | MASS | 100 | 0.83 | — | 30 / 1 kg |
| SUGAR_POWDERED | Azúcar glass | MASS | 98 | 0.56 | — | 45 / 1 kg |
| SUGAR_MUSCOVADO | Azúcar mascabado | MASS | 100 | 0.80 | — | 55 / 1 kg |
| HONEY | Miel de abeja | VOLUME | 98 | 1.42 | — | 120 / 500 ml |
| MAPLE_SYRUP | Jarabe de maple | VOLUME | 98 | 1.32 | — | 230 / 500 ml |
| CORN_SYRUP | Jarabe de maíz | VOLUME | 98 | 1.38 | — | 68 / 500 ml |
| PILONCILLO | Piloncillo | MASS | 98 | — | — | 48 / 1 kg |
| STEVIA | Stevia granulada | MASS | 100 | 0.60 | — | 160 / 500 g |
| ERYTHRITOL | Eritritol | MASS | 100 | 0.85 | — | 220 / 1 kg |
| CONDENSED_MILK | Leche condensada | VOLUME | 97 | 1.30 | MILK | 29 / 300 ml |
| DULCE_DE_LECHE | Cajeta / dulce de leche | MASS | 97 | — | MILK | 62 / 660 g |

**Lácteos (DAIRY)**
| code | name | dim | yield | dens. | allergens | ref. price |
|---|---|---|---|---|---|---|
| MILK_WHOLE | Leche entera | VOLUME | 100 | 1.03 | MILK | 28 / 1 L |
| MILK_EVAPORATED | Leche evaporada | VOLUME | 98 | 1.07 | MILK | 22 / 360 ml |
| MILK_POWDER | Leche en polvo | MASS | 100 | 0.50 | MILK | 140 / 1 kg |
| BUTTERMILK | Suero de leche (buttermilk) | VOLUME | 100 | 1.03 | MILK | 38 / 1 L |
| HEAVY_CREAM | Crema para batir 35 % | VOLUME | 98 | 0.99 | MILK | 105 / 1 L |
| SOUR_CREAM | Crema ácida | MASS | 97 | 1.01 | MILK | 42 / 450 g |
| BUTTER_UNSALTED | Mantequilla sin sal | MASS | 99 | 0.91 | MILK | 190 / 1 kg |
| BUTTER_SALTED | Mantequilla con sal | MASS | 99 | 0.91 | MILK | 180 / 1 kg |
| CREAM_CHEESE | Queso crema | MASS | 98 | 1.00 | MILK | 165 / 1 kg |
| MASCARPONE | Queso mascarpone | MASS | 98 | — | MILK | 320 / 500 g |
| RICOTTA | Queso ricotta | MASS | 98 | — | MILK | 95 / 500 g |
| YOGURT_GREEK | Yogur griego natural | MASS | 98 | 1.05 | MILK | 85 / 1 kg |
| MEDIA_CREMA | Media crema | VOLUME | 97 | 1.00 | MILK | 16 / 225 ml |
| COCONUT_MILK | Leche de coco | VOLUME | 98 | 0.97 | — | 45 / 400 ml |
| ALMOND_MILK | Bebida de almendra | VOLUME | 100 | 1.02 | TREE_NUTS | 55 / 1 L |
| OAT_MILK | Bebida de avena | VOLUME | 100 | 1.03 | GLUTEN | 52 / 1 L |

**Huevo (EGGS)**
| code | name | dim | yield | dens. | allergens | ref. price |
|---|---|---|---|---|---|---|
| EGG_WHOLE | Huevo entero (pieza ~50 g) | COUNT | 89 | — | EGG | 85 / 30 pz |
| EGG_WHITE | Clara de huevo pasteurizada | VOLUME | 100 | 1.04 | EGG | 75 / 1 L |
| EGG_YOLK | Yema de huevo | COUNT | 100 | — | EGG | 85 / 30 pz |
| AQUAFABA | Aquafaba (agua de garbanzo) | VOLUME | 100 | 1.00 | — | 20 / 400 ml |
| FLAX_EGG | Linaza molida (sustituto de huevo) | MASS | 100 | 0.45 | — | 70 / 500 g |

**Grasas y aceites (FATS)**
| code | name | dim | yield | dens. | allergens | ref. price |
|---|---|---|---|---|---|---|
| VEG_SHORTENING | Manteca vegetal | MASS | 100 | 0.86 | — | 60 / 1 kg |
| MARGARINE | Margarina vegetal | MASS | 100 | 0.91 | SOY | 75 / 1 kg |
| OIL_CANOLA | Aceite de canola | VOLUME | 100 | 0.92 | — | 52 / 1 L |
| OIL_COCONUT | Aceite de coco | VOLUME | 98 | 0.92 | — | 160 / 1 L |
| OIL_OLIVE | Aceite de oliva | VOLUME | 100 | 0.91 | — | 190 / 1 L |
| VEGAN_BUTTER | Mantequilla vegetal (sin lácteos) | MASS | 99 | 0.92 | — | 180 / 500 g |

**Leudantes (LEAVENING)**
| code | name | dim | yield | dens. | allergens | ref. price |
|---|---|---|---|---|---|---|
| BAKING_POWDER | Polvo para hornear | MASS | 100 | 0.90 | — | 48 / 220 g |
| BAKING_SODA | Bicarbonato de sodio | MASS | 100 | 1.10 | — | 18 / 200 g |
| YEAST_DRY | Levadura seca instantánea | MASS | 100 | 0.65 | — | 22 / 11 g |
| YEAST_FRESH | Levadura fresca | MASS | 100 | — | — | 35 / 500 g |
| CREAM_OF_TARTAR | Cremor tártaro | MASS | 100 | 0.95 | SULPHITES | 60 / 100 g |

**Chocolate y cacao (CHOCOLATE)**
| code | name | dim | yield | dens. | allergens | ref. price |
|---|---|---|---|---|---|---|
| CHOC_DARK_70 | Chocolate amargo 70 % | MASS | 98 | — | SOY, MILK | 420 / 1 kg |
| CHOC_SEMISWEET | Chocolate semiamargo | MASS | 98 | — | SOY, MILK | 320 / 1 kg |
| CHOC_MILK | Chocolate de leche | MASS | 98 | — | MILK, SOY | 330 / 1 kg |
| CHOC_WHITE | Chocolate blanco | MASS | 98 | — | MILK, SOY | 360 / 1 kg |
| CHOC_CHIPS | Chispas de chocolate | MASS | 100 | 0.60 | MILK, SOY | 190 / 1 kg |
| COCOA_POWDER | Cacao en polvo sin azúcar | MASS | 100 | 0.42 | — | 240 / 1 kg |
| CHOC_MEXICAN | Chocolate de mesa | MASS | 100 | — | — | 95 / 540 g |
| COMPOUND_COATING | Cobertura sabor chocolate | MASS | 98 | — | MILK, SOY | 140 / 1 kg |

**Frutos secos y semillas (NUTS_SEEDS)**
| code | name | dim | yield | dens. | allergens | ref. price |
|---|---|---|---|---|---|---|
| WALNUT | Nuez de Castilla | MASS | 100 | 0.42 | TREE_NUTS | 380 / 1 kg |
| PECAN | Nuez pecana | MASS | 100 | 0.42 | TREE_NUTS | 420 / 1 kg |
| ALMOND | Almendra entera | MASS | 100 | 0.60 | TREE_NUTS | 290 / 1 kg |
| ALMOND_SLICED | Almendra fileteada | MASS | 100 | 0.38 | TREE_NUTS | 340 / 1 kg |
| HAZELNUT | Avellana | MASS | 100 | 0.57 | TREE_NUTS | 480 / 1 kg |
| PISTACHIO | Pistache sin cáscara | MASS | 100 | 0.52 | TREE_NUTS | 690 / 1 kg |
| PEANUT | Cacahuate natural | MASS | 100 | 0.60 | PEANUT | 95 / 1 kg |
| PEANUT_BUTTER | Crema de cacahuate | MASS | 98 | 1.08 | PEANUT | 110 / 500 g |
| SESAME | Ajonjolí | MASS | 100 | 0.61 | SESAME | 80 / 500 g |
| CHIA | Chía | MASS | 100 | 0.65 | — | 90 / 500 g |
| COCONUT_SHRED | Coco rallado | MASS | 100 | 0.35 | — | 120 / 1 kg |
| SUNFLOWER_SEEDS | Semilla de girasol | MASS | 100 | 0.55 | — | 70 / 500 g |
| PUMPKIN_SEEDS | Pepita de calabaza | MASS | 100 | 0.55 | — | 160 / 1 kg |

**Frutas (FRUITS)**
| code | name | dim | yield | dens. | allergens | ref. price |
|---|---|---|---|---|---|---|
| STRAWBERRY | Fresa | MASS | 90 | — | — | 70 / 1 kg |
| BANANA | Plátano | MASS | 65 | — | — | 28 / 1 kg |
| APPLE | Manzana | MASS | 80 | — | — | 48 / 1 kg |
| LEMON | Limón (jugo y ralladura) | COUNT | 100 | — | — | 30 / 12 pz |
| ORANGE | Naranja | COUNT | 100 | — | — | 30 / 10 pz |
| BLUEBERRY | Mora azul | MASS | 98 | — | — | 70 / 170 g |
| RASPBERRY | Frambuesa | MASS | 95 | — | — | 70 / 170 g |
| MANGO | Mango | MASS | 65 | — | — | 45 / 1 kg |
| PINEAPPLE | Piña | MASS | 55 | — | — | 30 / 1 kg |
| PEACH_CANNED | Durazno en almíbar | MASS | 60 | — | SULPHITES | 42 / 820 g |
| RAISINS | Pasas | MASS | 100 | 0.65 | SULPHITES | 110 / 1 kg |
| CARROT | Zanahoria | MASS | 85 | — | — | 22 / 1 kg |
| PUMPKIN_PUREE | Puré de calabaza | MASS | 100 | 1.00 | — | 65 / 425 g |
| FRUIT_JAM | Mermelada de fresa | MASS | 98 | 1.30 | — | 55 / 470 g |

**Esencias, especias y espesantes (FLAVORINGS, SPICES, THICKENERS)**
| code | name | cat | dim | yield | dens. | allergens | ref. price |
|---|---|---|---|---|---|---|---|
| VANILLA_EXTRACT | Extracto de vainilla | FLAVORINGS | VOLUME | 100 | 0.88 | — | 180 / 250 ml |
| VANILLA_BEAN | Vaina de vainilla | FLAVORINGS | COUNT | 100 | — | — | 120 / 2 pz |
| ALMOND_EXTRACT | Extracto de almendra | FLAVORINGS | VOLUME | 100 | 0.88 | TREE_NUTS | 140 / 60 ml |
| INSTANT_COFFEE | Café soluble | FLAVORINGS | MASS | 100 | 0.30 | — | 150 / 200 g |
| RUM | Ron | FLAVORINGS | VOLUME | 100 | 0.95 | — | 220 / 750 ml |
| SALT | Sal fina | SPICES | MASS | 100 | 1.20 | — | 15 / 1 kg |
| CINNAMON_GROUND | Canela molida | SPICES | MASS | 100 | 0.50 | — | 60 / 100 g |
| NUTMEG | Nuez moscada molida | SPICES | MASS | 100 | 0.50 | — | 55 / 50 g |
| GINGER_GROUND | Jengibre molido | SPICES | MASS | 100 | 0.45 | — | 45 / 50 g |
| CLOVE_GROUND | Clavo molido | SPICES | MASS | 100 | 0.45 | — | 50 / 50 g |
| GELATIN_POWDER | Grenetina en polvo | THICKENERS | MASS | 100 | 0.65 | — | 120 / 250 g |
| AGAR | Agar agar | THICKENERS | MASS | 100 | 0.60 | — | 160 / 100 g |
| PECTIN | Pectina | THICKENERS | MASS | 100 | 0.60 | — | 140 / 100 g |
| XANTHAN | Goma xantana | THICKENERS | MASS | 100 | 0.60 | — | 150 / 100 g |
| GELATIN_STRAWBERRY | Gelatina sabor fresa (polvo) | THICKENERS | MASS | 100 | — | — | 14 / 120 g |
| GELATIN_LIME | Gelatina sabor limón (polvo) | THICKENERS | MASS | 100 | — | — | 14 / 120 g |

**Decoración, colorantes, empaque, otros**
| code | name | cat | dim | yield | dens. | allergens | ref. price |
|---|---|---|---|---|---|---|---|
| FONDANT | Fondant blanco | DECORATION | MASS | 95 | — | — | 150 / 1 kg |
| SPRINKLES | Chochitos / sprinkles | DECORATION | MASS | 100 | 0.80 | — | 120 / 500 g |
| MERINGUE_POWDER | Merengue en polvo | DECORATION | MASS | 100 | 0.50 | EGG | 160 / 250 g |
| EDIBLE_GLITTER | Brillo comestible | DECORATION | MASS | 100 | — | — | 95 / 10 g |
| FOOD_COLOR_GEL | Colorante en gel | COLORANTS | MASS | 100 | 1.20 | — | 45 / 20 g |
| FOOD_COLOR_LIQUID | Colorante líquido | COLORANTS | VOLUME | 100 | 1.00 | — | 25 / 30 ml |
| COOKIE_MARIA | Galleta María | OTHER | MASS | 100 | — | GLUTEN, MILK, SOY | 22 / 170 g |
| GRAHAM_CRACKER | Galleta graham | OTHER | MASS | 100 | — | GLUTEN, SOY | 48 / 250 g |
| LADYFINGERS | Soletas | OTHER | COUNT | 100 | — | GLUTEN, EGG | 75 / 24 pz |
| CORNFLAKES | Hojuelas de maíz | OTHER | MASS | 100 | 0.12 | — | 70 / 500 g |
| WATER | Agua purificada | OTHER | VOLUME | 100 | 1.00 | — | 12 / 1 L |
| CAKE_BOARD_25 | Base de cartón 25 cm | PACKAGING | COUNT | 100 | — | — | 12 / 1 pz |
| CAKE_BOX_25 | Caja para pastel 25 cm | PACKAGING | COUNT | 100 | — | — | 22 / 1 pz |
| CUPCAKE_LINER | Capacillo | PACKAGING | COUNT | 100 | — | — | 35 / 100 pz |
| CLEAR_DOME_IND | Domo individual | PACKAGING | COUNT | 100 | — | — | 4 / 1 pz |

(122 rows across the tables; the backend agent may add more but must keep these codes.)

### 10.4 Substitutes (platform suggestions)

| ingredient | substitute | ratio | notes |
|---|---|---|---|
| BUTTER_UNSALTED | VEGAN_BUTTER | 1 | Sin lácteos |
| BUTTER_UNSALTED | MARGARINE | 1 | Sin lácteos; contiene soya |
| BUTTER_UNSALTED | OIL_COCONUT | 0.8 | Para masas batidas |
| MILK_WHOLE | ALMOND_MILK | 1 | Sin lácteos; contiene frutos de cáscara |
| MILK_WHOLE | OAT_MILK | 1 | Sin lácteos; contiene gluten |
| MILK_WHOLE | COCONUT_MILK | 1 | Sin lácteos |
| HEAVY_CREAM | COCONUT_MILK | 1 | Usar la parte sólida refrigerada |
| EGG_WHITE | AQUAFABA | 1 | Para merengues |
| WHEAT_FLOUR_AP | GF_FLOUR_BLEND | 1 | Sin gluten; añadir goma xantana si la mezcla no la trae |
| CAKE_FLOUR | GF_FLOUR_BLEND | 1 | Sin gluten |
| CAKE_FLOUR | ALMOND_FLOUR | 1 | Sin gluten; contiene frutos de cáscara; reduce estructura |
| CHOC_SEMISWEET | CHOC_MEXICAN | 1 | Sin lácteos ni soya; textura más rústica |
| WALNUT | SUNFLOWER_SEEDS | 1 | Sin frutos de cáscara |
| PECAN | PUMPKIN_SEEDS | 1 | Sin frutos de cáscara |
| PEANUT_BUTTER | SUNFLOWER_SEEDS | 1 | Moler para pasta; sin cacahuate |
| CONDENSED_MILK | COCONUT_MILK | 1.2 | Reducir con azúcar; sin lácteos |
| GELATIN_POWDER | AGAR | 0.33 | Vegetal; hervir 2 min |
| SUGAR_WHITE | ERYTHRITOL | 1 | Sin azúcar |
| COOKIE_MARIA | GRAHAM_CRACKER | 1 | Base de pay |

### 10.5 Demo recipes (10)

Seed them into the **SYSTEM recipe library** (`owner_id NULL`, read-only, "Usar como plantilla" = duplicate into the tenant — add `POST /recipes/{id}/duplicate` support for SYSTEM recipes) **and** into the demo tenant. Quantities in base units unless noted; `section` in brackets; `*` = optional & quote-selectable; `†` = quote-selectable (not optional). Target margin 60 %, waste 3 % unless stated. Process HTML: use the numbered steps given.

**Sencillas (EASY)**

1. **Galletas con chispas de chocolate** — `CHOC_CHIP_COOKIES` · Galletas · 24 piezas · prep 20 · bake 12 · cool 15 · 180 °C · 7 días
   [Masa] WHEAT_FLOUR_AP 280 g · BUTTER_UNSALTED 170 g · SUGAR_BROWN 150 g · SUGAR_WHITE 100 g · EGG_WHOLE 2 pz · VANILLA_EXTRACT 10 ml · BAKING_SODA 5 g · SALT 3 g · CHOC_CHIPS 200 g · [Extras] WALNUT 80 g *
   Steps: 1) Acremar mantequilla con azúcares 3 min. 2) Incorporar huevos y vainilla. 3) Añadir secos tamizados. 4) Agregar chispas (y nuez). 5) Porcionar 40 g, refrigerar 30 min. 6) Hornear 11–12 min a 180 °C.
2. **Brownies** — `BROWNIES` · Postres individuales · 16 piezas · 20/28/30 · 175 °C · 5 días
   [Masa] CHOC_SEMISWEET 200 g · BUTTER_UNSALTED 150 g · SUGAR_WHITE 220 g · EGG_WHOLE 4 pz · WHEAT_FLOUR_AP 110 g · COCOA_POWDER 30 g · SALT 2 g · VANILLA_EXTRACT 5 ml · [Cobertura] PECAN 100 g *
3. **Panqué de plátano** — `BANANA_BREAD` · Panes · 10 rebanadas · 15/55/30 · 175 °C · 5 días
   [Masa] BANANA 450 g · WHEAT_FLOUR_AP 250 g · SUGAR_BROWN 150 g · OIL_CANOLA 100 ml · EGG_WHOLE 2 pz · BAKING_SODA 6 g · CINNAMON_GROUND 3 g · SALT 2 g · VANILLA_EXTRACT 5 ml · [Extras] WALNUT 80 g *
4. **Gelatina de mosaico** — `MOSAIC_GELATIN` · Gelatinas y flanes · 12 porciones · 30/0/240 · 3 días
   [Cubos] GELATIN_STRAWBERRY 120 g · GELATIN_LIME 120 g · WATER 1000 ml · [Base] MILK_WHOLE 500 ml · CONDENSED_MILK 300 ml · MILK_EVAPORATED 360 ml · GELATIN_POWDER 28 g · VANILLA_EXTRACT 5 ml
5. **Pay de limón** — `KEY_LIME_PIE` · Pays y tartas · 10 porciones · 25/0/180 · 4 días
   [Base] COOKIE_MARIA 340 g · BUTTER_UNSALTED 100 g · [Relleno] CONDENSED_MILK 300 ml · MILK_EVAPORATED 360 ml · LEMON 6 pz · CREAM_CHEESE 190 g · [Decoración] LEMON 1 pz †

**Grandes (MEDIUM / ADVANCED)**

6. **Pastel de tres leches** — `TRES_LECHES_CAKE` · Pasteles · 20 porciones · MEDIUM · 40/40/240 · 175 °C · 4 días · margin 65 %
   [Bizcocho] CAKE_FLOUR 250 g · SUGAR_WHITE 200 g · EGG_WHOLE 6 pz · BAKING_POWDER 10 g · MILK_WHOLE 120 ml · VANILLA_EXTRACT 10 ml · [Baño] MILK_EVAPORATED 360 ml · CONDENSED_MILK 300 ml · HEAVY_CREAM 250 ml · RUM 30 ml * · [Cubierta] HEAVY_CREAM 500 ml · SUGAR_POWDERED 60 g · [Decoración] STRAWBERRY 300 g † · CAKE_BOARD_25 1 pz · CAKE_BOX_25 1 pz
7. **Cheesecake estilo New York** — `NY_CHEESECAKE` · Cheesecakes · 16 porciones · ADVANCED · 30/75/600 · 160 °C baño maría · 5 días
   [Base] GRAHAM_CRACKER 250 g · BUTTER_UNSALTED 100 g · SUGAR_WHITE 30 g · [Relleno] CREAM_CHEESE 900 g · SUGAR_WHITE 250 g · EGG_WHOLE 5 pz · SOUR_CREAM 200 g · WHEAT_FLOUR_AP 30 g · VANILLA_EXTRACT 10 ml · LEMON 1 pz · [Cubierta] BLUEBERRY 340 g † · SUGAR_WHITE 80 g † · CORNSTARCH 10 g †
8. **Pastel de chocolate con ganache** — `CHOCOLATE_GANACHE_CAKE` · Pasteles · 24 porciones · ADVANCED · 45/45/120 · 175 °C · 5 días
   [Bizcocho] WHEAT_FLOUR_AP 350 g · SUGAR_WHITE 400 g · COCOA_POWDER 90 g · BAKING_SODA 9 g · BAKING_POWDER 5 g · SALT 4 g · EGG_WHOLE 3 pz · BUTTERMILK 300 ml · OIL_CANOLA 150 ml · INSTANT_COFFEE 6 g · WATER 250 ml · VANILLA_EXTRACT 10 ml · [Ganache] CHOC_SEMISWEET 400 g · HEAVY_CREAM 400 ml · BUTTER_UNSALTED 40 g · [Decoración] HAZELNUT 100 g * · CHOC_WHITE 100 g * · CAKE_BOARD_25 1 pz · CAKE_BOX_25 1 pz
9. **Pastel de zanahoria con betún de queso crema** — `CARROT_CAKE` · Pasteles · 20 porciones · MEDIUM · 50/50/120 · 175 °C · 5 días
   [Bizcocho] WHEAT_FLOUR_AP 300 g · SUGAR_BROWN 300 g · OIL_CANOLA 250 ml · EGG_WHOLE 4 pz · CARROT 350 g · PINEAPPLE 200 g · BAKING_POWDER 8 g · BAKING_SODA 6 g · CINNAMON_GROUND 6 g · NUTMEG 1 g · SALT 3 g · [Extras] WALNUT 120 g * · RAISINS 100 g * · [Betún] CREAM_CHEESE 450 g · BUTTER_UNSALTED 120 g · SUGAR_POWDERED 350 g · VANILLA_EXTRACT 5 ml · [Empaque] CAKE_BOARD_25 1 pz · CAKE_BOX_25 1 pz
10. **Tarta de frutos rojos con crema pastelera** — `BERRY_TART` · Repostería fina · 12 porciones · ADVANCED · 60/35/120 · 180 °C · 2 días
    [Masa sablée] WHEAT_FLOUR_AP 250 g · BUTTER_UNSALTED 150 g · SUGAR_POWDERED 90 g · ALMOND_FLOUR 30 g · EGG_WHOLE 1 pz · SALT 2 g · [Crema pastelera] MILK_WHOLE 500 ml · EGG_YOLK 5 pz · SUGAR_WHITE 120 g · CORNSTARCH 45 g · BUTTER_UNSALTED 30 g · VANILLA_BEAN 1 pz · [Fruta] STRAWBERRY 250 g · RASPBERRY 170 g † · BLUEBERRY 170 g † · [Brillo] FRUIT_JAM 80 g · GELATIN_POWDER 3 g *

For each seeded recipe: run the cost engine with reference prices, store revision v1 ("Receta creada desde la biblioteca Cronos"), status ACTIVE, `processHtml` with the steps as an `<ol>`, storage instructions ("Refrigerar 2–4 °C en recipiente hermético" for dairy-based; "Recipiente hermético a temperatura ambiente" otherwise).

---

## 11. Endpoint summary

| Method | Path | Permission | Status |
|---|---|---|---|
| GET | `/allergens` | CATALOG.ALLERGEN.READ | new (replaces `/allergen`) |
| POST | `/allergens` | CATALOG.ALLERGEN.MANAGE | new |
| PUT | `/allergens/{id}` | CATALOG.ALLERGEN.MANAGE | new |
| PATCH | `/allergens/{id}/status` | CATALOG.ALLERGEN.MANAGE | new |
| DELETE | `/allergens/{id}` | CATALOG.ALLERGEN.MANAGE | new |
| POST | `/allergens/detect` | authenticated | new |
| GET | `/ingredients` | INGREDIENT.INGREDIENT.READ | new (replaces `/raw-material`) |
| GET | `/ingredients/stats` | INGREDIENT.INGREDIENT.READ | new |
| GET | `/ingredients/{id}` | INGREDIENT.INGREDIENT.READ | new |
| POST | `/ingredients` | INGREDIENT.INGREDIENT.CREATE | new |
| PUT | `/ingredients/{id}` | INGREDIENT.UPDATE (USER) / CATALOG.INGREDIENT.MANAGE (SYSTEM) | new |
| PATCH | `/ingredients/{id}/status` | same as PUT | new |
| DELETE | `/ingredients/{id}` | INGREDIENT.INGREDIENT.DELETE | new |
| POST | `/ingredients/{id}/prices` | INGREDIENT.INGREDIENT.UPDATE | new |
| GET | `/ingredients/{id}/prices` | INGREDIENT.INGREDIENT.READ | new |
| GET | `/ingredients/{id}/substitutes` | INGREDIENT.INGREDIENT.READ | new |
| GET | `/ingredients/{id}/usage` | INGREDIENT.INGREDIENT.READ | new |
| GET | `/recipes` | RECIPE.RECIPE.READ | changed (V8 envelope, new shape) |
| GET | `/recipes/stats` | RECIPE.RECIPE.READ | new |
| GET | `/recipes/{id}` | RECIPE.RECIPE.READ | changed |
| POST | `/recipes` | RECIPE.RECIPE.CREATE | changed (aggregate) |
| PUT | `/recipes/{id}` | RECIPE.RECIPE.UPDATE | changed (aggregate + version) |
| PATCH | `/recipes/{id}/status` | RECIPE.RECIPE.UPDATE | new |
| POST | `/recipes/{id}/duplicate` | RECIPE.RECIPE.CREATE | new |
| DELETE | `/recipes/{id}` | RECIPE.RECIPE.DELETE | changed (soft) |
| POST | `/recipes/cost-preview` | RECIPE.RECIPE.READ | new |
| POST | `/recipes/{id}/recalculate` | RECIPE.RECIPE.UPDATE | new (replaces `/sync-costs`) |
| GET | `/recipes/{id}/history` | RECIPE.RECIPE.READ | new |
| POST | `/recipes/{id}/files` | RECIPE.RECIPE.UPDATE | changed (one per request, description part) |
| PATCH | `/recipes/{id}/files/{fileId}` | RECIPE.RECIPE.UPDATE | changed (was PUT multipart) |
| DELETE | `/recipes/{id}/files/{fileId}` | RECIPE.RECIPE.UPDATE | unchanged path |
| GET | `/recipes/simple` | RECIPE.RECIPE.READ | unchanged (ACTIVE only) |
| `*` | `/recipes/{id}/shares…` | RECIPE.RECIPE.SHARE | unchanged |
| POST/PUT | `/quotes…` | existing | changed (§6) |

---

## 12. Testing checklist

- **Cost engine** — table-driven cases listed in §5.5; property test: `totalCost = Σ rounded parts`; scaling linearity for ingredient lines.
- **Detection** — same fixtures as `allergen-detection.spec.ts` (accents, whole words, longest keyword, exclusions) plus both locales.
- **Ingredients** — SYSTEM immutability for tenants; own price on SYSTEM ingredient; dimension lock when used; density required for MASS⇄VOLUME; substitute validation (self, duplicates, incompatible dimension); tenant isolation (404 on foreign id); stale flag at 60 days.
- **Price ripple** — affected recipes recomputed + revision; open quotes flagged; issued/accepted quotes untouched; below-margin list correct; > 500 recipes → async path.
- **Recipes** — aggregate replace (added/removed/updated lines by id); every validation in §5.3 with exact `field` paths; publish rules; duplicate; soft delete keeps quotes; concurrent PUT → one 409; processHtml sanitisation (script/style/onerror/`javascript:` stripped; allowed tags kept).
- **Files** — magic-byte rejection (renamed .exe as .jpg), size/count/quota limits, EXIF stripped, single cover, signed URL expiry.
- **Quotes** — server re-pricing overrides client cost; configuration validation (non-selectable line excluded → 400; undeclared substitution → 400); snapshot immutability; PRICE_BELOW_COST guard and approval path.
- **Seeds** — idempotent re-run; 14 allergens; ≥ 122 ingredients with reference prices; 10 recipes cost CURRENT with no unpriced lines.

---

## 13. Legacy endpoints

Deprecate (one release, `Deprecation`/`Sunset` headers, delegating to new services): `/raw-material/**`, `/allergen/**`, `/recipes/{id}/ingredients/**`, `/recipes/{id}/ingredients/{id}/substitute`, `/recipes/{id}/fixed-costs/**`, `/recipes/{id}/cost`, `/recipes/{id}/sync-costs`, `PUT /recipes/{id}/files`. The new UI no longer calls them.

---

## 14. Frontend map

| Area | Path |
|---|---|
| Contracts | `src/app/core/models/kitchen.models.ts`; quote additions in `domain.model.ts` |
| Services | `core/services/domain/{allergen,ingredient,recipe}.service.ts` |
| Allergen catalog | `pages/cronos/allergens/` |
| Ingredients | `pages/cronos/ingredients/{ingredients.component,ingredient-editor/}` |
| Recipes | `pages/cronos/recipes/{recipes.component,recipe-studio/}` |
| Shared kitchen UI | `pages/cronos/kitchen-shared/` (detection, badges, price dialog, configurator, lookups) |
| Quote integration | `pages/cronos/quotes/{quote-form,quote-edit}` → `RecipeConfiguratorDialogComponent` |

## 15. Open decisions

1. Exchange rates for prices in non-default currencies (now rejected).
2. Tenant setting for `STALE_PRICE_DAYS` (default 60).
3. Whether `PRICE_BELOW_COST` should be blocking for all roles or only warn (current spec: block unless approved).
4. Sub-recipes (a recipe used as an ingredient, e.g. "crema pastelera" reused) — out of scope; model `recipe_lines.sub_recipe_id` later.
5. Nutrition facts / NOM-051 front-of-pack labelling — out of scope.
6. Cross-dimension substitutes (e.g. 1 egg [pz] → 7 g flaxseed + 45 ml water) need a per-piece weight on COUNT ingredients (`gramsPerPiece`); until then substitutes must share the base dimension (or be a MASS/VOLUME pair with densities), so `EGG_WHOLE → FLAX_EGG` is intentionally not seeded.
