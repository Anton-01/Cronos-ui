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
    loadComponent: () => import('./cronos/recetas/recetas.component').then(m => m.RecetasComponent),
  },
  {
    path: 'cronos/recetas/nueva',
    loadComponent: () => import('./cronos/recetas/receta-form/receta-form.component').then(m => m.RecetaFormComponent),
  },
  {
    path: 'cronos/recetas/editar/:id',
    loadComponent: () => import('./cronos/recetas/receta-form/receta-form.component').then(m => m.RecetaFormComponent),
  },
  {
    path: 'cronos/recetas/:id',
    loadComponent: () => import('./cronos/recetas/receta-detalle/receta-detalle.component').then(m => m.RecetaDetalleComponent),
  },
  // ─── Cotizaciones ───
  {
    path: 'cronos/cotizaciones',
    loadComponent: () => import('./cronos/cotizaciones/cotizaciones.component').then(m => m.CotizacionesComponent),
  },
  {
    path: 'cronos/cotizaciones/nueva',
    loadComponent: () => import('./cronos/cotizaciones/cotizacion-form/cotizacion-form.component').then(m => m.CotizacionFormComponent),
  },
  {
    path: 'cronos/cotizaciones/editar/:id',
    loadComponent: () => import('./cronos/cotizaciones/cotizacion-edit/cotizacion-edit.component').then(m => m.CotizacionEditComponent),
  },
  {
    path: 'cronos/cotizaciones/detalles/:id',
    loadComponent: () => import('./cronos/cotizaciones/cotizacion-detalle/cotizacion-detalle.component').then(m => m.CotizacionDetalleComponent),
  },
  // ─── Costos ───
  {
    path: 'cronos/costos-fijos',
    loadComponent: () => import('./cronos/fixed-costs/fixed-costs.component').then(m => m.FixedCostsComponent),
  },
  // ─── Cuenta ───
  {
    path: 'cronos/cuenta/mi-cuenta',
    loadComponent: () => import('./cronos/cuenta/mi-cuenta/mi-cuenta.component').then(m => m.MiCuentaComponent),
  },
  {
    path: 'cronos/cuenta/seguridad',
    loadComponent: () => import('./cronos/cuenta/seguridad/seguridad.component').then(m => m.SeguridadComponent),
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
