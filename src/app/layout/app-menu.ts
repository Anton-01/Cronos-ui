import { MenuItem } from 'primeng/api';

/**
 * A single navigable destination in the sidebar.
 *
 * Per Context.md §11.3 there is exactly one nav model: the expanded sidebar,
 * the slim (icon-only) sidebar and the mobile off-canvas sidebar all render
 * from this same structure. Slim mode hides `label` and shows it as a
 * tooltip — it never swaps in a different template or a different model.
 */
export interface NavItem {
  /**
   * Translation key, not display text — the sidebar renders it through the
   * `translate` pipe. Keeping the key (rather than resolved text) in the model
   * is what lets the menu re-label itself on a language switch without being
   * rebuilt, and it doubles as the stable identity `@for` tracks by.
   */
  labelKey: string;
  icon: string;
  route: string;
  /**
   * URL prefixes that mark this item active. Defaults to `[route]`; declare
   * extra prefixes when child routes live under a different path (e.g. a
   * detail view outside the list route).
   */
  activePrefixes?: string[];
  /**
   * Sub-destinations rendered in a collapsible group under this item.
   *
   * A parent still carries a `route` — the group root — for two reasons: it
   * is what `activePrefixes` matches so the parent lights up whenever any
   * child is open, and it stays a real navigable URL that redirects to the
   * first child. Children never nest further; one level is the whole model.
   */
  children?: NavItem[];
}

/**
 * A titled group of items. `labelKey` renders as the small uppercase muted
 * section header ("DASHBOARDS", "APPS") that gives Freya its scannable
 * sidebar rhythm; it is hidden in slim mode.
 */
export interface NavSection {
  labelKey: string;
  items: NavItem[];
}

/**
 * The sidebar navigation model.
 *
 * Admin sections are filtered by role here for a clean menu; the routes
 * themselves stay protected by `roleGuard` — this is presentation, not
 * authorization.
 */
export function buildNavSections(hasAdminRole: boolean, hasSuperAdminRole: boolean): NavSection[] {
  const sections: NavSection[] = [
    {
      labelKey: 'NAV.SECTIONS.DASHBOARDS',
      items: [{ labelKey: 'NAV.ITEMS.DASHBOARD', icon: 'pi pi-home', route: '/dashboard' }],
    },
    {
      labelKey: 'NAV.SECTIONS.OPERATIONS',
      items: [
        { labelKey: 'NAV.ITEMS.MY_RECIPES', icon: 'pi pi-book', route: '/cronos/recetas' },
        { labelKey: 'NAV.ITEMS.MY_QUOTES', icon: 'pi pi-file-edit', route: '/cronos/cotizaciones' },
        { labelKey: 'NAV.ITEMS.INGREDIENTS', icon: 'pi pi-shopping-bag', route: '/cronos/ingredientes' },
        { labelKey: 'NAV.ITEMS.FIXED_COSTS', icon: 'pi pi-wallet', route: '/cronos/costos-fijos' },
      ],
    },
    {
      labelKey: 'NAV.SECTIONS.CATALOGS',
      items: [
        { labelKey: 'NAV.ITEMS.UNIT_TYPES', icon: 'pi pi-sitemap', route: '/cronos/tipos-unidad' },
        {
          labelKey: 'NAV.ITEMS.MEASUREMENT_UNITS',
          icon: 'pi pi-calculator',
          route: '/cronos/unidades-medida',
        },
        {
          labelKey: 'NAV.ITEMS.CATEGORIES',
          icon: 'pi pi-tags',
          route: '/cronos/categorias',
          children: [
            {
              labelKey: 'NAV.ITEMS.PRODUCT_CATEGORIES',
              icon: 'pi pi-shopping-cart',
              route: '/cronos/categorias/productos',
            },
            {
              labelKey: 'NAV.ITEMS.INGREDIENT_CATEGORIES',
              icon: 'pi pi-inbox',
              route: '/cronos/categorias/ingredientes',
            },
          ],
        },
        { labelKey: 'NAV.ITEMS.ALLERGENS', icon: 'pi pi-exclamation-triangle', route: '/cronos/alergenos' },
      ],
    },
    {
      labelKey: 'NAV.SECTIONS.ACCOUNT',
      items: [
        { labelKey: 'NAV.ITEMS.MY_ACCOUNT', icon: 'pi pi-user', route: '/cronos/cuenta/mi-cuenta' },
        { labelKey: 'NAV.ITEMS.SECURITY', icon: 'pi pi-lock', route: '/cronos/cuenta/seguridad' },
      ],
    },
  ];

  const adminItems: NavItem[] = [];
  if (hasAdminRole) {
    adminItems.push({ labelKey: 'NAV.ITEMS.USER_MANAGEMENT', icon: 'pi pi-users', route: '/cronos/admin/usuarios' });
  }
  if (hasSuperAdminRole) {
    adminItems.push({ labelKey: 'NAV.ITEMS.ROLE_MANAGEMENT', icon: 'pi pi-shield', route: '/cronos/admin/roles' });
  }
  if (adminItems.length > 0) {
    sections.push({ labelKey: 'NAV.SECTIONS.ADMINISTRATION', items: adminItems });
  }

  return sections;
}

/** URL prefixes that light up a nav item, defaulting to its own route. */
export function activePrefixesOf(item: NavItem): string[] {
  return item.activePrefixes ?? [item.route];
}

/**
 * Account dropdown in the topbar. Kept next to the nav model so every label
 * lives in one file.
 *
 * `MenuItem.label` is plain text with no pipe to run it through, so this takes
 * a translator and is rebuilt inside a `computed` on each language change —
 * the sidebar gets the same result from the `translate` pipe instead.
 */
export function buildUserMenu(t: (key: string) => string, onLogout: () => void): MenuItem[] {
  return [
    { label: t('NAV.ITEMS.MY_ACCOUNT'), icon: 'pi pi-user', routerLink: '/cronos/cuenta/mi-cuenta' },
    { label: t('NAV.ITEMS.SECURITY'), icon: 'pi pi-lock', routerLink: '/cronos/cuenta/seguridad' },
    { separator: true },
    { label: t('NAV.ITEMS.SIGN_OUT'), icon: 'pi pi-sign-out', command: onLogout },
  ];
}
