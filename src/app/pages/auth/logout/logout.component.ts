import { ChangeDetectionStrategy, Component, OnInit, inject } from '@angular/core';

import { AuthService } from 'src/app/core/services/auth.service';

@Component({
  selector: 'app-logout',
  standalone: true,
  template: `
    <div class="flex flex-column align-items-center gap-2 py-4">
      <i class="pi pi-spinner pi-spin text-2xl text-primary"></i>
      <span class="text-color-secondary">Cerrando sesión...</span>
    </div>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class LogoutComponent implements OnInit {
  private readonly authService = inject(AuthService);

  ngOnInit(): void {
    this.authService.performLogout();
  }
}
