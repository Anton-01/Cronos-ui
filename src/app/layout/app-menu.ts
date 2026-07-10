import { MenuItem } from 'primeng/api';

/**
 * Sidebar navigation model. Admin items are filtered by role at runtime
 * (see MainLayoutComponent) — routes are also protected by roleGuard.
 */
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
        { label: 'Ingredientes', icon: 'pi pi-shopping-basket', routerLink: '/cronos/ingredientes' },
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
