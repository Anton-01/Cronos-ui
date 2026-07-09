import { ChangeDetectionStrategy, Component, OnInit, computed, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { CardModule } from 'primeng/card';

import { PageInfoService } from 'src/app/core/services/page-info.service';
import { ProfileStateService } from 'src/app/core/services/profile/ProfileStateService';

interface QuickLink {
  label: string;
  description: string;
  icon: string;
  route: string;
}

@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [RouterLink, CardModule],
  templateUrl: './dashboard.component.html',
  styleUrl: './dashboard.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DashboardComponent implements OnInit {
  private readonly pageInfoService = inject(PageInfoService);
  private readonly profileState = inject(ProfileStateService);

  readonly greeting = computed(() => {
    const user = this.profileState.user();
    const name = user?.firstName || user?.username || '';
    return name ? `¡Hola, ${name}!` : '¡Bienvenido!';
  });

  readonly quickLinks: QuickLink[] = [
    {
      label: 'Mis Recetas',
      description: 'Crea y gestiona tus recetas con costos calculados.',
      icon: 'pi pi-book',
      route: '/cronos/recetas',
    },
    {
      label: 'Mis Cotizaciones',
      description: 'Genera cotizaciones para tus clientes.',
      icon: 'pi pi-file-edit',
      route: '/cronos/cotizaciones',
    },
    {
      label: 'Ingredientes',
      description: 'Administra tu catálogo de ingredientes y precios.',
      icon: 'pi pi-shopping-basket',
      route: '/cronos/ingredientes',
    },
    {
      label: 'Costos Fijos',
      description: 'Controla los costos fijos de tu operación.',
      icon: 'pi pi-wallet',
      route: '/cronos/costos-fijos',
    },
  ];

  ngOnInit(): void {
    this.pageInfoService.updateTitle('Dashboard');
    this.pageInfoService.updateBreadcrumbs([]);
  }
}
