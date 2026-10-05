import { ChangeDetectionStrategy, Component, computed, effect, inject, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';

import { TranslatePipe } from '@ngx-translate/core';
import { ButtonModule } from 'primeng/button';
import { CardModule } from 'primeng/card';
import { DialogModule } from 'primeng/dialog';
import { SelectModule } from 'primeng/select';
import { TableLazyLoadEvent, TableModule } from 'primeng/table';
import { TagModule } from 'primeng/tag';
import { TooltipModule } from 'primeng/tooltip';

import { DataImportService } from 'src/app/core/services/domain/data-import.service';
import { ImportBatchSummary, ImportReport, ImportResource, ImportStatus } from 'src/app/core/models/unit-catalog.models';
import { catalogErrorMessage } from 'src/app/core/utils/catalog-error.util';
import { LanguageService } from 'src/app/core/services/language.service';
import { PageInfoService } from 'src/app/core/services/page-info.service';
import { AlertService } from 'src/app/shared/services/alert.service';
import { SelectOption } from 'src/app/shared/i18n/catalog-options';
import { TableSkeletonRowComponent } from 'src/app/shared/components/table-skeleton-row/table-skeleton-row.component';
import { ImportReportViewComponent } from 'src/app/shared/components/import-report-view/import-report-view.component';
import { copyToClipboard } from 'src/app/shared/utils/clipboard.util';

const RESOURCE_VALUES: readonly ImportResource[] = ['UNIT_TYPE', 'MEASUREMENT_UNIT'];
const STATUS_VALUES: readonly ImportStatus[] = ['VALIDATED', 'COMMITTED', 'REJECTED', 'FAILED'];

const STATUS_TAG: Readonly<Record<ImportStatus, 'success' | 'info' | 'danger' | 'warn'>> = {
  VALIDATED: 'info',
  COMMITTED: 'success',
  REJECTED: 'danger',
  FAILED: 'danger',
};

@Component({
  selector: 'app-import-history',
  standalone: true,
  imports: [
    DatePipe,
    FormsModule,
    TranslatePipe,
    ButtonModule,
    CardModule,
    DialogModule,
    SelectModule,
    TableModule,
    TagModule,
    TooltipModule,
    TableSkeletonRowComponent,
    ImportReportViewComponent,
  ],
  templateUrl: './import-history.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ImportHistoryComponent {
  private readonly dataImportService = inject(DataImportService);
  private readonly alertService = inject(AlertService);
  private readonly pageInfoService = inject(PageInfoService);
  private readonly language = inject(LanguageService);

  readonly batches = signal<ImportBatchSummary[]>([]);
  readonly totalRecords = signal(0);
  readonly isLoading = signal(false);
  protected readonly skeletonRows = Array.from({ length: 6 });

  readonly resourceFilter = signal<ImportResource | null>(null);
  readonly statusFilter = signal<ImportStatus | null>(null);

  readonly viewedReport = signal<ImportReport | null>(null);
  readonly isLoadingReport = signal(false);
  readonly showReportDialog = signal(false);

  private pageIndex = 0;
  private pageSizeValue = 20;

  readonly resourceOptions = computed<SelectOption<ImportResource>[]>(() =>
    RESOURCE_VALUES.map((value) => ({ label: this.language.t(`UNIT_CATALOG_IMPORT.RESOURCE.${value}`), value })),
  );

  readonly statusOptions = computed<SelectOption<ImportStatus>[]>(() =>
    STATUS_VALUES.map((value) => ({ label: this.language.t(`UNIT_CATALOG_IMPORT.STATUS.${value}`), value })),
  );

  constructor() {
    effect(() => {
      this.pageInfoService.updateTitle(this.language.t('IMPORT_HISTORY.TITLE'));
      this.pageInfoService.updateDescription(this.language.t('IMPORT_HISTORY.DESCRIPTION'));
      this.pageInfoService.updateBreadcrumbs([
        { title: this.language.t('BREADCRUMB.HOME'), path: '/dashboard', isActive: false },
        { title: this.language.t('NAV.SECTIONS.ADMINISTRATION'), path: '', isActive: false },
        { title: this.language.t('IMPORT_HISTORY.TITLE'), path: '', isActive: true },
      ]);
    });
  }

  onLazyLoad(event: TableLazyLoadEvent): void {
    this.pageIndex = Math.floor((event.first ?? 0) / (event.rows ?? this.pageSizeValue));
    this.pageSizeValue = event.rows ?? this.pageSizeValue;
    this.load();
  }

  onFilterChange(): void {
    this.pageIndex = 0;
    this.load();
  }

  private load(): void {
    this.isLoading.set(true);
    this.dataImportService
      .getBatches({
        page: this.pageIndex,
        size: this.pageSizeValue,
        resource: this.resourceFilter() ?? undefined,
        status: this.statusFilter() ?? undefined,
      })
      .subscribe({
        next: (res) => {
          this.isLoading.set(false);
          this.batches.set(res.data?.content ?? []);
          this.totalRecords.set(res.data?.totalElements ?? 0);
        },
        error: (err: unknown) => {
          this.isLoading.set(false);
          this.alertService.error(catalogErrorMessage(err, this.language.t('IMPORT_HISTORY.TOAST.LOAD_FAILED')));
        },
      });
  }

  statusTag(status: ImportStatus): 'success' | 'info' | 'danger' | 'warn' {
    return STATUS_TAG[status];
  }

  statusLabel(status: ImportStatus): string {
    return this.language.t(`UNIT_CATALOG_IMPORT.STATUS.${status}`);
  }

  resourceLabel(resource: ImportResource): string {
    return this.language.t(`UNIT_CATALOG_IMPORT.RESOURCE.${resource}`);
  }

  modeLabel(dryRun: boolean): string {
    return this.language.t(dryRun ? 'IMPORT_HISTORY.MODE.VALIDATION' : 'IMPORT_HISTORY.MODE.COMMIT');
  }

  shaShort(sha256: string): string {
    return `${sha256.slice(0, 10)}…`;
  }

  async copySha(sha256: string): Promise<void> {
    if (await copyToClipboard(sha256)) {
      this.alertService.success(this.language.t('IMPORT_HISTORY.TOAST.SHA_COPIED'));
    }
  }

  viewReport(batch: ImportBatchSummary): void {
    this.showReportDialog.set(true);
    this.isLoadingReport.set(true);
    this.viewedReport.set(null);
    this.dataImportService.getReport(batch.batchId).subscribe({
      next: (res) => {
        this.isLoadingReport.set(false);
        this.viewedReport.set(res.data);
      },
      error: (err: unknown) => {
        this.isLoadingReport.set(false);
        this.showReportDialog.set(false);
        this.alertService.error(catalogErrorMessage(err, this.language.t('IMPORT_HISTORY.TOAST.REPORT_FAILED')));
      },
    });
  }

  closeReportDialog(): void {
    this.showReportDialog.set(false);
    this.viewedReport.set(null);
  }
}
