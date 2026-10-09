import { DecimalPipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, ElementRef, computed, inject, input, model, signal, viewChild } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { TranslatePipe } from '@ngx-translate/core';
import { AutoCompleteCompleteEvent, AutoCompleteModule } from 'primeng/autocomplete';
import { ButtonModule } from 'primeng/button';
import { DialogModule } from 'primeng/dialog';
import { InputNumberModule } from 'primeng/inputnumber';
import { InputTextModule } from 'primeng/inputtext';
import { MessageModule } from 'primeng/message';
import { MultiSelectModule } from 'primeng/multiselect';
import { SelectModule } from 'primeng/select';
import { TagModule } from 'primeng/tag';
import { ToggleSwitchModule } from 'primeng/toggleswitch';
import { TooltipModule } from 'primeng/tooltip';
import { catchError, of } from 'rxjs';

import { AllergenRef, AllergenResponse, IngredientSubstitute, IngredientSummary } from 'src/app/core/models/kitchen.models';
import { MeasurementUnitOptionResponse } from 'src/app/core/models/unit-catalog.models';
import { IngredientService } from 'src/app/core/services/domain/ingredient.service';
import { LanguageService } from 'src/app/core/services/language.service';
import { AlertService } from 'src/app/shared/services/alert.service';
import { AllergenBadgesComponent } from '../../kitchen-shared/allergen-badges.component';
import { AllergenMatch, detectAllergens } from '../../kitchen-shared/allergen-detection';
import { KitchenLookupsStore } from '../../kitchen-shared/kitchen-lookups.store';
import { RecipeSectionsDialogComponent, sectionKey } from '../../kitchen-shared/recipe-sections-dialog.component';
import { LineDraft, LineIssue, groupBySection, lineAllergens, lineFromIngredient, summarizeAllergens } from './recipe-draft';

const MAX_LINES = 150;

/**
 * The ingredient builder of the recipe studio.
 *
 * Adding is keyboard-first (search → quantity → unit → Enter). The moment a
 * line is added its declared allergens are linked automatically and the
 * ingredient name is scanned against the allergen keywords: undeclared
 * matches surface as an inline "possible allergen — link it?" suggestion on
 * that line, never silently. Lines with allergens offer substitutes that are
 * free of them, with the quantity converted by the substitute's ratio.
 */
