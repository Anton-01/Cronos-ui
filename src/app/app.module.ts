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
    colorScheme: {
      light: {
        content: {
          borderColor: '{surface.100}',
        },
        formField: {
          borderColor: '{surface.200}',
          hoverBorderColor: '{surface.300}',
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
      },
    },
  },
});

import { AppRoutingModule } from './app-routing.module';
import { AppComponent } from './app.component';
import { ErrorInterceptorService } from './core/interceptors/error-interceptor.service';
import { authInterceptor } from './core/interceptors/auth.interceptor';

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
    }),
    MessageService,
    ConfirmationService,
    provideHttpClient(
      withInterceptors([authInterceptor]),
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
