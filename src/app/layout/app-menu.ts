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
  label: string;
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
 * A titled group of items. `label` renders as the small uppercase muted
 * section header ("DASHBOARDS", "APPS") that gives Freya its scannable
 * sidebar rhythm; it is hidden in slim mode.
 */
export interface NavSection {
  label: string;
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
      label: 'Dashboards',
      items: [{ label: 'Dashboard', icon: 'pi pi-home', route: '/dashboard' }],
    },
    {
      label: 'Operations',
      items: [
        { label: 'My Recipes', icon: 'pi pi-book', route: '/cronos/recetas' },
        { label: 'My Quotes', icon: 'pi pi-file-edit', route: '/cronos/cotizaciones' },
        { label: 'Ingredients', icon: 'pi pi-shopping-bag', route: '/cronos/ingredientes' },
        { label: 'Fixed Costs', icon: 'pi pi-wallet', route: '/cronos/costos-fijos' },
      ],
    },
    {
      label: 'Catalogs',
      items: [
        { label: 'Unit Types', icon: 'pi pi-sitemap', route: '/cronos/tipos-unidad' },
        { label: 'Measurement Units', icon: 'pi pi-calculator', route: '/cronos/unidades-medida' },
        {
          label: 'Categories',
          icon: 'pi pi-tags',
          route: '/cronos/categorias',
          children: [
            { label: 'Product Categories', icon: 'pi pi-shopping-cart', route: '/cronos/categorias/productos' },
            { label: 'Ingredient Categories', icon: 'pi pi-inbox', route: '/cronos/categorias/ingredientes' },
          ],
        },
        { label: 'Allergens', icon: 'pi pi-exclamation-triangle', route: '/cronos/alergenos' },
      ],
    },
    {
      label: 'Account',
      items: [
        { label: 'My Account', icon: 'pi pi-user', route: '/cronos/cuenta/mi-cuenta' },
        { label: 'Security', icon: 'pi pi-lock', route: '/cronos/cuenta/seguridad' },
      ],
    },
  ];

  const adminItems: NavItem[] = [];
  if (hasAdminRole) {
    adminItems.push({ label: 'User Management', icon: 'pi pi-users', route: '/cronos/admin/usuarios' });
  }
  if (hasSuperAdminRole) {
    adminItems.push({ label: 'Role Management', icon: 'pi pi-shield', route: '/cronos/admin/roles' });
  }
  if (adminItems.length > 0) {
    sections.push({ label: 'Administration', items: adminItems });
  }

  return sections;
}

/** URL prefixes that light up a nav item, defaulting to its own route. */
export function activePrefixesOf(item: NavItem): string[] {
  return item.activePrefixes ?? [item.route];
}

/** Account dropdown in the topbar. Kept next to the nav model so every label lives in one file. */
export function buildUserMenu(onLogout: () => void): MenuItem[] {
  return [
    { label: 'My Account', icon: 'pi pi-user', routerLink: '/cronos/cuenta/mi-cuenta' },
    { label: 'Security', icon: 'pi pi-lock', routerLink: '/cronos/cuenta/seguridad' },
    { separator: true },
    { label: 'Sign Out', icon: 'pi pi-sign-out', command: onLogout },
  ];
}
