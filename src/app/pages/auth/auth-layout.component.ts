import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterOutlet } from '@angular/router';

@Component({
  selector: 'app-auth-layout',
  standalone: true,
  imports: [RouterOutlet],
  template: `
    <div class="auth-wrapper">
      <div class="auth-card">
        <div class="flex flex-column align-items-center gap-2 mb-4">
          <img src="./assets/media/logos/favicon.svg" alt="Cronos" class="auth-logo" />
          <span class="text-2xl font-bold text-color">Cronos</span>
          <span class="text-color-secondary text-sm">Sistema de Gestión para Repostería Especializada</span>
        </div>
        <router-outlet />
      </div>
      <footer class="auth-footer">
        <span>Cronos — Control total de tus recetas, costos y cotizaciones</span>
      </footer>
    </div>
  `,
  styles: `
    .auth-wrapper {
      min-height: 100vh;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      gap: 1.5rem;
      padding: 1.5rem;
      background: var(--p-surface-50);
    }

    :host-context(.app-dark) .auth-wrapper {
      background: var(--p-surface-950);
    }

    .auth-card {
      width: 100%;
      max-width: 26rem;
      padding: 2rem;
      background: var(--p-content-background);
      border: 1px solid var(--p-content-border-color);
      border-radius: var(--p-border-radius-lg, 10px);
    }

    .auth-logo {
      height: 3rem;
    }

    .auth-footer {
      color: var(--p-text-muted-color);
      font-size: 0.875rem;
      text-align: center;
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AuthLayoutComponent {}