@Component({
  selector: 'app-recipe-lines-editor',
  standalone: true,
  imports: [
    DecimalPipe,
    FormsModule,
    TranslatePipe,
    AutoCompleteModule,
    ButtonModule,
    DialogModule,
    InputNumberModule,
    InputTextModule,
    MessageModule,
    MultiSelectModule,
    SelectModule,
    TagModule,
    ToggleSwitchModule,
    TooltipModule,
    AllergenBadgesComponent,
    RecipeSectionsDialogComponent,
  ],
  templateUrl: './recipe-lines-editor.component.html',
  styleUrl: './recipe-lines-editor.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class RecipeLinesEditorComponent {
  private readonly ingredientService = inject(IngredientService);
  private readonly lookups = inject(KitchenLookupsStore);
  private readonly alert = inject(AlertService);
  private readonly language = inject(LanguageService);

  private readonly quantityInput = viewChild<ElementRef<HTMLElement>>('quantityInput');

  readonly lines = model<LineDraft[]>([]);
  readonly allergenCatalog = input<readonly AllergenResponse[]>([]);
  /** line key → cost at base yield, from the live server preview. */
  readonly lineCosts = input<ReadonlyMap<string, number | null>>(new Map());
  readonly issues = input<readonly LineIssue[]>([]);
  readonly readonly = input(false);
  readonly costing = input(false);

  // Add bar
  protected readonly picked = signal<IngredientSummary | null>(null);
  protected readonly suggestions = signal<IngredientSummary[]>([]);
  protected readonly addQuantity = signal<number | null>(null);
  protected readonly addUnitId = signal<number | null>(null);
  protected readonly addSection = signal<string>('');
  protected readonly sectionSuggestions = signal<string[]>([]);
  protected readonly sectionsDialogOpen = signal(false);

  // Substitute dialog
  protected readonly substituteFor = signal<LineDraft | null>(null);
  protected readonly substituteOptions = signal<IngredientSubstitute[]>([]);
  protected readonly substituteLoading = signal(false);

  // Manual allergen dialog
  protected readonly allergenEditFor = signal<LineDraft | null>(null);
  protected readonly allergenEditIds = signal<number[]>([]);

  protected readonly groups = computed(() => groupBySection(this.lines()));
  protected readonly summary = computed(() => summarizeAllergens(this.lines()));
  /** Sections used by this recipe, in first-appearance order. */
  protected readonly sections = computed(() => [...new Set(this.lines().map((line) => line.section?.trim()).filter((name): name is string => !!name))]);
  /** The user's saved labels first (their order), then any used here that are not saved. */
  protected readonly sectionNames = computed(() => {
    const names = this.lookups.snapshot().recipeSections.map((section) => section.name);
    const known = new Set(names.map(sectionKey));
    return [...names, ...this.sections().filter((name) => !known.has(sectionKey(name)))];
  });
  private readonly sectionColors = computed(
    () => new Map(this.lookups.snapshot().recipeSections.filter((section) => section.color).map((section) => [sectionKey(section.name), section.color!])),
  );
  protected readonly issueByKey = computed(() => {
    const map = new Map<string, string>();
    for (const issue of this.issues()) {
      if (!map.has(issue.key)) {
        map.set(issue.key, issue.messageKey);
      }
    }
    return map;
  });
  protected readonly addUnits = computed(() => {
    const ingredient = this.picked();
    return ingredient ? this.unitsFor(ingredient.baseDimension) : [];
  });
  protected readonly canAdd = computed(
    () => !!this.picked() && (this.addQuantity() ?? 0) > 0 && this.addUnitId() !== null && this.lines().length < MAX_LINES,
  );
  protected readonly allergenOptions = computed(() => this.allergenCatalog().map((allergen) => ({ label: allergen.name, value: allergen.id, icon: allergen.icon })));
  protected readonly totalCost = computed(() => {
    let total = 0;
    for (const value of this.lineCosts().values()) {
      total += value ?? 0;
    }
    return total;
  });

  // ─── Add ───

  protected search(event: AutoCompleteCompleteEvent): void {
    this.ingredientService
      .search({ page: 0, size: 15, search: event.query, status: 'ACTIVE', sort: 'name,asc' })
      .pipe(catchError(() => of(null)))
      .subscribe((response) => this.suggestions.set(response?.data?.content ?? []));
  }

  protected onPick(ingredient: IngredientSummary): void {
    this.picked.set(ingredient);
    const units = this.unitsFor(ingredient.baseDimension);
    // Default to the dimension's base unit (g / ml / pz) — the most common in recipes.
    this.addUnitId.set(units.find((unit) => unit.isBaseUnit && unit.dimension === ingredient.baseDimension)?.id ?? units[0]?.id ?? null);
    // After the overlay closes (it hands focus back to the search box), jump to the quantity.
    setTimeout(() => this.quantityInput()?.nativeElement.querySelector('input')?.focus(), 80);
  }

  /** Typing over a picked ingredient un-picks it; picking goes through `onPick`. */
  protected onIngredientModel(value: unknown): void {
    if (value === null || typeof value !== 'object') {
      this.picked.set(null);
    }
  }

  protected searchSections(event: AutoCompleteCompleteEvent): void {
    const term = event.query;
    this.sectionSuggestions.set(this.sectionNames().filter((section) => sectionKey(section).includes(sectionKey(term))));
  }

  protected sectionColor(name: string | null): string | null {
    return this.sectionColors().get(sectionKey(name)) ?? null;
  }

  /** A label renamed in the catalog re-labels the lines of the recipe open here (saved with it). */
  protected onSectionRenamed(change: { from: string; to: string }): void {
    const from = sectionKey(change.from);
    if (!this.lines().some((line) => sectionKey(line.section) === from)) {
      return;
    }
    this.lines.update((list) => list.map((line) => (sectionKey(line.section) === from ? { ...line, section: change.to } : line)));
    if (sectionKey(this.addSection()) === from) {
      this.addSection.set(change.to);
    }
  }

  protected setLineSection(key: string, value: string | null): void {
    this.patch(key, { section: value?.trim() || null });
  }

  protected add(): void {
    const ingredient = this.picked();
    if (!ingredient || !this.canAdd()) {
      if (this.lines().length >= MAX_LINES) {
        this.alert.warning(this.language.t('KITCHEN.RECIPES.ERRORS.MAX_LINES', { max: MAX_LINES }));
      }
      return;
    }
    const line = lineFromIngredient(ingredient, this.addQuantity()!, this.addUnitId()!, this.addSection().trim() || null);
    this.lines.update((list) => [...list, line]);
    const matches = this.suggestionsFor(line);
    if (ingredient.allergens.length > 0) {
      this.alert.info(this.language.t('KITCHEN.DETECTION.DECLARED_LINKED', { ingredient: ingredient.name, allergens: this.names(ingredient.allergens) }));
    } else if (matches.length > 0) {
      this.alert.warning(this.language.t('KITCHEN.DETECTION.POSSIBLE', { ingredient: ingredient.name, allergens: this.names(matches.map((match) => match.allergen)) }));
    }
    if (ingredient.costPerBaseUnit === null) {
      this.alert.warning(this.language.t('KITCHEN.RECIPES.UNPRICED_ADDED', { ingredient: ingredient.name }));
    }
    this.picked.set(null);
    this.addQuantity.set(null);
  }

  protected onAddKey(event: KeyboardEvent): void {
    if (event.key === 'Enter') {
      event.preventDefault();
      this.add();
    }
  }

  // ─── Line edits ───

  protected patch(key: string, change: Partial<LineDraft>): void {
    this.lines.update((list) => list.map((line) => (line.key === key ? { ...line, ...change } : line)));
  }

  protected remove(key: string): void {
    this.lines.update((list) => list.filter((line) => line.key !== key));
  }

  protected move(key: string, direction: -1 | 1): void {
    this.lines.update((list) => {
      const index = list.findIndex((line) => line.key === key);
      const target = index + direction;
      if (index < 0 || target < 0 || target >= list.length) {
        return list;
      }
      const next = [...list];
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
  }

  protected unitsFor(dimension: LineDraft['baseDimension']): MeasurementUnitOptionResponse[] {
    // Density is resolved server-side; offer MASS⇄VOLUME units for those dimensions.
    return this.lookups.unitsFor(dimension, dimension !== 'COUNT');
  }

  // ─── Allergens ───

  protected allergensOf(line: LineDraft): AllergenRef[] {
    return lineAllergens(line);
  }

  protected suggestionsFor(line: LineDraft): AllergenMatch[] {
    const exclude = new Set([...lineAllergens(line).map((allergen) => allergen.id), ...line.dismissedAllergenIds]);
    return detectAllergens(`${line.ingredientName} ${line.notes ?? ''}`, this.allergenCatalog(), exclude);
  }

  protected acceptSuggestion(line: LineDraft, match: AllergenMatch): void {
    const { id, code, name } = match.allergen;
    this.patch(line.key, { extraAllergens: [...line.extraAllergens, { allergen: { id, code, name }, source: 'DETECTED' }] });
  }

  protected dismissSuggestion(line: LineDraft, match: AllergenMatch): void {
    this.patch(line.key, { dismissedAllergenIds: [...line.dismissedAllergenIds, match.allergen.id] });
  }

  protected openAllergenEdit(line: LineDraft): void {
    this.allergenEditFor.set(line);
    this.allergenEditIds.set(line.extraAllergens.map((extra) => extra.allergen.id));
  }

  protected saveAllergenEdit(): void {
    const line = this.allergenEditFor();
    if (!line) {
      return;
    }
    const declared = new Set(line.ingredientAllergens.map((allergen) => allergen.id));
    const previous = new Map(line.extraAllergens.map((extra) => [extra.allergen.id, extra.source]));
    const extra = this.allergenCatalog()
      .filter((allergen) => this.allergenEditIds().includes(allergen.id) && !declared.has(allergen.id))
      .map((allergen) => ({ allergen: { id: allergen.id, code: allergen.code, name: allergen.name }, source: previous.get(allergen.id) ?? ('MANUAL' as const) }));
    this.patch(line.key, { extraAllergens: extra });
    this.allergenEditFor.set(null);
  }

  // ─── Substitutes ───

  protected openSubstitutes(line: LineDraft): void {
    this.substituteFor.set(line);
    this.substituteOptions.set([]);
    this.substituteLoading.set(true);
    const avoid = this.allergensOf(line).map((allergen) => allergen.id);
    this.ingredientService.substitutes(line.ingredientId, avoid).subscribe({
      next: (response) => {
        this.substituteOptions.set(response.data ?? []);
        this.substituteLoading.set(false);
      },
      error: () => {
        this.substituteOptions.set([]);
        this.substituteLoading.set(false);
      },
    });
  }

  protected applySubstitute(option: IngredientSubstitute): void {
    const line = this.substituteFor();
    if (!line) {
      return;
    }
    const quantity = line.quantity === null ? null : Math.round(line.quantity * option.ratio * 1000) / 1000;
    this.patch(line.key, {
      ingredientId: option.ingredientId,
      ingredientName: option.ingredientName,
      quantity,
      ingredientAllergens: [],
      extraAllergens: option.introduces.map((allergen) => ({ allergen, source: 'MANUAL' as const })),
      dismissedAllergenIds: [],
      substitutedFrom: line.substitutedFrom ?? line.ingredientName,
      notes: [line.notes, this.language.t('KITCHEN.RECIPES.SUBSTITUTE_NOTE', { original: line.ingredientName, ratio: option.ratio })]
        .filter(Boolean)
        .join(' · '),
    });
    this.alert.success(this.language.t('KITCHEN.RECIPES.SUBSTITUTED', { original: line.ingredientName, substitute: option.ingredientName }));
    this.substituteFor.set(null);
  }

  protected names(allergens: readonly AllergenRef[]): string {
    return allergens.map((allergen) => allergen.name).join(', ');
  }

  protected unitCode(line: LineDraft): string {
    return this.lookups.snapshot().units.find((unit) => unit.id === line.unitId)?.codeIdentity ?? '';
  }
}
