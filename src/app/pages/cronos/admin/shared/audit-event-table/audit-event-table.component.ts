import { DatePipe, KeyValuePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, DestroyRef, computed, effect, inject, input, signal, untracked } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { TranslatePipe } from '@ngx-translate/core';
import { TableLazyLoadEvent, TableModule } from 'primeng/table';
import { ButtonModule } from 'primeng/button';
import { DatePickerModule } from 'primeng/datepicker';
import { IconFieldModule } from 'primeng/iconfield';
import { InputIconModule } from 'primeng/inputicon';
import { InputTextModule } from 'primeng/inputtext';
import { MultiSelectModule } from 'primeng/multiselect';
import { TagModule } from 'primeng/tag';
import { TooltipModule } from 'primeng/tooltip';
import { Subject, debounceTime, distinctUntilChanged, switchMap, catchError, of } from 'rxjs';

import { AuditCategory, AuditEvent, AuditOutcome, AuditQuery, AuditSeverity } from 'src/app/core/models/iam.models';
import { IamAuditService } from 'src/app/core/services/iam/iam-audit.service';
import { LanguageService } from 'src/app/core/services/language.service';
import { triggerBlobDownload } from 'src/app/core/services/domain/import-file.util';
import { catalogErrorMessage } from 'src/app/core/utils/catalog-error.util';
import { AlertService } from 'src/app/shared/services/alert.service';
import { TableSkeletonRowComponent } from 'src/app/shared/components/table-skeleton-row/table-skeleton-row.component';
import {
  AUDIT_CATEGORY_ICON,
  AUDIT_OUTCOME_SEVERITY,
  AUDIT_SEVERITY_SEVERITY,
  TagSeverity,
  auditCategoryOptions,
  auditOutcomeOptions,
  auditSeverityOptions,
} from '../iam-labels';

type FixedScope = Pick<AuditQuery, 'actorId' | 'targetType' | 'targetId'>;

/**
 * Server-paged audit trail with an expandable before/after diff per event.
 * Reused by the global audit log (all filters) and the user detail
 * "Activity" tab (scoped by `actorId` or `targetId`).
 */
