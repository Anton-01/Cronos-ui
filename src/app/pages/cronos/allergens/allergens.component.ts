import { ChangeDetectionStrategy, Component, computed, effect, inject, signal } from '@angular/core';
import { FormBuilder, FormsModule, ReactiveFormsModule, Validators } from '@angular/forms';
import { TranslatePipe } from '@ngx-translate/core';
import { ButtonModule } from 'primeng/button';
import { DialogModule } from 'primeng/dialog';
import { IconFieldModule } from 'primeng/iconfield';
import { InputIconModule } from 'primeng/inputicon';
import { InputTextModule } from 'primeng/inputtext';
import { MessageModule } from 'primeng/message';
import { MultiSelectModule } from 'primeng/multiselect';
import { SelectButtonModule } from 'primeng/selectbutton';
import { SkeletonModule } from 'primeng/skeleton';
import { TagModule } from 'primeng/tag';
import { TextareaModule } from 'primeng/textarea';
import { TooltipModule } from 'primeng/tooltip';

import { PERMISSIONS } from 'src/app/core/constants/permissions';
import { AllergenRequest, AllergenResponse } from 'src/app/core/models/kitchen.models';
import { RecordStatus } from 'src/app/core/models/unit-catalog.models';
import { AuthorizationService } from 'src/app/core/services/authorization.service';
import { AllergenService } from 'src/app/core/services/domain/allergen.service';
import { LanguageService } from 'src/app/core/services/language.service';
import { PageInfoService } from 'src/app/core/services/page-info.service';
import { catalogErrorMessage, catalogErrors, hasCatalogError } from 'src/app/core/utils/catalog-error.util';
import { FieldErrorComponent } from 'src/app/shared/components/field-error/field-error.component';
import { AlertService } from 'src/app/shared/services/alert.service';
import { ConfirmService } from 'src/app/shared/services/confirm.service';
import { IAM_CODE_PATTERN, toIamCode } from '../admin/shared/iam-validators';
import { normalizeForMatch } from '../kitchen-shared/allergen-detection';

/** Pictograms offered for custom allergens (PrimeIcons). */
const ICON_CHOICES: readonly string[] = [
  'pi pi-exclamation-triangle',
  'pi pi-ban',
  'pi pi-shield',
  'pi pi-heart',
  'pi pi-sun',
  'pi pi-bolt',
  'pi pi-circle',
  'pi pi-star',
  'pi pi-flag',
  'pi pi-tag',
];

const REGULATIONS: readonly string[] = ['NOM-051', 'EU-1169', 'FDA-FALCPA', 'CODEX'];
const KEYWORD_MAX = 40;
const KEYWORDS_MAX = 60;

type StatusFilter = 'ALL' | RecordStatus;

/**
 * Allergen catalog. SYSTEM rows (the 14 regulated allergens) are shipped by
 * the platform; tenants may add their own (e.g. a regional sensitivity).
 * Keywords are what make ingredient/recipe detection work, so they are the
 * centre of the editor, with a live "would match" preview.
 */
