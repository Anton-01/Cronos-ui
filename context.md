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
| Tailwind CSS | **not installed** — to be added (v4, zero-config `@import "tailwindcss"` + PostCSS plugin) |
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
on. **Do not replace it with a `lara` preset.** Instead, deepen `CronosPreset`'s
dark-mode branch to hit the "deep blacks, sophisticated grays" target:

- Extend `semantic.colorScheme.dark` in `CronosPreset` — do not hand-roll a
  parallel dark palette in `styles.scss`.
- Keep the existing `.app-dark` selector as the single dark-mode toggle
  (`darkModeSelector: '.app-dark'` in `providePrimeNG`). Never introduce a second
  dark-mode mechanism (no `prefers-color-scheme` media query overrides, no
  duplicate `:root[data-theme]` scheme).
- Background depth for dark mode should route through `--p-surface-950` /
  `--p-surface-900` tokens (already bridged to `--surface-ground` /
  `--surface-card` in `styles.scss`), not literal hex/`#000` values.
- Never leave a view relying on default `--p-surface-0` (pure white) as its main
  background. Large surfaces use `--p-surface-50` (light) / `--p-surface-950`
  (dark); cards flatten to hairline borders instead of stacking shadows on white
  (see existing `.layout-content .p-card` rule in `styles.scss` — follow that
  pattern, don't fight it).

---

## 3. Styling Rules — PrimeFlex vs. Tailwind, division of labor

Both stay. They are not redundant if scoped correctly:

- **PrimeFlex** → structural layout only: `p-grid`/`flex`, `col-*`, `gap-*`,
  `align-items-*`, `justify-content-*`. Anything that mirrors how PrimeNG's own
  component internals expect spacing.
- **Tailwind** → everything else: one-off spacing/sizing not covered by
  PrimeFlex tokens, typography utilities, dark-mode fine-tuning (`dark:` variant
  reads off `.app-dark`, configure `darkMode: 'selector'` pointed at
  `.app-dark` — not the default `media` strategy, or Tailwind's dark mode and
  PrimeNG's dark mode will drift out of sync), and interaction-state utilities
  PrimeFlex doesn't provide (`hover:`, `focus-visible:`, `active:`).
- Never use Tailwind's `bg-white` / `bg-black` literals — use the `p-` CSS
  variable tokens (`var(--p-surface-*)`) via Tailwind's `theme()` / arbitrary
  value syntax (`bg-[var(--p-surface-950)]`) so colors stay theme-reactive.
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
- Scope reality check: Spanish UI copy is **not** confined to the modal legend
  in section 5 — it's present across roughly 20 files including auth
  (`login`, `register`), `dashboard`, `layout/main-layout`, `quotes` (list,
  form, edit, detail), `recipes` (list, detail, form), `admin` (user
  management, roles management, create-user modal), and `index.html`. Treat
  the full-English rule as an incremental migration applied file-by-file as
  each view is touched for the redesign — not a single mass find/replace pass
  — so every string is verified in context rather than blindly translated.

---

## 10. Working Agreement

Component-by-component execution proceeds only after this file is approved.
Each future change should cite which section of this file it satisfies (e.g.
"per §5, dialog border-radius now reads from CronosPreset"). If a change
requires deviating from a rule here, that deviation is called out explicitly
and this file is updated in the same PR — it never drifts silently out of
sync with the code.