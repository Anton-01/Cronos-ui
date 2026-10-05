import { ChangeDetectionStrategy, Component, Input } from '@angular/core';

export type MetricCardVariant = 'green' | 'dark' | 'orange' | 'blue';

@Component({
  selector: 'app-metric-card',
  standalone: true,
  template: `
    <div class="metric-card" [class]="'metric-card-' + variant">
      <i class="metric-card-icon" [class]="icon"></i>
      <span class="metric-card-label">{{ label }}</span>
      <span class="metric-card-value">{{ value }}</span>
    </div>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class MetricCardComponent {
  @Input({ required: true }) label!: string;
  @Input({ required: true }) value!: string;
  @Input({ required: true }) icon!: string;
  @Input({ required: true }) variant!: MetricCardVariant;
}
