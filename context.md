# Cronos UI — Design & Engineering Context

This file is the source of truth for all future UI/UX and code-quality work on
this project. It reflects the **actual current state** of the codebase (verified
2026-08-17), not assumptions. Read it before touching any component.

---

## 1. Stack Snapshot (verified, not aspirational)

| Layer | Reality |
|---|---|
| Angular | `21.2.18`, **NgModule-based** bootstrap (`app.module.ts`), not standalone |
| PrimeNG | `21.1.9` — new design-token theming engine (`@primeng/themes`), **not** the legacy CSS-theme era |
| PrimeFlex | `^4.0.0`, already wired in `angular.json` (`styles` array) |
| PrimeIcons | `^7.0.0` |
| Tailwind CSS | `^4.x`, installed 2026-08-18 — `@tailwindcss/postcss` via `postcss.config.json`, entry point `src/tailwind.css` (kept out of `styles.scss` on purpose, see §3), `dark:` variant scoped to `.app-dark` via `@custom-variant` |
| Theme preset | Custom `CronosPreset` in `app.module.ts` = `definePreset(Aura, {...})`, dark mode via `.app-dark` selector |
| Component selectors | Modern only: `p-select`, `p-multiselect` (the app has zero usages of the deprecated `p-dropdown` / `p-multiSelect` tags — keep it that way) |

---

## 2. Theming Rule — Aura, not Lara

PrimeNG dropped the old CSS-file theme catalog (Saga, Vela, Arya, **Lara**) at v18.
Theming is now token-based via `definePreset()` + `providePrimeNG()`. There is no
"Lara" stylesheet to import anymore — asking for it would be asking for a
component that no longer exists in this PrimeNG version.

**Decision:** the app already runs on `Aura`, extended into `CronosPreset`
(`src/app/app.module.ts`). Aura is also what the real primeng.org homepage runs
on. **Do not replace it with a `lara` preset** — `@primeng/themes/lara` does
exist as an installable package (the new token engine ships Aura/Lara/Material/
Nora as alternate primitive+semantic token sets), so asking for it isn't asking
for a nonexistent component the way it would have under the pre-v18 CSS-theme
catalog. It's simply not the base this project chose; `CronosPreset` stays an
Aura extension, not a base-theme swap.

- Extend `semantic.colorScheme.dark` in `CronosPreset` — do not hand-roll a
  parallel dark palette in `styles.scss`.
- Keep the existing `.app-dark` selector as the single dark-mode toggle
  (`darkModeSelector: '.app-dark'` in `providePrimeNG`). Never introduce a second
  dark-mode mechanism (no `prefers-color-scheme` media query overrides, no
  duplicate `:root[data-theme]` scheme). Tailwind's `dark:` variant is scoped to
  the same selector via `@custom-variant dark (&:where(.app-dark, .app-dark *));`
  in `src/tailwind.css` — see §3.
- Background depth for dark mode should route through `--p-surface-950` /
  `--p-surface-900` tokens (already bridged to `--surface-ground` /
  `--surface-card` in `styles.scss`), not literal hex/`#000` values.
- Never leave a view relying on default `--p-surface-0` (pure white) as its main
  background. Large surfaces use `--p-surface-50` (light) / `--p-surface-950`
  (dark). **Cards are the deliberate exception**: `p-card`/`p-panel` *do* render
  on pure `--p-surface-0` (light) / `--p-surface-900` (dark) via
  `content.background` — that's what lets them pop off the tinted ground. See
  §10 for the full shadow-first card rule (this supersedes the project's
  earlier hairline-border-only approach).
- There is no single generic `--border-radius` CSS variable to override in
  PrimeNG v21's token engine. Every component's radius resolves against the
  **primitive** `border.radius` scale (`none/xs/sm/md/lg/xl`) — `CronosPreset`
  bumps that scale once (`primitive.borderRadius` in `app.module.ts`) and it
  cascades to every component built on top of it (inputs/buttons via
  `{form.field.border.radius}` → `md`; panels/tags via
  `{content.border.radius}` → `md`; dialogs/cards via `{border.radius.xl}`
  directly). Don't add a literal `border-radius: 12px` (or similar) override
  in `styles.scss` for a PrimeNG component that already reads a radius token —
  bump the primitive scale or the specific component token in `CronosPreset`
  instead, so the value stays centralized. Utility classes that have no
  PrimeNG token equivalent (`.metric-card`, `.page-header`) may hardcode
  `1.25rem` to match the current `xl` value — see §10.

---

## 3. Styling Rules — PrimeFlex vs. Tailwind, division of labor

Both stay. They are not redundant if scoped correctly:

- **PrimeFlex** → structural layout only: `p-grid`/`flex`, `col-*`, `gap-*`,
  `align-items-*`, `justify-content-*`. Anything that mirrors how PrimeNG's own
  component internals expect spacing.
- **Tailwind** → everything else: one-off spacing/sizing not covered by
  PrimeFlex tokens, typography utilities, dark-mode fine-tuning, and
  interaction-state utilities PrimeFlex doesn't provide (`hover:`,
  `focus-visible:`, `active:`).
