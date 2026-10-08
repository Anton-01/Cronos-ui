import { DecimalPipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, effect, inject, input, signal, untracked } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { TranslatePipe } from '@ngx-translate/core';
import { AutoCompleteCompleteEvent, AutoCompleteModule } from 'primeng/autocomplete';
import { ButtonModule } from 'primeng/button';
import { CardModule } from 'primeng/card';
import { DividerModule } from 'primeng/divider';
import { InputNumberModule } from 'primeng/inputnumber';
import { SelectModule } from 'primeng/select';
import { SelectButtonModule } from 'primeng/selectbutton';
import { TooltipModule } from 'primeng/tooltip';
import { catchError, of } from 'rxjs';

import { IngredientConversion, PanSize } from 'src/app/core/models/baking-guide.models';
import { PricingMethod, RecipeSummary } from 'src/app/core/models/kitchen.models';
import { RecipeService } from 'src/app/core/services/domain/recipe.service';
import { FinanceDefaultsStore } from 'src/app/core/services/finance/finance-defaults.store';
import { LanguageService } from 'src/app/core/services/language.service';
import { RoundingStep, effectiveMargin, effectiveMarkup, foodCostPercent, priceFromCost, roundPriceUp } from '../kitchen-shared/pricing';
import {
  CONVECTION_OFFSET_C,
  GAS_MARKS,
  METRIC_CUP_ML,
  US_CUP_ML,
  VolumeMeasure,
  batterVolume,
  celsiusToFahrenheit,
  convertPan,
  fahrenheitToCelsius,
  gasMarkFor,
  gramsPerMeasure,
  panServings,
} from './baking-math';

const ROUNDING_STEPS: readonly RoundingStep[] = [0, 0.5, 1, 5, 10];
const MEASURES: readonly VolumeMeasure[] = ['CUP', 'HALF_CUP', 'THIRD_CUP', 'QUARTER_CUP', 'TABLESPOON', 'TEASPOON'];

/**
 * What-if calculators. Nothing here is saved or quoted — recipe and quote
 * prices always come from the server; these answer "what if" questions.
 */
