import { ChangeDetectionStrategy, Component, ElementRef, OnInit, computed, effect, inject, signal, viewChild } from '@angular/core';
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
import { TokenService } from 'src/app/core/services/token.service';
import { ApiError, RecordStatus, UnitDimension, UnitTypeRequest, UnitTypeResponse } from 'src/app/core/models/unit-catalog.models';
import { catalogErrorMessage, catalogErrors, catalogRootMessage } from 'src/app/core/utils/catalog-error.util';
import { PageInfoService } from 'src/app/core/services/page-info.service';
import { AlertService } from 'src/app/shared/services/alert.service';
import { ConfirmService } from 'src/app/shared/services/confirm.service';
import { StatusToggleComponent } from 'src/app/shared/components/status-toggle/status-toggle.component';
import { EntityStatus, SelectOption, dimensionOptions, statusOptions } from 'src/app/shared/i18n/catalog-options';
import { TableSkeletonRowComponent } from 'src/app/shared/components/table-skeleton-row/table-skeleton-row.component';
import { codeIdentityValidator, CODE_IDENTITY_MAX_LENGTH } from 'src/app/shared/validators/unit-catalog.validators';
import { focusFirstInvalidControl } from 'src/app/shared/utils/form-focus.util';
import { UnitCatalogImportWizardComponent } from 'src/app/shared/components/unit-catalog-import-wizard/unit-catalog-import-wizard.component';

/** Which form control an `errors[].field` maps onto. */
const SERVER_FIELD_TO_CONTROL: Readonly<Record<string, 'codeIdentity' | 'name' | 'dimension'>> = {
  codeIdentity: 'codeIdentity',
  name: 'name',
  dimension: 'dimension',
};

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
    UnitCatalogImportWizardComponent,
  ],
  templateUrl: './unit-types.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class UnitTypesComponent implements OnInit {
  private readonly unitTypeService = inject(UnitTypeService);
  private readonly alertService = inject(AlertService);
  private readonly confirmService = inject(ConfirmService);
  private readonly pageInfoService = inject(PageInfoService);
  private readonly tokenService = inject(TokenService);
  private readonly language = inject(LanguageService);
  private readonly fb = inject(FormBuilder);

  private readonly formRef = viewChild<ElementRef<HTMLFormElement>>('unitTypeFormEl');

  readonly items = signal<UnitTypeResponse[]>([]);
  readonly isLoading = signal(false);
  protected readonly skeletonRows = Array.from({ length: 6 });
  readonly showForm = signal(false);
  readonly showImportWizard = signal(false);
  readonly selectedItem = signal<UnitTypeResponse | null>(null);
  readonly isSaving = signal(false);

  /** Catalog writes need SUPER_ADMIN or the MANAGE_CATALOGS permission — see `roleGuard`. */
  readonly canManageCatalogs = computed(
    () => this.tokenService.hasRole('SUPER_ADMIN') || this.tokenService.hasPermission('MANAGE_CATALOGS'),
  );

  readonly dimensionSelectOptions = computed<SelectOption<UnitDimension>[]>(() =>
    dimensionOptions((key) => this.language.t(key)),
  );

  readonly statusFilterOptions = computed<SelectOption<EntityStatus>[]>(() =>
    statusOptions((key) => this.language.t(key)),
  );

  readonly codeMaxLength = CODE_IDENTITY_MAX_LENGTH;

  readonly form = this.fb.group({
    codeIdentity: ['', [Validators.required, Validators.maxLength(CODE_IDENTITY_MAX_LENGTH), codeIdentityValidator()]],
    name: ['', [Validators.required, Validators.maxLength(100)]],
    dimension: this.fb.control<UnitDimension | null>(null, [Validators.required]),
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
        this.items.set(res.data?.content ?? []);
        this.isLoading.set(false);
      },
      error: (err: unknown) => {
        this.isLoading.set(false);
        this.alertService.error(catalogErrorMessage(err, this.language.t('UNIT_TYPES.TOAST.LOAD_FAILED')));
      },
    });
  }

  openCreate(): void {
    if (!this.canManageCatalogs()) {
      return;
    }
    this.selectedItem.set(null);
    this.form.reset();
    this.showForm.set(true);
  }

  openEdit(item: UnitTypeResponse): void {
    if (!this.canManageCatalogs()) {
      return;
    }
    this.selectedItem.set(item);
    this.form.reset({
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
    if (!this.canManageCatalogs() || this.isSaving()) {
      return;
    }
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      focusFirstInvalidControl(this.formRef()?.nativeElement);
      return;
    }

    const { codeIdentity, name, dimension } = this.form.getRawValue();
    const payload: UnitTypeRequest = { codeIdentity: codeIdentity!, name: name!, dimension: dimension! };
    const current = this.selectedItem();

    this.isSaving.set(true);
    const request$ = current ? this.unitTypeService.update(current.id, payload) : this.unitTypeService.create(payload);

    request$.subscribe({
      next: () => {
        this.isSaving.set(false);
        this.closeForm();
        this.load();
        this.alertService.success(this.language.t(current ? 'UNIT_TYPES.TOAST.UPDATED' : 'UNIT_TYPES.TOAST.CREATED'));
      },
      error: (err: unknown) => this.onSaveError(err),
    });
  }

  private onSaveError(error: unknown): void {
    this.isSaving.set(false);
    const details = catalogErrors(error);

    for (const detail of details) {
      this.applyFieldError(detail);
    }

    const hasFieldError = details.some((detail) => detail.field !== null);
    if (hasFieldError) {
      this.alertService.error(catalogRootMessage(error, this.language.t('COMMON.TOAST.SAVE_FAILED')));
      return;
    }

    this.alertService.error(catalogErrorMessage(error, this.language.t('COMMON.TOAST.SAVE_FAILED')));
  }

  private applyFieldError(detail: ApiError): void {
    const controlName = detail.field ? SERVER_FIELD_TO_CONTROL[detail.field] : undefined;
    if (!controlName) {
      return;
    }
    const control = this.form.controls[controlName];
    control.setErrors({ serverValidation: detail.message });
    control.markAsTouched();
  }

  serverError(controlName: 'codeIdentity' | 'name' | 'dimension'): string | null {
    const message: unknown = this.form.controls[controlName].errors?.['serverValidation'];
    return typeof message === 'string' ? message : null;
  }

  isInvalid(controlName: 'codeIdentity' | 'name' | 'dimension'): boolean {
    const control = this.form.controls[controlName];
    return control.invalid && (control.touched || control.dirty);
  }

  async confirmDelete(item: UnitTypeResponse): Promise<void> {
    if (!this.canManageCatalogs()) {
      return;
    }
    const confirmed = await this.confirmService.confirmDelete(item.name);
    if (!confirmed) {
      return;
    }
    this.unitTypeService.delete(item.id).subscribe({
      next: () => {
        this.load();
        this.alertService.success(this.language.t('UNIT_TYPES.TOAST.DELETED'));
      },
      error: (err: unknown) => {
        this.alertService.error(catalogErrorMessage(err, this.language.t('COMMON.TOAST.DELETE_FAILED')));
      },
    });
  }

  openImportWizard(): void {
    if (!this.canManageCatalogs()) {
      return;
    }
    this.showImportWizard.set(true);
  }

  onImportFinished(committed: boolean): void {
    this.showImportWizard.set(false);
    if (committed) {
      this.load();
    }
  }

  updateItemStatus(id: number, newStatus: RecordStatus): void {
    this.items.update((current) => current.map((item) => (item.id === id ? { ...item, status: newStatus } : item)));
  }
}
