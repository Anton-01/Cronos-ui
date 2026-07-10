# Cronos UI — Migration Context

> **Purpose of this file:** Single source of truth for the Metronic → PrimeNG migration.
> It records the strict rules, the technology stack, the architecture, key decisions, and
> the progress log. Update it at the end of every work session so any future conversation
> (human or LLM) can resume with full context.

---

## 1. Project Overview

- **Product:** Cronos — management system for a specialized bakery business
  (quotes, recipes, ingredients, fixed costs, measurement units, allergens, users/roles/permissions).
- **Repository:** `Anton-01/cronos-ui`
- **Migration branch:** `claude/metronic-primeng-migration-7hnxoz`
- **Status:** ✅ **MIGRATION COMPLETE** (all 4 phases executed and validated on 2026-07-09/10).
  The app is 100% PrimeNG; zero Metronic traces remain in source, styles, assets, or dependencies.

## 2. Strict Rules (all enforced)

1. **Zero Metronic:** ✅ No Metronic CSS classes, SCSS, JS plugins, assets, or dependencies remain.
   Verified by grep audit (`metronic|keenicon|keenthemes|kt_|data-kt|sweetalert|ng-bootstrap|apexcharts|datatables` → 0 hits in `src/`).
2. **PrimeNG purism:** ✅ All UI is native PrimeNG (see §4). The only non-Prime UI library kept is
   `ngx-image-cropper` (create-user avatar crop — PrimeNG has no equivalent; documented exception).
3. **Advanced DataTables:** ✅ Every list view uses native `p-table` with sortable columns,
   per-column filter menus (`p-columnFilter display="menu"`), dropdown filters for enum columns,
   global search, paginator with page-size options, and loading state.
4. **English-only source code:** ✅ All components, classes, folders, variables, and comments are
   English. UI strings remain Spanish (content, not code). Route URLs keep their original Spanish
   paths (`/cronos/recetas`, …) on purpose: they are user-facing/bookmarkable and referenced by
   shared public links.
5. **Latest stable versions:** ✅ Angular 21.2 + PrimeNG 21.1 (see §5).
6. **Global styles:** ✅ `styles.scss` contains only base typography, PrimeNG token bridge for
   PrimeFlex, and dark-mode helpers. `angular.json` loads only `styles.scss`, PrimeIcons, PrimeFlex.

## 3. Technology Stack (final)

| Item | Value |
|---|---|
| Angular | 21.2.x (NgModule root `app.module.ts` + 100% standalone feature components, signals, OnPush) |
| UI | PrimeNG 21.1.x, `@primeng/themes` (Aura preset, dark mode via `.app-dark` selector), PrimeIcons 7, PrimeFlex 4 |
| State | Angular signals (`signal`/`computed`/`toSignal`); `ProfileStateService` for current user |
| Toasts | Global `<p-toast>` in app root; `ToastService`/`AlertService` are facades over `MessageService` (public APIs unchanged for consumers) |
| Confirmations | Global `<p-confirmdialog>`; `ConfirmService` = promise-based facade over `ConfirmationService` |
| Dates/Currency | Native `Intl` (`toLocaleDateString('es-MX')`, `Intl.NumberFormat`) |
| Exception | `ngx-image-cropper` (avatar cropping) |
| Bundle | Initial 1.18 MB raw / ~210 KB gzip (was 2.62 MB at Metronic baseline). `src/assets` 48 KB (was 74 MB) |
| Build | `browser` builder, ESLint 9, Karma configured (no spec files exist — starter shipped none) |

## 4. Architecture Map

- `src/app/layout/` — `MainLayoutComponent`: fixed topbar (logo, dark-mode toggle, user `p-menu`),
  `p-panelmenu` sidebar (menu model in `layout/app-menu.ts`, admin items filtered by
  `TokenService.hasRole`), `p-drawer` mobile nav, `p-breadcrumb` + page title fed by `PageInfoService`.
- `src/app/core/` — real services (auth, token, user, role, permission, profile signal store,
  domain services), functional guards (`authGuard`, `guestGuard`, `roleGuard`), interceptors,
  `PageInfoService` (signal-based; `updateTitle`/`updateBreadcrumbs`), `ThemeService`
  (`.app-dark` class + `cronos_theme_mode` localStorage; pre-boot script in `index.html`).
