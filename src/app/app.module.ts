import { NgModule } from '@angular/core';
import { BrowserModule } from '@angular/platform-browser';
import { provideAnimationsAsync } from '@angular/platform-browser/animations/async';
import {
  provideHttpClient,
  withInterceptors,
  withInterceptorsFromDi,
  HTTP_INTERCEPTORS,
} from '@angular/common/http';
import { ConfirmationService, MessageService } from 'primeng/api';
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
