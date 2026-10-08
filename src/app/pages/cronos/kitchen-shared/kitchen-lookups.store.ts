import { Injectable, inject, signal } from '@angular/core';
import { Observable, catchError, forkJoin, map, of, shareReplay } from 'rxjs';

import { CategoryResponse, CategoryType } from 'src/app/core/models/category.model';
import { UserFixedCostResponse } from 'src/app/core/models/domain.model';
import { MeasurementUnitOptionResponse, UnitDimension } from 'src/app/core/models/unit-catalog.models';
import { CategoryService } from 'src/app/core/services/domain/category.service';
import { MeasurementUnitService } from 'src/app/core/services/domain/measurement-unit.service';
import { UserFixedCostService } from 'src/app/core/services/domain/user-fixed-cost.service';

export interface KitchenLookups {
  units: MeasurementUnitOptionResponse[];
  ingredientCategories: CategoryResponse[];
  productCategories: CategoryResponse[];
  fixedCosts: UserFixedCostResponse[];
}

const EMPTY: KitchenLookups = { units: [], ingredientCategories: [], productCategories: [], fixedCosts: [] };

/**
 * Reference data every kitchen screen needs (units, categories, fixed
 * costs), fetched once per session and shared. A failing source degrades to
 * an empty list instead of failing the screen.
 */
@Injectable({ providedIn: 'root' })
export class KitchenLookupsStore {
  private readonly units = inject(MeasurementUnitService);
  private readonly categories = inject(CategoryService);
  private readonly fixedCostService = inject(UserFixedCostService);

  private cache$: Observable<KitchenLookups> | null = null;
  readonly snapshot = signal<KitchenLookups>(EMPTY);

  load(): Observable<KitchenLookups> {
    if (!this.cache$) {
      let failed = false;
      const safe = <T>(source: Observable<T[]>): Observable<T[]> =>
        source.pipe(
          catchError(() => {
            failed = true;
            return of([] as T[]);
          }),
        );
      this.cache$ = forkJoin({
        units: safe(this.units.getCatalogOptions().pipe(map((response) => response.data ?? []))),
        ingredientCategories: safe(this.categoriesOf('INGREDIENT')),
        productCategories: safe(this.categoriesOf('PRODUCT')),
        fixedCosts: safe(
          this.fixedCostService.getAll({ page: 0, size: 200 }).pipe(map((response) => (response.data?.content ?? []).filter((cost) => cost.isActive))),
        ),
      }).pipe(
        map((lookups) => {
          this.snapshot.set(lookups);
          // A failed source must not be cached for the whole session — the next screen retries it.
          if (failed) {
            this.cache$ = null;
          }
          return lookups;
        }),
        shareReplay({ bufferSize: 1, refCount: false }),
      );
    }
    return this.cache$;
  }

  invalidate(): void {
    this.cache$ = null;
  }

  /** Units usable for an ingredient of `dimension`; MASS⇄VOLUME only when it has a density. */
  unitsFor(dimension: UnitDimension, hasDensity: boolean): MeasurementUnitOptionResponse[] {
    return this.snapshot().units.filter(
      (unit) =>
        unit.dimension === dimension ||
        (hasDensity && ['MASS', 'VOLUME'].includes(unit.dimension) && ['MASS', 'VOLUME'].includes(dimension)),
    );
  }

  private categoriesOf(type: CategoryType): Observable<CategoryResponse[]> {
    return this.categories
      .getAll({ type, page: 0, size: 500, sort: 'name,asc' })
      .pipe(map((response) => (response.data?.content ?? []).filter((category) => category.status === 'ACTIVE')));
  }
}

/**
 * Client-side estimate of the cost of one base unit (g / ml / pz) — mirrors
 * doc §4.4 so the editor can preview before saving. The server value wins.
 */
export function estimateCostPerBaseUnit(
  price: number | null,
  purchaseQuantity: number | null,
  unit: MeasurementUnitOptionResponse | undefined,
  yieldPercent: number | null,
  baseDimension: UnitDimension,
  densityGPerMl: number | null,
): number | null {
  if (!price || !purchaseQuantity || !unit || !yieldPercent) {
    return null;
  }
  let baseQuantity = purchaseQuantity * unit.multiplierToBase;
  if (unit.dimension !== baseDimension) {
    if (!densityGPerMl) {
      return null;
    }
    // ml → g multiplies by density; g → ml divides.
    baseQuantity = unit.dimension === 'VOLUME' ? baseQuantity * densityGPerMl : baseQuantity / densityGPerMl;
  }
  const usable = baseQuantity * (yieldPercent / 100);
  return usable > 0 ? price / usable : null;
}
