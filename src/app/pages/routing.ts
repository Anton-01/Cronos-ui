import { Routes } from '@angular/router';
import { roleGuard } from '../core/guards/role.guard';

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
  {
    path: 'cronos/categorias',
    loadComponent: () => import('./cronos/categories/categories.component').then(m => m.CategoriesComponent),
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
    path: 'cronos/cuenta/mi-cuenta',
    loadComponent: () => import('./cronos/account/my-account/my-account.component').then(m => m.MyAccountComponent),
  },
  {
    path: 'cronos/cuenta/seguridad',
    loadComponent: () => import('./cronos/account/security/security.component').then(m => m.SecurityComponent),
  },
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
