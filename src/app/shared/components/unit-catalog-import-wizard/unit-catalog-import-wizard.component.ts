import { ChangeDetectionStrategy, Component, computed, inject, input, output, signal } from '@angular/core';

import { TranslatePipe } from '@ngx-translate/core';
import { MenuItem } from 'primeng/api';
import { ButtonModule } from 'primeng/button';
import { DialogModule } from 'primeng/dialog';
import { FileUploadModule, FileRemoveEvent, FileSelectEvent, FileUploadHandlerEvent } from 'primeng/fileupload';
import { MessageModule } from 'primeng/message';
import { StepsModule } from 'primeng/steps';

import { MeasurementUnitService } from 'src/app/core/services/domain/measurement-unit.service';
import { UnitTypeService } from 'src/app/core/services/domain/unit-type.service';
import { DownloadedFile, triggerBlobDownload } from 'src/app/core/services/domain/import-file.util';
import { ImportReport, ImportResource } from 'src/app/core/models/unit-catalog.models';
import { catalogErrorMessage, catalogTraceId } from 'src/app/core/utils/catalog-error.util';
import { LanguageService } from 'src/app/core/services/language.service';
import { AlertService } from 'src/app/shared/services/alert.service';
import { ConfirmService } from 'src/app/shared/services/confirm.service';
import { ImportReportViewComponent } from 'src/app/shared/components/import-report-view/import-report-view.component';
import { Observable } from 'rxjs';

const MAX_FILE_SIZE_BYTES = 2 * 1024 * 1024;
const ACCEPTED_EXTENSION = '.xlsx';

interface ImportCapableService {
  importFile(file: File, dryRun: boolean): Observable<{ data: ImportReport | null }>;
  downloadTemplate(): Observable<DownloadedFile>;
}

/**
 * The bulk `.xlsx` import wizard — one component for both `/unit-type/import`
 * and `/measurement-unit/import`, selected by `resource`. Dry-run validation
 * is always the step before a commit; the same `File` object is resent with
 * `dryRun=false` so the server re-validates against current data rather than
 * trusting a report that might be stale by the time the user confirms.
 */
