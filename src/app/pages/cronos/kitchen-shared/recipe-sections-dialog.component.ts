import { ChangeDetectionStrategy, Component, computed, inject, input, model, output, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { TranslatePipe } from '@ngx-translate/core';
import { ButtonModule } from 'primeng/button';
import { DialogModule } from 'primeng/dialog';
import { InputTextModule } from 'primeng/inputtext';
import { MessageModule } from 'primeng/message';
import { TooltipModule } from 'primeng/tooltip';
import { Observable } from 'rxjs';

import { RecipeSection, RecipeSectionRequest } from 'src/app/core/models/kitchen.models';
import { ApiEnvelope } from 'src/app/core/models/unit-catalog.models';
import { RecipeSectionService } from 'src/app/core/services/domain/recipe-section.service';
import { LanguageService } from 'src/app/core/services/language.service';
import { catalogErrorMessage } from 'src/app/core/utils/catalog-error.util';
import { AlertService } from 'src/app/shared/services/alert.service';
import { ConfirmService } from 'src/app/shared/services/confirm.service';
import { KitchenLookupsStore } from './kitchen-lookups.store';

export const SECTION_NAME_MAX = 40;

/** Heading colours offered for a section. Static palette steps: they read the same in both themes. */
export const SECTION_COLORS: readonly string[] = ['#b45309', '#be123c', '#7c3aed', '#1d4ed8', '#0f766e', '#15803d', '#a16207', '#475569'];

/** Case- and accent-insensitive identity of a section name — the server applies the same rule (doc baking-studio §3.2). */
export function sectionKey(name: string | null | undefined): string {
  return (name ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .trim()
    .replace(/\s+/g, ' ')
    .toLowerCase();
}

/**
 * Manages the user's ingredient-group labels: add, rename, recolour,
 * reorder, delete and restore the defaults. Lines store the section as text,
 * so a rename here only re-labels the recipe open in the editor (`renamed`),
 * never other saved recipes.
 */
@Component({
  selector: 'app-recipe-sections-dialog',
  standalone: true,
  imports: [FormsModule, TranslatePipe, ButtonModule, DialogModule, InputTextModule, MessageModule, TooltipModule],
  templateUrl: './recipe-sections-dialog.component.html',
  styleUrl: './recipe-sections-dialog.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class RecipeSectionsDialogComponent {
  private readonly service = inject(RecipeSectionService);
  private readonly lookups = inject(KitchenLookupsStore);
  private readonly alert = inject(AlertService);
  private readonly confirm = inject(ConfirmService);
  private readonly language = inject(LanguageService);

  readonly visible = model(false);
  /** Section names used by the recipe being edited — the ones not in the catalog are offered for saving. */
  readonly usedInRecipe = input<readonly string[]>([]);
  readonly renamed = output<{ from: string; to: string }>();

  protected readonly nameMax = SECTION_NAME_MAX;
  protected readonly colors = SECTION_COLORS;
  protected readonly sections = computed(() => this.lookups.snapshot().recipeSections);
  protected readonly unsaved = computed(() => {
    const known = new Set(this.sections().map((section) => sectionKey(section.name)));
    return this.usedInRecipe().filter((name) => !known.has(sectionKey(name)));
  });

  protected readonly newName = signal('');
  protected readonly busy = signal(false);
  protected readonly editingId = signal<string | null>(null);
  protected readonly editName = signal('');
  protected readonly editColor = signal<string | null>(null);

  protected readonly newNameError = computed(() => this.nameError(this.newName(), null));
  protected readonly editNameError = computed(() => this.nameError(this.editName(), this.editingId()));

  // ─── Add ───

  protected add(name = this.newName()): void {
    const trimmed = name.trim().replace(/\s+/g, ' ');
    if (this.busy() || this.nameError(trimmed, null)) {
      return;
    }
    this.run(this.service.create({ name: trimmed, color: null }), (created) => {
      if (!created) {
        return;
      }
      this.lookups.setRecipeSections([...this.sections(), created]);
      this.newName.set('');
      this.alert.success(this.language.t('KITCHEN.SECTIONS.CREATED', { name: created.name }));
    });
  }

  protected onAddKey(event: KeyboardEvent): void {
    if (event.key === 'Enter') {
      event.preventDefault();
      this.add();
    }
  }

  // ─── Edit ───

  protected startEdit(section: RecipeSection): void {
    this.editingId.set(section.id);
    this.editName.set(section.name);
    this.editColor.set(section.color);
  }

  protected cancelEdit(): void {
    this.editingId.set(null);
  }

  protected saveEdit(section: RecipeSection): void {
    const name = this.editName().trim().replace(/\s+/g, ' ');
    if (this.busy() || this.editNameError()) {
      return;
    }
    const request: RecipeSectionRequest = { name, color: this.editColor() };
    this.run(this.service.update(section.id, request), (updated) => {
      if (!updated) {
        return;
      }
      this.lookups.setRecipeSections(this.sections().map((entry) => (entry.id === updated.id ? updated : entry)));
      this.editingId.set(null);
      if (section.name !== updated.name) {
        this.renamed.emit({ from: section.name, to: updated.name });
      }
    });
  }

  protected onEditKey(event: KeyboardEvent, section: RecipeSection): void {
    if (event.key === 'Enter') {
      event.preventDefault();
      this.saveEdit(section);
    } else if (event.key === 'Escape') {
      event.stopPropagation();
      this.cancelEdit();
    }
  }

  // ─── Order ───

  protected move(index: number, direction: -1 | 1): void {
    const target = index + direction;
    const list = [...this.sections()];
    if (this.busy() || target < 0 || target >= list.length) {
      return;
    }
    [list[index], list[target]] = [list[target], list[index]];
    const previous = this.sections();
    // Optimistic: the list moves at once and rolls back if the server refuses.
    this.lookups.setRecipeSections(list.map((section, order) => ({ ...section, displayOrder: order })));
    this.service.reorder(list.map((section) => section.id)).subscribe({
      next: (response) => response.data && this.lookups.setRecipeSections(response.data),
      error: (error: unknown) => {
        this.lookups.setRecipeSections(previous);
        this.alert.error(catalogErrorMessage(error, this.language.t('COMMON.TOAST.SAVE_FAILED')));
      },
    });
  }

  // ─── Delete / defaults ───

  protected async remove(section: RecipeSection): Promise<void> {
    const message =
      section.usageCount > 0
        ? this.language.t('KITCHEN.SECTIONS.DELETE_IN_USE', { name: section.name, count: section.usageCount })
        : this.language.t('KITCHEN.SECTIONS.DELETE_MESSAGE', { name: section.name });
    if (this.busy() || !(await this.confirm.confirmDelete(section.name, message))) {
      return;
    }
    this.run(this.service.delete(section.id), () => {
      this.lookups.setRecipeSections(this.sections().filter((entry) => entry.id !== section.id));
      this.alert.success(this.language.t('KITCHEN.SECTIONS.DELETED', { name: section.name }));
    });
  }

  protected restoreDefaults(): void {
    this.run(this.service.restoreDefaults(), (sections) => {
      this.lookups.setRecipeSections(sections ?? this.sections());
      this.alert.success(this.language.t('KITCHEN.SECTIONS.RESTORED'));
    });
  }

  private nameError(name: string, ignoreId: string | null): string | null {
    const key = sectionKey(name);
    if (!key) {
      return null;
    }
    if (name.trim().length > SECTION_NAME_MAX) {
      return 'KITCHEN.SECTIONS.ERRORS.TOO_LONG';
    }
    return this.sections().some((section) => section.id !== ignoreId && sectionKey(section.name) === key) ? 'KITCHEN.SECTIONS.ERRORS.DUPLICATE' : null;
  }

  private run<T>(request$: Observable<ApiEnvelope<T>>, done: (data: T | null) => void): void {
    this.busy.set(true);
    request$.subscribe({
      next: (response) => {
        this.busy.set(false);
        done(response.data);
      },
      error: (error: unknown) => {
        this.busy.set(false);
        this.alert.error(catalogErrorMessage(error, this.language.t('COMMON.TOAST.SAVE_FAILED')));
      },
    });
  }
}