@Component({
  selector: 'app-audit-event-table',
  standalone: true,
  imports: [
    DatePipe,
    KeyValuePipe,
    FormsModule,
    TranslatePipe,
    TableModule,
    ButtonModule,
    DatePickerModule,
    IconFieldModule,
    InputIconModule,
    InputTextModule,
    MultiSelectModule,
    TagModule,
    TooltipModule,
    TableSkeletonRowComponent,
  ],
  templateUrl: './audit-event-table.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AuditEventTableComponent {
  private readonly auditService = inject(IamAuditService);
  private readonly alert = inject(AlertService);
  private readonly language = inject(LanguageService);
  private readonly destroyRef = inject(DestroyRef);

  readonly scope = input<FixedScope>({});
  readonly showFilters = input(true);
  readonly allowExport = input(false);
  readonly rows = input(15);

  // Widened to `string` keys: row templates are untyped (`let-event`).
  protected readonly categoryIcon: Readonly<Record<string, string>> = AUDIT_CATEGORY_ICON;
  protected readonly outcomeSeverity: Readonly<Record<string, TagSeverity>> = AUDIT_OUTCOME_SEVERITY;
  protected readonly severitySeverity: Readonly<Record<string, TagSeverity>> = AUDIT_SEVERITY_SEVERITY;
  protected readonly skeletonRows = Array.from({ length: 6 });
  protected readonly today = new Date();

  protected readonly events = signal<AuditEvent[]>([]);
  protected readonly total = signal(0);
  protected readonly loading = signal(true);
  protected readonly exporting = signal(false);
  protected readonly first = signal(0);

  protected readonly search = signal('');
  protected readonly categories = signal<AuditCategory[]>([]);
  protected readonly outcomes = signal<AuditOutcome[]>([]);
  protected readonly severities = signal<AuditSeverity[]>([]);
  protected readonly range = signal<Date[] | null>(null);

  protected readonly categoryOptions = computed(() => auditCategoryOptions((key) => this.language.t(key)));
  protected readonly outcomeOptions = computed(() => auditOutcomeOptions((key) => this.language.t(key)));
  protected readonly severityOptions = computed(() => auditSeverityOptions((key) => this.language.t(key)));
  protected readonly hasFilters = computed(
    () =>
      this.search().length > 0 ||
      this.categories().length > 0 ||
      this.outcomes().length > 0 ||
      this.severities().length > 0 ||
      (this.range()?.length ?? 0) > 0,
  );

  private readonly page = signal({ page: 0, size: 15 });
  private readonly requests = new Subject<AuditQuery>();
  private readonly searchInput = new Subject<string>();

  constructor() {
    this.requests
      .pipe(
        switchMap((query) => {
          this.loading.set(true);
          return this.auditService.events(query).pipe(
            catchError((error: unknown) => {
              this.alert.error(catalogErrorMessage(error, this.language.t('IAM.AUDIT.LOAD_FAILED')));
              return of(null);
            }),
          );
        }),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe((response) => {
        this.events.set(response?.data?.content ?? []);
        this.total.set(response?.data?.totalElements ?? 0);
        this.loading.set(false);
      });

    this.searchInput
      .pipe(debounceTime(350), distinctUntilChanged(), takeUntilDestroyed(this.destroyRef))
      .subscribe((term) => {
        this.search.set(term);
        this.resetToFirstPage();
      });

    // Any filter or scope change reloads; page changes come through onLazyLoad.
    effect(() => {
      const query = this.buildQuery();
      untracked(() => this.requests.next(query));
    });
  }

  protected onLazyLoad(event: TableLazyLoadEvent): void {
    const size = event.rows ?? this.rows();
    const page = Math.floor((event.first ?? 0) / size);
    const current = this.page();
    if (current.page !== page || current.size !== size) {
      this.first.set(event.first ?? 0);
      this.page.set({ page, size });
    }
  }

  protected onSearch(term: string): void {
    this.searchInput.next(term.trim());
  }

  protected setFilter<T>(target: { set: (value: T) => void }, value: T): void {
    target.set(value);
    this.resetToFirstPage();
  }

  protected clearFilters(): void {
    this.search.set('');
    this.categories.set([]);
    this.outcomes.set([]);
    this.severities.set([]);
    this.range.set(null);
    this.resetToFirstPage();
  }

  protected reload(): void {
    this.requests.next(this.buildQuery());
  }

  protected export(): void {
    const { page: _page, size: _size, ...query } = this.buildQuery();
    this.exporting.set(true);
    this.auditService.export(query).subscribe({
      next: (file) => {
        this.exporting.set(false);
        triggerBlobDownload(file.blob, file.fileName);
      },
      error: (error: unknown) => {
        this.exporting.set(false);
        this.alert.error(catalogErrorMessage(error, this.language.t('IAM.AUDIT.EXPORT_FAILED')));
      },
    });
  }

  protected hasChanges(event: AuditEvent): boolean {
    return Object.keys(event.changes ?? {}).length > 0;
  }

  protected display(value: unknown): string {
    if (value === null || value === undefined || value === '') {
      return '∅';
    }
    if (Array.isArray(value)) {
      return value.join(', ');
    }
    return typeof value === 'object' ? JSON.stringify(value) : String(value);
  }

  private resetToFirstPage(): void {
    this.first.set(0);
    this.page.update((current) => ({ ...current, page: 0 }));
  }

  private buildQuery(): AuditQuery {
    const { page, size } = this.page();
    const [from, to] = this.range() ?? [];
    const end = to ? new Date(to) : from ? new Date(from) : null;
    end?.setHours(23, 59, 59, 999);
    return {
      page,
      size,
      ...this.scope(),
      search: this.search() || undefined,
      categories: this.categories(),
      outcomes: this.outcomes(),
      severities: this.severities(),
      from: from ? new Date(new Date(from).setHours(0, 0, 0, 0)).toISOString() : undefined,
      to: end ? end.toISOString() : undefined,
    };
  }
}
