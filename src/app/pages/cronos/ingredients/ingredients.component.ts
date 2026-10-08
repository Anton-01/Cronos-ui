import { DatePipe, DecimalPipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, DestroyRef, computed, effect, inject, signal, untracked } from '@angular/core';
import { takeUntilDestroyed, toSignal } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { TranslatePipe } from '@ngx-translate/core';
import { MenuItem } from 'primeng/api';
import { ButtonModule } from 'primeng/button';
import { CardModule } from 'primeng/card';
import { IconFieldModule } from 'primeng/iconfield';
import { InputIconModule } from 'primeng/inputicon';
import { InputTextModule } from 'primeng/inputtext';
import { MenuModule } from 'primeng/menu';
import { MultiSelectModule } from 'primeng/multiselect';
import { SelectModule } from 'primeng/select';
import { TableLazyLoadEvent, TableModule } from 'primeng/table';
import { TagModule } from 'primeng/tag';
import { ToggleSwitchModule } from 'primeng/toggleswitch';
import { TooltipModule } from 'primeng/tooltip';
import { Subject, catchError, debounceTime, distinctUntilChanged, of, switchMap } from 'rxjs';

import { PERMISSIONS } from 'src/app/core/constants/permissions';
import { CatalogScope, IngredientQuery, IngredientStats, IngredientSummary, PriceImpact } from 'src/app/core/models/kitchen.models';
import { AuthorizationService } from 'src/app/core/services/authorization.service';
import { AllergenService } from 'src/app/core/services/domain/allergen.service';
import { IngredientService } from 'src/app/core/services/domain/ingredient.service';
import { LanguageService } from 'src/app/core/services/language.service';
import { PageInfoService } from 'src/app/core/services/page-info.service';
import { catalogErrorMessage } from 'src/app/core/utils/catalog-error.util';
import { StatCardComponent } from 'src/app/shared/components/stat-card/stat-card.component';
import { TableSkeletonRowComponent } from 'src/app/shared/components/table-skeleton-row/table-skeleton-row.component';
import { AlertService } from 'src/app/shared/services/alert.service';
import { ConfirmService } from 'src/app/shared/services/confirm.service';
import { AllergenBadgesComponent } from '../kitchen-shared/allergen-badges.component';
import { PRICE_SOURCE_SEVERITY, TagSeverity } from '../kitchen-shared/kitchen-labels';
import { KitchenLookupsStore } from '../kitchen-shared/kitchen-lookups.store';
import { PriceDialogComponent } from '../kitchen-shared/price-dialog.component';

type QuickFilter = 'ALL' | 'OWN' | 'STALE' | 'ALLERGENS';

/**
 * Ingredient catalog: the platform master list (SYSTEM) plus the caller's
 * own ingredients (USER), with each one's effective cost, where that cost
 * comes from (own price / market reference / none) and whether it is stale.
 */
