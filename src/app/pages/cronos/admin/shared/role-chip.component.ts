import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';

import { contrastTextFor } from './iam-labels';

/** A role name painted in the role's own colour. */
@Component({
  selector: 'app-role-chip',
  standalone: true,
  template: `<span class="role-chip" [style.background]="background()" [style.color]="foreground()">{{ name() }}</span>`,
  styles: `
    .role-chip {
      display: inline-flex;
      align-items: center;
      padding: 0.15rem 0.6rem;
      border-radius: var(--radius-pill);
      font-size: 0.75rem;
      font-weight: 600;
      white-space: nowrap;
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class RoleChipComponent {
  readonly name = input.required<string>();
  readonly color = input<string | null>(null);

  protected readonly background = computed(() => this.color() ?? 'var(--surface-hover)');
  protected readonly foreground = computed(() => (this.color() ? contrastTextFor(this.color()) : 'var(--p-text-color)'));
}
