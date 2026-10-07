import { inject } from '@angular/core';
import { Router, Routes, UrlTree } from '@angular/router';
import { roleGuard } from '../core/guards/role.guard';
import { permissionGuard } from '../core/guards/permission.guard';
import { PERMISSIONS } from '../core/constants/permissions';
import { unsavedChangesGuard } from '../core/guards/unsaved-changes.guard';
import { CategoryType } from '../core/models/category.model';
import { AccountSettingsTab } from '../core/models/account.model';

const ACCOUNT_SETTINGS_PATH = '/cronos/cuenta/configuracion';

/** Old standalone account pages now open the matching Account Settings tab. */
function redirectToAccountTab(tab: AccountSettingsTab): () => UrlTree {
  return () => inject(Router).createUrlTree([ACCOUNT_SETTINGS_PATH], { queryParams: { tab } });
}

const Routing: Routes = [
  {
    path: 'dashboard',
    loadComponent: () => import('./dashboard/dashboard.component').then((m) => m.DashboardComponent),
  },
  // ─── Cronos CRUD Routes ───
  {
    path: 'cronos/tipos-unidad',
    loadComponent: () => import('./cronos/unit-types/unit-types.component').then(m => m.UnitTypesComponent),
  },
  // ─── Categorías: one grid component, one route per CategoryType ───
  {
    path: 'cronos/categorias',
    redirectTo: 'cronos/categorias/productos',
    pathMatch: 'full',
  },
  {
    path: 'cronos/categorias/productos',
    loadComponent: () => import('./cronos/categories/category-list.component').then(m => m.CategoryListComponent),
    data: { type: 'PRODUCT' satisfies CategoryType },
  },
  {
    path: 'cronos/categorias/ingredientes',
    loadComponent: () => import('./cronos/categories/category-list.component').then(m => m.CategoryListComponent),
    data: { type: 'INGREDIENT' satisfies CategoryType },
  },
  {
    path: 'cronos/alergenos',
    loadComponent: () => import('./cronos/allergens/allergens.component').then(m => m.AllergensComponent),
  },
  {
    path: 'cronos/unidades-medida',
    loadComponent: () => import('./cronos/measurement-units/measurement-units.component').then(m => m.MeasurementUnitsComponent),
  },
  {
    path: 'cronos/ingredientes',
    loadComponent: () => import('./cronos/ingredients/ingredients.component').then(m => m.IngredientsComponent),
  },
  {
    path: 'cronos/ingredientes/nuevo',
    loadComponent: () => import('./cronos/ingredients/ingredient-editor/ingredient-editor.component').then(m => m.IngredientEditorComponent),
    canDeactivate: [unsavedChangesGuard],
  },
  { path: 'cronos/ingredientes/editar/:id', redirectTo: 'cronos/ingredientes/:id' },
  {
    path: 'cronos/ingredientes/:id',
    loadComponent: () => import('./cronos/ingredients/ingredient-editor/ingredient-editor.component').then(m => m.IngredientEditorComponent),
    canDeactivate: [unsavedChangesGuard],
  },
  // ─── Recetas ───
  {
    path: 'cronos/recetas',
    loadComponent: () => import('./cronos/recipes/recipes.component').then(m => m.RecipesComponent),
  },
  {
    path: 'cronos/recetas/nueva',
    loadComponent: () => import('./cronos/recipes/recipe-studio/recipe-studio.component').then(m => m.RecipeStudioComponent),
    canDeactivate: [unsavedChangesGuard],
  },
  { path: 'cronos/recetas/editar/:id', redirectTo: 'cronos/recetas/:id' },
  {
    path: 'cronos/recetas/:id',
    loadComponent: () => import('./cronos/recipes/recipe-studio/recipe-studio.component').then(m => m.RecipeStudioComponent),
    canDeactivate: [unsavedChangesGuard],
  },
  // ─── Cotizaciones ───
  {
    path: 'cronos/cotizaciones',
    loadComponent: () => import('./cronos/quotes/quotes.component').then(m => m.QuotesComponent),
  },
  {
    path: 'cronos/cotizaciones/nueva',
    loadComponent: () => import('./cronos/quotes/quote-form/quote-form.component').then(m => m.QuoteFormComponent),
  },
  {
    path: 'cronos/cotizaciones/editar/:id',
    loadComponent: () => import('./cronos/quotes/quote-edit/quote-edit.component').then(m => m.QuoteEditComponent),
  },
  {
    path: 'cronos/cotizaciones/detalles/:id',
    loadComponent: () => import('./cronos/quotes/quote-detail/quote-detail.component').then(m => m.QuoteDetailComponent),
  },
  // ─── Costos ───
  {
    path: 'cronos/costos-fijos',
    loadComponent: () => import('./cronos/fixed-costs/fixed-costs.component').then(m => m.FixedCostsComponent),
  },
  // ─── Cuenta ───
  {
    path: 'cronos/cuenta/configuracion',
    loadComponent: () =>
      import('./cronos/account/account-settings/account-settings.component').then(m => m.AccountSettingsComponent),
    canDeactivate: [unsavedChangesGuard],
  },
  { path: 'cronos/cuenta/mi-cuenta', redirectTo: redirectToAccountTab('profile') },
  { path: 'cronos/cuenta/seguridad', redirectTo: redirectToAccountTab('security') },
  // ─── Administration: identity & access (permission-guarded, doc §1.4) ───
  {
    path: 'cronos/admin/usuarios/nuevo',
    loadComponent: () => import('./cronos/admin/users/user-create/user-create.component').then(m => m.UserCreateComponent),
    canActivate: [permissionGuard],
    canDeactivate: [unsavedChangesGuard],
    data: { permissions: [PERMISSIONS.IAM_USER_CREATE] },
  },
  {
    path: 'cronos/admin/usuarios/:id',
    loadComponent: () => import('./cronos/admin/users/user-detail/user-detail.component').then(m => m.UserDetailComponent),
    canActivate: [permissionGuard],
    canDeactivate: [unsavedChangesGuard],
    data: { permissions: [PERMISSIONS.IAM_USER_READ] },
  },
  {
    path: 'cronos/admin/usuarios',
    loadComponent: () => import('./cronos/admin/users/user-list/user-list.component').then(m => m.UserListComponent),
    canActivate: [permissionGuard],
    data: { permissions: [PERMISSIONS.IAM_USER_READ] },
  },
  {
    path: 'cronos/admin/roles/nuevo',
    loadComponent: () => import('./cronos/admin/roles/role-editor/role-editor.component').then(m => m.RoleEditorComponent),
    canActivate: [permissionGuard],
    canDeactivate: [unsavedChangesGuard],
    data: { permissions: [PERMISSIONS.IAM_ROLE_CREATE] },
  },
  {
    path: 'cronos/admin/roles/:id',
    loadComponent: () => import('./cronos/admin/roles/role-editor/role-editor.component').then(m => m.RoleEditorComponent),
    canActivate: [permissionGuard],
    canDeactivate: [unsavedChangesGuard],
    data: { permissions: [PERMISSIONS.IAM_ROLE_READ] },
  },
  {
    path: 'cronos/admin/roles',
    loadComponent: () => import('./cronos/admin/roles/role-list/role-list.component').then(m => m.RoleListComponent),
    canActivate: [permissionGuard],
    data: { permissions: [PERMISSIONS.IAM_ROLE_READ] },
  },
  {
    path: 'cronos/admin/grupos-permisos',
    loadComponent: () =>
      import('./cronos/admin/permission-groups/permission-groups.component').then(m => m.PermissionGroupsComponent),
    canActivate: [permissionGuard],
    data: { permissions: [PERMISSIONS.IAM_GROUP_READ] },
  },
  {
    path: 'cronos/admin/auditoria',
    loadComponent: () => import('./cronos/admin/audit-log/audit-log.component').then(m => m.AuditLogComponent),
    canActivate: [permissionGuard],
    data: { permissions: [PERMISSIONS.IAM_AUDIT_READ] },
  },
  {
    path: 'cronos/admin/politica-seguridad',
    loadComponent: () =>
      import('./cronos/admin/security-policy/security-policy.component').then(m => m.SecurityPolicyComponent),
    canActivate: [permissionGuard],
    canDeactivate: [unsavedChangesGuard],
    data: { permissions: [PERMISSIONS.IAM_POLICY_READ] },
  },
  // ─── Settings ───
  {
    path: 'cronos/configuracion/finanzas',
    loadComponent: () => import('./cronos/finance/finance-settings.component').then(m => m.FinanceSettingsComponent),
    canActivate: [permissionGuard],
    data: { permissions: [PERMISSIONS.FINANCE_CURRENCY_READ, PERMISSIONS.FINANCE_TAX_READ] },
  },
  {
    path: 'cronos/admin/importaciones',
    loadComponent: () => import('./cronos/admin/import-history/import-history.component').then(m => m.ImportHistoryComponent),
    canActivate: [roleGuard],
    data: { role: 'SUPER_ADMIN', anyPermission: ['MANAGE_CATALOGS'] },
  },
  {
    path: '',
    redirectTo: '/dashboard',
    pathMatch: 'full',
  },
  {
    path: '**',
    redirectTo: 'error/404',
  },
];

export { Routing };