@Component({
  selector: 'app-ingredients',
  standalone: true,
  imports: [
    DatePipe,
    DecimalPipe,
    FormsModule,
    RouterLink,
    TranslatePipe,
    ButtonModule,
    CardModule,
    IconFieldModule,
    InputIconModule,
    InputTextModule,
    MenuModule,
    MultiSelectModule,
    SelectModule,
    TableModule,
    TagModule,
    ToggleSwitchModule,
    TooltipModule,
    StatCardComponent,
    TableSkeletonRowComponent,
    AllergenBadgesComponent,
    PriceDialogComponent,
  ],
  templateUrl: './ingredients.component.html',
  styleUrl: '../admin/users/user-list/user-list.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class IngredientsComponent {
  private readonly ingredientService = inject(IngredientService);
  private readonly authorization = inject(AuthorizationService);
  private readonly lookups = inject(KitchenLookupsStore);
  private readonly alert = inject(AlertService);
  private readonly confirm = inject(ConfirmService);
  private readonly language = inject(LanguageService);
  private readonly pageInfo = inject(PageInfoService);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);

  protected readonly perms = PERMISSIONS;
  protected readonly priceSeverity: Readonly<Record<string, TagSeverity>> = PRICE_SOURCE_SEVERITY;
  protected readonly skeletonRows = Array.from({ length: 8 });

  protected readonly rows = signal<IngredientSummary[]>([]);
  protected readonly total = signal(0);
  protected readonly loading = signal(true);
  protected readonly first = signal(0);
  protected readonly stats = signal<IngredientStats | null>(null);
  protected readonly statsLoading = signal(true);
  protected readonly rowMenu = signal<MenuItem[]>([]);

  protected readonly search = signal('');
  protected readonly categoryIds = signal<number[]>([]);
  protected readonly allergenIds = signal<number[]>([]);
  protected readonly excludeAllergens = signal(false);
  protected readonly scope = signal<CatalogScope | null>(null);
  protected readonly staleOnly = signal(false);
  private readonly paging = signal({ page: 0, size: 15, sort: 'name,asc' });

  protected readonly priceTarget = signal<IngredientSummary | null>(null);
  protected readonly priceOpen = signal(false);

  private readonly allergenCatalog = toSignal(inject(AllergenService).active().pipe(catchError(() => of([]))), { initialValue: [] });
  protected readonly allergenOptions = computed(() => this.allergenCatalog().map((allergen) => ({ label: allergen.name, value: allergen.id })));
  protected readonly categoryOptions = computed(() =>
    this.lookups.snapshot().ingredientCategories.map((category) => ({ label: category.name, value: category.id })),
  );
  protected readonly scopeOptions = computed(() => [
    { label: this.language.t('KITCHEN.SCOPE.SYSTEM'), value: 'SYSTEM' as CatalogScope },
    { label: this.language.t('KITCHEN.SCOPE.USER'), value: 'USER' as CatalogScope },
  ]);
  protected readonly hasFilters = computed(
    () => !!this.search() || this.categoryIds().length > 0 || this.allergenIds().length > 0 || this.scope() !== null || this.staleOnly(),
  );
  protected readonly canCreate = computed(() => this.authorization.can(PERMISSIONS.INGREDIENT_CREATE));

  private readonly requests = new Subject<IngredientQuery>();
  private readonly searchInput = new Subject<string>();

  constructor() {
    effect(() => {
      this.pageInfo.updateTitle(this.language.t('KITCHEN.INGREDIENTS.TITLE'));
      this.pageInfo.updateDescription(this.language.t('KITCHEN.INGREDIENTS.DESCRIPTION'));
      this.pageInfo.updateBreadcrumbs([
        { title: this.language.t('BREADCRUMB.HOME'), path: '/dashboard', isActive: false },
        { title: this.language.t('NAV.SECTIONS.OPERATIONS'), path: '', isActive: false },
        { title: this.language.t('KITCHEN.INGREDIENTS.TITLE'), path: '', isActive: true },
      ]);
    });

    this.requests
      .pipe(
        switchMap((query) => {
          this.loading.set(true);
          return this.ingredientService.search(query).pipe(
            catchError((error: unknown) => {
              this.alert.error(catalogErrorMessage(error, this.language.t('KITCHEN.INGREDIENTS.LOAD_FAILED')));
              return of(null);
            }),
          );
        }),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe((response) => {
        this.rows.set(response?.data?.content ?? []);
        this.total.set(response?.data?.totalElements ?? 0);
        this.loading.set(false);
      });

    this.searchInput
      .pipe(debounceTime(300), distinctUntilChanged(), takeUntilDestroyed(this.destroyRef))
      .subscribe((term) => this.applyFilter(() => this.search.set(term)));

    effect(() => {
      const query = this.buildQuery();
      untracked(() => this.requests.next(query));
    });

    this.lookups.load().subscribe();
    this.loadStats();
  }

  private loadStats(): void {
    this.statsLoading.set(true);
    this.ingredientService.stats().subscribe({
      next: (response) => {
        this.stats.set(response.data);
        this.statsLoading.set(false);
      },
      error: () => this.statsLoading.set(false),
    });
  }

  protected reload(): void {
    this.requests.next(this.buildQuery());
    this.loadStats();
  }

  protected onLazyLoad(event: TableLazyLoadEvent): void {
    const size = event.rows ?? 15;
    const field = typeof event.sortField === 'string' ? event.sortField : 'name';
    const next = { page: Math.floor((event.first ?? 0) / size), size, sort: `${field},${event.sortOrder === -1 ? 'desc' : 'asc'}` };
    const current = this.paging();
    if (current.page !== next.page || current.size !== next.size || current.sort !== next.sort) {
      this.first.set(event.first ?? 0);
      this.paging.set(next);
    }
  }

  protected onSearch(term: string): void {
    this.searchInput.next(term.trim());
  }

  protected setCategories(value: number[]): void {
    this.applyFilter(() => this.categoryIds.set(value));
  }

  protected setAllergens(value: number[]): void {
    this.applyFilter(() => this.allergenIds.set(value));
  }

  protected setExclude(value: boolean): void {
    this.applyFilter(() => this.excludeAllergens.set(value));
  }

  protected setScope(value: CatalogScope | null): void {
    this.applyFilter(() => this.scope.set(value));
  }

  protected quickFilter(filter: QuickFilter): void {
    this.applyFilter(() => {
      this.scope.set(filter === 'OWN' ? 'USER' : null);
      this.staleOnly.set(filter === 'STALE');
      if (filter === 'ALLERGENS') {
        this.allergenIds.set(this.allergenCatalog().map((allergen) => allergen.id));
        this.excludeAllergens.set(false);
      } else {
        this.allergenIds.set([]);
      }
    });
  }

  protected clearFilters(): void {
    this.applyFilter(() => {
      this.search.set('');
      this.categoryIds.set([]);
      this.allergenIds.set([]);
      this.excludeAllergens.set(false);
      this.scope.set(null);
      this.staleOnly.set(false);
    });
  }

  private applyFilter(change: () => void): void {
    change();
    this.first.set(0);
    this.paging.update((current) => ({ ...current, page: 0 }));
  }

  private buildQuery(): IngredientQuery {
    const { page, size, sort } = this.paging();
    return {
      page,
      size,
      sort,
      search: this.search() || undefined,
      categoryIds: this.categoryIds(),
      allergenIds: this.allergenIds(),
      excludeAllergens: this.allergenIds().length > 0 ? this.excludeAllergens() : undefined,
      scope: this.scope() ?? undefined,
      priceStale: this.staleOnly() || undefined,
    };
  }

  // ─── Rows ───

  /** Cost per kg / L / pz — base units are g / ml / pz. */
  protected displayCost(row: IngredientSummary): number | null {
    if (row.costPerBaseUnit === null) {
      return null;
    }
    return row.baseDimension === 'COUNT' ? row.costPerBaseUnit : row.costPerBaseUnit * 1000;
  }

  protected displayUnit(row: IngredientSummary): string {
    return row.baseDimension === 'COUNT' ? row.baseUnitCode : row.baseDimension === 'MASS' ? 'kg' : 'L';
  }

  protected canEdit(row: IngredientSummary): boolean {
    return row.scope === 'USER'
      ? this.authorization.can(PERMISSIONS.INGREDIENT_UPDATE)
      : this.authorization.can(PERMISSIONS.CATALOG_INGREDIENT_MANAGE);
  }

  protected openPrice(row: IngredientSummary): void {
    this.priceTarget.set(row);
    this.priceOpen.set(true);
  }

  protected onPriceSaved(impact: PriceImpact): void {
    this.rows.update((list) => list.map((row) => (row.id === impact.ingredient.id ? impact.ingredient : row)));
    this.loadStats();
  }

  protected openRowMenu(row: IngredientSummary): void {
    const items: MenuItem[] = [
      { label: this.language.t('KITCHEN.INGREDIENTS.ACTIONS.OPEN'), icon: 'pi pi-external-link', command: () => this.open(row) },
      { label: this.language.t('KITCHEN.INGREDIENTS.ACTIONS.PRICE'), icon: 'pi pi-dollar', command: () => this.openPrice(row) },
      {
        label: this.language.t('KITCHEN.INGREDIENTS.ACTIONS.HISTORY'),
        icon: 'pi pi-chart-line',
        command: () => void this.router.navigate(['/cronos/ingredientes', row.id], { queryParams: { tab: 'prices' } }),
      },
    ];
    if (row.scope === 'USER' && this.authorization.can(PERMISSIONS.INGREDIENT_DELETE)) {
      items.push({ separator: true });
      items.push({
        label: this.language.t('COMMON.DELETE'),
        icon: 'pi pi-trash',
        disabled: row.usedInRecipes > 0,
        title: row.usedInRecipes > 0 ? this.language.t('KITCHEN.INGREDIENTS.DELETE_BLOCKED', { count: row.usedInRecipes }) : undefined,
        command: () => void this.remove(row),
      });
    }
    this.rowMenu.set(items);
  }

  protected open(row: IngredientSummary): void {
    void this.router.navigate(['/cronos/ingredientes', row.id]);
  }

  private async remove(row: IngredientSummary): Promise<void> {
    if (!(await this.confirm.confirmDelete(row.name))) {
      return;
    }
    this.ingredientService.delete(row.id).subscribe({
      next: () => {
        this.alert.success(this.language.t('KITCHEN.INGREDIENTS.DELETED'));
        this.reload();
      },
      error: (error: unknown) => this.alert.error(catalogErrorMessage(error, this.language.t('COMMON.TOAST.DELETE_FAILED'))),
    });
  }
}
