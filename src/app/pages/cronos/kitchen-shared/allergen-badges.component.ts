import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { TranslatePipe } from '@ngx-translate/core';
import { TooltipModule } from 'primeng/tooltip';
import { catchError, of } from 'rxjs';

import { AllergenRef } from 'src/app/core/models/kitchen.models';
import { AllergenService } from 'src/app/core/services/domain/allergen.service';

/**
 * Allergen pictograms in a row. Compact mode shows icons only (tooltip
 * names them); full mode shows labelled chips. An empty list renders a
 * "no declared allergens" hint so absence is explicit, never ambiguous.
 */
@Component({
  selector: 'app-allergen-badges',
  standalone: true,
  imports: [TranslatePipe, TooltipModule],
  template: `
    @if (allergens().length === 0) {
      @if (showEmpty()) {
        <span class="text-xs text-color-secondary"><i class="pi pi-check-circle text-green-500 text-xs" aria-hidden="true"></i> {{ 'KITCHEN.ALLERGENS.NONE_DECLARED' | translate }}</span>
      }
    } @else {
      <span class="allergen-badges" role="list" [attr.aria-label]="'KITCHEN.ALLERGENS.CONTAINS' | translate">
        @for (allergen of allergens(); track allergen.id) {
          <span class="allergen-badge" [class.allergen-badge-compact]="compact()" role="listitem" [pTooltip]="allergen.name" [attr.aria-label]="allergen.name">
            <i [class]="iconOf(allergen.code)" aria-hidden="true"></i>
            @if (!compact()) {
              <span>{{ allergen.name }}</span>
            }
          </span>
        }
      </span>
    }
  `,
  styles: `
    .allergen-badges {
      display: inline-flex;
      flex-wrap: wrap;
      gap: 0.3rem;
    }

    .allergen-badge {
      display: inline-flex;
      align-items: center;
      gap: 0.3rem;
      padding: 0.15rem 0.55rem;
      border-radius: var(--radius-pill);
      background: color-mix(in srgb, var(--p-orange-500) 14%, transparent);
      color: var(--p-orange-700);
      font-size: 0.75rem;
      font-weight: 600;
    }

    .allergen-badge-compact {
      width: 1.6rem;
      height: 1.6rem;
      padding: 0;
      justify-content: center;
    }

    :host-context(.app-dark) .allergen-badge {
      color: var(--p-orange-300);
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AllergenBadgesComponent {
  private readonly catalog = toSignal(inject(AllergenService).active().pipe(catchError(() => of([]))), { initialValue: [] });

  readonly allergens = input<readonly AllergenRef[]>([]);
  readonly compact = input(false);
  readonly showEmpty = input(false);

  private readonly icons = computed(() => new Map(this.catalog().map((allergen) => [allergen.code, allergen.icon])));

  protected iconOf(code: string): string {
    return this.icons().get(code) ?? 'pi pi-exclamation-triangle';
  }
}
