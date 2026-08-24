import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { toSignal } from '@angular/core/rxjs-interop';
import { TranslatePipe } from '@ngx-translate/core';
import { ButtonModule } from 'primeng/button';
import { map } from 'rxjs';

import { LanguageService } from 'src/app/core/services/language.service';

interface ErrorPageContent {
  code: string;
  title: string;
  message: string;
}

/** Status codes this page has copy for; anything else falls back to 404. */
const SUPPORTED_CODES = ['404', '500'] as const;

@Component({
  selector: 'app-error-page',
  standalone: true,
  imports: [RouterLink, TranslatePipe, ButtonModule],
  template: `
    <div class="flex flex-column align-items-center justify-content-center min-h-screen gap-3 p-4 text-center">
      <span class="error-code">{{ content().code }}</span>
      <h1 class="m-0 text-3xl font-bold">{{ content().title }}</h1>
      <p class="m-0 text-color-secondary">{{ content().message }}</p>
      <p-button [label]="'ERRORS.PAGE.BACK_HOME' | translate" icon="pi pi-home" routerLink="/dashboard" />
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
  private readonly language = inject(LanguageService);

  private readonly code = toSignal(
    this.route.paramMap.pipe(map((params) => params.get('code') ?? '404')),
    { initialValue: '404' },
  );

  readonly content = computed<ErrorPageContent>(() => {
    const raw = this.code();
    const code = SUPPORTED_CODES.find((supported) => supported === raw) ?? '404';
    return {
      code,
      title: this.language.t(`ERRORS.PAGE.${code}.TITLE`),
      message: this.language.t(`ERRORS.PAGE.${code}.MESSAGE`),
    };
  });
}