- **Tailwind v4 install specifics** (installed 2026-08-18): entry point is
  `src/tailwind.css` (`@import "tailwindcss";` + the `@custom-variant`), wired
  via `postcss.config.json` (`@tailwindcss/postcss`) and listed in
  `angular.json`'s `styles` array *before* `src/styles.scss`. It is **not**
  imported from inside `styles.scss` — Sass's own `@import` resolver would try
  to find a `tailwindcss.scss` partial and fail before PostCSS ever sees it
  (Tailwind v4 + Sass don't compose through the same `@import`). Keep the
  Tailwind entry as a plain `.css` file. `dark:` is scoped to `.app-dark` via
  `@custom-variant dark (&:where(.app-dark, .app-dark *));` in that file — not
  Tailwind's default `prefers-color-scheme` media strategy — so it never drifts
  from PrimeNG's `darkModeSelector: '.app-dark'`.
- Never use Tailwind's `bg-white` / `bg-black` literals — use the `p-` CSS
  variable tokens (`var(--p-surface-*)`) via Tailwind's arbitrary value syntax
  (`bg-[var(--p-surface-950)]`) so colors stay theme-reactive. Exception: the
  vibrant `.metric-card-*` fills (§10) are intentionally *not*
  theme-reactive — they use PrimeNG's static palette scale
  (`--p-green-700`, `--p-orange-700`, `--p-blue-200`), which holds the same
  value in both colorSchemes, unlike `--p-surface-*`.
- No component may ship with an unbroken large white/pure-surface-0 background
  in dark mode. If a PrimeNG component defaults to `--p-surface-0`, override
  it through the preset (section 2), not with ad-hoc component CSS.

---

## 4. Loading States — `p-skeleton` — IMPLEMENTED (see below)

Two shared, reusable components carry every skeleton in the app — no page
inlines its own `p-skeleton` markup:

- **`tr[appTableSkeletonRow]`**
  (`src/app/shared/components/table-skeleton-row/table-skeleton-row.component.ts`) —
  attribute-selector on `tr` (decorates a real `<tr>`, doesn't wrap it, so
  table structure stays valid inside `<tbody>`). Takes `[columns]` and renders
  that many `<td><p-skeleton></td>` cells with varied widths. Wired into every
  `<p-table>` via PrimeNG's built-in `pTemplate="loadingbody"` template
  (context: renders while `[loading]="true"`). Each table also sets
  `[showLoader]="false"` so PrimeNG's default spinner-overlay mask doesn't
  stack on top of the skeleton rows. Applied to all 11 list pages: unit-types,
  quotes, user-management, allergens, measurement-units, recipes, ingredients,
  fixed-costs, categories, roles-management, account/security (both tables).

- **`app-detail-skeleton`**
  (`src/app/shared/components/detail-skeleton/detail-skeleton.component.ts`) —
  `[fields]` (count) + `[showTitle]` (bool) inputs, renders a responsive
  label/value grid shaped like a Cronos detail/form page. Used behind
  `@if (isLoading()) { <app-detail-skeleton /> } @else { ... }` in the 6
  pages that fetch on init: quote-detail, recipe-detail, quote-edit,
  recipe-form (edit mode), ingredient-form (edit mode), my-account. Two of
  these (recipe-form, ingredient-form) previously rendered the form
  immediately with no loading gate at all — the skeleton gate was added
  net-new, not swapped in from an existing spinner. The other four already
  had a correctly-toggled `isLoading` signal gating a bare spinner icon; only
  the spinner markup was replaced.

- Skeleton visibility in all cases is driven by the component's existing
  `isLoading` signal, already toggled at HTTP start/complete — none of that
  loading-state logic needed to change, only what renders while it's `true`.
- Dashboard has no init data fetch (static quick-links, profile state loaded
  elsewhere) — intentionally has no skeleton.

---

## 5. Modals (`p-dialog`) — Styling & Content

10 `p-dialog` usages currently in the app.

**Styling:**
- Round corners via the preset's dialog design tokens (`--p-dialog-border-radius`
  or the equivalent `dialog.borderRadius` key in `CronosPreset`), not per-component
  inline `border-radius` overrides.
- Soft elevation only — no heavy/aggressive borders. Rely on PrimeNG's dialog
  shadow token, tuned once in the preset, not per-dialog.
- `p-button` inside dialogs uses the theme's `primary`/`secondary`/`text`
  severities as configured in `CronosPreset` — never a hardcoded hex color on a
  button.

**Content — remove the placeholder legend:**
- Delete the Spanish string `"El registro se dará de alta con el estatus de
  Activo por defecto"` everywhere it appears. Confirmed locations as of this
  audit:
  - `src/app/pages/cronos/unit-types/unit-types.component.html`
  - `src/app/pages/cronos/allergens/allergens.component.html`
  - `src/app/pages/cronos/measurement-units/measurement-units.component.html`
  - `src/app/pages/cronos/categories/categories.component.html`
- Re-check for this string (and paraphrases of it) on every new create/edit
  modal going forward — it should never reappear.

---

## 6. Select / Dropdown Overlap Fix — RESOLVED (see §10 deviation note)

Implemented via `providePrimeNG({ overlayAppendTo: 'body', ... })` in
`app.module.ts`, **not** per-component `appendTo="body"` as originally
specified in this section. Every PrimeNG overlay (`p-select`, `p-multiselect`,
`p-autocomplete`, `p-cascadeselect`, `p-datepicker`, `p-popover`, `p-menu`,
etc.) reads `this.appendTo() || this.config.overlayAppendTo()` internally, so
the global config option is a strict superset of setting `appendTo="body"` on
every template — one line covers all current and future overlay usages
instead of relying on each new template to remember it.

- Default going forward: **do not** add `[appendTo]="'body'"` per component —
  it's redundant with the global config. Only set a component-local
  `appendTo` when a specific instance genuinely needs a different target
  (e.g. an overlay that must stay inside a specific scrollable container).
- Do not solve overlap by inflating a global `z-index` value in `styles.scss`;
  `overlayAppendTo` already removes the stacking-context problem at its root.
  Only touch a panel's `z-index` token in `CronosPreset` if two `body`-appended
  overlays still collide with each other (e.g. dialog + multiselect open at
  once).
- Option/list touch targets: `list.option.padding` in `CronosPreset` is set to
  `0.75rem 1rem` (~44px row height with default font size) — applies to every
  select/list-style overlay at once. Don't override `.p-select-option` padding
  per component.

---

## 7. Full-Screen Forms — AUDITED, narrower fix than expected

Before touching anything, every full-screen form route was read in full.
Most were already exactly what this section asks for:
`recipe-form`, `ingredient-form`, `quote-form`, and `quote-edit` already
group fields into titled `p-card` sections (`ingredient-form` even uses the
card `subtitle` template) with a PrimeFlex `grid`/`col-*` responsive layout —
not a flat wall of inputs. **Don't restructure these further** — the
`p-card`-per-section pattern already in `ingredient-form` is the reference to
copy for any *new* full-screen form, not something to redo.

What was actually wrong, and fixed:

- `quote-form` and `quote-edit`'s Summary card separated the input fields
  from the computed totals with a hand-rolled
  `<div class="border-top-1 surface-border pt-3">` instead of the PrimeNG
  component this section calls for. Replaced with `<p-divider styleClass="my-0" />`
  in both.
- `sign-in-method` (embedded in the Security page) had the same hand-rolled
  `border-top-1 surface-border` div separating the Password and 2FA sections.
  Same fix: `<p-divider styleClass="my-0" />`.
- `my-account` was the one genuine flat-wall case — a single `p-card` with no
  internal grouping at all, editable identity fields and the read-only Roles
  display run together with just a `gap-3`. Added a `<p-divider>` before the
  Roles row. Didn't split it into multiple `p-card`s — six fields in one
  short settings form doesn't warrant `p-panel`-level ceremony; a single
  divider between "editable" and "read-only, system-assigned" is
  proportionate.

