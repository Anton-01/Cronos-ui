import { NgModule } from '@angular/core';
import { Routes, RouterModule } from '@angular/router';
import { authGuard } from './core/guards/auth.guard';
import { guestGuard } from './core/guards/guest.guard';
import { Routing } from './pages/routing';

export const routes: Routes = [
  {
    path: 'oauth2-callback',
    loadComponent: () =>
      import('./pages/auth/oauth2-callback/oauth2-callback.component').then((m) => m.OAuth2CallbackComponent),
  },
  {
    path: 'auth',
    loadComponent: () => import('./pages/auth/auth-layout.component').then((m) => m.AuthLayoutComponent),
    children: [
      { path: '', redirectTo: 'login', pathMatch: 'full' },
      {
        path: 'login',
        canActivate: [guestGuard],
        loadComponent: () => import('./pages/auth/login/login.component').then((m) => m.LoginComponent),
      },
      {
        path: 'register',
        canActivate: [guestGuard],
        loadComponent: () => import('./pages/auth/register/register.component').then((m) => m.RegisterComponent),
      },
      // Kept for backwards compatibility with the old Metronic route name
      { path: 'registration', redirectTo: 'register', pathMatch: 'full' },
      {
        path: 'forgot-password',
        loadComponent: () =>
          import('./pages/auth/forgot-password/forgot-password.component').then((m) => m.ForgotPasswordComponent),
      },
      {
        path: 'logout',
        loadComponent: () => import('./pages/auth/logout/logout.component').then((m) => m.LogoutComponent),
      },
      { path: '**', redirectTo: 'login' },
    ],
  },
  {
    path: 'error/:code',
    loadComponent: () => import('./pages/errors/error-page.component').then((m) => m.ErrorPageComponent),
  },
  {
    path: 'shared/recipe',
    loadComponent: () =>
      import('./pages/public/layout/public-layout.component').then((m) => m.PublicLayoutComponent),
    children: [
      {
        path: ':token',
        loadComponent: () =>
          import('./pages/public/shared-recipe/shared-recipe.component').then((m) => m.SharedRecipeComponent),
      },
    ],
  },
  {
    path: 'cronos/cotizaciones/ver',
    loadComponent: () =>
      import('./pages/public/layout/public-quote-layout.component').then((m) => m.PublicQuoteLayoutComponent),
    children: [
      {
        path: ':token',
        loadComponent: () =>
          import('./pages/public/shared-quote/shared-quote.component').then((m) => m.SharedQuoteComponent),
      },
    ],
  },
  {
    path: '',
    canActivate: [authGuard],
    loadComponent: () => import('./layout/main-layout.component').then((m) => m.MainLayoutComponent),
    children: Routing,
  },
  { path: '**', redirectTo: 'error/404' },
];

@NgModule({
  imports: [RouterModule.forRoot(routes)],
  exports: [RouterModule],
})
export class AppRoutingModule {}
