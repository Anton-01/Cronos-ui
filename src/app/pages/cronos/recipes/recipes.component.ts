import { DecimalPipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, DestroyRef, computed, effect, inject, signal, untracked } from '@angular/core';
import { takeUntilDestroyed, toSignal } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { TranslatePipe } from '@ngx-translate/core';
import { ButtonModule } from 'primeng/button';
import { IconFieldModule } from 'primeng/iconfield';
import { InputIconModule } from 'primeng/inputicon';
import { InputTextModule } from 'primeng/inputtext';
import { MultiSelectModule } from 'primeng/multiselect';
import { PaginatorModule, PaginatorState } from 'primeng/paginator';
import { SkeletonModule } from 'primeng/skeleton';
import { TooltipModule } from 'primeng/tooltip';
import { Subject, catchError, debounceTime, distinctUntilChanged, of, switchMap } from 'rxjs';

import { PERMISSIONS } from 'src/app/core/constants/permissions';
import { CostStatus, RecipeQuery, RecipeStats, RecipeStatus, RecipeSummary } from 'src/app/core/models/kitchen.models';
import { AuthorizationService } from 'src/app/core/services/authorization.service';
import { AllergenService } from 'src/app/core/services/domain/allergen.service';
import { RecipeService } from 'src/app/core/services/domain/recipe.service';
import { LanguageService } from 'src/app/core/services/language.service';
import { PageInfoService } from 'src/app/core/services/page-info.service';
import { catalogErrorMessage } from 'src/app/core/utils/catalog-error.util';
import { StatCardComponent } from 'src/app/shared/components/stat-card/stat-card.component';
import { AlertService } from 'src/app/shared/services/alert.service';
import { AllergenBadgesComponent } from '../kitchen-shared/allergen-badges.component';
import { CostStatusTagComponent } from '../kitchen-shared/cost-status-tag.component';
import { DIFFICULTY_ICON, RECIPE_STATUS_PILL, formatMinutes, recipeStatusOptions } from '../kitchen-shared/kitchen-labels';
import { KitchenLookupsStore } from '../kitchen-shared/kitchen-lookups.store';

const PAGE_SIZE = 12;

