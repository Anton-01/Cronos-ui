# Cronos UI — Migration Context

> **Purpose of this file:** Single source of truth for the Metronic → PrimeNG migration.
> It records the strict rules, the technology stack (current and target), the codebase
> inventory, the phase plan, and the progress log. Update it at the end of every work
> session so any future conversation (human or LLM) can resume with full context.

---

## 1. Project Overview

- **Product:** Cronos — management system for a specialized bakery business
  (quotes, recipes, ingredients, fixed costs, measurement units, allergens, users/roles/permissions).
- **Repository:** `Anton-01/cronos-ui`
- **Working branch for the migration:** `claude/metronic-primeng-migration-7hnxoz`
- **Origin:** The app was bootstrapped from the **Metronic 8 "demo1" Angular starter kit**,
  which locked the project to Angular 18 and dragged in a large amount of template code,
  styles, and dependencies that are not needed.

## 2. Migration Goal

Total and radical migration: **eradicate every trace of Metronic** (SCSS, CSS classes,
scripts, assets, template components, dependencies) and rebuild the visual/component
architecture **strictly on PrimeNG**.

## 3. Strict Rules (non-negotiable)

1. **Zero Metronic:** No Metronic CSS classes, SCSS files, JS plugins, assets, or
   `package.json` dependencies may remain at the end of the migration.
2. **PrimeNG purism:** Third-party UI libraries are removed and replaced strictly by
   native PrimeNG modules (dialogs → `p-dialog`/DialogService, toasts/alerts →
   `p-toast`/ConfirmationService, icons → PrimeIcons, etc.).
3. **Advanced DataTables:** Every table migrates to native `p-table` with **advanced
   filters, pagination, and sorting** using PrimeNG's built-in capabilities
   (no jQuery DataTables, no angular-datatables).
4. **English-only source code:** Spanish is forbidden in source code. All component,
   variable, interface, class, method names **and comments** must be 100% English.
   (User-facing UI text may remain Spanish — it is content, not code.)
5. **Latest stable versions:** Target the latest stable Angular supported by the stable
   PrimeNG release (see §5 "Version decision").
6. **Global styles:** `angular.json` / `styles.scss` must end up containing only the
   PrimeNG theme (via `@primeng/themes` preset), PrimeFlex utilities, and PrimeIcons.

## 4. Technology Stack

### Current (as of 2026-07-09, after Phase 1)

| Item | Value |
|---|---|
| Angular | **21.2.x** (upgraded 18→19→20→21 via `ng update`; TypeScript 5.9, zone.js 0.15) |
| UI (new) | **PrimeNG 21.1.9** + `@primeng/themes` 21 (Aura preset, `darkModeSelector: '.app-dark'`) + PrimeIcons 7 + PrimeFlex 4 — configured in `app.module.ts` (`providePrimeNG`) and `angular.json` styles |
| UI (legacy, dies in Phase 2) | Metronic 8 shell (Bootstrap 5.3, ng-bootstrap **20**, KeenIcons, Metronic Sass, ~74 MB `src/assets`) |
| Removed in Phase 1 | jQuery/datatables.net/angular-datatables (+ legacy `pages/{user,role,permission}` listings), apexcharts/ng-apexcharts (+ Metronic chart widgets + `modules/widgets-examples`), `@angular/material`, `angular-in-memory-web-api` (+ `src/app/_fake`) |
| Transitional bumps | ngx-sweetalert2 → 15 (removed in Phase 3), ng-bootstrap → 20 (removed in Phase 2) |
| Build | `@angular-devkit/build-angular:browser` builder, Karma tests, ESLint 9. Font inlining disabled (sandbox proxy blocks Google Fonts at build time). Budgets: initial warn 2 MB / error 5 MB; component styles warn 8 kB / error 16 kB |

### Target (after migration)

| Item | Value |
|---|---|
| Angular | **21.x** (latest stable supported by stable PrimeNG — see §5) |
| UI | **PrimeNG 21.x** + `@primeng/themes` (Aura preset) + PrimeIcons + PrimeFlex 4 |
| Tables | Native `p-table` with column filters, paginator, sortable columns, global search |
| Dialogs / alerts | `p-dialog`, `DynamicDialog`, `p-toast` (MessageService), `p-confirmdialog` (ConfirmationService) |
| Dates | Native `Intl` / Angular `DatePipe` (moment removed) |
| HTTP mocks | Removed (`_fake/`, angular-in-memory-web-api) |

## 5. Version Decision (recorded 2026-07-09)

- Latest stable Angular on npm: **22.0.6**. Latest stable PrimeNG: **21.1.9**, whose
  peer dependency is `@angular/core ^21.0.7`. PrimeNG 22 is still **RC**.
- **Decision:** migrate to **Angular 21 + PrimeNG 21** (both stable, mutually supported).
  Bump to Angular 22 + PrimeNG 22 later as a routine minor task once PrimeNG 22 is stable.

## 6. Codebase Inventory

### Business code (KEEP — refactor to PrimeNG + English)

