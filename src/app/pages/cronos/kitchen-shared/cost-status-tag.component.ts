import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { TranslatePipe } from '@ngx-translate/core';
import { TagModule } from 'primeng/tag';
import { TooltipModule } from 'primeng/tooltip';

import { CostStatus } from 'src/app/core/models/kitchen.models';
import { COST_STATUS_ICON, COST_STATUS_SEVERITY } from './kitchen-labels';

/** Whether a recipe's cost reflects today's prices — the "never lose money" signal. */
@Component({
  selector: 'app-cost-status-tag',
  standalone: true,
  imports: [DatePipe, TranslatePipe, TagModule, TooltipModule],
  template: `
    <p-tag
      [severity]="severity[status()]"
      [icon]="icon[status()]"
      [value]="'KITCHEN.COST_STATUS.' + status() | translate"
      [pTooltip]="calculatedAt() ? ('KITCHEN.COST_STATUS.CALCULATED_AT' | translate) + ' ' + (calculatedAt() | date: 'medium') : ''"
    />
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CostStatusTagComponent {
  readonly status = input.required<CostStatus>();
  readonly calculatedAt = input<string | null>(null);

  protected readonly severity = COST_STATUS_SEVERITY;
  protected readonly icon = COST_STATUS_ICON;
}
