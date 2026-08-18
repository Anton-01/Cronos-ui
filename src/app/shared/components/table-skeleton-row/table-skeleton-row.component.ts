import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { SkeletonModule } from 'primeng/skeleton';

/**
 * One skeleton placeholder row for a p-table body, used from a table's
 * `pTemplate="loadingbody"` (see context.md §4). Selector targets `tr` so
 * the component decorates a real <tr> instead of wrapping it — table
 * structure stays valid inside <tbody>.
 */
@Component({
  selector: 'tr[appTableSkeletonRow]',
  standalone: true,
  imports: [SkeletonModule],
  template: `
    @for (col of cells(); track $index) {
      <td>
        <p-skeleton height="1.25rem" [width]="col" />
      </td>
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class TableSkeletonRowComponent {
  readonly columns = input(4);

  // Vary widths across the row so it reads as text/content, not a uniform
  // gray bar repeated N times.
  readonly cells = computed(() => {
    const widths = ['85%', '65%', '75%', '55%', '70%', '60%'];
    return Array.from(
      { length: this.columns() },
      (_, i) => widths[i % widths.length]
    );
  });
}