/** Recipe library: searchable, filterable by allergens it must be free of, with each recipe's cost health. */
@Component({
  selector: 'app-recipes',
  standalone: true,
  imports: [
    DecimalPipe,
    FormsModule,
    RouterLink,
    TranslatePipe,
    ButtonModule,
    IconFieldModule,
    InputIconModule,
    InputTextModule,
    MultiSelectModule,
    PaginatorModule,
    SkeletonModule,
    TooltipModule,
    StatCardComponent,
    AllergenBadgesComponent,
    CostStatusTagComponent,
  ],
  templateUrl: './recipes.component.html',
  styleUrls: ['./recipes.component.scss', '../admin/users/user-list/user-list.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class RecipesComponent {
  private readonly recipeService = inject(RecipeService);
  private readonly authorization = inject(AuthorizationService);
  private readonly lookups = inject(KitchenLookupsStore);
  private readonly alert = inject(AlertService);
  private readonly language = inject(LanguageService);
  private readonly pageInfo = inject(PageInfoService);
  private readonly destroyRef = inject(DestroyRef);

  protected readonly statusPill = RECIPE_STATUS_PILL;
  protected readonly difficultyIcon = DIFFICULTY_ICON;
  protected readonly pageSize = PAGE_SIZE;
  protected readonly skeletons = Array.from({ length: 8 });

  protected readonly recipes = signal<RecipeSummary[]>([]);
  protected readonly total = signal(0);
  protected readonly loading = signal(true);
  protected readonly stats = signal<RecipeStats | null>(null);
  protected readonly statsLoading = signal(true);
  protected readonly first = signal(0);

  protected readonly search = signal('');
  protected readonly categoryIds = signal<number[]>([]);
  protected readonly statuses = signal<RecipeStatus[]>([]);
  protected readonly freeOf = signal<number[]>([]);
  protected readonly costStatus = signal<CostStatus | null>(null);

  private readonly allergenCatalog = toSignal(inject(AllergenService).active().pipe(catchError(() => of([]))), { initialValue: [] });
  protected readonly allergenOptions = computed(() => this.allergenCatalog().map((allergen) => ({ label: allergen.name, value: allergen.id })));
  protected readonly categoryOptions = computed(() => this.lookups.snapshot().productCategories.map((category) => ({ label: category.name, value: category.id })));
  protected readonly statusOptions = computed(() => recipeStatusOptions((key) => this.language.t(key)));
  protected readonly canCreate = computed(() => this.authorization.can(PERMISSIONS.RECIPE_CREATE));
  protected readonly hasFilters = computed(
    () => !!this.search() || this.categoryIds().length > 0 || this.statuses().length > 0 || this.freeOf().length > 0 || this.costStatus() !== null,
  );

  private readonly page = signal(0);
  private readonly requests = new Subject<RecipeQuery>();
  private readonly searchInput = new Subject<string>();

  constructor() {
    effect(() => {
      this.pageInfo.updateTitle(this.language.t('KITCHEN.RECIPES.TITLE'));
      this.pageInfo.updateDescription(this.language.t('KITCHEN.RECIPES.DESCRIPTION'));
      this.pageInfo.updateBreadcrumbs([
        { title: this.language.t('BREADCRUMB.HOME'), path: '/dashboard', isActive: false },
        { title: this.language.t('KITCHEN.RECIPES.TITLE'), path: '', isActive: true },
      ]);
    });
    this.requests
      .pipe(
        switchMap((query) => {
          this.loading.set(true);
          return this.recipeService.search(query).pipe(
            catchError((error: unknown) => {
              this.alert.error(catalogErrorMessage(error, this.language.t('KITCHEN.RECIPES.LOAD_FAILED')));
              return of(null);
            }),
          );
        }),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe((response) => {
        this.recipes.set(response?.data?.content ?? []);
        this.total.set(response?.data?.totalElements ?? 0);
        this.loading.set(false);
      });
    this.searchInput
      .pipe(debounceTime(300), distinctUntilChanged(), takeUntilDestroyed(this.destroyRef))
      .subscribe((term) => this.applyFilter(() => this.search.set(term)));
    effect(() => {
      const query: RecipeQuery = {
        page: this.page(),
        size: PAGE_SIZE,
        sort: 'updatedAt,desc',
        search: this.search() || undefined,
        categoryIds: this.categoryIds(),
        statuses: this.statuses(),
        freeOfAllergenIds: this.freeOf(),
        costStatus: this.costStatus() ?? undefined,
      };
      untracked(() => this.requests.next(query));
    });
    this.lookups.load().subscribe();
    this.recipeService.stats().subscribe({
      next: (response) => {
        this.stats.set(response.data);
        this.statsLoading.set(false);
      },
      error: () => this.statsLoading.set(false),
    });
  }

  protected onSearch(term: string): void {
    this.searchInput.next(term.trim());
  }

  protected setCategories(value: number[]): void {
    this.applyFilter(() => this.categoryIds.set(value));
  }

  protected setStatuses(value: RecipeStatus[]): void {
    this.applyFilter(() => this.statuses.set(value));
  }

  protected setFreeOf(value: number[]): void {
    this.applyFilter(() => this.freeOf.set(value));
  }

  protected quick(filter: 'ALL' | 'ACTIVE' | 'DRAFT' | 'STALE'): void {
    this.applyFilter(() => {
      this.statuses.set(filter === 'ACTIVE' ? ['ACTIVE'] : filter === 'DRAFT' ? ['DRAFT'] : []);
      this.costStatus.set(filter === 'STALE' ? 'STALE' : null);
    });
  }

  protected clearFilters(): void {
    this.applyFilter(() => {
      this.search.set('');
      this.categoryIds.set([]);
      this.statuses.set([]);
      this.freeOf.set([]);
      this.costStatus.set(null);
    });
  }

  private applyFilter(change: () => void): void {
    change();
    this.first.set(0);
    this.page.set(0);
  }

  protected onPage(event: PaginatorState): void {
    this.first.set(event.first ?? 0);
    this.page.set(event.page ?? 0);
  }

  protected time(minutes: number): string {
    return formatMinutes(minutes, (key) => this.language.t(key));
  }
}