- `src/app/shared/` — `ToastService`, `AlertService`, `ConfirmService`, `StatusToggleComponent`
  (`p-toggleswitch` + confirm + PATCH `/api/v1/{endpoint}/{id}/status`).
- `src/app/pages/auth/` — `AuthLayoutComponent` (centered card), login (2FA + Google/Facebook OAuth),
  register, forgot-password (informational — the old flow used the deleted fake demo backend),
  logout (`performLogout`), oauth2-callback.
- `src/app/pages/dashboard/` — welcome + quick-link cards.
- `src/app/pages/errors/` — `ErrorPageComponent` at `error/:code` (404/500).
- `src/app/pages/public/` — shared-recipe & shared-quote public pages + their layouts (self-contained
  custom SCSS; badges/containers replaced with PrimeNG-token equivalents).
- `src/app/pages/cronos/` — feature views (all standalone, English names):
  `categories`, `allergens`, `unit-types`, `measurement-units`, `ingredients` (+ `ingredient-form`),
  `fixed-costs`, `recipes` (+ `recipe-form`, `recipe-detail` with p-tabs: ingredients/fixed-costs/
  instructions/files/shares + financial panel with cost breakdown & yield simulation),
  `quotes` (+ `quote-form`, `quote-edit` with terminal-status read-only lock, `quote-detail`),
  `account` (`my-account`, `security` with sessions/login-history/2FA), `admin`
  (`user-management` + `create-user-modal`, `roles-management` with permission matrix).

## 5. Key Decisions Log

| Date | Decision |
|---|---|
| 2026-07-09 | **Angular 21 + PrimeNG 21** (not Angular 22): PrimeNG stable 21.1.9 pins `@angular/core ^21.0.7`; PrimeNG 22 still RC. Bump both majors together when PrimeNG 22 ships stable. |
| 2026-07-09 | Route URLs stay Spanish (user-facing, bookmarkable, used in shared public links). Code identifiers are English. |
| 2026-07-09 | Catalog tables load up to 1000 rows and use client-side p-table filtering/sorting/pagination (full native filter capabilities; datasets are small per-user catalogs). |
| 2026-07-09 | `ToastService`/`AlertService` keep their public APIs as facades over `MessageService`, so ~40 consumer call sites needed no changes. |
| 2026-07-09 | `ngx-image-cropper` kept as the single documented non-Prime UI exception. |
| 2026-07-10 | Metronic forgot-password flow (fake backend demo) replaced by an informational page; backend has no reset endpoint yet. |
| 2026-07-10 | Project renamed `demo1` → `cronos-ui` (package.json, angular.json, dist path). Environments reduced to `{ production, apiUrl }`. |
| — | Build quirks: font inlining disabled (sandbox proxy blocks Google Fonts at build time); budgets initial warn 2 MB / error 5 MB, component styles warn 8 kB / error 16 kB. |

## 6. Dependency State (final)

**dependencies:** `@angular/*` 21, `@primeng/themes`, `primeng`, `primeicons`, `primeflex`,
`ngx-image-cropper`, `rxjs`, `tslib`, `zone.js`.

**Removed during migration:** Metronic template code (`_metronic/`, demo modules, demo pages),
bootstrap, @ng-bootstrap/ng-bootstrap, @popperjs/core, jquery, datatables.net(-bs5),
angular-datatables, @angular/material, @angular/localize, angular-in-memory-web-api (+`_fake/`),
apexcharts, ng-apexcharts, sweetalert2, @sweetalert2/ngx-sweetalert2, ngx-translate (core+loader),
ng-inline-svg-2, ngx-clipboard, clipboard, moment, object-path, prismjs, prism-themes, nouislider,
animate.css, line-awesome, socicon, bootstrap-icons, @fortawesome/fontawesome-free, KeenIcons,
webpack RTL toolchain (+`rtl.config.js`, `ngcc.config.js`), ~74 MB of Metronic assets.

## 7. Phase Summary

