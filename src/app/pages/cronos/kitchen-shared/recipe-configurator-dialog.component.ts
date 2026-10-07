import { DecimalPipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, DestroyRef, computed, effect, inject, input, model, output, signal, untracked } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { TranslatePipe } from '@ngx-translate/core';
import { ButtonModule } from 'primeng/button';
import { CheckboxModule } from 'primeng/checkbox';
import { DialogModule } from 'primeng/dialog';
import { InputNumberModule } from 'primeng/inputnumber';
import { MessageModule } from 'primeng/message';
import { SelectModule } from 'primeng/select';
import { SkeletonModule } from 'primeng/skeleton';
import { TagModule } from 'primeng/tag';
import { Subject, catchError, debounceTime, forkJoin, map, of, switchMap, tap } from 'rxjs';

import {
  AllergenRef,
  IngredientSubstitute,
  RecipeConfiguration,
  RecipeCostPreview,
  RecipeDetail,
  RecipeLine,
} from 'src/app/core/models/kitchen.models';
import { IngredientService } from 'src/app/core/services/domain/ingredient.service';
import { RecipeService } from 'src/app/core/services/domain/recipe.service';
import { LanguageService } from 'src/app/core/services/language.service';
import { catalogErrorMessage } from 'src/app/core/utils/catalog-error.util';
import { AllergenBadgesComponent } from './allergen-badges.component';

export interface ConfiguredProduct {
  recipeId: string;
  configuration: RecipeConfiguration;
  /** Cost of ONE yield unit under this configuration. */
  unitCost: number;
  suggestedUnitPrice: number;
  allergens: AllergenRef[];
  /** Human summary for the quote line ("Sin nuez · Mantequilla → margarina"). */
  summary: string;
}

/**
 * Lets the baker decide, per quote line, which of a recipe's selectable
 * ingredients go in, swap allergenic ones for their substitutes, and see the
 * resulting unit cost and allergen declaration before it reaches the quote.
 * The server prices the configuration (`/recipes/cost-preview`), so the
 * quote never carries a client-computed cost.
 */
