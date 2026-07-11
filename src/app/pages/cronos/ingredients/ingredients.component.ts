import { ChangeDetectionStrategy, Component, OnInit, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';

import { ButtonModule } from 'primeng/button';
import { CardModule } from 'primeng/card';
import { IconFieldModule } from 'primeng/iconfield';
import { InputIconModule } from 'primeng/inputicon';
import { InputTextModule } from 'primeng/inputtext';
import { SelectModule } from 'primeng/select';
import { TableModule } from 'primeng/table';
import { TagModule } from 'primeng/tag';
import { TooltipModule } from 'primeng/tooltip';

import { IngredientService } from 'src/app/core/services/domain/ingredient.service';
import { IngredientResponse } from 'src/app/core/models/domain.model';
import { PageInfoService } from 'src/app/core/services/page-info.service';
import { AlertService } from 'src/app/shared/services/alert.service';
import { ConfirmService } from 'src/app/shared/services/confirm.service';
import { StatusToggleComponent } from 'src/app/shared/components/status-toggle/status-toggle.component';

const STATUS_FILTER_OPTIONS = [
  { label: 'Activo', value: 'ACTIVE' },
  { label: 'Inactivo', value: 'INACTIVE' },
];

@Component({
  selector: 'app-ingredients',
  standalone: true,
  imports: [
    FormsModule,
    ButtonModule,
    CardModule,
    IconFieldModule,
    InputIconModule,
    InputTextModule,
    SelectModule,
    TableModule,
    TagModule,
    TooltipModule,
    StatusToggleComponent,
  ],
  templateUrl: './ingredients.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class IngredientsComponent implements OnInit {
  private readonly ingredientService = inject(IngredientService);
  private readonly alertService = inject(AlertService);
  private readonly confirmService = inject(ConfirmService);
  private readonly pageInfoService = inject(PageInfoService);
  private readonly router = inject(Router);

  readonly items = signal<IngredientResponse[]>([]);
  readonly isLoading = signal(false);
  selectedItems: IngredientResponse[] = [];

  readonly statusFilterOptions = STATUS_FILTER_OPTIONS;

  ngOnInit(): void {
    this.pageInfoService.updateTitle('Ingredientes');
    this.pageInfoService.updateDescription('Gestión del catálogo de ingredientes y sus costos');
    this.pageInfoService.updateBreadcrumbs([
      { title: 'Inicio', path: '/dashboard', isActive: false },
      { title: 'Catálogos', path: '', isActive: false },
      { title: 'Ingredientes', path: '', isActive: true },
    ]);
    this.load();
  }

  load(): void {
    this.isLoading.set(true);
    this.ingredientService.getAll({ page: 0, size: 1000, sort: 'name,asc' }).subscribe({
      next: (res) => {
        this.items.set(res.data.content);
        this.isLoading.set(false);
      },
      error: (err) => {
        this.isLoading.set(false);
        this.alertService.error(err?.message || 'Error al cargar ingredientes');
      },
    });
  }

  openCreate(): void {
    this.router.navigate(['/cronos/ingredientes/nuevo']);
  }

  openEdit(item: IngredientResponse): void {
    this.router.navigate(['/cronos/ingredientes/editar', item.id]);
  }

  async confirmDelete(item: IngredientResponse): Promise<void> {
    const confirmed = await this.confirmService.confirmDelete(item.name);
    if (!confirmed) {
      return;
    }
    this.ingredientService.delete(item.id).subscribe({
      next: () => {
        this.load();
        this.alertService.success('Ingrediente eliminado correctamente');
      },
      error: (err) => {
        this.alertService.error(err?.message || 'Error al eliminar');
      },
    });
  }

  formatCurrency(value: number): string {
    return '$' + value.toFixed(2);
  }

  formatPercentage(value: number): string {
    return value.toFixed(2) + '%';
  }

  formatQuantity(value: number): string {
    return value.toFixed(4);
  }

  updateItemStatus(id: string, newStatus: 'ACTIVE' | 'INACTIVE'): void {
    this.items.update((current) =>
      current.map((item) => (item.id === id ? { ...item, status: newStatus } : item))
    );
  }
}