@Component({
  selector: 'app-unit-catalog-import-wizard',
  standalone: true,
  imports: [TranslatePipe, ButtonModule, DialogModule, FileUploadModule, MessageModule, StepsModule, ImportReportViewComponent],
  templateUrl: './unit-catalog-import-wizard.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class UnitCatalogImportWizardComponent {
  private readonly unitTypeService = inject(UnitTypeService);
  private readonly measurementUnitService = inject(MeasurementUnitService);
  private readonly alertService = inject(AlertService);
  private readonly confirmService = inject(ConfirmService);
  private readonly language = inject(LanguageService);

  readonly resource = input.required<ImportResource>();

  /** `true` when a commit actually landed — the parent's cue to refetch its grid. */
  readonly finished = output<boolean>();

  readonly activeStep = signal(0);
  readonly selectedFile = signal<File | null>(null);
  readonly fileError = signal<string | null>(null);
  readonly isValidating = signal(false);
  readonly isApplying = signal(false);
  readonly isDownloadingTemplate = signal(false);
  readonly report = signal<ImportReport | null>(null);

  readonly acceptedExtension = ACCEPTED_EXTENSION;
  readonly maxFileSizeBytes = MAX_FILE_SIZE_BYTES;

  readonly stepItems = computed<MenuItem[]>(() => [
    { label: this.language.t('UNIT_CATALOG_IMPORT.WIZARD.STEPS.FILE') },
    { label: this.language.t('UNIT_CATALOG_IMPORT.WIZARD.STEPS.VALIDATE') },
    { label: this.language.t('UNIT_CATALOG_IMPORT.WIZARD.STEPS.RESULT') },
  ]);

  readonly dialogTitle = computed(() =>
    this.language.t(
      this.resource() === 'UNIT_TYPE' ? 'UNIT_CATALOG_IMPORT.WIZARD.TITLE_UNIT_TYPE' : 'UNIT_CATALOG_IMPORT.WIZARD.TITLE_MEASUREMENT_UNIT',
    ),
  );

  readonly canValidate = computed(() => this.selectedFile() !== null && !this.isValidating());

  readonly canApply = computed(
    () => this.report()?.status === 'VALIDATED' && this.selectedFile() !== null && !this.isApplying(),
  );

  readonly isRejected = computed(() => this.report()?.status === 'REJECTED');

  private service(): ImportCapableService {
    return this.resource() === 'UNIT_TYPE' ? this.unitTypeService : this.measurementUnitService;
  }

  downloadTemplate(): void {
    this.isDownloadingTemplate.set(true);
    this.service()
      .downloadTemplate()
      .subscribe({
        next: (file) => {
          this.isDownloadingTemplate.set(false);
          triggerBlobDownload(file.blob, file.fileName);
        },
        error: (err: unknown) => {
          this.isDownloadingTemplate.set(false);
          this.alertService.error(catalogErrorMessage(err, this.language.t('UNIT_CATALOG_IMPORT.WIZARD.FILE.TEMPLATE_FAILED')));
        },
      });
  }

  /**
   * `p-fileUpload` is `customUpload` so it never POSTs on its own — this is
   * only ever invoked if a future revision wires its own upload trigger
   * back in. The wizard's own "Validar" button is what actually calls
   * `importFile`, driving two requests (dry-run, then commit) against the
   * same selected `File`.
   */
  onUploadHandler(event: FileUploadHandlerEvent): void {
    this.setSelectedFile(event.files[0] ?? null);
  }

  onFileSelect(event: FileSelectEvent): void {
    this.setSelectedFile(event.files[0] ?? null);
  }

  onFileRemove(_event: FileRemoveEvent): void {
    this.setSelectedFile(null);
  }

  onFileClear(): void {
    this.setSelectedFile(null);
  }

  private setSelectedFile(file: File | null): void {
    this.report.set(null);
    this.fileError.set(null);

    if (!file) {
      this.selectedFile.set(null);
      return;
    }
    if (!file.name.toLowerCase().endsWith(ACCEPTED_EXTENSION)) {
      this.selectedFile.set(null);
      this.fileError.set(this.language.t('UNIT_CATALOG_IMPORT.WIZARD.FILE.ERRORS.NOT_XLSX'));
      return;
    }
    if (file.size > MAX_FILE_SIZE_BYTES) {
      this.selectedFile.set(null);
      this.fileError.set(this.language.t('UNIT_CATALOG_IMPORT.WIZARD.FILE.ERRORS.TOO_LARGE'));
      return;
    }
    this.selectedFile.set(file);
  }

  validate(): void {
    const file = this.selectedFile();
    if (!file || this.isValidating()) {
      return;
    }
    this.isValidating.set(true);
    this.service()
      .importFile(file, true)
      .subscribe({
        next: (res) => {
          this.isValidating.set(false);
          if (res.data) {
            this.report.set(res.data);
            this.activeStep.set(1);
          }
        },
        error: (err: unknown) => {
          this.isValidating.set(false);
          this.alertService.error(this.toastMessage(err, this.language.t('UNIT_CATALOG_IMPORT.WIZARD.TOAST.VALIDATE_FAILED')));
        },
      });
  }

  backToFile(): void {
    this.activeStep.set(0);
  }

  async confirmApply(): Promise<void> {
    const current = this.report();
    if (!current || current.status !== 'VALIDATED') {
      return;
    }
    const confirmed = await this.confirmService.confirm({
      title: this.language.t('UNIT_CATALOG_IMPORT.CONFIRM.TITLE'),
      message: this.language.t('UNIT_CATALOG_IMPORT.CONFIRM.MESSAGE', { created: current.created, updated: current.updated }),
      acceptLabel: this.language.t('UNIT_CATALOG_IMPORT.CONFIRM.ACCEPT'),
      severity: 'primary',
      icon: 'pi pi-cloud-upload',
    });
    if (confirmed) {
      this.apply();
    }
  }

  private apply(): void {
    const file = this.selectedFile();
    if (!file || this.isApplying()) {
      return;
    }
    this.isApplying.set(true);
    this.service()
      .importFile(file, false)
      .subscribe({
        next: (res) => {
          this.isApplying.set(false);
          if (res.data) {
            this.report.set(res.data);
            this.activeStep.set(2);
          }
        },
        error: (err: unknown) => {
          this.isApplying.set(false);
          this.alertService.error(this.toastMessage(err, this.language.t('UNIT_CATALOG_IMPORT.WIZARD.TOAST.APPLY_FAILED')));
        },
      });
  }

  close(): void {
    this.finished.emit(this.report()?.status === 'COMMITTED');
  }

  /** The error detail, with a translated "Reference: <traceId>" appended when the envelope carries one. */
  private toastMessage(error: unknown, fallback: string): string {
    const message = catalogErrorMessage(error, fallback);
    const traceId = catalogTraceId(error);
    return traceId ? `${message} (${this.language.t('COMMON.TOAST.TRACE_REFERENCE', { traceId })})` : message;
  }
}
