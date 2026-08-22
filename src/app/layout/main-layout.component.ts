import {
  ChangeDetectionStrategy,
  Component,
  HostListener,
  OnInit,
  computed,
  effect,
  inject,
  signal,
} from '@angular/core';
import { NavigationEnd, Router, RouterLink, RouterOutlet } from '@angular/router';
import { toSignal } from '@angular/core/rxjs-interop';
import { filter, map, startWith } from 'rxjs';
import { FormsModule } from '@angular/forms';
import { MenuItem } from 'primeng/api';
import { AvatarModule } from 'primeng/avatar';
import { BreadcrumbModule } from 'primeng/breadcrumb';
import { ButtonModule } from 'primeng/button';
import { IconFieldModule } from 'primeng/iconfield';
import { InputIconModule } from 'primeng/inputicon';
import { InputTextModule } from 'primeng/inputtext';
import { MenuModule } from 'primeng/menu';
import { RippleModule } from 'primeng/ripple';
import { TooltipModule } from 'primeng/tooltip';

import { AuthService } from 'src/app/core/services/auth.service';
import { PageInfoService } from 'src/app/core/services/page-info.service';
import { ProfileStateService } from 'src/app/core/services/profile/ProfileStateService';
import { ThemeService } from 'src/app/core/services/theme.service';
import { TokenService } from 'src/app/core/services/token.service';
import { NavItem, NavSection, activePrefixesOf, buildNavSections, buildUserMenu } from './app-menu';

const SLIM_STORAGE_KEY = 'cronos_sidebar_slim';
const DESKTOP_BREAKPOINT = 992;

/**
 * Application shell — Freya layout (see Context.md §11).
 *
 * Three regions: a fixed expanded sidebar that owns the logo and the whole
 * navigation model, a sticky transparent topbar carrying search and account
 * controls, and a gray content ground on which each page's `p-card`s sit as
 * the white elevated surfaces.
 *
 * The sidebar has three states driven purely by classes on `.layout-wrapper`:
 * expanded (default), slim (`.layout-slim`, desktop, persisted) and
 * off-canvas (`.layout-mobile-active`, below 992px).
 */
@Component({
  selector: 'app-main-layout',
  standalone: true,
  imports: [
    RouterOutlet,
    RouterLink,
    FormsModule,
    AvatarModule,
    BreadcrumbModule,
    ButtonModule,
    IconFieldModule,
    InputIconModule,
    InputTextModule,
    MenuModule,
    RippleModule,
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

  /** Desktop: sidebar collapsed to icons only. Persisted across sessions. */
  readonly slim = signal(localStorage.getItem(SLIM_STORAGE_KEY) === 'true');

  /** Mobile (<992px): sidebar revealed off-canvas over a dimming mask. */
  readonly mobileMenuOpen = signal(false);

  /**
   * Topbar search field state. There is no global search endpoint yet, so the
   * field holds its term locally; wire it to a service when one exists rather
   * than faking a result set here.
   */
  readonly searchTerm = signal('');

  readonly navSections: NavSection[] = buildNavSections(
    this.tokenService.hasRole('ADMIN'),
    this.tokenService.hasRole('SUPER_ADMIN'),
  );

  readonly userMenuItems: MenuItem[] = buildUserMenu(() => this.logout());

  /**
   * Per-group open/closed state, keyed by label, holding only the groups the
   * user has clicked. Absent means "follow the active route".
   */
  private readonly groupOverrides = signal<Readonly<Record<string, boolean>>>({});

  private readonly currentUrl = toSignal(
    this.router.events.pipe(
      filter((event) => event instanceof NavigationEnd),
      map(() => this.router.url),
      startWith(this.router.url),
    ),
    { initialValue: this.router.url },
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

  constructor() {
    // Navigating from the off-canvas sidebar should close it; the URL signal
    // is the single source for "a navigation happened".
    effect(() => {
      this.currentUrl();
      this.mobileMenuOpen.set(false);
    });
  }

  ngOnInit(): void {
    this.profileState.loadProfile();
  }

  isActive(item: NavItem): boolean {
    const url = this.currentUrl();
    return activePrefixesOf(item).some((prefix) => url === prefix || url.startsWith(`${prefix}/`));
  }

  /**
   * Whether a group's children are visible.
   *
   * A group opens by itself when the current URL is inside it, and the user's
   * click is recorded as an override so an explicitly collapsed group stays
   * collapsed while they are still on one of its pages. Slim mode ignores
   * both: labels are hidden there, so a closed group would leave its routes
   * unreachable behind an icon with no flyout.
   */
  isGroupOpen(item: NavItem): boolean {
    if (this.slim()) {
      return true;
    }
    return this.groupOverrides()[item.label] ?? this.isActive(item);
  }

  toggleGroup(item: NavItem): void {
    const open = this.isGroupOpen(item);
    this.groupOverrides.update((current) => ({ ...current, [item.label]: !open }));
  }

  /** Below `lg` the button opens the off-canvas sidebar; above it toggles slim mode. */
  toggleSidebar(): void {
    if (window.innerWidth < DESKTOP_BREAKPOINT) {
      this.mobileMenuOpen.update((open) => !open);
      return;
    }
    this.slim.update((slim) => {
      localStorage.setItem(SLIM_STORAGE_KEY, String(!slim));
      return !slim;
    });
  }

  closeMobileMenu(): void {
    this.mobileMenuOpen.set(false);
  }

  @HostListener('document:keydown.escape')
  onEscape(): void {
    this.closeMobileMenu();
  }

  logout(): void {
    this.authService.performLogout();
  }
}
