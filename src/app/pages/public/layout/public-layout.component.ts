import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { TagModule } from 'primeng/tag';

@Component({
  selector: 'app-public-layout',
  standalone: true,
  imports: [RouterOutlet, TagModule],
  template: `
    <div class="public-root">
      <header class="public-header">
        <div class="public-container flex align-items-center justify-content-between">
          <a href="/" class="flex align-items-center no-underline">
            <img alt="Cronos Bakery" src="./assets/media/logos/cronos-logo-light.svg" class="public-logo" />
          </a>
          <p-tag icon="pi pi-share-alt" value="Receta Compartida" severity="info" />
        </div>
      </header>

      <div class="flex-grow-1">
        <router-outlet />
      </div>

      <footer class="public-footer">
        <div class="public-container text-center">
          <span class="text-color-secondary text-sm">
            Potenciado por <strong class="text-color">Cronos</strong> — Gestión de recetas profesional
          </span>
        </div>
      </footer>
    </div>
  `,
  styles: `
    :host {
      display: flex;
      flex-direction: column;
      min-height: 100vh;
    }

    .public-root {
      display: flex;
      flex-direction: column;
      min-height: 100vh;
      background: var(--p-surface-50);
    }

    .public-container {
      max-width: 72rem;
      margin: 0 auto;
      padding: 0 1.5rem;
      width: 100%;
    }

    .public-header {
      padding: 1rem 0;
      background: var(--p-content-background);
      border-bottom: 1px solid var(--p-content-border-color);
    }

    .public-logo {
      height: 2.25rem;
    }

    .public-footer {
      margin-top: auto;
      padding: 1.5rem 0;
      background: var(--p-content-background);
      border-top: 1px solid var(--p-content-border-color);
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PublicLayoutComponent {}
