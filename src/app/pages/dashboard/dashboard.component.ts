import { ChangeDetectionStrategy, Component, OnInit, computed, inject, signal } from '@angular/core';
import { Observable, catchError, forkJoin, map, of } from 'rxjs';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { DestroyRef } from '@angular/core';

import { IngredientService } from 'src/app/core/services/domain/ingredient.service';
import { PageInfoService } from 'src/app/core/services/page-info.service';
import { ProfileStateService } from 'src/app/core/services/profile/ProfileStateService';
import { QuoteService } from 'src/app/core/services/domain/quote.service';
import { RecipeService } from 'src/app/core/services/domain/recipe.service';
import { UserFixedCostService } from 'src/app/core/services/domain/user-fixed-cost.service';
import { ApiResponse } from 'src/app/core/models/api-response.model';
import { Page } from 'src/app/core/models/pagination.model';
import { StatCardAccent, StatCardComponent } from 'src/app/shared/components/stat-card/stat-card.component';

/** A dashboard metric tile: a live count that doubles as a shortcut. */
interface MetricTile {
  key: 'recipes' | 'quotes' | 'ingredients' | 'fixedCosts';
  label: string;
  caption: string;
  icon: string;
  accent: StatCardAccent;
  route: string;
}

/** Counting only needs `totalElements`, so ask the API for the smallest page it will serve. */
const COUNT_PAGE = { page: 0, size: 1 };

@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [StatCardComponent],
  templateUrl: './dashboard.component.html',
  styleUrl: './dashboard.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DashboardComponent implements OnInit {
  private readonly pageInfoService = inject(PageInfoService);
  private readonly profileState = inject(ProfileStateService);
  private readonly recipeService = inject(RecipeService);
  private readonly quoteService = inject(QuoteService);
  private readonly ingredientService = inject(IngredientService);
  private readonly fixedCostService = inject(UserFixedCostService);
  private readonly destroyRef = inject(DestroyRef);

  readonly greeting = computed(() => {
    const user = this.profileState.user();
    const name = user?.firstName || user?.username || '';
    return name ? `Hi, ${name}!` : 'Welcome!';
  });

  readonly isLoading = signal(true);
  readonly counts = signal<Record<MetricTile['key'], number>>({
    recipes: 0,
    quotes: 0,
    ingredients: 0,
    fixedCosts: 0,
  });

  /** Accent order is fixed by Context.md §12.2: green, navy, amber, slate. */
  readonly metrics: MetricTile[] = [
    {
      key: 'recipes',
      label: 'My Recipes',
      caption: 'Recipes with calculated costs',
      icon: 'pi pi-book',
      accent: 'green',
      route: '/cronos/recetas',
    },
    {
      key: 'quotes',
      label: 'My Quotes',
      caption: 'Quotes generated for clients',
      icon: 'pi pi-file-edit',
      accent: 'navy',
      route: '/cronos/cotizaciones',
    },
    {
      key: 'ingredients',
      label: 'Ingredients',
      caption: 'Items in your catalog',
      icon: 'pi pi-shopping-bag',
      accent: 'amber',
      route: '/cronos/ingredientes',
    },
    {
      key: 'fixedCosts',
      label: 'Fixed Costs',
      caption: 'Costs tracked for your operation',
      icon: 'pi pi-wallet',
      accent: 'slate',
      route: '/cronos/costos-fijos',
    },
  ];

  ngOnInit(): void {
    this.pageInfoService.updateTitle('Dashboard');
    this.pageInfoService.updateBreadcrumbs([]);
    this.loadCounts();
  }

  countOf(key: MetricTile['key']): number {
    return this.counts()[key];
  }

  /**
   * A failed count must not blank the dashboard: each request falls back to 0
   * so one unavailable endpoint still leaves the other three tiles correct.
   */
  private loadCounts(): void {
    forkJoin({
      recipes: this.countFrom(this.recipeService.getAll(COUNT_PAGE)),
      quotes: this.countFrom(this.quoteService.getAll(COUNT_PAGE)),
      ingredients: this.countFrom(this.ingredientService.getAll(COUNT_PAGE)),
      fixedCosts: this.countFrom(this.fixedCostService.getAll(COUNT_PAGE)),
    })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((counts) => {
        this.counts.set(counts);
        this.isLoading.set(false);
      });
  }

  private countFrom(
    source: Observable<ApiResponse<Page<unknown>>>,
  ): Observable<number> {
    return source.pipe(
      map((response) => response.data?.totalElements ?? 0),
      catchError(() => of(0)),
    );
  }
}
