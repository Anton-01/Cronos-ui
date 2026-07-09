import {
  ChangeDetectionStrategy,
  Component,
  OnInit,
  computed,
  inject,
  signal,
} from '@angular/core';
import { Router, RouterOutlet } from '@angular/router';
import { MenuItem } from 'primeng/api';
import { AvatarModule } from 'primeng/avatar';
import { BreadcrumbModule } from 'primeng/breadcrumb';
import { ButtonModule } from 'primeng/button';
import { DrawerModule } from 'primeng/drawer';
import { MenuModule } from 'primeng/menu';
import { PanelMenuModule } from 'primeng/panelmenu';
import { TooltipModule } from 'primeng/tooltip';

import { AuthService } from 'src/app/core/services/auth.service';
import { PageInfoService } from 'src/app/core/services/page-info.service';
import { ProfileStateService } from 'src/app/core/services/profile/ProfileStateService';
import { ThemeService } from 'src/app/core/services/theme.service';
import { TokenService } from 'src/app/core/services/token.service';
import { buildAppMenu } from './app-menu';

@Component({
  selector: 'app-main-layout',
  standalone: true,
  imports: [
    RouterOutlet,
    AvatarModule,
    BreadcrumbModule,
    ButtonModule,
    DrawerModule,
    MenuModule,
    PanelMenuModule,
    TooltipModule,
  ],
  templateUrl: './main-layout.component.html',
  styleUrl: './main-layout.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class MainLayoutComponent implements OnInit {
  private readonly authService = inject(AuthService);
  private readonly tokenService = inject(TokenService);
  private readonly router = inject(Router);

  readonly profileState = inject(ProfileStateService);
  readonly pageInfo = inject(PageInfoService);
  readonly theme = inject(ThemeService);

  readonly sidebarVisible = signal(false);

  readonly menuModel: MenuItem[] = buildAppMenu(
    this.tokenService.hasRole('ADMIN'),
    this.tokenService.hasRole('SUPER_ADMIN'),
  );

  readonly breadcrumbItems = computed<MenuItem[]>(() =>
    this.pageInfo.breadcrumbs().map((link) => ({
      label: link.title,
      routerLink: link.path || undefined,
      disabled: !link.path || link.isSeparator === true,
    })),
  );

  readonly breadcrumbHome: MenuItem = { icon: 'pi pi-home', routerLink: '/dashboard' };

  readonly userInitials = computed(() => {
    const user = this.profileState.user();
    if (!user) {
      return '?';
    }
    const first = user.firstName?.charAt(0) ?? user.username.charAt(0);
    const last = user.lastName?.charAt(0) ?? '';
    return (first + last).toUpperCase();
  });

  readonly userFullName = computed(() => {
    const user = this.profileState.user();
    if (!user) {
      return '';
    }
    return [user.firstName, user.lastName].filter(Boolean).join(' ') || user.username;
  });

  readonly userMenuItems: MenuItem[] = [
    { label: 'Mi Cuenta', icon: 'pi pi-user', routerLink: '/cronos/cuenta/mi-cuenta' },
    { label: 'Seguridad', icon: 'pi pi-lock', routerLink: '/cronos/cuenta/seguridad' },
    { separator: true },
    { label: 'Cerrar Sesión', icon: 'pi pi-sign-out', command: () => this.logout() },
  ];

  ngOnInit(): void {
    this.profileState.loadProfile();
  }

  toggleSidebar(): void {
    this.sidebarVisible.update((visible) => !visible);
  }

  logout(): void {
    this.authService.performLogout();
  }

  navigateHome(): void {
    this.router.navigate(['/dashboard']);
  }
}
