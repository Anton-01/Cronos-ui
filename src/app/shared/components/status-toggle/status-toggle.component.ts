import { ChangeDetectionStrategy, Component, EventEmitter, Input, Output, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { FormsModule } from '@angular/forms';
import { ToggleSwitchModule } from 'primeng/toggleswitch';

import { LanguageService } from 'src/app/core/services/language.service';
import { AlertService } from 'src/app/shared/services/alert.service';
import { ConfirmService } from 'src/app/shared/services/confirm.service';
import { StatusEntity } from 'src/app/core/models/common.models';

type EntityStatus = 'ACTIVE' | 'INACTIVE';

@Component({
  selector: 'app-status-toggle',
  standalone: true,
  imports: [FormsModule, ToggleSwitchModule],
  template: `
    <div class="flex align-items-center gap-2">
      <p-toggleswitch
        [ngModel]="item.status === 'ACTIVE'"
        (onChange)="onToggle()"
        [disabled]="loading()"
        styleClass="status-toggle-switch"
      />
      <span
        class="status-pill"
        [class.status-pill-active]="item.status === 'ACTIVE'"
        [class.status-pill-inactive]="item.status !== 'ACTIVE'"
      >
        {{ statusLabel(item.status) }}
      </span>
    </div>
  `,
  styles: `
    :host ::ng-deep .status-toggle-switch {
      transform: scale(0.8);
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class StatusToggleComponent {
  private readonly http = inject(HttpClient);
  private readonly alertService = inject(AlertService);
  private readonly confirmService = inject(ConfirmService);
  private readonly language = inject(LanguageService);

  @Input({ required: true }) item!: StatusEntity;
  @Input({ required: true }) endpoint!: string;
  @Input({ required: true }) nameEntity!: string;

  @Output() statusChanged = new EventEmitter<EntityStatus>();

  readonly loading = signal(false);

  /** Shared with every catalog grid, so it reads the common status keys. */
  statusLabel(status: string): string {
    return this.language.t(status === 'ACTIVE' ? 'COMMON.STATUS.ACTIVE' : 'COMMON.STATUS.INACTIVE');
  }

  async onToggle(): Promise<void> {
    const previousStatus = this.item.status as EntityStatus;
    const newStatus: EntityStatus = previousStatus === 'ACTIVE' ? 'INACTIVE' : 'ACTIVE';

    const confirmed = await this.confirmService.confirm({
      title: this.language.t('COMMON.STATUS_TOGGLE.CONFIRM_TITLE'),
      message: this.language.t('COMMON.STATUS_TOGGLE.CONFIRM_MESSAGE', {
        name: this.nameEntity,
        status: this.statusLabel(newStatus),
      }),
      acceptLabel: this.language.t('COMMON.STATUS_TOGGLE.ACCEPT'),
      severity: newStatus === 'ACTIVE' ? 'primary' : 'danger',
      icon: 'pi pi-question-circle',
    });

    if (!confirmed) {
      // Force the switch back to its previous visual state
      this.item = { ...this.item, status: previousStatus };
      return;
    }

    this.loading.set(true);
    this.http.patch(`/api/v1/${this.endpoint}/${this.item.id}/status`, { status: newStatus }).subscribe({
      next: () => {
        this.loading.set(false);
        this.item = { ...this.item, status: newStatus };
        this.statusChanged.emit(newStatus);
        this.alertService.success(this.language.t('COMMON.STATUS_TOGGLE.SUCCESS'));
      },
      error: (err) => {
        this.loading.set(false);
        this.item = { ...this.item, status: previousStatus };
        this.alertService.error(err?.message || this.language.t('COMMON.STATUS_TOGGLE.FAILED'));
      },
    });
  }
}
