import { ChangeDetectionStrategy, Component, OnInit, computed, effect, inject, signal } from '@angular/core';
import { FormsModule, ReactiveFormsModule, FormBuilder, Validators } from '@angular/forms';

import { TranslatePipe } from '@ngx-translate/core';
import { ButtonModule } from 'primeng/button';
import { CardModule } from 'primeng/card';
import { CheckboxModule } from 'primeng/checkbox';
import { DialogModule } from 'primeng/dialog';
import { IconFieldModule } from 'primeng/iconfield';
import { InputIconModule } from 'primeng/inputicon';
import { InputNumberModule } from 'primeng/inputnumber';
import { InputTextModule } from 'primeng/inputtext';
import { SelectModule } from 'primeng/select';
import { TableModule } from 'primeng/table';
import { TagModule } from 'primeng/tag';
import { TooltipModule } from 'primeng/tooltip';

import { MeasurementUnitService } from 'src/app/core/services/domain/measurement-unit.service';
import { MeasurementUnitResponse } from 'src/app/core/models/domain.model';
import { LanguageService } from 'src/app/core/services/language.service';
import { PageInfoService } from 'src/app/core/services/page-info.service';
import { AlertService } from 'src/app/shared/services/alert.service';
import { ConfirmService } from 'src/app/shared/services/confirm.service';
import { StatusToggleComponent } from 'src/app/shared/components/status-toggle/status-toggle.component';
import { SelectOption, EntityStatus, statusOptions } from 'src/app/shared/i18n/catalog-options';
import { TableSkeletonRowComponent } from 'src/app/shared/components/table-skeleton-row/table-skeleton-row.component';

@Component({
  selector: 'app-measurement-units',
  standalone: true,
  imports: [
    TranslatePipe,
    FormsModule,
    ReactiveFormsModule,
    ButtonModule,
    CardModule,
    CheckboxModule,
    DialogModule,
    IconFieldModule,
    InputIconModule,
    InputNumberModule,
    InputTextModule,
    SelectModule,
    TableModule,
    TagModule,
    TooltipModule,
    StatusToggleComponent,
    TableSkeletonRowComponent,
  ],
  templateUrl: './measurement-units.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class MeasurementUnitsComponent implements OnInit {
  private readonly measurementUnitService = inject(MeasurementUnitService);
  private readonly alertService = inject(AlertService);
  private readonly confirmService = inject(ConfirmService);
  private readonly pageInfoService = inject(PageInfoService);
  private readonly language = inject(LanguageService);
  private readonly fb = inject(FormBuilder);

  readonly items = signal<MeasurementUnitResponse[]>([]);
  readonly isLoading = signal(false);
  protected readonly skeletonRows = Array.from({ length: 6 });
  selectedItems: MeasurementUnitResponse[] = [];
  readonly showForm = signal(false);
  readonly selectedItem = signal<MeasurementUnitResponse | null>(null);
  readonly isSaving = signal(false);

  readonly statusFilterOptions = computed<SelectOption<EntityStatus>[]>(() =>
    statusOptions((key) => this.language.t(key)),
  );

  readonly form = this.fb.group({
    code: ['', [Validators.required, Validators.minLength(1)]],
    name: ['', [Validators.required, Validators.minLength(2)]],
    pluralName: ['', [Validators.required, Validators.minLength(2)]],
    dimensionName: ['', [Validators.required]],
    baseFactor: [1 as number, [Validators.required, Validators.min(0.000001)]],
    isBase: [false as boolean],
  });

  constructor() {
    // Page chrome re-renders on a language switch; the fetch stays in ngOnInit.
    effect(() => {
      this.pageInfoService.updateTitle(this.language.t('MEASUREMENT_UNITS.TITLE'));
      this.pageInfoService.updateDescription(this.language.t('MEASUREMENT_UNITS.DESCRIPTION'));
      this.pageInfoService.updateBreadcrumbs([
        { title: this.language.t('BREADCRUMB.HOME'), path: '/dashboard', isActive: false },
        { title: this.language.t('BREADCRUMB.CATALOGS'), path: '', isActive: false },
        { title: this.language.t('MEASUREMENT_UNITS.TITLE'), path: '', isActive: true },
      ]);
    });
  }

  ngOnInit(): void {
    this.load();
  }

  load(): void {
    this.isLoading.set(true);
    this.measurementUnitService.getAll({ page: 0, size: 1000, sort: 'name,asc' }).subscribe({
      next: (res) => {
        this.items.set(res.data.content);
        this.isLoading.set(false);
      },
      error: (err) => {
        this.isLoading.set(false);
        this.alertService.error(err?.message || this.language.t('MEASUREMENT_UNITS.TOAST.LOAD_FAILED'));
      },
    });
  }

  openCreate(): void {
    this.selectedItem.set(null);
    this.form.reset({ baseFactor: 1, isBase: false });
    this.showForm.set(true);
  }

  openEdit(item: MeasurementUnitResponse): void {
    this.selectedItem.set(item);
    this.form.patchValue({
      code: item.codeIdentity,
      name: item.name,
      pluralName: item.namePlural,
      dimensionName: item.unitType,
      baseFactor: item.multiplierToBase,
      isBase: item.isBaseUnit,
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
    const value = this.form.value;
    const payload = {
      codeIdentity: value.code!,
      name: value.name!,
      namePlural: value.pluralName!,
      unitType: value.dimensionName!,
      multiplierToBase: value.baseFactor!,
      isBaseUnit: value.isBase!,
    };

    const request$ = isEdit
      ? this.measurementUnitService.update({ id: this.selectedItem()!.id, ...payload })
      : this.measurementUnitService.create(payload);

    request$.subscribe({
      next: () => {
        this.isSaving.set(false);
        this.closeForm();
        this.load();
        this.alertService.success(
          this.language.t(isEdit ? 'MEASUREMENT_UNITS.TOAST.UPDATED' : 'MEASUREMENT_UNITS.TOAST.CREATED')
        );
      },
      error: (err) => {
        this.isSaving.set(false);
        this.alertService.error(err?.message || this.language.t('COMMON.TOAST.SAVE_FAILED'));
      },
    });
  }

  async confirmDelete(item: MeasurementUnitResponse): Promise<void> {
    const confirmed = await this.confirmService.confirmDelete(item.name);
    if (!confirmed) {
      return;
    }
    this.measurementUnitService.delete(item.id).subscribe({
      next: () => {
        this.load();
        this.alertService.success(this.language.t('MEASUREMENT_UNITS.TOAST.DELETED'));
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
