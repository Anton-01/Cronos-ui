import { NgModule } from '@angular/core';
import { Routes, RouterModule } from '@angular/router';
import { AuthGuard } from './modules/auth/services/auth.guard';
import { guestGuard } from './core/guards/guest.guard';

export const routes: Routes = [
  {
    path: 'oauth2-callback',
    loadComponent: () =>
      import('./pages/cronos/auth/oauth2-callback/oauth2-callback.component').then(
        (m) => m.OAuth2CallbackComponent
      ),
  },
  {
    path: 'auth',
    loadChildren: () =>
      import('./modules/auth/auth.module').then((m) => m.AuthModule),
  },
  {
    path: 'error',
    loadChildren: () =>
      import('./modules/errors/errors.module').then((m) => m.ErrorsModule),
  },
  {
    path: 'shared/recipe',
    loadComponent: () =>
      import('./pages/public/layout/public-layout.component').then(
        (m) => m.PublicLayoutComponent
      ),
    children: [
      {
        path: ':token',
        loadComponent: () =>
          import('./pages/public/shared-recipe/shared-recipe.component').then(
            (m) => m.SharedRecipeComponent
          ),
      },
    ],
  },
  {
    path: '',
    canActivate: [AuthGuard],
    loadChildren: () =>
      import('./_metronic/layout/layout.module').then((m) => m.LayoutModule),
  },
  { path: '**', redirectTo: 'error/404' },
];

@NgModule({
  imports: [RouterModule.forRoot(routes)],
  exports: [RouterModule],
})
export class AppRoutingModule {}
