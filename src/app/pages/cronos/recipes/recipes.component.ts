import { ChangeDetectionStrategy, Component, OnInit, computed, effect, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';

import { TranslatePipe } from '@ngx-translate/core';
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
import { LanguageService } from 'src/app/core/services/language.service';
import { SelectOption, EntityStatus, statusOptions } from 'src/app/shared/i18n/catalog-options';
import { PageInfoService } from 'src/app/core/services/page-info.service';
import { AlertService } from 'src/app/shared/services/alert.service';
import { ConfirmService } from 'src/app/shared/services/confirm.service';
import { TableSkeletonRowComponent } from 'src/app/shared/components/table-skeleton-row/table-skeleton-row.component';

@Component({
  selector: 'app-recipes',
  standalone: true,
  imports: [
    TranslatePipe,
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
    TableSkeletonRowComponent,
  ],
  templateUrl: './recipes.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class RecipesComponent implements OnInit {
  private readonly recipeService = inject(RecipeService);
  private readonly alertService = inject(AlertService);
  private readonly confirmService = inject(ConfirmService);
  private readonly pageInfoService = inject(PageInfoService);
  private readonly language = inject(LanguageService);
  private readonly router = inject(Router);

  readonly items = signal<RecipeResponse[]>([]);
  readonly isLoading = signal(false);
  protected readonly skeletonRows = Array.from({ length: 6 });
  selectedItems: RecipeResponse[] = [];

  readonly statusFilterOptions = computed<SelectOption<EntityStatus>[]>(() =>
    statusOptions((key) => this.language.t(key)),
  );

  constructor() {
    // Page chrome re-renders on a language switch; the fetch stays in ngOnInit.
    effect(() => {
      this.pageInfoService.updateTitle(this.language.t('RECIPES.TITLE'));
      this.pageInfoService.updateDescription(this.language.t('RECIPES.DESCRIPTION'));
      this.pageInfoService.updateBreadcrumbs([
        { title: this.language.t('BREADCRUMB.HOME'), path: '/dashboard', isActive: false },
        { title: this.language.t('BREADCRUMB.OPERATIONS'), path: '', isActive: false },
        { title: this.language.t('RECIPES.TITLE'), path: '', isActive: true },
      ]);
    });
  }

  ngOnInit(): void {
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
        this.alertService.error(
          err?.error?.message || err?.message || this.language.t('RECIPES.TOAST.LOAD_FAILED'),
        );
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
        this.alertService.success(this.language.t('RECIPES.TOAST.DELETED'));
      },
      error: (err) => {
        this.alertService.error(
          err?.error?.message || err?.message || this.language.t('COMMON.TOAST.DELETE_FAILED'),
        );
      },
    });
  }
}
