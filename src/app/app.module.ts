import { NgModule, APP_INITIALIZER } from '@angular/core';
import { BrowserModule } from '@angular/platform-browser';
import { BrowserAnimationsModule } from '@angular/platform-browser/animations';
import { ClipboardModule } from 'ngx-clipboard';
import { TranslateModule } from '@ngx-translate/core';
import { InlineSVGModule } from 'ng-inline-svg-2';
import { NgbModule } from '@ng-bootstrap/ng-bootstrap';
import { AppRoutingModule } from './app-routing.module';
import { AppComponent } from './app.component';
import { AuthService } from './modules/auth';
import { SweetAlert2Module } from '@sweetalert2/ngx-sweetalert2';
import { ToastContainerComponent } from './shared/components/toast-container/toast-container.component';
import { GlobalAlertContainerComponent } from './shared/components/global-alert-container/global-alert-container.component';
import { provideHttpClient, withInterceptors, withInterceptorsFromDi, HTTP_INTERCEPTORS } from '@angular/common/http';
import { ErrorInterceptorService } from './core/interceptors/error-interceptor.service';
import {authInterceptor} from "./core/interceptors/auth.interceptor";
import { lastValueFrom } from 'rxjs';

function appInitializer(authService: AuthService) {
  return () => {
    return lastValueFrom(authService.getUserByToken())
      .catch((err) => {
        console.warn('Error en la carga inicial del usuario:', err);
        return null;
      });
  };
}

@NgModule({
  declarations: [AppComponent],
  imports: [
    BrowserModule,
    BrowserAnimationsModule,
    TranslateModule.forRoot(),
    ClipboardModule,
    AppRoutingModule,
    InlineSVGModule.forRoot(),
    NgbModule,
    SweetAlert2Module.forRoot(),
    ToastContainerComponent,
    GlobalAlertContainerComponent,
  ],
  providers: [
    {
      provide: APP_INITIALIZER,
      useFactory: appInitializer,
      multi: true,
      deps: [AuthService],
    },
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
export class AppModule { }