| Phase | Scope | Status |
|---|---|---|
| 0 | `context.md` created | ✅ 2026-07-09 |
| 1 | Angular 18→19→20→21 (`ng update` per major, build verified each step); PrimeNG 21 base installed (`providePrimeNG` + Aura); safe dep purge | ✅ 2026-07-09 |
| 2 | PrimeNG shell (`MainLayoutComponent`), `_metronic/**` and demo modules deleted, theme/dark mode, error pages, PrimeNG dashboard | ✅ 2026-07-09 |
| 3 | Every view migrated to PrimeNG + renamed to English; toasts/confirms centralized; auth rebuilt; public pages converted | ✅ 2026-07-10 |
| 4 | Final sweep: Metronic Sass/assets deleted, `styles.scss` PrimeNG-only, last deps removed, project renamed, grep audit = zero traces, full headless-browser validation | ✅ 2026-07-10 |

**Validation gates used throughout:** `ng build` green after every step + headless Chromium smoke
tests with mocked API (login redirect, shell navigation, tables with filters/paginator, dialogs,
dark mode, user menu, 404, all feature routes render without page errors).

## 8. Coding Conventions

- English-only identifiers and comments. UI strings in Spanish.
- Standalone components, `inject()`, signals, `ChangeDetectionStrategy.OnPush`.
- PrimeNG modules imported per component; no shared UI mega-module.
- Styling: PrimeNG theme tokens (`--p-*`) + PrimeFlex utilities; component SCSS only when needed.
- Tables: the `categories.component` is the reference pattern for advanced p-table CRUD views.
- New shared behavior goes through the facades (`ToastService`, `AlertService`, `ConfirmService`).

## 9. Pending / Future Work

- Bump to Angular 22 + PrimeNG 22 when PrimeNG 22 leaves RC (single `ng update` + npm install).
- Real password-reset flow when the backend exposes an endpoint (replace informational page).
- Unit tests: Karma is configured but the project has no spec files (inherited from the starter).
- Optional: self-host the Inter font (currently Google Fonts `<link>`; build-time inlining disabled).

## 10. Progress Log

| Date | Session summary |
|---|---|
| 2026-07-09 | Repo audited. Version decision recorded. `context.md` created (Phase 0). |
| 2026-07-09 | **Phase 1:** Angular 18→21 chain (blockers removed step by step: legacy jQuery DataTables pages deleted, fake in-memory backend removed, apexcharts widgets + widgets-examples demo module deleted, @angular/material removed, ng-bootstrap/ngx-sweetalert2 bumped transitionally). PrimeNG 21 + Aura installed and wired. Validated: build + headless browser boot. |
| 2026-07-09 | **Phase 2:** New PrimeNG shell (topbar/sidebar/breadcrumbs/dark mode), signal `PageInfoService`, `ThemeService`, PrimeNG dashboard + error pages. Deleted `_metronic/**`, demo modules, RTL toolchain. Rescued real `sign-in-method` component from demo module. Fixed toast/alert overlays intercepting topbar clicks; styles order so Bootstrap couldn't override PrimeFlex. Validated in browser (nav, dark mode, menus, 404). |
| 2026-07-09/10 | **Phase 3:** Shared infra (Toast/Alert facades over MessageService, ConfirmService over ConfirmationService, StatusToggle on p-toggleswitch). All views migrated + renamed to English: categories, allergens, unit-types, measurement-units, ingredients(+form), fixed-costs, recipes(+form+detail with tabs/financial panel), quotes(+form+edit+detail), account (my-account, security+2FA), admin (user-management+create modal, roles-management). Auth rebuilt as standalone PrimeNG pages (`pages/auth`), `modules/` deleted entirely; guards moved to core. Public shared pages converted to PrimeNG tokens. |
| 2026-07-10 | **Phase 4:** sweetalert2/moment/fontawesome/localize/bootstrap uninstalled; `styles.scss` PrimeNG-only; `src/assets` reduced 74 MB → 48 KB (Cronos logos + splash only); environments minimized; project renamed to `cronos-ui`; grep audit → zero Metronic traces; bundle 2.62 MB → 1.18 MB. Full app smoke test: 13 routes validated headless, no page errors. **Migration complete.** |