@Component({
  selector: 'app-allergens',
  standalone: true,
  imports: [
    FormsModule,
    ReactiveFormsModule,
    TranslatePipe,
    ButtonModule,
    DialogModule,
    IconFieldModule,
    InputIconModule,
    InputTextModule,
    MessageModule,
    MultiSelectModule,
    SelectButtonModule,
    SkeletonModule,
    TagModule,
    TextareaModule,
    TooltipModule,
    FieldErrorComponent,
  ],
  templateUrl: './allergens.component.html',
  styleUrl: './allergens.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AllergensComponent {
  private readonly allergenService = inject(AllergenService);
  private readonly authorization = inject(AuthorizationService);
  private readonly alert = inject(AlertService);
  private readonly confirm = inject(ConfirmService);
  private readonly language = inject(LanguageService);
  private readonly pageInfo = inject(PageInfoService);
  private readonly fb = inject(FormBuilder);

  protected readonly iconChoices = ICON_CHOICES;
  protected readonly regulationOptions = REGULATIONS.map((value) => ({ label: value, value }));
  protected readonly skeletons = Array.from({ length: 8 });

  protected readonly items = signal<AllergenResponse[]>([]);
  protected readonly loading = signal(true);
  protected readonly search = signal('');
  protected readonly statusFilter = signal<StatusFilter>('ACTIVE');
  protected readonly canManage = computed(() => this.authorization.can(PERMISSIONS.CATALOG_ALLERGEN_MANAGE));

  protected readonly dialogOpen = signal(false);
  protected readonly editing = signal<AllergenResponse | null>(null);
  protected readonly saving = signal(false);
  protected readonly keywordDraft = signal('');
  protected readonly testText = signal('');

  protected readonly statusOptions = computed(() => [
    { label: this.language.t('COMMON.STATUS.ACTIVE'), value: 'ACTIVE' as StatusFilter },
    { label: this.language.t('COMMON.STATUS.INACTIVE'), value: 'INACTIVE' as StatusFilter },
    { label: this.language.t('COMMON.ALL'), value: 'ALL' as StatusFilter },
  ]);

  protected readonly form = this.fb.nonNullable.group({
    code: ['', [Validators.required, Validators.maxLength(50), Validators.pattern(IAM_CODE_PATTERN)]],
    name: ['', [Validators.required, Validators.maxLength(80)]],
    description: ['', Validators.maxLength(500)],
    icon: [ICON_CHOICES[0], Validators.required],
    keywords: [[] as string[]],
    regulations: [[] as string[]],
  });

  protected readonly keywords = signal<string[]>([]);
  protected readonly isSystem = computed(() => this.editing()?.scope === 'SYSTEM');

  protected readonly filtered = computed(() => {
    const term = normalizeForMatch(this.search());
    const status = this.statusFilter();
    return this.items().filter(
      (item) =>
        (status === 'ALL' || item.status === status) &&
        (!term ||
          normalizeForMatch(`${item.name} ${item.code} ${item.description ?? ''}`).includes(term) ||
          item.keywords.some((keyword) => keyword.includes(term))),
    );
  });

  protected readonly counts = computed(() => ({
    total: this.items().length,
    system: this.items().filter((item) => item.scope === 'SYSTEM').length,
    custom: this.items().filter((item) => item.scope === 'USER').length,
  }));

  /** Live preview: does the test text trigger this allergen with the current keywords? */
  protected readonly testMatch = computed(() => {
    const text = ` ${normalizeForMatch(this.testText())} `;
    if (!text.trim()) {
      return null;
    }
    return this.keywords().find((keyword) => text.includes(` ${normalizeForMatch(keyword)} `)) ?? '';
  });

  constructor() {
    effect(() => {
      this.pageInfo.updateTitle(this.language.t('KITCHEN.ALLERGENS.TITLE'));
      this.pageInfo.updateDescription(this.language.t('KITCHEN.ALLERGENS.DESCRIPTION'));
      this.pageInfo.updateBreadcrumbs([
        { title: this.language.t('BREADCRUMB.HOME'), path: '/dashboard', isActive: false },
        { title: this.language.t('BREADCRUMB.CATALOGS'), path: '', isActive: false },
        { title: this.language.t('KITCHEN.ALLERGENS.TITLE'), path: '', isActive: true },
      ]);
    });
    this.load();
  }

  protected load(): void {
    this.loading.set(true);
    this.allergenService.list().subscribe({
      next: (response) => {
        this.items.set(response.data ?? []);
        this.loading.set(false);
      },
      error: (error: unknown) => {
        this.loading.set(false);
        this.alert.error(catalogErrorMessage(error, this.language.t('KITCHEN.ALLERGENS.LOAD_FAILED')));
      },
    });
  }

  // ─── Editor ───

  protected openCreate(): void {
    this.editing.set(null);
    this.form.enable();
    this.form.reset({ code: '', name: '', description: '', icon: ICON_CHOICES[0], keywords: [], regulations: [] });
    this.keywords.set([]);
    this.testText.set('');
    this.dialogOpen.set(true);
  }

  protected openEdit(item: AllergenResponse): void {
    this.editing.set(item);
    this.form.enable();
    this.form.reset({
      code: item.code,
      name: item.name,
      description: item.description ?? '',
      icon: item.icon,
      keywords: item.keywords,
      regulations: item.regulations,
    });
    this.keywords.set([...item.keywords]);
    this.testText.set('');
    this.form.controls.code.disable();
    if (item.scope === 'SYSTEM') {
      // Platform allergens: only the detection keywords can be extended per tenant.
      this.form.controls.name.disable();
      this.form.controls.description.disable();
      this.form.controls.icon.disable();
      this.form.controls.regulations.disable();
    }
    this.dialogOpen.set(true);
  }

  protected onNameBlur(): void {
    const code = this.form.controls.code;
    if (!this.editing() && !code.dirty && !code.value) {
      code.setValue(toIamCode(this.form.controls.name.value));
    }
  }

  protected addKeyword(): void {
    const keyword = normalizeForMatch(this.keywordDraft()).slice(0, KEYWORD_MAX);
    if (!keyword) {
      return;
    }
    if (this.keywords().length >= KEYWORDS_MAX) {
      this.alert.warning(this.language.t('KITCHEN.ALLERGENS.KEYWORDS_MAX', { max: KEYWORDS_MAX }));
      return;
    }
    if (!this.keywords().includes(keyword)) {
      this.keywords.update((list) => [...list, keyword]);
      this.form.markAsDirty();
    }
    this.keywordDraft.set('');
  }

  protected removeKeyword(keyword: string): void {
    this.keywords.update((list) => list.filter((entry) => entry !== keyword));
    this.form.markAsDirty();
  }

  protected onKeywordKey(event: KeyboardEvent): void {
    if (event.key === 'Enter' || event.key === ',') {
      event.preventDefault();
      this.addKeyword();
    }
  }

  protected pickIcon(icon: string): void {
    if (this.form.controls.icon.enabled) {
      this.form.controls.icon.setValue(icon);
      this.form.markAsDirty();
    }
  }

  protected save(): void {
    if (this.saving() || !this.canManage()) {
      return;
    }
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    if (this.keywords().length === 0) {
      this.alert.warning(this.language.t('KITCHEN.ALLERGENS.KEYWORDS_REQUIRED'));
      return;
    }
    const value = this.form.getRawValue();
    const current = this.editing();
    const request: AllergenRequest = {
      code: value.code,
      name: value.name.trim(),
      description: value.description.trim() || null,
      icon: value.icon,
      keywords: this.keywords(),
      regulations: value.regulations,
      ...(current ? { version: current.version } : {}),
    };
    this.saving.set(true);
    const request$ = current ? this.allergenService.update(current.id, request) : this.allergenService.create(request);
    request$.subscribe({
      next: () => {
        this.saving.set(false);
        this.dialogOpen.set(false);
        this.allergenService.invalidate();
        this.alert.success(this.language.t(current ? 'KITCHEN.ALLERGENS.UPDATED' : 'KITCHEN.ALLERGENS.CREATED', { name: request.name }));
        this.load();
      },
      error: (error: unknown) => this.onError(error),
    });
  }

  protected async toggleStatus(item: AllergenResponse): Promise<void> {
    const next: RecordStatus = item.status === 'ACTIVE' ? 'INACTIVE' : 'ACTIVE';
    const confirmed = await this.confirm.confirm({
      title: this.language.t('COMMON.STATUS_TOGGLE.CONFIRM_TITLE'),
      message: this.language.t(next === 'INACTIVE' ? 'KITCHEN.ALLERGENS.DEACTIVATE_MESSAGE' : 'KITCHEN.ALLERGENS.ACTIVATE_MESSAGE', {
        name: item.name,
        count: item.ingredientCount,
      }),
      severity: next === 'INACTIVE' ? 'danger' : 'primary',
    });
    if (!confirmed) {
      return;
    }
    this.allergenService.changeStatus(item.id, next, item.version).subscribe({
      next: () => {
        this.allergenService.invalidate();
        this.alert.success(this.language.t('COMMON.STATUS_TOGGLE.SUCCESS'));
        this.load();
      },
      error: (error: unknown) => this.onError(error),
    });
  }

  protected async remove(item: AllergenResponse): Promise<void> {
    if (item.ingredientCount > 0) {
      this.alert.warning(this.language.t('KITCHEN.ALLERGENS.DELETE_BLOCKED', { count: item.ingredientCount }));
      return;
    }
    if (!(await this.confirm.confirmDelete(item.name))) {
      return;
    }
    this.allergenService.delete(item.id).subscribe({
      next: () => {
        this.allergenService.invalidate();
        this.alert.success(this.language.t('KITCHEN.ALLERGENS.DELETED'));
        this.load();
      },
      error: (error: unknown) => this.onError(error),
    });
  }

  private onError(error: unknown): void {
    this.saving.set(false);
    if (hasCatalogError(error, 'CONCURRENT_MODIFICATION')) {
      this.alert.warning(this.language.t('IAM.COMMON.CONCURRENT_MODIFICATION'));
      this.dialogOpen.set(false);
      this.load();
      return;
    }
    let applied = false;
    for (const detail of catalogErrors(error)) {
      const control = detail.field ? this.form.get(detail.field) : null;
      if (control) {
        control.setErrors({ serverValidation: detail.message });
        control.markAsTouched();
        applied = true;
      }
    }
    if (!applied) {
      this.alert.error(catalogErrorMessage(error, this.language.t('COMMON.TOAST.SAVE_FAILED')));
    }
  }

  protected showError(name: keyof typeof this.form.controls): boolean {
    const control = this.form.controls[name];
    return control.invalid && (control.touched || control.dirty);
  }
}
