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

import { IngredientService } from 'src/app/core/services/domain/ingredient.service';
import { IngredientResponse } from 'src/app/core/models/domain.model';
import { LanguageService } from 'src/app/core/services/language.service';
import { PageInfoService } from 'src/app/core/services/page-info.service';
import { AlertService } from 'src/app/shared/services/alert.service';
import { ConfirmService } from 'src/app/shared/services/confirm.service';
import { StatusToggleComponent } from 'src/app/shared/components/status-toggle/status-toggle.component';
import { SelectOption, EntityStatus, statusOptions } from 'src/app/shared/i18n/catalog-options';
import { TableSkeletonRowComponent } from 'src/app/shared/components/table-skeleton-row/table-skeleton-row.component';

@Component({
  selector: 'app-ingredients',
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
  private readonly language = inject(LanguageService);
  private readonly router = inject(Router);

  readonly items = signal<IngredientResponse[]>([]);
  readonly isLoading = signal(false);
  protected readonly skeletonRows = Array.from({ length: 6 });
  selectedItems: IngredientResponse[] = [];

  readonly statusFilterOptions = computed<SelectOption<EntityStatus>[]>(() =>
    statusOptions((key) => this.language.t(key)),
  );

  constructor() {
    // Page chrome re-renders on a language switch; the fetch stays in ngOnInit.
    effect(() => {
      this.pageInfoService.updateTitle(this.language.t('INGREDIENTS.TITLE'));
      this.pageInfoService.updateDescription(this.language.t('INGREDIENTS.DESCRIPTION'));
      this.pageInfoService.updateBreadcrumbs([
        { title: this.language.t('BREADCRUMB.HOME'), path: '/dashboard', isActive: false },
        { title: this.language.t('BREADCRUMB.CATALOGS'), path: '', isActive: false },
        { title: this.language.t('INGREDIENTS.TITLE'), path: '', isActive: true },
      ]);
    });
  }

  ngOnInit(): void {
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
        this.alertService.error(err?.message || this.language.t('INGREDIENTS.TOAST.LOAD_FAILED'));
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
        this.alertService.success(this.language.t('INGREDIENTS.TOAST.DELETED'));
      },
      error: (err) => {
        this.alertService.error(err?.message || this.language.t('COMMON.TOAST.DELETE_FAILED'));
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
