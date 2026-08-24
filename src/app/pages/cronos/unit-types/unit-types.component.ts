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
import { TooltipModule } from 'primeng/tooltip';

import { UnitTypeService } from 'src/app/core/services/domain/unit-type.service';
import { LanguageService } from 'src/app/core/services/language.service';
import { UnitTypeResponse } from 'src/app/core/models/domain.model';
import { PageInfoService } from 'src/app/core/services/page-info.service';
import { AlertService } from 'src/app/shared/services/alert.service';
import { ConfirmService } from 'src/app/shared/services/confirm.service';
import { StatusToggleComponent } from 'src/app/shared/components/status-toggle/status-toggle.component';
import { SelectOption, EntityStatus, statusOptions } from 'src/app/shared/i18n/catalog-options';
import { TableSkeletonRowComponent } from 'src/app/shared/components/table-skeleton-row/table-skeleton-row.component';

@Component({
  selector: 'app-unit-types',
  standalone: true,
  imports: [
    FormsModule,
    ReactiveFormsModule,
    TranslatePipe,
    ButtonModule,
    CardModule,
    DialogModule,
    IconFieldModule,
    InputIconModule,
    InputTextModule,
    SelectModule,
    TableModule,
    TooltipModule,
    StatusToggleComponent,
    TableSkeletonRowComponent,
  ],
  templateUrl: './unit-types.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class UnitTypesComponent implements OnInit {
  private readonly unitTypeService = inject(UnitTypeService);
  private readonly alertService = inject(AlertService);
  private readonly confirmService = inject(ConfirmService);
  private readonly pageInfoService = inject(PageInfoService);
  private readonly language = inject(LanguageService);
  private readonly fb = inject(FormBuilder);

  readonly items = signal<UnitTypeResponse[]>([]);
  readonly isLoading = signal(false);
  protected readonly skeletonRows = Array.from({ length: 6 });
  selectedItems: UnitTypeResponse[] = [];
  readonly showForm = signal(false);
  readonly selectedItem = signal<UnitTypeResponse | null>(null);
  readonly isSaving = signal(false);

  readonly statusFilterOptions = computed<SelectOption<EntityStatus>[]>(() =>
    statusOptions((key) => this.language.t(key)),
  );

  readonly form = this.fb.group({
    codeIdentity: ['', [Validators.required, Validators.minLength(2)]],
    name: ['', [Validators.required, Validators.minLength(2)]],
    dimension: ['', [Validators.required, Validators.minLength(2)]],
  });

  constructor() {
    // Page chrome re-renders on a language switch; the fetch stays in ngOnInit.
    effect(() => {
      this.pageInfoService.updateTitle(this.language.t('UNIT_TYPES.TITLE'));
      this.pageInfoService.updateDescription(this.language.t('UNIT_TYPES.DESCRIPTION'));
      this.pageInfoService.updateBreadcrumbs([
        { title: this.language.t('BREADCRUMB.HOME'), path: '/dashboard', isActive: false },
        { title: this.language.t('BREADCRUMB.CATALOGS'), path: '', isActive: false },
        { title: this.language.t('UNIT_TYPES.TITLE'), path: '', isActive: true },
      ]);
    });
  }

  ngOnInit(): void {
    this.load();
  }

  load(): void {
    this.isLoading.set(true);
    this.unitTypeService.getAll({ page: 0, size: 1000, sort: 'name,asc' }).subscribe({
      next: (res) => {
        this.items.set(res.data.content);
        this.isLoading.set(false);
      },
      error: (err) => {
        this.isLoading.set(false);
        this.alertService.error(err?.message || this.language.t('UNIT_TYPES.TOAST.LOAD_FAILED'));
      },
    });
  }

  openCreate(): void {
    this.selectedItem.set(null);
    this.form.reset();
    this.showForm.set(true);
  }

  openEdit(item: UnitTypeResponse): void {
    this.selectedItem.set(item);
    this.form.patchValue({
      codeIdentity: item.codeIdentity,
      name: item.name,
      dimension: item.dimension,
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
      codeIdentity: this.form.value.codeIdentity!,
      name: this.form.value.name!,
      dimension: this.form.value.dimension!,
    };

    const request$ = isEdit
      ? this.unitTypeService.update({ id: this.selectedItem()!.id, ...payload })
      : this.unitTypeService.create(payload);

    request$.subscribe({
      next: () => {
        this.isSaving.set(false);
        this.closeForm();
        this.load();
        this.alertService.success(
          this.language.t(isEdit ? 'UNIT_TYPES.TOAST.UPDATED' : 'UNIT_TYPES.TOAST.CREATED'),
        );
      },
      error: (err) => {
        this.isSaving.set(false);
        this.alertService.error(err?.message || this.language.t('COMMON.TOAST.SAVE_FAILED'));
      },
    });
  }

  async confirmDelete(item: UnitTypeResponse): Promise<void> {
    const confirmed = await this.confirmService.confirmDelete(item.name);
    if (!confirmed) {
      return;
    }
    this.unitTypeService.delete(item.id).subscribe({
      next: () => {
        this.load();
        this.alertService.success(this.language.t('UNIT_TYPES.TOAST.DELETED'));
      },
      error: (err) => {
        this.alertService.error(err?.message || this.language.t('COMMON.TOAST.DELETE_FAILED'));
      },
    });
  }

  updateItemStatus(id: number, newStatus: 'ACTIVE' | 'INACTIVE'): void {
    this.items.update((current) =>
      current.map((item) => (item.id === id ? { ...item, status: newStatus } : item))
    );
  }
}
