import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { toSignal } from '@angular/core/rxjs-interop';
import { ButtonModule } from 'primeng/button';
import { map } from 'rxjs';

interface ErrorPageContent {
  code: string;
  title: string;
  message: string;
}

const ERROR_CONTENT: Record<string, ErrorPageContent> = {
  '404': {
    code: '404',
    title: 'Página no encontrada',
    message: 'La página que buscas no existe o fue movida.',
  },
  '500': {
    code: '500',
    title: 'Error del servidor',
    message: 'Algo salió mal. Por favor intenta de nuevo más tarde.',
  },
};

@Component({
  selector: 'app-error-page',
  standalone: true,
  imports: [RouterLink, ButtonModule],
  template: `
    <div class="flex flex-column align-items-center justify-content-center min-h-screen gap-3 p-4 text-center">
      <span class="error-code">{{ content().code }}</span>
      <h1 class="m-0 text-3xl font-bold">{{ content().title }}</h1>
      <p class="m-0 text-color-secondary">{{ content().message }}</p>
      <p-button label="Volver al inicio" icon="pi pi-home" routerLink="/dashboard" />
    </div>
  `,
  styles: `
    .error-code {
      font-size: 6rem;
      font-weight: 800;
      line-height: 1;
      color: var(--p-primary-color);
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ErrorPageComponent {
  private readonly route = inject(ActivatedRoute);

  private readonly code = toSignal(
    this.route.paramMap.pipe(map((params) => params.get('code') ?? '404')),
    { initialValue: '404' },
  );

  readonly content = computed<ErrorPageContent>(() => ERROR_CONTENT[this.code()] ?? ERROR_CONTENT['404']);
}