@Component({
  selector: 'app-recipe-configurator-dialog',
  standalone: true,
  imports: [DecimalPipe, FormsModule, TranslatePipe, ButtonModule, CheckboxModule, DialogModule, InputNumberModule, MessageModule, SelectModule, SkeletonModule, TagModule, AllergenBadgesComponent],
  templateUrl: './recipe-configurator-dialog.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class RecipeConfiguratorDialogComponent {
  private readonly recipeService = inject(RecipeService);
  private readonly ingredientService = inject(IngredientService);
  private readonly language = inject(LanguageService);
  private readonly destroyRef = inject(DestroyRef);

  readonly visible = model(false);
  readonly recipeId = input<string | null>(null);
  readonly initial = input<RecipeConfiguration | null>(null);
  readonly applied = output<ConfiguredProduct>();

  protected readonly loading = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly recipe = signal<RecipeDetail | null>(null);
  /** line id → substitutes free of that line's allergens. */
  protected readonly substitutes = signal<ReadonlyMap<string, IngredientSubstitute[]>>(new Map());
  protected readonly excluded = signal<ReadonlySet<string>>(new Set());
  protected readonly swaps = signal<ReadonlyMap<string, string>>(new Map());
  protected readonly yieldQuantity = signal<number>(1);
  protected readonly preview = signal<RecipeCostPreview | null>(null);
  protected readonly pricing = signal(false);

  protected readonly fixedLines = computed(() => (this.recipe()?.lines ?? []).filter((line) => !line.quoteSelectable && !line.optional));
  protected readonly selectableLines = computed(() => (this.recipe()?.lines ?? []).filter((line) => line.quoteSelectable || line.optional));
  protected readonly swappableLines = computed(() => (this.recipe()?.lines ?? []).filter((line) => (this.substitutes().get(line.id) ?? []).length > 0));
  protected readonly configuration = computed<RecipeConfiguration>(() => ({
    excludedLineIds: [...this.excluded()],
    substitutions: [...this.swaps().entries()].map(([lineId, ingredientId]) => ({ lineId, ingredientId })),
    yieldQuantity: this.yieldQuantity(),
  }));
  protected readonly unitCost = computed(() => this.preview()?.cost.costPerUnit ?? null);

  private readonly previews = new Subject<RecipeConfiguration>();

  constructor() {
    this.previews
      .pipe(
        debounceTime(250),
        tap(() => this.pricing.set(true)),
        switchMap((configuration) => {
          const recipe = this.recipe();
          if (!recipe) {
            return of(null);
          }
          return this.recipeService
            .costPreview({
              recipeId: recipe.id,
              lines: null,
              fixedCosts: null,
              yieldQuantity: configuration.yieldQuantity,
              wastePercent: recipe.wastePercent,
              targetMarginPercent: recipe.targetMarginPercent,
              configuration,
            })
            .pipe(catchError(() => of(null)));
        }),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe((response) => {
        this.pricing.set(false);
        if (response?.data) {
          this.preview.set(response.data);
        }
      });

    effect(() => {
      const open = this.visible();
      const id = this.recipeId();
      untracked(() => {
        if (open && id) {
          this.load(id);
        }
      });
    });
    effect(() => {
      const configuration = this.configuration();
      untracked(() => {
        if (this.recipe()) {
          this.previews.next(configuration);
        }
      });
    });
  }

  private load(id: string): void {
    this.loading.set(true);
    this.error.set(null);
    this.preview.set(null);
    this.recipeService
      .getById(id)
      .pipe(
        switchMap((response) => {
          const recipe = response.data;
          if (!recipe) {
            return of({ recipe: null, substitutes: new Map<string, IngredientSubstitute[]>() });
          }
          const withAllergens = recipe.lines.filter((line) => line.allergens.length > 0);
          const requests = withAllergens.map((line) =>
            this.ingredientService.substitutes(line.ingredientId, line.allergens.map((allergen) => allergen.allergenId)).pipe(
              map((result) => [line.id, result.data ?? []] as const),
              catchError(() => of([line.id, []] as const)),
            ),
          );
          return (requests.length > 0 ? forkJoin(requests) : of([])).pipe(
            map((pairs) => ({ recipe, substitutes: new Map<string, IngredientSubstitute[]>(pairs.map(([key, value]) => [key, [...value]])) })),
          );
        }),
      )
      .subscribe({
        next: ({ recipe, substitutes }) => {
          this.loading.set(false);
          if (!recipe) {
            return;
          }
          this.substitutes.set(substitutes);
          const initial = this.initial();
          // Optional lines start out; selectable ones start in — unless a saved configuration says otherwise.
          this.excluded.set(new Set(initial?.excludedLineIds ?? recipe.lines.filter((line) => line.optional).map((line) => line.id)));
          this.swaps.set(new Map((initial?.substitutions ?? []).map((swap) => [swap.lineId, swap.ingredientId])));
          this.yieldQuantity.set(initial?.yieldQuantity ?? recipe.yieldQuantity);
          this.recipe.set(recipe);
        },
        error: (error: unknown) => {
          this.loading.set(false);
          this.error.set(catalogErrorMessage(error, this.language.t('KITCHEN.CONFIGURATOR.LOAD_FAILED')));
        },
      });
  }

  protected isIncluded(line: RecipeLine): boolean {
    return !this.excluded().has(line.id);
  }

  protected toggle(line: RecipeLine, included: boolean): void {
    this.excluded.update((set) => {
      const next = new Set(set);
      if (included) {
        next.delete(line.id);
      } else {
        next.add(line.id);
      }
      return next;
    });
  }

  protected swapOptions(line: RecipeLine): { label: string; value: string | null }[] {
    return [
      { label: `${line.ingredientName} (${this.language.t('KITCHEN.CONFIGURATOR.ORIGINAL')})`, value: null },
      ...(this.substitutes().get(line.id) ?? []).map((option) => ({
        label: `${option.ingredientName} × ${option.ratio}`,
        value: option.ingredientId,
      })),
    ];
  }

  protected swapOf(line: RecipeLine): string | null {
    return this.swaps().get(line.id) ?? null;
  }

  protected setSwap(line: RecipeLine, ingredientId: string | null): void {
    this.swaps.update((map) => {
      const next = new Map(map);
      if (ingredientId) {
        next.set(line.id, ingredientId);
      } else {
        next.delete(line.id);
      }
      return next;
    });
  }

  protected lineAllergens(line: RecipeLine): AllergenRef[] {
    return line.allergens.map((allergen) => ({ id: allergen.allergenId, code: allergen.code, name: allergen.name }));
  }

  protected apply(): void {
    const recipe = this.recipe();
    const preview = this.preview();
    if (!recipe || !preview) {
      return;
    }
    const lines = new Map(recipe.lines.map((line) => [line.id, line]));
    const parts: string[] = [];
    const without = [...this.excluded()].map((id) => lines.get(id)?.ingredientName).filter(Boolean);
    const withOptional = recipe.lines.filter((line) => line.optional && !this.excluded().has(line.id)).map((line) => line.ingredientName);
    if (withOptional.length > 0) {
      parts.push(`${this.language.t('KITCHEN.CONFIGURATOR.WITH')} ${withOptional.join(', ')}`);
    }
    if (without.length > 0) {
      parts.push(`${this.language.t('KITCHEN.CONFIGURATOR.WITHOUT')} ${without.join(', ')}`);
    }
    for (const [lineId, ingredientId] of this.swaps()) {
      const option = this.substitutes().get(lineId)?.find((entry) => entry.ingredientId === ingredientId);
      if (option) {
        parts.push(`${lines.get(lineId)?.ingredientName} → ${option.ingredientName}`);
      }
    }
    this.applied.emit({
      recipeId: recipe.id,
      configuration: this.configuration(),
      unitCost: preview.cost.costPerUnit,
      suggestedUnitPrice: preview.cost.suggestedUnitPrice,
      allergens: preview.allergens,
      summary: parts.join(' · '),
    });
    this.visible.set(false);
  }
}
