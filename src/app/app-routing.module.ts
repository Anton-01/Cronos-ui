import { NgModule } from '@angular/core';
import { Routes, RouterModule } from '@angular/router';
import { AuthGuard } from './modules/auth/services/auth.guard';
import { Routing } from './pages/routing';

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
    path: 'error/:code',
    loadComponent: () =>
      import('./pages/errors/error-page.component').then((m) => m.ErrorPageComponent),
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
    path: 'cronos/cotizaciones/ver',
    loadComponent: () =>
      import('./pages/public/layout/public-quote-layout.component').then(
        (m) => m.PublicQuoteLayoutComponent
      ),
    children: [
      {
        path: ':token',
        loadComponent: () =>
          import('./pages/public/shared-quote/shared-quote.component').then(
            (m) => m.SharedQuoteComponent
          ),
      },
    ],
  },
  {
    path: '',
    canActivate: [AuthGuard],
    loadComponent: () =>
      import('./layout/main-layout.component').then((m) => m.MainLayoutComponent),
    children: Routing,
  },
  { path: '**', redirectTo: 'error/404' },
];

@NgModule({
  imports: [RouterModule.forRoot(routes)],
  exports: [RouterModule],
})
export class AppRoutingModule {}
