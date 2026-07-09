import { ChangeDetectionStrategy, Component, EventEmitter, Input, Output, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { FormsModule } from '@angular/forms';
import { ToggleSwitchModule } from 'primeng/toggleswitch';

import { AlertService } from 'src/app/shared/services/alert.service';
import { ConfirmService } from 'src/app/shared/services/confirm.service';
import { StatusEntity } from 'src/app/core/models/common.models';

type EntityStatus = 'ACTIVE' | 'INACTIVE';

@Component({
  selector: 'app-status-toggle',
  standalone: true,
  imports: [FormsModule, ToggleSwitchModule],
  template: `
    <div class="flex flex-column align-items-start gap-1">
      <p-toggleswitch
        [ngModel]="item.status === 'ACTIVE'"
        (onChange)="onToggle()"
        [disabled]="loading()"
      />
      <span
        class="text-xs font-bold"
        [style.color]="item.status === 'ACTIVE' ? 'var(--p-green-500)' : 'var(--p-red-500)'"
      >
        {{ item.status === 'ACTIVE' ? 'Activo' : 'Inactivo' }}
      </span>
    </div>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class StatusToggleComponent {
  private readonly http = inject(HttpClient);
  private readonly alertService = inject(AlertService);
  private readonly confirmService = inject(ConfirmService);

  @Input({ required: true }) item!: StatusEntity;
  @Input({ required: true }) endpoint!: string;
  @Input({ required: true }) nameEntity!: string;

  @Output() statusChanged = new EventEmitter<EntityStatus>();

  readonly loading = signal(false);

  async onToggle(): Promise<void> {
    const previousStatus = this.item.status as EntityStatus;
    const newStatus: EntityStatus = previousStatus === 'ACTIVE' ? 'INACTIVE' : 'ACTIVE';

    const confirmed = await this.confirmService.confirm({
      title: '¿Actualizar estatus?',
      message: `"${this.nameEntity}" pasará a estar ${newStatus === 'ACTIVE' ? 'Activo' : 'Inactivo'}.`,
      acceptLabel: 'Sí, cambiar',
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
        this.alertService.success('Estatus actualizado');
      },
      error: (err) => {
        this.loading.set(false);
        this.item = { ...this.item, status: previousStatus };
        this.alertService.error(err?.message || 'Error al actualizar');
      },
    });
  }
}
