import { ChangeDetectionStrategy, Component, computed, effect, inject, signal } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { toSignal } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { map } from 'rxjs';

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

import { CategoryService } from 'src/app/core/services/domain/category.service';
import {
  CategoryResponse,
  CategoryScope,
  CategoryStatus,
  CategoryType,
} from 'src/app/core/models/category.model';
import { apiErrorMessage, hasApiError } from 'src/app/core/utils/api-error.util';
import { LanguageService } from 'src/app/core/services/language.service';
import { PageInfoService } from 'src/app/core/services/page-info.service';
import { AlertService } from 'src/app/shared/services/alert.service';
import { ConfirmService } from 'src/app/shared/services/confirm.service';
import { StatusToggleComponent } from 'src/app/shared/components/status-toggle/status-toggle.component';
import { TableSkeletonRowComponent } from 'src/app/shared/components/table-skeleton-row/table-skeleton-row.component';
import { CategoryFormDialogComponent } from './category-form-dialog/category-form-dialog.component';
import { CategoryImportDialogComponent } from './category-import-dialog/category-import-dialog.component';
import {
  SelectOption,
  TagSeverity,
  categoryScopeIcon,
  categoryScopeLabelKey,
  categoryScopeOptions,
  categoryScopeSeverity,
  categoryStatusLabelKey,
  categoryStatusOptions,
  isCategoryEditable,
} from './category-presentation';

/**
 * Page size for the single fetch that backs the grid.
 *
 * Every catalog view in Cronos pulls one large page and lets `p-table` own
 * paging, sorting and the per-column filters client-side; server-side lazy
 * loading would trade those filters for round trips at a row count this
 * catalog will not reach.
 */
const FETCH_SIZE = 1000;

/** Copy that changes per route, so one component serves both category types. */
interface CategoryPageCopy {
  title: string;
  description: string;
  breadcrumb: string;
  emptyMessage: string;
  searchPlaceholder: string;
}

/** Translation keys behind `CategoryPageCopy`, one set per route. */
const PAGE_COPY_KEYS: Readonly<Record<CategoryType, Readonly<Record<keyof CategoryPageCopy, string>>>> = {
  PRODUCT: {
    title: 'CATEGORIES.PAGE.PRODUCT.TITLE',
    description: 'CATEGORIES.PAGE.PRODUCT.DESCRIPTION',
    breadcrumb: 'CATEGORIES.BREADCRUMB.PRODUCT',
    emptyMessage: 'CATEGORIES.PAGE.PRODUCT.EMPTY',
    searchPlaceholder: 'CATEGORIES.PAGE.PRODUCT.SEARCH_PLACEHOLDER',
  },
  INGREDIENT: {
    title: 'CATEGORIES.PAGE.INGREDIENT.TITLE',
    description: 'CATEGORIES.PAGE.INGREDIENT.DESCRIPTION',
    breadcrumb: 'CATEGORIES.BREADCRUMB.INGREDIENT',
    emptyMessage: 'CATEGORIES.PAGE.INGREDIENT.EMPTY',
    searchPlaceholder: 'CATEGORIES.PAGE.INGREDIENT.SEARCH_PLACEHOLDER',
  },
};

/** Which dialog, if any, is mounted over the grid. */
type OpenDialog = 'none' | 'form' | 'import';

/**
 * One grid for both category routes.
 *
 * The route's `data.type` decides which slice of `/category` is fetched, which
 * copy is shown, and — through the form dialog — what type a newly created
 * category is filed under, so `/cronos/categorias/productos` and
 * `/cronos/categorias/ingredientes` share this component instead of
 * duplicating a table. SYSTEM rows arrive mixed in with the caller's own USER
 * rows; `scope` alone decides whether a row is actionable.
 */