Rule going forward, now that the codebase has a working example: group
fields into titled `p-card` sections for any form with more than ~2 logical
groups of fields (see `ingredient-form`); use a single `p-divider` inside one
card for a two-part form too small to justify separate cards (see
`my-account`). Never hand-roll a `border-top-*` div as a section separator —
use `p-divider`.

---

## 8. Code Quality Rules

- **SOLID**: one responsibility per component/service; extract form-building,
  validation, and data-fetching into dedicated services rather than growing
  component classes.
- **Change detection**: every new/touched component sets
  `changeDetection: ChangeDetectionStrategy.OnPush`. Mutate state through
  signals or new object/array references — never mutate in place under OnPush.
- **Lazy loading**: feature routes stay lazy-loaded (`loadChildren` /
  `loadComponent`); do not add new feature modules/components to eager
  `imports` in `app.module.ts`.
- **Notifications**: all success/error feedback goes through the existing
  `MessageService` (Toast) injected via DI — no `alert()`, no ad-hoc inline
  banner components, no duplicate toast implementations.

---

## 9. Language Rule — English only

- All new/touched code — variables, methods, classes, comments, commit-facing
  strings — must be English. No exceptions, no partial migrations left mid-file.
- When refactoring a file that contains Spanish (identifiers, comments, or UI
  copy), migrate the whole file's Spanish to English as part of that pass —
  don't leave a mixed-language file behind.
- Scope reality check — **done**: the Spanish UI copy that used to sit across
  ~20 files (auth, dashboard, layout, quotes, recipes, categories, catalogs,
  account, admin, public share pages) is now translation keys resolved from
  `assets/i18n/*.json` (§16.5). Source literals are gone; what remains in
  Spanish is bundle *content*, which is the point.
- Two deliberate exceptions, both documented where they live: `index.html`
  (§16.4, pre-bootstrap shell) and the `DENSITY_DIMENSIONS` set in the
  ingredient form, whose Spanish words are matched against values the **API**
  returns and are therefore data, not copy.

---

## 10. UI/UX Design System & Theming Rules

Consolidates the "premium dashboard" pass (2026-08-18, Freya-reference visual
target). This section is the index — the underlying mechanism for most of it
already lives in §2 (radius, shadow, borders) and §3 (Tailwind); read those
for the "why," this section for the checklist.

**Global Layout**
- The app wrapper (`body`) always uses `var(--surface-ground)`
  (→ `--p-surface-50` light / `--p-surface-950` dark) — never pure white/black.
- `p-card` / `p-panel` render pure `var(--surface-card)`
  (→ `--p-surface-0` light / `--p-surface-900` dark) so they visibly pop off
  the tinted ground. This is the one deliberate exception to "never rely on
  `--p-surface-0`" — see §2.
- Depth comes from shadow, not border. `content.borderColor` is set to
  `transparent` in `CronosPreset` for both color schemes — do not reintroduce
  a literal `border: 1px solid var(--p-content-border-color)` on a card-like
  container; it will render invisibly and isn't the intended depth cue anyway.
  Any container that needs to visually separate from the ground (e.g.
  `.page-header`) needs the same `background: var(--p-content-background)` +
  `box-shadow` pairing, not a border on a ground-colored background (that was
  a real bug fixed in this pass — a `surface-50`-on-`surface-50` header with a
  now-transparent border is invisible).

**Border Radius**
- Global scale lives in `CronosPreset.primitive.borderRadius`
  (`app.module.ts`): `xs 6px / sm 8px / md 10px / lg 14px / xl 20px`. Bump it
  there, not with a literal `--border-radius` variable (doesn't exist in this
  PrimeNG version) or per-component hardcoded `border-radius` values.
- Utility classes with no PrimeNG token equivalent (`.metric-card`,
  `.page-header`, the paginator footer band) hardcode `1.25rem` to visually
  match the current `xl` primitive. If the primitive scale changes, grep
  `styles.scss` for `1.25rem` radius values and update them together — they
  aren't token-linked because these aren't PrimeNG-templated elements.

**Shadows**
- Soft, large, diffused, two-layer shadows — never a single hard-edged
  `box-shadow` or a heavy border-simulating shadow. Reference value (light):
  `0 20px 40px -16px rgba(15, 23, 42, 0.12), 0 4px 12px -4px rgba(15, 23, 42, 0.06)`;
  dark mode deepens the alpha, doesn't change the shape:
  `0 20px 40px -16px rgba(0, 0, 0, 0.55), 0 4px 12px -4px rgba(0, 0, 0, 0.35)`.
- `p-card` gets this via a real design token (`components.card.colorScheme.*
  .root.shadow` in `CronosPreset`). `p-panel` does **not** have a `shadow`
  design token in Aura's own schema (its styled CSS never wires up a
  `box-shadow` property) — its elevation is a plain `.p-panel` /
  `.app-dark .p-panel` rule in `styles.scss`, kept in sync with the card
  value by hand. Don't assume every component token you'd expect actually
  exists — check `node_modules/@primeuix/themes/dist/aura/<component>/index.mjs`
  before wiring a token override that PrimeNG's CSS will silently ignore.
- Dialog/overlay shadow is unchanged from the pre-existing rule (§2's
  `overlay.modal.shadow` override) — already soft/diffused, not touched by
  this pass.

**Metric Cards (Dashboards)**
- `.metric-card` + one of `.metric-card-green` / `.metric-card-dark` /
  `.metric-card-orange` / `.metric-card-blue` (`styles.scss`). Structure:
  `.metric-card-icon` (absolute, top-right), `.metric-card-label`,
  `.metric-card-value`.
- These fills are **intentionally not theme-reactive** — `--p-green-700`,
  `#1e293b`, `--p-orange-700`, `--p-blue-200` hold the same value in both
  light and dark colorScheme (unlike `--p-surface-*`), matching the reference
  dashboard where accent tiles don't change color when the app switches
  theme.
- Text/icon color is picked per-variant for ≥4.5:1 contrast (WCAG AA, normal
  text): green/dark/orange variants use white text on a `700`-weight fill;
  the blue variant is a light tint (`blue-200`) so it takes dark text
  (`blue-900`) instead — a `500`-weight blue with white text fails contrast
  at this tile's font sizes. Don't lighten the green/orange fills or darken
  the blue fill without rechecking contrast.
- `<app-metric-card>` (`shared/components/metric-card`) is the reusable
  component form: `[label]`, `[value]`, `[icon]`, `[variant]`. It expects a
  real numeric/short stat value — don't repurpose it for a link+description
  card (see the dashboard quick-links, which apply the `.metric-card-*`
  classes directly instead of using the component, precisely because they
  carry a sentence description, not a stat value).

