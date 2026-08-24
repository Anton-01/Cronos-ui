import { LOCALE_ID, NgModule } from '@angular/core';
import { registerLocaleData } from '@angular/common';
import localeEsMX from '@angular/common/locales/es-MX';
import { BrowserModule } from '@angular/platform-browser';
import { provideAnimationsAsync } from '@angular/platform-browser/animations/async';
import {
  provideHttpClient,
  withInterceptors,
  withInterceptorsFromDi,
  HTTP_INTERCEPTORS,
} from '@angular/common/http';
import { ConfirmationService, MessageService } from 'primeng/api';
import { provideTranslateService } from '@ngx-translate/core';
import { provideTranslateHttpLoader } from '@ngx-translate/http-loader';
import { providePrimeNG } from 'primeng/config';
import { definePreset } from '@primeng/themes';
import { ConfirmDialogModule } from 'primeng/confirmdialog';
import { ToastModule } from 'primeng/toast';
import Aura from '@primeng/themes/aura';

// Aura tuned for the Cronos look: hairline borders and softer radii everywhere
const CronosPreset = definePreset(Aura, {
  semantic: {
    // Modern, soft elevation for dialogs/confirm dialogs — replaces Aura's
    // default (heavier, more clinical) modal shadow.
    overlay: {
      modal: {
        shadow:
          '0 24px 48px -12px rgba(0, 0, 0, 0.18), 0 8px 16px -8px rgba(0, 0, 0, 0.12)',
      },
    },
    // Roomier option rows across every select/list-style overlay
    // (p-select, p-multiselect, p-autocomplete, p-cascadeselect, menus) —
    // ~44px touch target instead of Aura's default ~32px.
    list: {
      option: {
        padding: '0.75rem 1rem',
      },
    },
    colorScheme: {
      light: {
        content: {
          borderColor: '{surface.100}',
        },
        formField: {
          borderColor: '{surface.200}',
          hoverBorderColor: '{surface.300}',
        },
        // Dialogs share the same hairline border as cards instead of Aura's
        // default heavier surface.200 border.
        overlay: {
          modal: {
            borderColor: '{surface.100}',
          },
        },
      },
      dark: {
        content: {
          borderColor: '{surface.800}',
        },
        formField: {
          borderColor: '{surface.700}',
          hoverBorderColor: '{surface.600}',
        },
        overlay: {
          modal: {
            borderColor: '{surface.800}',
          },
        },
      },
    },
  },
});

import { AppRoutingModule } from './app-routing.module';
import { AppComponent } from './app.component';
import { ErrorInterceptorService } from './core/interceptors/error-interceptor.service';
import { authInterceptor } from './core/interceptors/auth.interceptor';
import { languageInterceptor } from './core/interceptors/language.interceptor';
import { DEFAULT_LANGUAGE, resolveStoredLanguage } from './core/services/language.service';

// Angular ships `en` data in the framework but every other locale must be
// registered explicitly, or `date`/`number`/`currency` throw at runtime.
// Cronos prices ingredients and issues quotes in Mexico, so `es-MX` is the
// locale the native pipes are built around.
registerLocaleData(localeEsMX, 'es-MX');

@NgModule({
  declarations: [AppComponent],
  imports: [
    BrowserModule,
    AppRoutingModule,
    ToastModule,
    ConfirmDialogModule,
  ],
  providers: [
    provideAnimationsAsync(),
    providePrimeNG({
      theme: {
        preset: CronosPreset,
        options: {
          darkModeSelector: '.app-dark',
        },
      },
      // Overlays (p-select, p-multiselect, p-autocomplete, p-datepicker, ...)
      // render into <body> instead of their local stacking context, so they
      // never get clipped/overlapped by a dialog, card, or sticky header.
      // Falls back automatically for every overlay component unless a
      // specific instance sets its own [appendTo].
      overlayAppendTo: 'body',
    }),
    MessageService,
    ConfirmationService,
    {
      // `LOCALE_ID` is resolved once at bootstrap and cannot change without a
      // reload, so it reads the persisted choice rather than being pinned to a
      // literal: a user who picked English gets English pipes on their next
      // load instead of Mexican date order under an English UI. With nothing
      // persisted this returns 'es-MX', which is the product default.
      provide: LOCALE_ID,
      useFactory: resolveStoredLanguage,
    },
    /**
     * UI string translation (Context.md §16.5).
     *
     * Bundle filenames are the BCP 47 tags themselves (`en.json`,
     * `es-MX.json`), so one identifier drives the `Accept-Language` header,
     * the `<html lang>` and the bundle lookup — there is deliberately no
     * second locale enum for translation keys.
     *
     * `lang` is seeded from the same `resolveStoredLanguage()` that feeds
     * `LOCALE_ID` above, so the first paint is already in the user's locale
     * instead of flashing raw keys until `LanguageService.init()` runs.
     * After bootstrap `LanguageService` is the only writer — see its `apply()`.
     */
    provideTranslateService({
      loader: provideTranslateHttpLoader({ prefix: './assets/i18n/', suffix: '.json' }),
      lang: resolveStoredLanguage(),
      fallbackLang: DEFAULT_LANGUAGE,
    }),
    provideHttpClient(
      // Order is the execution order on the way out: auth stamps identity,
      // language stamps the locale the backend answers in.
      withInterceptors([authInterceptor, languageInterceptor]),
      withInterceptorsFromDi()
    ),
    {
      provide: HTTP_INTERCEPTORS,
      useClass: ErrorInterceptorService,
      multi: true,
    },
  ],
  bootstrap: [AppComponent],
})
export class AppModule {}