- `src/app/pages/cronos/**` — real app: `auth` (login/register/oauth2-callback),
  `cotizaciones` (quotes), `recetas` (recipes), `ingredientes`, `categorias`,
  `alergenos`, `costos-fijos`, `tipos-unidad`, `unidades-medida`, `cuenta`,
  `admin/user-management`, `admin/roles-management`.
  ⚠ Folder/component names are in Spanish → must be renamed to English (Rule 4).
- `src/app/pages/dashboard`, `src/app/pages/public` — review, keep what is real.
- `src/app/core/**` — services/guards/interceptors (real).
- `src/app/shared/**` — shared utilities (review for Metronic coupling).
- `src/app/modules/auth`, `src/app/modules/errors` — routed and real (Metronic-derived;
  refactor in Phase 2/3).

### Legacy / template code (DELETE during migration)

- `src/app/_metronic/**` (~2.5 MB) — layout, partials, kt directives, shared module.
- `src/app/_fake/**` + `angular-in-memory-web-api` — fake backend.
- `src/app/modules/{apps,crud,account,profile,widgets-examples,wizards,i18n}` — demo modules.
- `src/app/pages/{builder,user,role,permission}` — Metronic demo pages; `user`/`role`/
  `permission` listings use jQuery DataTables and are superseded by `pages/cronos/admin/**`.
- `src/assets/{sass,css,plugins,media}` (~74 MB) — Metronic styles/plugins/media
  (keep only real brand assets, e.g. Cronos logos).

### Known Metronic coupling points in business code (to break in Phase 2)

- `PageInfoService` (`_metronic/layout/core/page-info.service`) — imported by ~14 files.
- `SharedModule` (`_metronic/shared/shared.module`) — 4 imports.
- `_metronic/partials` (`ModalComponent`, `ModalConfig`, Widgets/Modals modules) — 2 imports.
- `LayoutService` (`_metronic/layout`) — 1 import.
- Metronic CSS utility classes (`kt_*`, `btn btn-*`, `card`, `d-flex`, `fv-row`, …)
  spread across all templates → replaced in Phases 2–3.

## 7. Dependency Disposition

| Package | Verdict | Replacement / Note | Removal phase |
|---|---|---|---|
| `@angular/*` 18 | **Upgrade** | Angular 21 (`ng update`, one major at a time) | 1 |
| `@angular/material` | Remove | Unused (only a stray `mat-typography` class in `index.html`) | 1 |
| `angular-in-memory-web-api` + `src/app/_fake` | Remove | Real API already in use | 1 |
| `prismjs`, `prism-themes`, `@types/prismjs` | Remove | Unused outside Metronic demo | 1 |
| `nouislider` | Remove | Unused; if ever needed → `p-slider` | 1 |
| `primeng`, `@primeng/themes`, `primeicons`, `primeflex` | **Add** | Core of the new UI | 1 |
| `bootstrap`, `@ng-bootstrap/ng-bootstrap`, `@popperjs/core` | Remove | PrimeNG components + PrimeFlex | 2 |
| `object-path` | Remove | Used by Metronic `LayoutService` only | 2 |
| `@ngx-translate/*` | Remove | App UI is Spanish-only content; Metronic i18n demo goes away | 2 |
| `ng-inline-svg-2` | Remove | PrimeIcons / plain `<img>` for logos | 2 |
| `apexcharts`, `ng-apexcharts` | Remove | Metronic widgets only; real charts (if any) → `p-chart` | 2 |
| `animate.css`, `line-awesome`, `socicon`, `bootstrap-icons`, `@fortawesome/fontawesome-free` | Remove | PrimeIcons | 2 |
| `jquery`, `datatables.net*`, `angular-datatables`, `@types/jquery`, `@types/datatables.net` | Remove | Native `p-table` | 3 |
| `sweetalert2`, `@sweetalert2/ngx-sweetalert2` | Remove | `p-toast` + `p-confirmdialog` (Message/Confirmation services) | 3 |
| `ngx-clipboard`, `clipboard` | Remove | Native `navigator.clipboard` (used in 2 cronos views) | 3 |
| `moment` | Remove | Angular `DatePipe` / native `Intl` | 3 |
| `ngx-image-cropper` | **Keep (exception)** | No PrimeNG equivalent; used by create-user modal. Revisit at the end | — |
| `rtl.config.js`, `ngcc.config.js`, webpack RTL toolchain | Remove | Metronic RTL build leftovers | 1 |

> Rule for removals: a dependency is uninstalled **in the same commit** that deletes its
> last consumer, so the build stays green at every step.

## 8. Migration Phases