**Status Pills**
- Already implemented pre-dating this pass: `.status-pill` +
  `.status-pill-active` / `.status-pill-inactive` (`styles.scss`) — soft
  transparent background (`--p-green-100`/`--p-green-700` light, a
  `color-mix` tint in dark), rounded pill (`border-radius: 999px`), small dot
  via `::before`. `p-tag` is also forced to `border-radius: 999px` so any
  `<p-tag>` usage matches the same pill language. New status-style badges
  (e.g. a hypothetical `INSTOCK`/`LOWSTOCK`/`OUTOFSTOCK` set) should add
  sibling classes here (`.status-pill-lowstock`, etc.) rather than a new,
  parallel badge system.

**Language Rule**
- Reaffirms §9: all UI text, code, classes, and comments touched by a
  redesign pass go to English in the same PR, applied file-by-file as each
  view is touched (not a mass find/replace). `dashboard.component.ts/html`
  was fully migrated as part of this pass, since it was touched for the
  metric-card restyle.

---

## 11. Working Agreement

Component-by-component execution proceeds only after this file is approved.
Each future change should cite which section of this file it satisfies (e.g.
"per §5, dialog border-radius now reads from CronosPreset"). If a change
requires deviating from a rule here, that deviation is called out explicitly
and this file is updated in the same PR — it never drifts silently out of
sync with the code.
---

# PART II — Freya Design Baseline (Visual Source of Truth)

> Added 2026-08-22. Part I above governs **architecture and code quality**.
> Part II governs **visual language**. Both are binding. Where a rule here
> conflicts with an older Part I styling note, Part II wins and the Part I
> note is annotated as superseded.
>
> Reference: the PrimeNG **Freya** premium template. The goal is not a
> pixel-clone of Freya's demo content, but the same *system*: an expanded
> light sidebar, a quiet topbar, a soft gray content ground, and white cards
> with generous radii and near-invisible shadows.

---

## 11. Layout Structure Guidelines

The shell is `MainLayoutComponent` (`src/app/layout/`). Three fixed regions,
one scrolling region. Nothing else may position itself `fixed` at the app
level.

### 11.1 Region map

```
┌──────────────┬───────────────────────────────────────────────┐
│              │  .layout-topbar        (sticky, 4.5rem)       │
│ .layout-     ├───────────────────────────────────────────────┤
│  sidebar     │  .layout-main          (scrolls)              │
│  (fixed,     │    .layout-content-header   (title + crumbs)  │
│   16rem)     │    .layout-content          (router-outlet)   │
│              │    .layout-footer                             │
└──────────────┴───────────────────────────────────────────────┘
```

### 11.2 Sidebar — `.layout-sidebar`

| Property | Value | Token |
|---|---|---|
| Width (expanded) | `16rem` | `--layout-sidebar-width` |
| Width (slim) | `5rem` | `--layout-sidebar-width-slim` |
| Position | `fixed`, `inset-block: 0`, `left: 0` | — |
| Background | white / `surface-900` in dark | `--surface-card` |
| Right edge | 1px hairline, **never** a shadow | `--surface-border` |
| z-index | `1100` (above topbar) | `--layout-z-sidebar` |
| Internal scroll | `.layout-menu` only; logo block stays pinned | — |

Rules:
- The sidebar owns the logo. The topbar **never** renders a logo — that is the
  single most visible difference between the old shell and Freya.
- Three vertical zones, in order: `.layout-sidebar-logo` (fixed height
  `4.5rem`, matching the topbar so the two align on the same baseline),
  `.layout-menu` (`flex: 1`, `overflow-y: auto`), `.layout-sidebar-footer`.
- **Slim mode** (`.layout-slim` on the wrapper) hides labels and section
  headers, centers icons, and hands the label to a `pTooltip` on the right.
  It is a class toggle only — never a second template.
- **Mobile** (`< 992px`): the sidebar translates off-canvas
  (`translateX(-100%)`) and is revealed by `.layout-mobile-active` on the
  wrapper, backed by `.layout-mask`. Do not swap in `p-drawer`; one sidebar
  implementation, three states.

### 11.3 Menu typography inside the sidebar

| Element | Size | Weight | Case | Color |
|---|---|---|---|---|
| Section header (`DASHBOARDS`, `APPS`) | `0.72rem` | `700` | `uppercase`, `letter-spacing: .06em` | `--text-color-secondary` |
| Menu item label | `0.9rem` | `500` | sentence | `--text-color` |
| Menu item, active | `0.9rem` | `600` | sentence | `--primary-color` |
| Menu item icon | `1.1rem` | — | — | inherits item color |

- Item height `2.6rem`, radius `--radius-md`, icon gap `0.75rem`, icons
  **left-aligned** in a fixed `1.5rem` box so labels align regardless of glyph
  width.
- Active state = tinted background at 12% primary + primary text. No left
  accent bar, no bold underline, no filled pill.
- Hover state = `--surface-hover`, no transform, no shadow.

### 11.4 Topbar — `.layout-topbar`

| Property | Value |
|---|---|
| Height | `4.5rem` (`--layout-topbar-height`) |
| Position | `sticky; top: 0` inside the main column (not `fixed`) |
| Background | `--surface-ground` — it dissolves into the page, it is not a bar |
| Border | none, ever |
| Layout | `flex; align-items: center; justify-content: space-between` |
| Padding | `0 1.5rem` |

- Left cluster: sidebar toggle only. On `lg+` the toggle switches
  expanded ↔ slim; below `lg` it opens the off-canvas sidebar.
- Right cluster: search → theme toggle → user button, `gap-2`.
- Search uses `p-iconfield` + `p-inputicon` + `input pInputText`, pill radius
  (`--radius-pill`), `--surface-card` background, hairline border. Hidden
  below `md` — replaced by nothing, not by a cramped input.

### 11.5 Main content wrapper

