import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterOutlet } from '@angular/router';

@Component({
  selector: 'app-public-quote-layout',
  standalone: true,
  imports: [CommonModule, RouterOutlet],
  template: `
    <!-- begin::Public Quote Layout -->
    <div class="d-flex flex-column flex-root app-root" id="kt_app_root">
      <!-- begin::Header -->
      <header class="py-4 py-lg-6 border-bottom bg-white shadow-sm">
        <div class="container">
          <div class="d-flex align-items-center justify-content-between">
            <a href="/" class="d-flex align-items-center text-decoration-none">
              <img
                alt="Cronos Logo"
                src="./assets/media/logos/default.svg"
                class="h-30px h-lg-40px theme-light-show"
              />
              <img
                alt="Cronos Logo"
                src="./assets/media/logos/default-dark.svg"
                class="h-30px h-lg-40px theme-dark-show"
              />
            </a>
            <span class="badge badge-light-success fs-7 fw-semibold px-4 py-2">
              <i class="ki-duotone ki-document fs-6 me-1">
                <span class="path1"></span>
                <span class="path2"></span>
              </i>
              Cotización
            </span>
          </div>
        </div>
      </header>
      <!-- end::Header -->

      <!-- begin::Content -->
      <div class="flex-grow-1 bg-gray-100">
        <router-outlet></router-outlet>
      </div>
      <!-- end::Content -->

      <!-- begin::Footer -->
      <footer class="py-6 bg-light border-top mt-auto">
        <div class="container text-center">
          <span class="text-gray-500 fs-7">
            Potenciado por <strong class="text-gray-700">Cronos</strong> &mdash; Gestión de repostería profesional
          </span>
        </div>
      </footer>
      <!-- end::Footer -->
    </div>
    <!-- end::Public Quote Layout -->
  `,
  styles: [`
    :host {
      display: flex;
      flex-direction: column;
      min-height: 100vh;
    }
    .app-root {
      min-height: 100vh;
    }
  `],
})
export class PublicQuoteLayoutComponent {}