| Phase | Scope | Status |
|---|---|---|
| **0** | Create this `context.md` | ✅ Done (2026-07-09) |
| **1** | Angular 18 → 21 upgrade chain; install PrimeNG 21 base (theme preset, PrimeIcons, PrimeFlex); remove safe unused deps; keep build green | ✅ Done (2026-07-09) — validated with `ng build` + headless-browser smoke test (app boots, redirects to `/auth/login`, renders) |
| **2** | Rebuild core layout with PrimeNG; delete `_metronic/**` and demo modules | ✅ Done (2026-07-09) — new `src/app/layout/MainLayoutComponent` (topbar + p-panelmenu sidebar + p-drawer mobile + p-breadcrumb + user p-menu + dark-mode toggle). `_metronic/**` fully deleted. Validated in headless browser: navigation, titles/breadcrumbs, dark mode, user menu, 404 page. **Deviation:** Metronic compiled Sass + KeenIcons font stay in `styles.scss` until Phase 3 finishes (business views still use Bootstrap/`ki-*` classes); they are removed with the last migrated view |
| **3** | View-by-view refactor: all tables → advanced `p-table` (column filters, paginator, sorting, global search); forms → PrimeNG form components; sweetalert2 → toast/confirm services; rename Spanish identifiers/folders to English | ⬜ Pending |
| **4** | Final sweep: grep-verify zero Metronic traces (`kt_`, `keenicons`, `metronic`, Bootstrap classes), dependency audit, bundle-size check, README update | ⬜ Pending |

## 9. Coding Conventions (apply to all new/refactored code)

- English-only identifiers and comments (Rule 4). UI strings may be Spanish.
- Standalone components; `inject()` over constructor injection; signals
  (`signal`/`computed`/`toSignal`) for component state — matches the newest code already
  in the repo (e.g. roles-management).
- PrimeNG imports per-component (standalone imports array), no monolithic shared UI module.
- Styling: PrimeNG theme tokens + PrimeFlex utilities; component SCSS only when strictly
  necessary (respect the 4 kB per-component style budget).
- Naming: `feature-name.component.ts`, English folder names (`quotes`, `recipes`,
  `ingredients`, `fixed-costs`, `measurement-units`, `unit-types`, `allergens`, `account`).

## 10. Progress Log

| Date | Session summary |
|---|---|
| 2026-07-09 | Repo audited. Version decision recorded (Angular 21 + PrimeNG 21). `context.md` created (Phase 0). Phase 1 execution plan delivered. |
| 2026-07-09 | **Phase 2 executed and validated.** New PrimeNG shell: `layout/main-layout.component` (fixed topbar, p-panelmenu sidebar — General/Catálogos/Operación/Cuenta/Administración with role-filtered admin items, p-drawer for mobile, p-breadcrumb + page title fed by new signal-based `core/services/page-info.service` — same `updateTitle`/`updateBreadcrumbs` API, so the 14 business consumers only changed the import path). New `core/services/theme.service` (`.app-dark` class + `cronos_theme_mode` localStorage; pre-boot script in `index.html`). New standalone PrimeNG `pages/dashboard` (welcome + quick links) and `pages/errors/error-page.component` (`error/:code`). Deleted: `_metronic/**`, `modules/{apps,crud,account,profile,wizards,i18n,errors}`, `pages/builder`, RTL/webpack toolchain. Rescued: real `sign-in-method` component (password change + 2FA) moved from demo `modules/account` into `pages/cronos/cuenta/seguridad/`. Removed deps: ng-bootstrap (+popperjs), ngx-translate ×2, ng-inline-svg-2, ngx-clipboard, clipboard, @sweetalert2/ngx-sweetalert2 (wrapper only; sweetalert2 core stays until Phase 3), object-path, socicon, line-awesome, bootstrap-icons, animate.css, prismjs/prism-themes, nouislider, webpack toolchain. NgbTooltip→pTooltip in 2 admin components. Bug fixed: toast/alert fixed containers intercepted topbar clicks (pointer-events). Styles order: `styles.scss` before PrimeFlex so Bootstrap can't override the PrimeFlex grid. Layout uses theme-flipping tokens (`--p-content-background`, `--p-surface-50/950`). Validation: build green; headless Chromium — sidebar nav, breadcrumbs, dark/light toggle, user menu, 404, business views render inside new shell. Bundle: 2.59 MB. FontAwesome kept temporarily (2 cotizaciones templates). |
| 2026-07-09 | **Phase 1 executed and validated.** Angular upgraded 18→19→20→21 (one `ng update` per major, build verified at each step). Removed: jQuery/DataTables stack + legacy `pages/{user,role,permission}` (superseded by `pages/cronos/admin`), apexcharts + all Metronic chart/mixed/tiles widgets that used it + `modules/widgets-examples`, fake in-memory backend (`_fake/`, `angular-in-memory-web-api`), unused `@angular/material`. Transitional bumps: ng-bootstrap→20, ngx-sweetalert2→15. Installed PrimeNG 21 + Aura theme preset + PrimeIcons + PrimeFlex; wired via `providePrimeNG` in `app.module.ts` and `angular.json` styles. Build fixes: relaxed style budgets, disabled build-time font inlining. Validation: `ng build` green; headless Chromium smoke test — app bootstraps, splash clears, login page renders (only console error is sandbox-blocked Google Fonts). Note: initial bundle temporarily 3.0 MB (PrimeNG coexists with Metronic Sass until Phase 2). |
