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

import { RecipeService } from 'src/app/core/services/domain/recipe.service';
import { RecipeResponse } from 'src/app/core/models/domain.model';
import { PageInfoService } from 'src/app/core/services/page-info.service';
import { AlertService } from 'src/app/shared/services/alert.service';
import { ConfirmService } from 'src/app/shared/services/confirm.service';

const STATUS_FILTER_OPTIONS = [
  { label: 'Activa', value: 'ACTIVE' },
  { label: 'Borrador', value: 'DRAFT' },
];

@Component({
  selector: 'app-recipes',
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
  ],
  templateUrl: './recipes.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class RecipesComponent implements OnInit {
  private readonly recipeService = inject(RecipeService);
  private readonly alertService = inject(AlertService);
  private readonly confirmService = inject(ConfirmService);
  private readonly pageInfoService = inject(PageInfoService);
  private readonly router = inject(Router);

  readonly items = signal<RecipeResponse[]>([]);
  readonly isLoading = signal(false);

  readonly statusFilterOptions = STATUS_FILTER_OPTIONS;

  ngOnInit(): void {
    this.pageInfoService.updateTitle('Recetas');
    this.pageInfoService.updateBreadcrumbs([
      { title: 'Inicio', path: '/dashboard', isActive: false },
      { title: 'Recetas', path: '', isActive: true },
    ]);
    this.load();
  }

  load(): void {
    this.isLoading.set(true);
    this.recipeService.getAll({ page: 0, size: 1000, sort: 'name,asc' }).subscribe({
      next: (res) => {
        this.items.set(res.data.content);
        this.isLoading.set(false);
      },
      error: (err) => {
        this.isLoading.set(false);
        this.alertService.error(err?.error?.message || err?.message || 'Error al cargar recetas');
      },
    });
  }

  openCreate(): void {
    this.router.navigate(['/cronos/recetas/nueva']);
  }

  openDetail(item: RecipeResponse): void {
    this.router.navigate(['/cronos/recetas', item.id]);
  }

  openEdit(item: RecipeResponse): void {
    this.router.navigate(['/cronos/recetas/editar', item.id]);
  }

  formatDate(date: string): string {
    return new Date(date).toLocaleDateString('es-MX', { year: 'numeric', month: 'short', day: 'numeric' });
  }

  async confirmDelete(item: RecipeResponse): Promise<void> {
    const confirmed = await this.confirmService.confirmDelete(item.name);
    if (!confirmed) {
      return;
    }
    this.recipeService.delete(item.id).subscribe({
      next: () => {
        this.load();
        this.alertService.success('Receta eliminada correctamente');
      },
      error: (err) => {
        this.alertService.error(err?.error?.message || err?.message || 'Error al eliminar');
      },
    });
  }
}
