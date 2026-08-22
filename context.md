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

### 16.5 Not yet done — UI string translation

The header contract above makes the **backend** speak the user's language.
Cronos' own UI copy is still hardcoded Spanish (§9 tracks that migration).
When UI translation lands, `@ngx-translate/core` is the intended library, and
it consumes `LanguageService` rather than holding a second copy of the state:

```bash
npm install @ngx-translate/core @ngx-translate/http-loader
```

```ts
// app.module.ts — providers
provideTranslateService({
  loader: provideTranslateHttpLoader({ prefix: './assets/i18n/', suffix: '.json' }),
  fallbackLang: 'es-MX',
}),
```

```ts
// language.service.ts — the one new side effect, inside apply()
private readonly translate = inject(TranslateService);

private apply(language: AppLanguage): void {
  this.current.set(language);
  localStorage.setItem(LANGUAGE_STORAGE_KEY, language);
  document.documentElement.lang = language;
  this.translate.use(language);   // ← added; bundle files are en.json / es-MX.json
}
```

Bundle filenames must match the tag exactly (`en.json`, `es-MX.json`) so one
identifier drives the header, the `<html lang>` and the bundle lookup. Do not
introduce a second locale enum for translation keys.
