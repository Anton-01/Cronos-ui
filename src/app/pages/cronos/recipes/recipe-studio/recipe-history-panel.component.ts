import { DatePipe, DecimalPipe, KeyValuePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, OnInit, inject, input, signal } from '@angular/core';
import { TranslatePipe } from '@ngx-translate/core';
import { ButtonModule } from 'primeng/button';
import { TimelineModule } from 'primeng/timeline';

import { RecipeRevision } from 'src/app/core/models/kitchen.models';
import { RecipeService } from 'src/app/core/services/domain/recipe.service';
import { LanguageService } from 'src/app/core/services/language.service';
import { catalogErrorMessage } from 'src/app/core/utils/catalog-error.util';
import { AlertService } from 'src/app/shared/services/alert.service';

const PAGE_SIZE = 20;

/** Version timeline: who changed what, when, and what the unit cost was after each change. */
@Component({
  selector: 'app-recipe-history-panel',
  standalone: true,
  imports: [DatePipe, DecimalPipe, KeyValuePipe, TranslatePipe, ButtonModule, TimelineModule],
  template: `
    @if (loading() && revisions().length === 0) {
      <div class="flex justify-content-center py-5"><i class="pi pi-spin pi-spinner text-2xl text-primary" aria-hidden="true"></i></div>
    } @else if (revisions().length === 0) {
      <div class="text-center text-color-secondary py-5">{{ 'KITCHEN.HISTORY.EMPTY' | translate }}</div>
    } @else {
      <p-timeline [value]="revisions()" align="left">
        <ng-template #marker let-revision>
          <span class="history-marker">v{{ revision.version }}</span>
        </ng-template>
        <ng-template #content let-revision>
          <div class="flex flex-column gap-1 pb-3">
            <div class="flex flex-wrap align-items-center gap-2">
              <span class="font-semibold">{{ revision.summary }}</span>
              @if (revision.costPerUnit !== null) {
                <span class="text-xs font-mono px-2 py-1 border-round surface-ground">{{ 'KITCHEN.HISTORY.UNIT_COST' | translate }} {{ revision.costPerUnit | number: '1.2-2' }}</span>
              }
            </div>
            <span class="text-xs text-color-secondary">{{ revision.changedAt | date: 'medium' }} · {{ revision.changedBy?.displayName ?? ('IAM.AUDIT.SYSTEM' | translate) }}</span>
            @for (change of revision.changes | keyvalue; track change.key) {
              <span class="text-xs"><span class="font-mono text-color-secondary">{{ change.key }}</span>: <span class="text-red-500">{{ display(change.value.from) }}</span> → <span class="text-green-600">{{ display(change.value.to) }}</span></span>
            }
          </div>
        </ng-template>
      </p-timeline>
      @if (!last()) {
        <p-button [label]="'KITCHEN.HISTORY.MORE' | translate" [text]="true" icon="pi pi-angle-down" [loading]="loading()" (onClick)="loadMore()" />
      }
    }
  `,
  styles: `
    .history-marker {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      min-width: 2.2rem;
      height: 1.6rem;
      padding: 0 0.4rem;
      border-radius: var(--radius-pill);
      background: color-mix(in srgb, var(--primary-color) 14%, transparent);
      color: var(--primary-color);
      font-size: 0.75rem;
      font-weight: 700;
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class RecipeHistoryPanelComponent implements OnInit {
  private readonly recipeService = inject(RecipeService);
  private readonly alert = inject(AlertService);
  private readonly language = inject(LanguageService);

  readonly recipeId = input.required<string>();

  protected readonly revisions = signal<RecipeRevision[]>([]);
  protected readonly loading = signal(false);
  protected readonly last = signal(true);
  private page = 0;

  ngOnInit(): void {
    this.fetch();
  }

  protected loadMore(): void {
    this.page += 1;
    this.fetch();
  }

  private fetch(): void {
    this.loading.set(true);
    this.recipeService.history(this.recipeId(), this.page, PAGE_SIZE).subscribe({
      next: (response) => {
        this.revisions.update((list) => [...list, ...(response.data?.content ?? [])]);
        this.last.set(response.data?.last ?? true);
        this.loading.set(false);
      },
      error: (error: unknown) => {
        this.loading.set(false);
        this.alert.error(catalogErrorMessage(error, this.language.t('KITCHEN.HISTORY.LOAD_FAILED')));
      },
    });
  }

  protected display(value: unknown): string {
    if (value === null || value === undefined || value === '') {
      return '∅';
    }
    return typeof value === 'object' ? JSON.stringify(value) : String(value);
  }
}
