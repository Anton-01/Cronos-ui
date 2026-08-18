import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { SkeletonModule } from 'primeng/skeleton';

/**
 * Placeholder for a full detail/form view while its initial data fetch is
 * in flight (see context.md §4). Renders `fields` label+value pairs in a
 * responsive grid, shaped like a typical Cronos detail page.
 */
@Component({
  selector: 'app-detail-skeleton',
  standalone: true,
  imports: [SkeletonModule],
  template: `
    <div class="flex flex-column gap-4">
      @if (showTitle()) {
        <div class="flex flex-column gap-2">
          <p-skeleton width="14rem" height="1.75rem" />
          <p-skeleton width="20rem" height="1rem" />
        </div>
      }
      <div class="grid">
        @for (field of fieldsArray(); track $index) {
          <div class="col-12 md:col-6 flex flex-column gap-2">
            <p-skeleton width="6rem" height="0.85rem" />
            <p-skeleton height="2.5rem" />
          </div>
        }
      </div>
    </div>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DetailSkeletonComponent {
  readonly fields = input(6);
  readonly showTitle = input(true);

  protected readonly fieldsArray = computed(() =>
    Array.from({ length: this.fields() })
  );
}