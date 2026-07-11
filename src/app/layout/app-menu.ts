import { MenuItem } from 'primeng/api';

/** Item of the icon-only navigation rail: navigates directly or opens a flyout. */
export interface RailItem {
  icon: string;
  label: string;
  route?: string;
  /** Routes prefix used to highlight the icon when a child route is active */
  activePrefixes: string[];
  /** Flyout entries for grouped destinations */
  children?: MenuItem[];
}

/**
 * Icon rail model. Groups are logical: catalogs collapse into one icon with
 * a flyout; frequent destinations stay one click away. Admin items are
 * filtered by role at runtime (routes are also protected by roleGuard).
 */
export function buildRailMenu(hasAdminRole: boolean, hasSuperAdminRole: boolean): RailItem[] {
  const rail: RailItem[] = [
    {
      icon: 'pi pi-home',
      label: 'Dashboard',
      route: '/dashboard',
      activePrefixes: ['/dashboard'],
    },
    {
      icon: 'pi pi-database',
      label: 'Catálogos',
      activePrefixes: [
        '/cronos/tipos-unidad',
        '/cronos/unidades-medida',
        '/cronos/categorias',
        '/cronos/alergenos',
      ],
      children: [
        { label: 'Tipos de Unidad', icon: 'pi pi-sitemap', routerLink: '/cronos/tipos-unidad' },
        { label: 'Unidades de Medida', icon: 'pi pi-calculator', routerLink: '/cronos/unidades-medida' },
        { label: 'Categorías', icon: 'pi pi-tags', routerLink: '/cronos/categorias' },
        { label: 'Alérgenos', icon: 'pi pi-exclamation-triangle', routerLink: '/cronos/alergenos' },
      ],
    },
    {
      icon: 'pi pi-shopping-bag',
      label: 'Ingredientes',
      route: '/cronos/ingredientes',
      activePrefixes: ['/cronos/ingredientes'],
    },
    {
      icon: 'pi pi-book',
      label: 'Mis Recetas',
      route: '/cronos/recetas',
      activePrefixes: ['/cronos/recetas'],
    },
    {
      icon: 'pi pi-file-edit',
      label: 'Mis Cotizaciones',
      route: '/cronos/cotizaciones',
      activePrefixes: ['/cronos/cotizaciones'],
    },
    {
      icon: 'pi pi-wallet',
      label: 'Costos Fijos',
      route: '/cronos/costos-fijos',
      activePrefixes: ['/cronos/costos-fijos'],
    },
    {
      icon: 'pi pi-user',
      label: 'Cuenta',
      activePrefixes: ['/cronos/cuenta'],
      children: [
        { label: 'Mi Cuenta', icon: 'pi pi-user', routerLink: '/cronos/cuenta/mi-cuenta' },
        { label: 'Seguridad', icon: 'pi pi-lock', routerLink: '/cronos/cuenta/seguridad' },
      ],
    },
  ];

  const adminChildren: MenuItem[] = [];
  if (hasAdminRole) {
    adminChildren.push({ label: 'Gestión de Usuarios', icon: 'pi pi-users', routerLink: '/cronos/admin/usuarios' });
  }
  if (hasSuperAdminRole) {
    adminChildren.push({ label: 'Gestión de Roles', icon: 'pi pi-shield', routerLink: '/cronos/admin/roles' });
  }
  if (adminChildren.length > 0) {
    rail.push({
      icon: 'pi pi-shield',
      label: 'Administración',
      activePrefixes: ['/cronos/admin'],
      children: adminChildren,
    });
  }

  return rail;
}

/** Grouped model reused by the mobile drawer (full-text panel menu). */
export function buildAppMenu(hasAdminRole: boolean, hasSuperAdminRole: boolean): MenuItem[] {
  const adminItems: MenuItem[] = [];
  if (hasAdminRole) {
    adminItems.push({ label: 'Gestión de Usuarios', icon: 'pi pi-users', routerLink: '/cronos/admin/usuarios' });
  }
  if (hasSuperAdminRole) {
    adminItems.push({ label: 'Gestión de Roles', icon: 'pi pi-shield', routerLink: '/cronos/admin/roles' });
  }

  const menu: MenuItem[] = [
    {
      label: 'General',
      items: [{ label: 'Dashboard', icon: 'pi pi-home', routerLink: '/dashboard' }],
    },
    {
      label: 'Catálogos',
      items: [
        { label: 'Tipos de Unidad', icon: 'pi pi-sitemap', routerLink: '/cronos/tipos-unidad' },
        { label: 'Unidades de Medida', icon: 'pi pi-calculator', routerLink: '/cronos/unidades-medida' },
        { label: 'Categorías', icon: 'pi pi-tags', routerLink: '/cronos/categorias' },
        { label: 'Alérgenos', icon: 'pi pi-exclamation-triangle', routerLink: '/cronos/alergenos' },
        { label: 'Ingredientes', icon: 'pi pi-shopping-bag', routerLink: '/cronos/ingredientes' },
      ],
    },
    {
      label: 'Operación',
      items: [
        { label: 'Costos Fijos', icon: 'pi pi-wallet', routerLink: '/cronos/costos-fijos' },
        { label: 'Mis Recetas', icon: 'pi pi-book', routerLink: '/cronos/recetas' },
        { label: 'Mis Cotizaciones', icon: 'pi pi-file-edit', routerLink: '/cronos/cotizaciones' },
      ],
    },
    {
      label: 'Cuenta',
      items: [
        { label: 'Mi Cuenta', icon: 'pi pi-user', routerLink: '/cronos/cuenta/mi-cuenta' },
        { label: 'Seguridad', icon: 'pi pi-lock', routerLink: '/cronos/cuenta/seguridad' },
      ],
    },
  ];

  if (adminItems.length > 0) {
    menu.push({ label: 'Administración', items: adminItems });
  }

  return menu;
}
