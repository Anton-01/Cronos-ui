import { inject } from '@angular/core';
import { Router, Routes, UrlTree } from '@angular/router';
import { roleGuard } from '../core/guards/role.guard';
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
    loadComponent: () => import('./cronos/ingredients/ingredient-form/ingredient-form.component').then(m => m.IngredientFormComponent),
  },
  {
    path: 'cronos/ingredientes/editar/:id',
    loadComponent: () => import('./cronos/ingredients/ingredient-form/ingredient-form.component').then(m => m.IngredientFormComponent),
  },
  // ─── Recetas ───
  {
    path: 'cronos/recetas',
    loadComponent: () => import('./cronos/recipes/recipes.component').then(m => m.RecipesComponent),
  },
  {
    path: 'cronos/recetas/nueva',
    loadComponent: () => import('./cronos/recipes/recipe-form/recipe-form.component').then(m => m.RecipeFormComponent),
  },
  {
    path: 'cronos/recetas/editar/:id',
    loadComponent: () => import('./cronos/recipes/recipe-form/recipe-form.component').then(m => m.RecipeFormComponent),
  },
  {
    path: 'cronos/recetas/:id',
    loadComponent: () => import('./cronos/recipes/recipe-detail/recipe-detail.component').then(m => m.RecipeDetailComponent),
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
  // ─── Admin (role-guarded) ───
  {
    path: 'cronos/admin/usuarios',
    loadComponent: () => import('./cronos/admin/user-management/user-management.component').then(m => m.UserManagementComponent),
    canActivate: [roleGuard],
    data: { role: 'ADMIN' },
  },
  {
    path: 'cronos/admin/roles',
    loadComponent: () => import('./cronos/admin/roles-management/roles-management.component').then(m => m.RolesManagementComponent),
    canActivate: [roleGuard],
    data: { role: 'SUPER_ADMIN' },
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
