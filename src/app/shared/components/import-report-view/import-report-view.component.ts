import { ChangeDetectionStrategy, Component, computed, inject, input, signal } from '@angular/core';
import { DecimalPipe } from '@angular/common';

import { TranslatePipe } from '@ngx-translate/core';
import { ButtonModule } from 'primeng/button';
import { MessageModule } from 'primeng/message';
import { TableModule } from 'primeng/table';
import { TagModule } from 'primeng/tag';

import { LanguageService } from 'src/app/core/services/language.service';
import { AlertService } from 'src/app/shared/services/alert.service';
import {
  FieldChange,
  ImportAction,
  ImportIssue,
  ImportIssueSeverity,
  ImportReport,
  ImportRowResult,
  ImportStatus,
} from 'src/app/core/models/unit-catalog.models';
import { StatCardComponent, StatCardAccent } from 'src/app/shared/components/stat-card/stat-card.component';
import { downloadCsv, issuesToCsv } from 'src/app/shared/utils/csv-export.util';
import { copyToClipboard } from 'src/app/shared/utils/clipboard.util';

interface SummaryCard {
  labelKey: string;
  value: number;
  icon: string;
  accent: StatCardAccent;
}

interface ChangeEntry {
  field: string;
  change: FieldChange;
}

const SEVERITY_TAG: Readonly<Record<ImportIssueSeverity, 'danger' | 'warn'>> = {
  ERROR: 'danger',
  WARNING: 'warn',
};

const ACTION_TAG: Readonly<Record<ImportAction, 'success' | 'info' | 'secondary'>> = {
  CREATE: 'success',
  UPDATE: 'info',
  UNCHANGED: 'secondary',
};

const STATUS_TAG: Readonly<Record<ImportStatus, 'success' | 'info' | 'danger' | 'warn'>> = {
  VALIDATED: 'info',
  COMMITTED: 'success',
  REJECTED: 'danger',
  FAILED: 'danger',
};

/**
 * Renders one `ImportReport`: summary tiles, the issues table and the
 * per-row diff table. Shared by the import wizard's validation/result steps
 * and the import-history "Ver reporte" dialog — the report shape is
 * identical in every case (`POST .../import` and `GET /data-imports/{id}`
 * answer with the same `ImportReport`).
 */
@Component({
  selector: 'app-import-report-view',
  standalone: true,
  imports: [DecimalPipe, TranslatePipe, ButtonModule, MessageModule, TableModule, TagModule, StatCardComponent],
  templateUrl: './import-report-view.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ImportReportViewComponent {
  private readonly language = inject(LanguageService);
  private readonly alertService = inject(AlertService);

  readonly report = input.required<ImportReport>();

  readonly summaryCards = computed<SummaryCard[]>(() => {
    const r = this.report();
    return [
      { labelKey: 'UNIT_CATALOG_IMPORT.VALIDATE.CARDS.TOTAL', value: r.totalRows, icon: 'pi pi-list', accent: 'navy' },
      { labelKey: 'UNIT_CATALOG_IMPORT.VALIDATE.CARDS.CREATED', value: r.created, icon: 'pi pi-plus-circle', accent: 'green' },
      { labelKey: 'UNIT_CATALOG_IMPORT.VALIDATE.CARDS.UPDATED', value: r.updated, icon: 'pi pi-pencil', accent: 'green' },
      { labelKey: 'UNIT_CATALOG_IMPORT.VALIDATE.CARDS.UNCHANGED', value: r.unchanged, icon: 'pi pi-minus-circle', accent: 'slate' },
      { labelKey: 'UNIT_CATALOG_IMPORT.VALIDATE.CARDS.REJECTED_ROWS', value: r.rejectedRows, icon: 'pi pi-times-circle', accent: 'amber' },
      { labelKey: 'UNIT_CATALOG_IMPORT.VALIDATE.CARDS.WARNINGS', value: r.warningCount, icon: 'pi pi-exclamation-triangle', accent: 'amber' },
    ];
  });

  readonly sortedIssues = computed<ImportIssue[]>(() =>
    [...this.report().issues].sort((a, b) => (a.row ?? -1) - (b.row ?? -1)),
  );

  /** `row` is unique within one report — a plain object keyed by it is enough for `p-table` row expansion. */
  readonly expandedRows = signal<Record<number, boolean>>({});

  toggleRow(row: number): void {
    this.expandedRows.update((current) => ({ ...current, [row]: !current[row] }));
  }

  severityTag(severity: ImportIssueSeverity): 'danger' | 'warn' {
    return SEVERITY_TAG[severity];
  }

  actionTag(action: ImportAction): 'success' | 'info' | 'secondary' {
    return ACTION_TAG[action];
  }

  statusTag(status: ImportStatus): 'success' | 'info' | 'danger' | 'warn' {
    return STATUS_TAG[status];
  }

  statusLabel(status: ImportStatus): string {
    return this.language.t(`UNIT_CATALOG_IMPORT.STATUS.${status}`);
  }

  severityLabel(severity: ImportIssueSeverity): string {
    return this.language.t(`UNIT_CATALOG_IMPORT.SEVERITY.${severity}`);
  }

  actionLabel(action: ImportAction): string {
    return this.language.t(`UNIT_CATALOG_IMPORT.ACTION.${action}`);
  }

  fieldLabel(field: string): string {
    return this.language.t(`UNIT_CATALOG_IMPORT.FIELDS.${field}`);
  }

  changeEntries(row: ImportRowResult): ChangeEntry[] {
    return Object.entries(row.changes).map(([field, change]) => ({ field, change }));
  }

  displayValue(value: unknown): string {
    if (value === null || value === undefined) {
      return this.language.t('COMMON.EMPTY_VALUE');
    }
    if (typeof value === 'boolean') {
      return this.language.t(value ? 'COMMON.YES' : 'COMMON.NO');
    }
    return String(value);
  }

  exportIssuesCsv(): void {
    const csv = issuesToCsv(this.sortedIssues());
    downloadCsv(csv, `import-${this.report().batchId}-issues.csv`);
  }

  async copyBatchId(): Promise<void> {
    if (await copyToClipboard(this.report().batchId)) {
      this.alertService.success(this.language.t('UNIT_CATALOG_IMPORT.RESULT.COPIED'));
    }
    // Clipboard access denied (insecure context, permission) — the id is
    // still on screen to copy by hand, so this fails silently rather than
    // surfacing a toast for something the user can route around visually.
  }
}