@Component({
  selector: 'app-category-list',
  standalone: true,
  imports: [
    FormsModule,
    TranslatePipe,
    ButtonModule,
    CardModule,
    IconFieldModule,
    InputIconModule,
    InputTextModule,
    SelectModule,
    TableModule,
    TagModule,
    TooltipModule,
    StatusToggleComponent,
    TableSkeletonRowComponent,
    CategoryFormDialogComponent,
    CategoryImportDialogComponent,
  ],
  templateUrl: './category-list.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CategoryListComponent {
  private readonly categoryService = inject(CategoryService);
  private readonly alertService = inject(AlertService);
  private readonly confirmService = inject(ConfirmService);
  private readonly pageInfoService = inject(PageInfoService);
  private readonly language = inject(LanguageService);
  private readonly route = inject(ActivatedRoute);

  /**
   * Read from the route's `data`, not its snapshot: the router reuses this
   * component across the two sibling routes, so only the stream sees the
   * switch from PRODUCT to INGREDIENT.
   */
  readonly type = toSignal(
    this.route.data.pipe(map((data) => (data['type'] === 'INGREDIENT' ? 'INGREDIENT' : 'PRODUCT') as CategoryType)),
    { initialValue: 'PRODUCT' as CategoryType },
  );

  readonly items = signal<CategoryResponse[]>([]);
  readonly isLoading = signal(false);

  readonly openDialog = signal<OpenDialog>('none');
  readonly selectedItem = signal<CategoryResponse | null>(null);
  readonly isReadOnlyDialog = signal(false);

  protected readonly skeletonRows = Array.from({ length: 6 });

  readonly scopeFilterOptions = computed<SelectOption<CategoryScope>[]>(() =>
    categoryScopeOptions((key) => this.language.t(key)),
  );

  readonly statusFilterOptions = computed<SelectOption<CategoryStatus>[]>(() =>
    categoryStatusOptions((key) => this.language.t(key)),
  );

  readonly copy = computed<CategoryPageCopy>(() => {
    const keys = PAGE_COPY_KEYS[this.type()];
    return {
      title: this.language.t(keys.title),
      description: this.language.t(keys.description),
      breadcrumb: this.language.t(keys.breadcrumb),
      emptyMessage: this.language.t(keys.emptyMessage),
      searchPlaceholder: this.language.t(keys.searchPlaceholder),
    };
  });

  readonly customCount = computed(() => this.items().filter((item) => item.scope === 'USER').length);
  readonly systemCount = computed(() => this.items().length - this.customCount());

  constructor() {
    // Page chrome depends on both the route and the active locale, so it lives
    // apart from the fetch below — switching language must re-title the page
    // without re-issuing the request.
    effect(() => {
      const copy = this.copy();
      this.pageInfoService.updateTitle(copy.title);
      this.pageInfoService.updateDescription(copy.description);
      this.pageInfoService.updateBreadcrumbs([
        { title: this.language.t('BREADCRUMB.HOME'), path: '/dashboard', isActive: false },
        { title: this.language.t('BREADCRUMB.CATALOGS'), path: '', isActive: false },
        { title: this.language.t('CATEGORIES.BREADCRUMB.ROOT'), path: '', isActive: false },
        { title: copy.breadcrumb, path: '', isActive: true },
      ]);
    });

    // The fetch keys off the route type alone.
    effect(() => {
      const type = this.type();
      this.closeDialog();
      this.load(type);
    });
  }

  load(type: CategoryType = this.type()): void {
    this.isLoading.set(true);
    this.categoryService.getAll({ type, page: 0, size: FETCH_SIZE, sort: 'name,asc' }).subscribe({
      next: (res) => {
        // Switching routes fires a second fetch before the first resolves;
        // whichever type is current owns the grid, whatever the arrival order.
        if (type !== this.type()) {
          return;
        }
        this.items.set(res.data.content);
        this.isLoading.set(false);
      },
      error: (err: unknown) => {
        if (type !== this.type()) {
          return;
        }
        this.isLoading.set(false);
        this.items.set([]);
        this.alertService.error(apiErrorMessage(err, this.language.t('CATEGORIES.TOAST.LOAD_FAILED')));
      },
    });
  }

  // ─── Row presentation ───

  scopeLabel(scope: CategoryScope): string {
    return this.language.t(categoryScopeLabelKey(scope));
  }

  statusLabel(status: CategoryStatus): string {
    return this.language.t(categoryStatusLabelKey(status));
  }

  scopeSeverity(scope: CategoryScope): TagSeverity {
    return categoryScopeSeverity(scope);
  }

  scopeIcon(scope: CategoryScope): string {
    return categoryScopeIcon(scope);
  }

  isEditable(item: CategoryResponse): boolean {
    return isCategoryEditable(item.scope);
  }

  // ─── Dialogs ───

  openCreate(): void {
    this.selectedItem.set(null);
    this.isReadOnlyDialog.set(false);
    this.openDialog.set('form');
  }

  openEdit(item: CategoryResponse): void {
    if (!this.isEditable(item)) {
      return;
    }
    this.selectedItem.set(item);
    this.isReadOnlyDialog.set(false);
    this.openDialog.set('form');
  }

  openView(item: CategoryResponse): void {
    this.selectedItem.set(item);
    this.isReadOnlyDialog.set(true);
    this.openDialog.set('form');
  }

  openImport(): void {
    this.openDialog.set('import');
  }

  closeDialog(): void {
    this.openDialog.set('none');
    this.selectedItem.set(null);
    this.isReadOnlyDialog.set(false);
  }

  /** Splice the persisted row into place so the grid updates without a refetch. */
  onSaved(saved: CategoryResponse): void {
    const wasEdit = this.selectedItem() !== null;
    this.closeDialog();

    if (saved.type !== this.type()) {
      // The dialog locks `type` to this route, so this is unreachable through
      // the UI — it stays as a guard against a server that classified the row
      // differently from what was posted.
      return;
    }

    this.items.update((current) =>
      wasEdit
        ? current.map((item) => (item.id === saved.id ? saved : item))
        : [...current, saved].sort((a, b) => a.name.localeCompare(b.name)),
    );
  }

  onImported(): void {
    this.closeDialog();
    this.load();
  }

  // ─── Row actions ───

  async confirmDelete(item: CategoryResponse): Promise<void> {
    if (!this.isEditable(item)) {
      return;
    }
    const confirmed = await this.confirmService.confirmDelete(
      item.name,
      this.language.t('CATEGORIES.DELETE.MESSAGE', { name: item.name }),
    );
    if (!confirmed) {
      return;
    }

    this.categoryService.delete(item.id).subscribe({
      next: () => {
        // Soft delete with no restore endpoint: drop the row locally rather
        // than paying for a refetch of a list that only shrank by one.
        this.items.update((current) => current.filter((row) => row.id !== item.id));
        this.alertService.success(this.language.t('CATEGORIES.TOAST.DELETED'));
      },
      error: (err: unknown) => this.onDeleteError(err),
    });
  }

  /**
   * Both conflict codes mean the grid is showing a row the caller may not
   * touch — only reachable from stale state, so refetch to resynchronise.
   */
  private onDeleteError(error: unknown): void {
    if (hasApiError(error, 'SYSTEM_RESOURCE_CONFLICT')) {
      this.alertService.error(
        this.language.t('CATEGORIES.TOAST.PROTECTED_DELETE'),
        this.language.t('CATEGORIES.TOAST.PROTECTED_TITLE'),
      );
      this.load();
      return;
    }
    if (hasApiError(error, 'UNAUTHORIZED_MODIFICATION')) {
      this.alertService.error(
        this.language.t('CATEGORIES.TOAST.NOT_OWNER'),
        this.language.t('CATEGORIES.TOAST.NOT_ALLOWED_TITLE'),
      );
      this.load();
      return;
    }
    this.alertService.error(apiErrorMessage(error, this.language.t('CATEGORIES.TOAST.DELETE_FAILED')));
  }

  updateItemStatus(id: number, status: CategoryStatus): void {
    this.items.update((current) => current.map((item) => (item.id === id ? { ...item, status } : item)));
  }
}
