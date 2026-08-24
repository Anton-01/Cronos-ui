import { ChangeDetectionStrategy, Component, ElementRef, computed, inject, output, signal, viewChild } from '@angular/core';

import { ButtonModule } from 'primeng/button';
import { DialogModule } from 'primeng/dialog';
import { MessageModule } from 'primeng/message';
import { TableModule } from 'primeng/table';
import { TagModule } from 'primeng/tag';
import { TooltipModule } from 'primeng/tooltip';

import { CategoryService } from 'src/app/core/services/domain/category.service';
import { CsvImportResponse, CsvImportRowError } from 'src/app/core/models/category.model';
import { apiErrorMessage } from 'src/app/core/utils/api-error.util';
import { AlertService } from 'src/app/shared/services/alert.service';

/** Anything larger is a pasted spreadsheet, not a category list. */
const MAX_FILE_SIZE_BYTES = 2 * 1024 * 1024;

const ACCEPTED_EXTENSION = '.csv';

/**
 * Bulk-create categories from a CSV (`name`, `description`, `type`).
 *
 * The dialog stays open after a run so the user can read the per-row report;
 * `imported` is emitted on close whenever at least one row landed, which is
 * the parent's cue to refetch.
 */
@Component({
  selector: 'app-category-import-dialog',
  standalone: true,
  imports: [ButtonModule, DialogModule, MessageModule, TableModule, TagModule, TooltipModule],
  templateUrl: './category-import-dialog.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CategoryImportDialogComponent {
  private readonly categoryService = inject(CategoryService);
  private readonly alertService = inject(AlertService);

  /** Emitted when the run created at least one category — refetch the grid. */
  readonly imported = output<CsvImportResponse>();

  /** Emitted when the dialog should be torn down without any new rows. */
  readonly closed = output<void>();

  private readonly fileInput = viewChild.required<ElementRef<HTMLInputElement>>('fileInput');

  readonly selectedFile = signal<File | null>(null);
  readonly isImporting = signal(false);
  readonly result = signal<CsvImportResponse | null>(null);
  readonly validationError = signal<string | null>(null);

  readonly acceptedExtension = ACCEPTED_EXTENSION;
  readonly maxFileSizeLabel = `${MAX_FILE_SIZE_BYTES / (1024 * 1024)} MB`;

  readonly canImport = computed(() => this.selectedFile() !== null && !this.isImporting());

  readonly rowErrors = computed<CsvImportRowError[]>(() => this.result()?.errors ?? []);

  readonly hasFailures = computed(() => (this.result()?.failureCount ?? 0) > 0);

  triggerFileInput(): void {
    this.fileInput().nativeElement.click();
  }

  onFileSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0] ?? null;
    this.result.set(null);
    this.validationError.set(null);

    if (!file) {
      this.selectedFile.set(null);
      return;
    }
    if (!file.name.toLowerCase().endsWith(ACCEPTED_EXTENSION)) {
      this.selectedFile.set(null);
      this.validationError.set('El archivo debe tener extensión .csv');
      return;
    }
    if (file.size > MAX_FILE_SIZE_BYTES) {
      this.selectedFile.set(null);
      this.validationError.set(`El archivo supera el tamaño máximo de ${this.maxFileSizeLabel}`);
      return;
    }
    this.selectedFile.set(file);
  }

  clearFile(): void {
    this.selectedFile.set(null);
    this.result.set(null);
    this.validationError.set(null);
    this.fileInput().nativeElement.value = '';
  }

  fileSizeLabel(file: File): string {
    return `${(file.size / 1024).toFixed(1)} KB`;
  }

  onImport(): void {
    const file = this.selectedFile();
    if (!file || this.isImporting()) {
      return;
    }

    this.isImporting.set(true);
    this.categoryService.importCsv(file).subscribe({
      next: (res) => {
        this.isImporting.set(false);
        this.result.set(res.data);
        if (res.data.successCount > 0) {
          this.alertService.success(
            `${res.data.successCount} de ${res.data.totalRows} categorías importadas correctamente`,
          );
        } else {
          this.alertService.warning('No se importó ninguna categoría. Revisa el detalle de errores.');
        }
      },
      error: (err: unknown) => {
        this.isImporting.set(false);
        this.alertService.error(apiErrorMessage(err, 'No se pudo importar el archivo'));
      },
    });
  }

  close(): void {
    const result = this.result();
    if (result && result.successCount > 0) {
      this.imported.emit(result);
      return;
    }
    this.closed.emit();
  }
}