@Component({
  selector: 'app-guide-calculators',
  standalone: true,
  imports: [DecimalPipe, FormsModule, TranslatePipe, AutoCompleteModule, ButtonModule, CardModule, DividerModule, InputNumberModule, SelectModule, SelectButtonModule, TooltipModule],
  templateUrl: './guide-calculators.component.html',
  styleUrl: './guide-calculators.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class GuideCalculatorsComponent {
  private readonly finance = inject(FinanceDefaultsStore);
  private readonly language = inject(LanguageService);
  private readonly recipeService = inject(RecipeService);
  private readonly router = inject(Router);

  readonly pans = input<readonly PanSize[]>([]);
  readonly conversions = input<readonly IngredientConversion[]>([]);

  protected readonly currency = computed(() => this.finance.defaultCurrency().code);

  // ─── Price & margin ───
  protected readonly priceMode = signal<'FORWARD' | 'REVERSE'>('FORWARD');
  protected readonly priceModeOptions = computed(() =>
    (['FORWARD', 'REVERSE'] as const).map((value) => ({ value, label: this.language.t(`GUIDE.CALC.PRICE.MODES.${value}`) })),
  );
  protected readonly unitCost = signal<number | null>(12.4);
  protected readonly ingredientCost = signal<number | null>(null);
  protected readonly method = signal<PricingMethod>('MARGIN');
  protected readonly methodOptions = computed(() => (['MARKUP', 'MARGIN'] as const).map((value) => ({ value, label: this.language.t(`KITCHEN.PRICING.${value}.LABEL`) })));
  protected readonly percent = signal<number | null>(65);
  protected readonly rounding = signal<RoundingStep>(1);
  protected readonly roundingOptions = computed(() =>
    ROUNDING_STEPS.map((value) => ({ value, label: value === 0 ? this.language.t('GUIDE.CALC.PRICE.NO_ROUNDING') : `${value}` })),
  );
  protected readonly taxPercent = signal<number | null>(null);
  /** Once the user types a tax rate, the finance default stops overwriting it. */
  private taxEdited = false;
  protected readonly salePrice = signal<number | null>(null);

  protected readonly priceResult = computed(() => {
    const cost = this.unitCost() ?? 0;
    const tax = this.taxPercent() ?? 0;
    const price =
      this.priceMode() === 'FORWARD'
        ? (() => {
            const raw = priceFromCost(cost, this.percent() ?? 0, this.method());
            return raw === null ? null : roundPriceUp(raw, this.rounding());
          })()
        : this.salePrice();
    if (price === null || cost <= 0) {
      return null;
    }
    const ingredients = this.ingredientCost() ?? cost;
    return {
      price,
      tax: (price * tax) / 100,
      withTax: price * (1 + tax / 100),
      profit: price - cost,
      margin: effectiveMargin(cost, price),
      markup: effectiveMarkup(cost, price),
      foodCost: foodCostPercent(ingredients, price),
    };
  });

  // ─── Pans ───
  protected readonly fromPanId = signal<string | null>(null);
  protected readonly toPanId = signal<string | null>(null);
  /** Pans grouped by shape, in the order they arrive. */
  protected readonly panGroups = computed(() => {
    const groups = new Map<string, { label: string; items: { value: string; label: string }[] }>();
    for (const pan of this.pans()) {
      const group = groups.get(pan.shape) ?? { label: this.language.t(`GUIDE.SHAPES.${pan.shape}`), items: [] };
      group.items.push({ value: pan.id, label: pan.name });
      groups.set(pan.shape, group);
    }
    return [...groups.values()];
  });
  private readonly fromPan = computed(() => this.pans().find((pan) => pan.id === this.fromPanId()) ?? null);
  private readonly toPan = computed(() => this.pans().find((pan) => pan.id === this.toPanId()) ?? null);
  protected readonly panResult = computed(() => {
    const from = this.fromPan();
    const to = this.toPan();
    if (!from || !to) {
      return null;
    }
    const conversion = convertPan(from, to);
    return conversion
      ? {
          ...conversion,
          fromBatter: batterVolume(from),
          toBatter: batterVolume(to),
          fromServings: panServings(from, 'EVENT'),
          toServings: panServings(to, 'EVENT'),
          // For cavities, "how many" is the inverse of the factor.
          cavities: to.shape === 'MUFFIN' && conversion.factor > 0 ? Math.floor(1 / conversion.factor) : null,
        }
      : null;
  });
  protected readonly recipeSuggestions = signal<RecipeSummary[]>([]);
  protected readonly pickedRecipe = signal<RecipeSummary | null>(null);

  // ─── Temperature ───
  protected readonly celsius = signal<number | null>(180);
  protected readonly fahrenheit = computed(() => {
    const value = this.celsius();
    return value === null ? null : Math.round(celsiusToFahrenheit(value));
  });
  protected readonly gasMark = computed(() => {
    const value = this.celsius();
    return value === null ? null : gasMarkFor(value);
  });
  protected readonly convection = computed(() => {
    const value = this.celsius();
    return value === null ? null : value - CONVECTION_OFFSET_C;
  });
  protected readonly gasMarks = GAS_MARKS;

  // ─── Volume ↔ weight ───
  protected readonly conversionCode = signal<string | null>(null);
  protected readonly amount = signal<number | null>(1);
  protected readonly measure = signal<VolumeMeasure>('CUP');
  protected readonly measureOptions = computed(() => MEASURES.map((value) => ({ value, label: this.language.t(`GUIDE.CALC.VOLUME.MEASURES.${value}`) })));
  protected readonly cupMl = signal<number>(US_CUP_ML);
  protected readonly cupOptions = computed(() => [
    { value: US_CUP_ML, label: this.language.t('GUIDE.CALC.VOLUME.US_CUP') },
    { value: METRIC_CUP_ML, label: this.language.t('GUIDE.CALC.VOLUME.METRIC_CUP') },
  ]);
  protected readonly conversionOptions = computed(() => this.conversions().map((entry) => ({ value: entry.code, label: entry.name })));
  private readonly conversion = computed(() => this.conversions().find((entry) => entry.code === this.conversionCode()) ?? null);
  protected readonly grams = computed(() => {
    const conversion = this.conversion();
    const amount = this.amount();
    return conversion && amount !== null ? amount * gramsPerMeasure(conversion, this.measure(), this.cupMl()) : null;
  });
  protected readonly perMeasure = computed(() => {
    const conversion = this.conversion();
    return conversion ? MEASURES.map((measure) => ({ measure, grams: gramsPerMeasure(conversion, measure, this.cupMl()) })) : [];
  });

  constructor() {
    // Defaults once the data arrives: finance IVA, a 20 → 25 cm round, flour.
    effect(() => {
      const tax = this.finance.defaultTaxPercent();
      untracked(() => !this.taxEdited && this.taxPercent.set(tax));
    });
    effect(() => {
      const pans = this.pans();
      untracked(() => {
        if (!this.fromPanId() && pans.length > 0) {
          this.fromPanId.set(pans.find((pan) => pan.code === 'ROUND_20')?.id ?? pans[0].id);
          this.toPanId.set(pans.find((pan) => pan.code === 'ROUND_25')?.id ?? pans[Math.min(1, pans.length - 1)].id);
        }
      });
    });
    effect(() => {
      const conversions = this.conversions();
      untracked(() => {
        if (!this.conversionCode() && conversions.length > 0) {
          this.conversionCode.set(conversions[0].code);
        }
      });
    });
    this.finance.load().subscribe({ error: () => undefined });
  }

  protected swapPans(): void {
    const from = this.fromPanId();
    this.fromPanId.set(this.toPanId());
    this.toPanId.set(from);
  }

  protected searchRecipes(event: AutoCompleteCompleteEvent): void {
    this.recipeService
      .search({ page: 0, size: 10, search: event.query, sort: 'name,asc' })
      .pipe(catchError(() => of(null)))
      .subscribe((response) => this.recipeSuggestions.set(response?.data?.content ?? []));
  }

  protected onRecipeModel(value: unknown): void {
    this.pickedRecipe.set(value !== null && typeof value === 'object' ? (value as RecipeSummary) : null);
  }

  /** Opens the recipe in book mode with every quantity multiplied by the pan factor. */
  protected openScaled(): void {
    const recipe = this.pickedRecipe();
    const result = this.panResult();
    if (recipe && result) {
      void this.router.navigate(['/cronos/recetas', recipe.id, 'libro'], { queryParams: { scale: Math.round(result.factor * 100) / 100 } });
    }
  }

  protected setTax(value: number | null): void {
    this.taxEdited = true;
    this.taxPercent.set(value);
  }

  protected setFahrenheit(value: number | null): void {
    this.celsius.set(value === null ? null : Math.round(fahrenheitToCelsius(value)));
  }
}