| Element | Rule |
|---|---|
| `.layout-main` | `background: var(--surface-ground)`; `padding: 0 1.5rem 1.5rem` (top padding is the topbar's job) |
| `.layout-content` | **transparent** — it is a grid ground, not a card |
| Cards inside | white `--surface-card`, `--radius-lg`, `--shadow-card`, no border |
| Footer | centered, `--text-color-secondary`, `0.8rem`, `padding-top: 2rem` |

> **Supersedes §2/§3 of Part I.** The old shell wrapped the whole route in one
> big white card (`.layout-content` had a background, border and shadow) and
> flattened every inner `p-card` to a borderless hairline box so shadows would
> not stack. Freya inverts that: the content ground is gray, and each `p-card`
> is the white elevated surface. The "flatten inner cards" rule in
> `styles.scss` is therefore replaced by the elevated-card rule in §14.

---

## 12. Color Palette (Design Tokens)

All tokens are declared once in `src/styles.scss` under `:root`, remapped
under `.app-dark`, and **always** derive from PrimeNG v21 `--p-*` theme tokens
rather than literal hex — except the four dashboard accents, which are brand
constants and are declared as literals.

### 12.1 Surface & text

| Token | Light | Dark | Use |
|---|---|---|---|
| `--surface-ground` | `--p-surface-100` | `--p-surface-950` | App canvas behind everything |
| `--surface-card` | `--p-content-background` | `--p-surface-900` | Cards, sidebar, overlays |
| `--surface-overlay` | `--p-content-background` | `--p-surface-800` | Menus, dialogs |
| `--surface-border` | `--p-content-border-color` | `--p-surface-800` | Hairlines only |
| `--surface-hover` | `--p-surface-100` | `--p-surface-800` | Menu/row hover |
| `--text-color` | `--p-text-color` | idem | Primary copy |
| `--text-color-secondary` | `--p-text-muted-color` | idem | Labels, captions, section headers |
| `--primary-color` | `--p-primary-color` | idem | Active nav, links, focus |

The single most important change from the pre-Freya look: **`--surface-ground`
moved from `surface-50` to `surface-100`**. `surface-50` is too close to white
to separate the ground from the cards, which is why the old shell needed a
border on every card to be legible.

### 12.2 Dashboard accent cards

Four accents, in fixed order. Each has a base, a gradient end (used as a
`135deg` linear gradient for depth), and a matching tinted shadow.

| Accent | Base | Gradient end | Token prefix | Semantic slot |
|---|---|---|---|---|
| **Green** (emerald) | `#10b981` | `#059669` | `--accent-green-*` | Primary / positive volume |
| **Slate** (muted gray) | `#94a3b8` | `#7c8da3` | `--accent-slate-*` | Neutral / informational |
| **Navy** (dark blue) | `#3f4b5f` | `#2c3543` | `--accent-navy-*` | Dense / analytical |
| **Orange** (amber) | `#f9a94c` | `#f08c25` | `--accent-amber-*` | Attention / warning |

Rules:
- Foreground on all four is `#fff`. Never dark text on an accent card, not
  even on Slate/Amber — consistency beats per-card contrast tuning here.
- The accent set is **closed**. A fifth metric reuses an existing accent; it
  does not introduce a fifth color.
- Accents are for dashboard metric cards only. They are not button colors, not
  tag colors, not chart colors. Buttons keep PrimeNG severities (§8 Part I).

---

## 13. Typography, Radius, Elevation & Spacing

### 13.1 Type scale

Root is `14px` (`html { font-size: 14px }` — set in `styles.scss`), so `1rem`
= 14px. Every rem value below is written for that root; do not change it.

| Role | Class / size | Weight |
|---|---|---|
| Page title | `1.5rem` (`.layout-page-title`) | `700` |
| Page description | `0.875rem`, muted | `400` |
| Card title | `1.125rem` / `text-lg` | `600` |
| Metric card label | `0.875rem`, `#fff` @ 90% | `600` |
| Metric card value | `2rem` (`clamp` to `1.75rem` on small) | `700`, `letter-spacing: -.02em` |
| Body | `0.9375rem` | `400` |
| Caption / meta | `0.8rem`, muted | `400` |

Font stack stays `Inter, -apple-system, …` (already set on `body`). Do not
introduce a second family.

### 13.2 Radius scale

| Token | Value | PrimeFlex equivalent | Use |
|---|---|---|---|
| `--radius-sm` | `6px` | `border-round-md` | Inputs, small buttons |
| `--radius-md` | `10px` | — | Menu items, chips |
| `--radius-lg` | `14px` | `border-round-xl` | **Cards — the default** |
| `--radius-xl` | `20px` | `border-round-2xl` | Hero / banner blocks |
| `--radius-pill` | `999px` | `border-round-3xl` | Search field, status pills, tags |

Prefer the PrimeFlex class in templates when it maps cleanly
(`border-round-xl`); use the CSS variable in SCSS. Never hardcode a px radius
in a component stylesheet.

### 13.3 Elevation

Three shadows exist. There is no fourth.

```scss
--shadow-card:  0 1px 2px rgba(15,23,42,.04), 0 4px 12px -4px rgba(15,23,42,.06);
--shadow-hover: 0 2px 4px rgba(15,23,42,.05), 0 12px 24px -8px rgba(15,23,42,.10);
--shadow-overlay: 0 24px 48px -12px rgba(0,0,0,.18), 0 8px 16px -8px rgba(0,0,0,.12);
```

- Cards ship at `--shadow-card`. `--shadow-hover` is applied only on
  interactive cards, paired with `translateY(-2px)` and a `.2s ease`
  transition.
- Accent cards use their own tinted shadow
  (`0 8px 20px -8px <accent>66`) instead of `--shadow-card` — a neutral gray
  shadow under a saturated card reads as dirt.
- In dark mode every shadow is reduced, not recolored: the `.app-dark` block
  overrides the same three tokens with lower alpha.

### 13.4 Spacing — PrimeFlex is the vocabulary

Templates express spacing with PrimeFlex utilities; SCSS only handles what
utilities cannot.

| Context | Classes |
|---|---|
| Card inner padding | `p-4` (PrimeNG's `p-card-body` is retuned to `1.5rem` globally — do not add padding on top of it) |
| Gap between cards in a grid row | `grid` + `col-12 md:col-6 xl:col-3` (the `grid` gutter *is* the gap) |
| Vertical rhythm between page sections | `mb-4` |
| Icon ↔ label | `gap-2` |
| Toolbar clusters | `gap-2`, `align-items-center` |
| Card internals | `flex flex-column justify-content-between gap-3` |

Canonical metric-card internal layout, verbatim:

```html
<div class="flex align-items-start justify-content-between gap-3">…</div>
```

Never reach for a custom flex rule when `flex`, `align-items-center`,
`justify-content-between`, `flex-column`, `gap-*` or `col-*` already say it.

---

## 14. PrimeNG Global Overrides

Live in `src/styles.scss` under the "Freya component overrides" banner. Keep
them there — component stylesheets must not re-override PrimeNG internals.

**Card** — the one override that carries the whole aesthetic:
```scss
.p-card {
  background: var(--surface-card);
  border: none;              // Freya cards are borderless…
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-card);   // …and separated by shadow instead
}
.p-card .p-card-body { padding: 1.5rem; }
.p-card .p-card-title { font-size: 1.125rem; font-weight: 600; }
```

**Panel / Fieldset / Accordion** — strip the chrome: transparent headers, no
outer border, header font `600` at `0.95rem`. Freya's grouping reads through
spacing and weight, not boxes.

**DataTable** — keep the Part I §"tables" treatment (uppercase muted headers,
hairline row separators, striped even rows) but drop the outer border and let
the wrapping `p-card` provide the surface. The paginator stays a full-bleed
footer band; its negative margins are pinned to the `1.5rem` card padding
above — **if you change card padding, change the paginator margins in the same
commit.**

**Inputs** — `--radius-sm`, hairline border from `--p-formField-borderColor`,
no inner shadow. Search-style inputs get `--radius-pill` via `.p-input-pill`.

**Buttons** — untouched. PrimeNG severities already match Freya. The only
addition is `.p-button-page-action` from Part I.

**Menu / Overlay** — `--radius-lg` and `--shadow-overlay`, already routed
through `CronosPreset` in `app.module.ts`. Overlay radius belongs in the
preset, not here.

**Dark mode** — never write a `.app-dark .p-<component>` rule that changes
*layout*. Dark mode only ever swaps the token values in §12.

---

## 15. Component Inventory (Freya-era)

| Component | Path | Purpose |
|---|---|---|
| `MainLayoutComponent` | `src/app/layout/` | The shell: sidebar + topbar + content ground |
| `buildNavSections()` | `src/app/layout/app-menu.ts` | Single nav model driving expanded, slim and mobile states |
| `StatCardComponent` (`app-stat-card`) | `src/app/shared/components/stat-card/` | The four-accent metric card. **All metric tiles use it — no page hand-rolls a colored card.** |

`app-stat-card` contract:

| Input | Type | Notes |
|---|---|---|
| `label` | `string` | Small uppercase-ish title, top-left |
| `value` | `string \| number` | Large figure, bottom-left |
| `icon` | `string` | PrimeIcons class, top-right |
| `accent` | `'green' \| 'slate' \| 'navy' \| 'amber'` | §12.2 |
| `caption` | `string?` | Optional sub-line under the value |
| `link` | `string?` | When set the card becomes an `<a routerLink>` and gains hover lift |
| `loading` | `boolean` | Renders a `p-skeleton` in the value slot (per Part I §4) |

Per Part I §10, cite the section you are satisfying: e.g. "per §13.3, the
interactive card uses `--shadow-hover` with a 2px lift".

---

## 16. Internationalization & Headers

> Added 2026-08-22. Supersedes nothing in §9 — that rule governs the
> *codebase* (identifiers, comments, commit messages stay English). This
> section governs *user-facing locale*, which is a runtime concern.

### 16.1 Supported locales

| Locale | BCP 47 tag | Display | Notes |
|---|---|---|---|
| Spanish (Mexico) | `es-MX` | `🇲🇽 ES` | **Default.** Primary market. |
| English | `en` | `🇺🇸 EN` | |

The tag is the contract. `es-MX` is never abbreviated to `es` on the wire, and
`en` is never sent as `en-US` — the backend resolves its message bundles from
these two exact tags, so a mismatch silently degrades to the server default.
Adding a third locale means adding it to `AppLanguage` **and** shipping the
matching backend bundle in the same PR.

### 16.2 The header — `Accept-Language`

Every request to `environment.apiUrl` carries the active locale:

```
Accept-Language: es-MX
```

- The value is the tag alone, not a weighted list (`es-MX,es;q=0.9`). The
  backend negotiates on two known tags; a q-list adds parsing surface for no
  behavioural gain.
- It is set **globally in an interceptor, never per service**. A service that
  forgot it would return English validation errors into a Spanish form, and
  that failure is invisible until a user hits a 400.
- Only calls to our own API are tagged. Static assets — including the
  `/assets/i18n/*.json` bundles a future translation loader fetches — keep
  their own content negotiation and must not inherit ours.

### 16.3 Ownership

| Concern | Owner |
|---|---|
| Active locale, persistence, `<html lang>`, `<title>` | `core/services/language.service.ts` |
| Stamping the header | `core/interceptors/language.interceptor.ts` |
| Locale catalog (`code`, labels, flag, document title) | `core/models/language.model.ts` |
| `LOCALE_ID` + `registerLocaleData` | `app.module.ts` |
| Static default (`<html lang>`, first-paint `<title>`) | `src/index.html` |
| Switcher UI | `layout/main-layout.component.*` |

`LanguageService` is the deliberate twin of `ThemeService`: a signal for
readers, `localStorage` for persistence (`cronos_language`), exactly one DOM
side effect (`<html lang>`), and an `init()` the shell calls on bootstrap.
Read `language.current()`; write only through `language.use()`.

The switcher sits in the topbar's right cluster **immediately left of the
theme toggle**, as a `p-menu` popup behind a `.layout-lang-button` — the same
quiet chrome as `.layout-user-button`, so the three controls read as one row
(§11.4). Flags are regional-indicator emoji: no icon font, no SVG sprite, no
request. Note `p-dropdown` no longer exists in PrimeNG 19+ (it is `p-select`);
`p-menu` is the native fit for a topbar popup and is already the pattern the
account menu uses.

### 16.4 Enterprise compliance — pipes, titles and the static shell

Three rules beyond the header, all of them a11y/SEO obligations rather than
polish:

- **`LOCALE_ID` is `es-MX`.** `registerLocaleData(localeEsMX, 'es-MX')` runs at
  module load in `app.module.ts` — Angular bundles only `en` data, and an
  unregistered locale makes `date`/`number`/`currency` throw at runtime, not
  fall back. Cronos prices ingredients and issues quotes in Mexico, so the
  native pipes are built around `es-MX`. The provider reads the persisted
  choice via `resolveStoredLanguage()` and returns `es-MX` when nothing is
  stored: `LOCALE_ID` is resolved once at bootstrap and **cannot change
  without a reload**, so an in-session switch moves the header, the
  `<html lang>` and the `<title>` immediately while the pipes follow on the
  next load. Never try to "fix" that by re-providing `LOCALE_ID` at runtime —
  reload, or format through an explicit locale argument.
- **The `<title>` is dynamic, and `Title` is the only way it is written.**
  `LanguageService` injects `@angular/platform-browser`'s `Title` and sets it
  from `LanguageOption.documentTitle` inside `apply()`. No component writes
  `document.title`; `PageInfoService` drives the in-page heading only, which
  is a different surface with a different lifetime.
- **`index.html` carries the real default, not a generic one.**
  `<html lang="es-MX">` and the Spanish `<title>` are hardcoded, so a screen
  reader or a pre-hydration crawler reads the intended locale from the first
  byte instead of a generic `es` for the few milliseconds before Angular
  boots. That file and `LANGUAGE_OPTIONS` must be changed together.

### 16.5 UI string translation — IMPLEMENTED

`@ngx-translate/core` drives every UI string. It consumes `LanguageService`
rather than holding a second copy of the state: `use()` is the only writer, and
it moves the header, the bundle, the `<html lang>` and the `<title>` together.

Bundle filenames match the BCP 47 tag exactly (`en.json`, `es-MX.json`) so one
identifier drives the header, the `<html lang>` and the bundle lookup. There is
deliberately no second locale enum for translation keys.

```ts
// app.module.ts — providers
provideTranslateService({
  loader: provideTranslateHttpLoader({
    prefix: './assets/i18n/',
    suffix: '.json',
    useHttpBackend: true,   // ← required, see below
  }),
  lang: resolveStoredLanguage(),
  fallbackLang: DEFAULT_LANGUAGE,
}),
```

**`useHttpBackend: true` is load-bearing — do not remove it.**
`TranslateService` calls `use(lang)` from its own constructor, which runs while
`LanguageService` is still being constructed. On `HttpClient` that fetch builds
the interceptor chain at that moment, constructing
`ErrorInterceptorService` → `AlertService` → `LanguageService` — a cycle.
ngx-translate swallows a loader failure as a `console.warn`, so the symptom is
silent: no bundle loads and every key renders as itself. `HttpBackend` skips the
interceptor chain entirely, which is also correct on the merits — these are
static assets that must not carry `Authorization` or trip the 401-refresh flow,
exactly as `languageInterceptor` already documents about them.

`LanguageService.t(key, params)` is the only place that narrows
`TranslateService.instant()` (typed `any`) to a `string`. It reads a revision
signal bumped on `onLangChange`, so any `computed` that calls `t()` re-translates
on a switch without knowing the mechanism. Component constants that hold labels
(status maps, cost types, currencies) store **API enum values plus a key**, never
display text, so a selector re-labels itself instead of keeping whatever was
built at construction.

Two invariants worth keeping:

- Any `toLocaleDateString` / `Intl.NumberFormat` call passes
  `language.current()`, never a pinned `'es-MX'`, so dates and currency match
  the language on screen.
- `src/index.html` stays hardcoded Spanish (§16.4) — no runtime loader can
  reach it before Angular boots.

---

## 17. Dead Code & Migration Remnants — REMOVED

The repo carried leftovers from two migrations: the Angular CLI scaffold it was
generated from, and the move from class-based `HttpInterceptor`s to functional
ones. Everything below was verified unreachable before deletion (import-graph
walk from `src/main.ts`, plus a reference check for every asset), and the build,
lint and test suites were re-run after. Nothing here is "cleanup for its own
sake": each item was either unreachable, or configuration pointing at something
that no longer exists.

### 17.1 Superseded interceptors

| Removed | Why |
|---|---|
| `core/interceptors/auth-interceptor.service.ts` | Class-based twin of the registered functional `authInterceptor`. Never provided anywhere. It also carried the *older* logic the live one documents fixing — `includes()` substring matching, which lets `/auth/login` match `/auth/login-history`. |
| `core/interceptors/error.interceptor.ts` | Functional twin of the registered `ErrorInterceptorService`. Never registered. |

Only `authInterceptor`, `languageInterceptor` (functional) and
`ErrorInterceptorService` (class, via `HTTP_INTERCEPTORS`) are wired in
`app.module.ts`. Keeping unregistered duplicates around is how a bug fix lands
in the copy that does not run.

The dead auth interceptor listed `/public/recipes/share` as a public URL and the
live one does not. That is not a behavioural gap: an anonymous visitor has no
token to attach, and a signed-in baker sending one to a public endpoint is
harmless.

### 17.2 Scaffold remnants

| Removed | Why |
|---|---|
| `src/typings.d.ts` | Declared `var ClipboardJS: any` for a library that is not in `package.json` and is never referenced. Also the last `any` in the codebase (§8). |
| `src/test.ts` | Used `require.context`, which the Angular ≥16 Karma builder dropped — the file was inert and `ng test` could not run at all. Removing it (plus the `main` option in `angular.json` and its `tsconfig.spec.json` entry) restores the builder's own spec auto-discovery. |
| `src/polyfills.ts` | One `import 'zone.js'` wrapped in ~60 lines of IE/Edge-era scaffold comments. Replaced by the inline `"polyfills": ["zone.js"]` form in `angular.json` for both the `build` and `test` targets, and dropped from both tsconfigs. |
| `core/models/error-response.model.ts` | Sole export `ErrorResponse` referenced nowhere. The app reads failures through the `ApiResponse.errors[]` envelope and `api-error.util.ts`. Its re-export was removed from the `core/models` barrel. |
| `assets/media/logos/cronos-small.svg` | No reference in any template, style or config. |
| `assets/media/logos/favicon.ico` | No reference anywhere. The icon is served from `favicon.svg`, linked in `index.html`. If an `.ico` fallback is wanted, add it deliberately and link it. |
| `assets/.gitkeep` | Placeholder for an empty directory that now holds real tracked files. |

### 17.3 Configuration pointing at nothing

| Fixed | Why |
|---|---|
| `angular.json` → `assets: ["src/favicon.ico", …]` | That path does not exist; the favicon lives under `assets/media/logos/`. Removed from the `build` and `test` targets. |
| `karma.conf.js` → `coverage/demo1` | Coverage output was named after a different project from the starter template. Now `coverage/cronos-ui`. |
| `.browserslistrc` → `not IE 11` | Inert: Angular 21 cannot target IE, so the exclusion matched nothing. The rest of the support matrix is a deliberate product choice and was left alone. |

### 17.4 Deliberately kept

- **`RegisterUserRequest`** looked unused, but `create-user-modal` builds exactly
  that shape as an untyped object literal for the `userData` request part. It was
  *unwired*, not dead — the local is now annotated with it, so drift against the
  backend contract is a compile error instead of a runtime 400.
- **`environment.prod.ts`** is unreachable by import on purpose: it arrives
  through `fileReplacements` in the production configuration.
- **Over-exported symbols** (`ThemeMode`, `PageLink`, `ConfirmOptions`,
  `PHONE_COUNTRIES`, `CATEGORY_NAME_MAX_LENGTH`, …) are each used inside their
  own file. They are a wider API surface than needed, not dead code, so they were
  left as-is rather than churned.

---

## 18. Account Settings Module — IMPLEMENTED

`/cronos/cuenta/configuracion` replaces the separate My Account and Security
pages. The old URLs redirect to the matching tab (`?tab=profile|security`), so
bookmarks keep working. Backend contract: `docs/api/account-settings.md`.

| Piece | Path | Notes |
|---|---|---|
| `AccountSettingsComponent` | `pages/cronos/account/account-settings/` | Tab shell + Profile and Fiscal forms. `?tab=` is the single source of tab state |
| `AccountSettingsStore` | same folder | Component-scoped; one `SectionState` signal slice per section, so a save in one tab never re-renders another |
| `SecurityPanelComponent` | `…/account-settings/security-panel/` | Former Security page, now a lazily-rendered tab |
| `PhoneInputComponent` (`app-phone-input`) | `shared/components/phone-input/` | CVA + validator. Model value is **E.164**. Uses `libphonenumber-js/max` |
| `AvatarCropperDialogComponent` | `shared/components/avatar-cropper-dialog/` | `ngx-image-cropper`; emits a 512×512 JPEG `File` |
| `FieldErrorComponent` (`app-field-error`) | `shared/components/field-error/` | One translated message per control; takes `errors` so it works under OnPush |
| Validators | `shared/validators/{fiscal,phone,password}.validators.ts` | RFC, regime↔RFC, CP, legal-name suffix, E.164, password change |
| `unsavedChangesGuard` | `core/guards/` | `canDeactivate` confirmation for dirty forms |

Deviations, called out per §10:

- **`p-tabs`, not `p-tabView`.** `TabView` was deprecated in PrimeNG 18 and is
  not in v21. The page uses `p-tabs`/`p-tablist`/`p-tab`/`p-tabpanels`, same as
  `recipe-detail`. `[lazy]="true"` renders each panel on its first visit and
  keeps it mounted afterwards, so form state survives tab switches.
- **Tab surface tokens via `[dt]`.** Transparent tablist/tabpanel backgrounds
  are set through the component's design-token input rather than a
  `::ng-deep` override (§14). That way the white surfaces still come from the
  `p-card`s inside each tab.
- **`libphonenumber-js` over `ngx-intl-tel-input`.** The latter pulls in
  `ngx-bootstrap` and its own dropdown, which would be a second overlay system
  next to PrimeNG's. `libphonenumber-js/max` (the full-metadata build) adds
  about 55 kB gzip, but only to the lazy account-settings chunk.
- Phone numbers are stored as E.164 from now on. The quote form still keeps its
  local two-country `PHONE_COUNTRIES` list. Moving it onto `app-phone-input` is
  a follow-up, not part of this change.

---

## 19. Identity & Access Management and Finance Settings — IMPLEMENTED

Replaces the old `user-management` / `roles-management` screens (deleted, with
their `UserService` / `RoleService` / `PermissionService` and the admin-only
types in `user.model.ts` / `role.model.ts`). Backend contract and handoff:
`docs/api/iam-and-finance.md`. Every new endpoint uses the V8 envelope
(`ApiEnvelope` / `CatalogPage`) — never the legacy `ApiResponse` / `Page`.

| Piece | Path | Notes |
|---|---|---|
| Contracts | `core/models/iam.models.ts`, `core/models/finance.models.ts` | Mirror of the doc; change together |
| Permission codes | `core/constants/permissions.ts` | `MODULE.RESOURCE.ACTION`; only the codes a screen branches on |
| `AuthorizationService` | `core/services/authorization.service.ts` | Single "may the user do X?" answer. SUPER_ADMIN → all; JWT `permissions` claim is authoritative when present; `LEGACY_ROLE_PERMISSIONS` only for tokens minted before the claim |
| `permissionGuard` | `core/guards/permission.guard.ts` | `data.permissions` is any-of |
| `*appCan` | `shared/directives/can.directive.ts` | Structural; string or list |
| Sidebar | `layout/app-menu.ts` | `buildNavSections(can, canManageCatalogs)` — items filtered by permission |
| `PermissionMatrixComponent` | `pages/cronos/admin/shared/permission-matrix/` | Module → resource → action chips; dependency closure on grant, dependent closure on revoke (announced inline); `grant` and `grant-deny` (user overrides) modes; inherited cells come from roles/groups |
| Users | `pages/cronos/admin/users/{user-list,user-create,user-detail}` | Server-paged list with KPI filters + bulk status/roles + CSV export; 3-step create wizard (async availability, avatar crop, invitation vs temporary password); detail tabs Profile / Access (live server preview + SoD) / Security (reset, force change, 2FA reset, invitation, sessions, sign-in history) / Activity |
| Roles | `pages/cronos/admin/roles/{role-list,role-editor}` | Clone, activate/deactivate, delete-when-unused, colour, groups, members tab |
| Permission groups | `pages/cronos/admin/permission-groups/` | Groups CRUD + read-only permission catalog tab |
| Audit log | `pages/cronos/admin/audit-log/` + `shared/audit-event-table/` | Same table embedded in the user Activity tab (actor vs target perspective) |
| Security policy | `pages/cronos/admin/security-policy/` | Bounds mirrored from the doc; confirms before weakening |
| Finance | `pages/cronos/finance/` | `/cronos/configuracion/finanzas?tab=overview|currencies|tax-rates` |
| `FinanceDefaultsStore` | `core/services/finance/finance-defaults.store.ts` | App-wide defaults (currency, IVA %, prices-include-tax). Quote create pre-fills from it; quote create/edit list catalog currencies and IVA presets. Falls back to MXN / 0 % if the API is unreachable |

Rules introduced here:

- **Every privileged write is justified and versioned.** Access changes, member
  changes, 2FA resets and status changes carry a reason (`ReasonDialogComponent`,
  `ChangeStatusDialogComponent`); every write echoes `version` and a
  `409 CONCURRENT_MODIFICATION` reloads the record instead of overwriting.
- **No self-lockout.** An admin cannot change their own status (except to
  ACTIVE), access, credentials or sessions from the admin screens; the server
  enforces the same rule.
- **Passwords are never typed or shown by administrators** — invitation link or
  emailed temporary password only.
- **Status pills**: `.status-pill-info` / `-warn` / `-danger` were added as
  siblings of the existing pills (§10), not a parallel badge system.
- **Sticky save bar** (`.sticky-save-bar`, `styles.scss`) is the pattern for
  long editors with a dirty state (access panel, role editor, security policy,
  finance settings).
- Input-dependent loads in child components run in `ngOnInit`, never in the
  constructor — reading a required signal input there throws `NG0950`.
