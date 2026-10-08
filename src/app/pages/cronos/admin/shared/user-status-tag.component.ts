import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { DatePipe } from '@angular/common';
import { TranslatePipe } from '@ngx-translate/core';
import { TooltipModule } from 'primeng/tooltip';

import { UserStatus } from 'src/app/core/models/iam.models';
import { USER_STATUS_PILL } from './iam-labels';

/** The lifecycle status as a pill; shows the auto-revert date when time-bound. */
@Component({
  selector: 'app-user-status-tag',
  standalone: true,
  imports: [TranslatePipe, TooltipModule, DatePipe],
  template: `
    <span
      class="status-pill"
      [class]="pillClass()"
      [pTooltip]="until() ? (('IAM.USER_STATUS.UNTIL' | translate) + ' ' + (until() | date: 'medium')) : ''"
    >
      {{ 'IAM.USER_STATUS.' + status() | translate }}
      @if (until()) {
        <i class="pi pi-clock text-xs" aria-hidden="true"></i>
      }
    </span>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class UserStatusTagComponent {
  readonly status = input.required<UserStatus>();
  readonly until = input<string | null>(null);

  protected readonly pillClass = computed(() => `status-pill ${USER_STATUS_PILL[this.status()]}`);
}
