import { ChangeDetectionStrategy, Component, OnInit, computed, effect, inject, signal } from '@angular/core';
import { FormsModule, ReactiveFormsModule, FormBuilder, Validators } from '@angular/forms';

import { TranslatePipe } from '@ngx-translate/core';
import { ButtonModule } from 'primeng/button';
import { CardModule } from 'primeng/card';
import { DialogModule } from 'primeng/dialog';
import { IconFieldModule } from 'primeng/iconfield';
import { InputIconModule } from 'primeng/inputicon';
import { InputTextModule } from 'primeng/inputtext';
import { SelectModule } from 'primeng/select';
import { TableModule } from 'primeng/table';
import { TextareaModule } from 'primeng/textarea';
import { TooltipModule } from 'primeng/tooltip';

import { AllergenService } from 'src/app/core/services/domain/allergen.service';
import { AllergenResponse } from 'src/app/core/models/domain.model';
import { LanguageService } from 'src/app/core/services/language.service';
import { PageInfoService } from 'src/app/core/services/page-info.service';
import { AlertService } from 'src/app/shared/services/alert.service';
import { ConfirmService } from 'src/app/shared/services/confirm.service';
import { StatusToggleComponent } from 'src/app/shared/components/status-toggle/status-toggle.component';
import { SelectOption, EntityStatus, statusOptions } from 'src/app/shared/i18n/catalog-options';
import { TableSkeletonRowComponent } from 'src/app/shared/components/table-skeleton-row/table-skeleton-row.component';

@Component({
  selector: 'app-allergens',
  standalone: true,
  imports: [
    TranslatePipe,
    FormsModule,
    ReactiveFormsModule,
    ButtonModule,
    CardModule,
    DialogModule,
    IconFieldModule,
    InputIconModule,
    InputTextModule,
    SelectModule,
    TableModule,
    TextareaModule,
    TooltipModule,
    StatusToggleComponent,
    TableSkeletonRowComponent,
  ],
  templateUrl: './allergens.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AllergensComponent implements OnInit {
  private readonly allergenService = inject(AllergenService);
  private readonly alertService = inject(AlertService);
  private readonly confirmService = inject(ConfirmService);
  private readonly pageInfoService = inject(PageInfoService);
  private readonly language = inject(LanguageService);
  private readonly fb = inject(FormBuilder);

  readonly items = signal<AllergenResponse[]>([]);
  readonly isLoading = signal(false);
  protected readonly skeletonRows = Array.from({ length: 6 });
  selectedItems: AllergenResponse[] = [];
  readonly showForm = signal(false);
  readonly selectedItem = signal<AllergenResponse | null>(null);
  readonly isSaving = signal(false);

  readonly statusFilterOptions = computed<SelectOption<EntityStatus>[]>(() =>
    statusOptions((key) => this.language.t(key)),
  );

  readonly form = this.fb.group({
    name: ['', [Validators.required, Validators.minLength(2)]],
    alternativeName: [''],
    description: [''],
  });

  constructor() {
    // Page chrome re-renders on a language switch; the fetch stays in ngOnInit.
    effect(() => {
      this.pageInfoService.updateTitle(this.language.t('ALLERGENS.TITLE'));
      this.pageInfoService.updateDescription(this.language.t('ALLERGENS.DESCRIPTION'));
      this.pageInfoService.updateBreadcrumbs([
        { title: this.language.t('BREADCRUMB.HOME'), path: '/dashboard', isActive: false },
        { title: this.language.t('BREADCRUMB.CATALOGS'), path: '', isActive: false },
        { title: this.language.t('ALLERGENS.TITLE'), path: '', isActive: true },
      ]);
    });
  }

  ngOnInit(): void {
    this.load();
  }

  load(): void {
    this.isLoading.set(true);
    this.allergenService.getAll({ page: 0, size: 1000, sort: 'name,asc' }).subscribe({
      next: (res) => {
        this.items.set(res.data.content);
        this.isLoading.set(false);
      },
      error: (err) => {
        this.isLoading.set(false);
        this.alertService.error(err?.message || this.language.t('ALLERGENS.TOAST.LOAD_FAILED'));
      },
    });
  }

  openCreate(): void {
    this.selectedItem.set(null);
    this.form.reset();
    this.showForm.set(true);
  }

  openEdit(item: AllergenResponse): void {
    this.selectedItem.set(item);
    this.form.patchValue({
      name: item.name,
      alternativeName: item.alternativeName ?? '',
      description: item.description ?? '',
    });
    this.showForm.set(true);
  }

  closeForm(): void {
    this.showForm.set(false);
    this.selectedItem.set(null);
  }

  saveForm(): void {
    if (this.form.invalid || this.isSaving()) {
      this.form.markAllAsTouched();
      return;
    }
    this.isSaving.set(true);
    const isEdit = !!this.selectedItem();
    const payload = {
      name: this.form.value.name!,
      alternativeName: this.form.value.alternativeName || undefined,
      description: this.form.value.description || undefined,
    };

    const request$ = isEdit
      ? this.allergenService.update({ id: this.selectedItem()!.id, ...payload })
      : this.allergenService.create(payload);

    request$.subscribe({
      next: () => {
        this.isSaving.set(false);
        this.closeForm();
        this.load();
        this.alertService.success(
          this.language.t(isEdit ? 'ALLERGENS.TOAST.UPDATED' : 'ALLERGENS.TOAST.CREATED'),
        );
      },
      error: (err) => {
        this.isSaving.set(false);
        this.alertService.error(err?.message || this.language.t('COMMON.TOAST.SAVE_FAILED'));
      },
    });
  }

  async confirmDelete(item: AllergenResponse): Promise<void> {
    const confirmed = await this.confirmService.confirmDelete(item.name);
    if (!confirmed) {
      return;
    }
    this.allergenService.delete(item.id).subscribe({
      next: () => {
        this.load();
        this.alertService.success(this.language.t('ALLERGENS.TOAST.DELETED'));
      },
      error: (err) => {
        this.alertService.error(err?.message || this.language.t('COMMON.TOAST.DELETE_FAILED'));
      },
    });
  }

  updateItemStatus(id: string, newStatus: 'ACTIVE' | 'INACTIVE'): void {
    this.items.update((current) =>
      current.map((item) => (item.id === id ? { ...item, status: newStatus } : item))
    );
  }
}
