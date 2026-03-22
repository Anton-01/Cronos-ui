import { Routes } from '@angular/router';
import { roleGuard } from '../core/guards/role.guard';

const Routing: Routes = [
  {
    path: 'dashboard',
    loadChildren: () => import('./dashboard/dashboard.module').then((m) => m.DashboardModule),
  },
  {
    path: 'builder',
    loadChildren: () => import('./builder/builder.module').then((m) => m.BuilderModule),
  },
  {
    path: 'crafted/pages/profile',
    loadChildren: () => import('../modules/profile/profile.module').then((m) => m.ProfileModule),
  },
  {
    path: 'crafted/account',
    loadChildren: () => import('../modules/account/account.module').then((m) => m.AccountModule),
  },
  {
    path: 'crafted/pages/wizards',
    loadChildren: () => import('../modules/wizards/wizards.module').then((m) => m.WizardsModule),
  },
  {
    path: 'crafted/widgets',
    loadChildren: () => import('../modules/widgets-examples/widgets-examples.module').then((m) => m.WidgetsExamplesModule),
  },
  {
    path: 'apps/chat',
    loadChildren: () => import('../modules/apps/chat/chat.module').then((m) => m.ChatModule),
  },
  {
    path: 'apps/users',
    loadChildren: () => import('./user/user.module').then((m) => m.UserModule),
  },
  {
    path: 'apps/roles',
    loadChildren: () => import('./role/role.module').then((m) => m.RoleModule),
  },
  {
    path: 'apps/permissions',
    loadChildren: () => import('./permission/permission.module').then((m) => m.PermissionModule),
  },
  // ─── Cronos CRUD Routes ───
  {
    path: 'cronos/tipos-unidad',
    loadComponent: () => import('./cronos/tipos-unidad/tipos-unidad.component').then(m => m.TiposUnidadComponent),
  },
  {
    path: 'cronos/categorias',
    loadComponent: () => import('./cronos/categorias/categorias.component').then(m => m.CategoriasComponent),
  },
  {
    path: 'cronos/alergenos',
    loadComponent: () => import('./cronos/alergenos/alergenos.component').then(m => m.AlergenosComponent),
  },
  {
    path: 'cronos/unidades-medida',
    loadComponent: () => import('./cronos/unidades-medida/unidades-medida.component').then(m => m.UnidadesMedidaComponent),
  },
  {
    path: 'cronos/ingredientes',
    loadComponent: () => import('./cronos/ingredientes/ingredientes.component').then(m => m.IngredientesComponent),
  },
  {
    path: 'cronos/ingredientes/nuevo',
    loadComponent: () => import('./cronos/ingredientes/ingrediente-form/ingrediente-form.component').then(m => m.IngredienteFormComponent),
  },
  {
    path: 'cronos/ingredientes/editar/:id',
    loadComponent: () => import('./cronos/ingredientes/ingrediente-form/ingrediente-form.component').then(m => m.IngredienteFormComponent),
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
