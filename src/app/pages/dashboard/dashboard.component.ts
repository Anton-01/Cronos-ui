import { ChangeDetectionStrategy, Component, OnInit, computed, effect, inject, signal } from '@angular/core';
import { Observable, catchError, forkJoin, map, of } from 'rxjs';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { DestroyRef } from '@angular/core';

import { IngredientService } from 'src/app/core/services/domain/ingredient.service';
import { LanguageService } from 'src/app/core/services/language.service';
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
  key: MetricKey;
  label: string;
  caption: string;
  icon: string;
  accent: StatCardAccent;
  route: string;
}

type MetricKey = 'recipes' | 'quotes' | 'ingredients' | 'fixedCosts';

/**
 * Everything about a tile except its live count and its translated copy.
 * Accent order is fixed by Context.md §12.2: green, navy, amber, slate.
 */
interface MetricDefinition {
  key: MetricKey;
  /** Key suffix under `DASHBOARD.TILES` — the labels live in the bundles. */
  copyKey: string;
  icon: string;
  accent: StatCardAccent;
  route: string;
}

const METRIC_DEFINITIONS: readonly MetricDefinition[] = [
  { key: 'recipes', copyKey: 'RECIPES', icon: 'pi pi-book', accent: 'green', route: '/cronos/recetas' },
  { key: 'quotes', copyKey: 'QUOTES', icon: 'pi pi-file-edit', accent: 'navy', route: '/cronos/cotizaciones' },
  {
    key: 'ingredients',
    copyKey: 'INGREDIENTS',
    icon: 'pi pi-shopping-bag',
    accent: 'amber',
    route: '/cronos/ingredientes',
  },
  {
    key: 'fixedCosts',
    copyKey: 'FIXED_COSTS',
    icon: 'pi pi-wallet',
    accent: 'slate',
    route: '/cronos/costos-fijos',
  },
];

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
  private readonly language = inject(LanguageService);

  readonly greeting = computed(() => {
    const user = this.profileState.user();
    const name = user?.firstName || user?.username || '';
    return name
      ? this.language.t('DASHBOARD.GREETING', { name })
      : this.language.t('DASHBOARD.GREETING_ANONYMOUS');
  });

  readonly subtitle = computed(() => this.language.t('DASHBOARD.SUBTITLE'));

  readonly isLoading = signal(true);
  readonly counts = signal<Record<MetricKey, number>>({
    recipes: 0,
    quotes: 0,
    ingredients: 0,
    fixedCosts: 0,
  });

  readonly metrics = computed<MetricTile[]>(() =>
    METRIC_DEFINITIONS.map((definition) => ({
      key: definition.key,
      label: this.language.t(`DASHBOARD.TILES.${definition.copyKey}.LABEL`),
      caption: this.language.t(`DASHBOARD.TILES.${definition.copyKey}.CAPTION`),
      icon: definition.icon,
      accent: definition.accent,
      route: definition.route,
    })),
  );

  constructor() {
    // Re-titles on a language switch without re-counting.
    effect(() => this.pageInfoService.updateTitle(this.language.t('DASHBOARD.TITLE')));
  }

  ngOnInit(): void {
    this.pageInfoService.updateBreadcrumbs([]);
    this.loadCounts();
  }

  countOf(key: MetricKey): number {
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
