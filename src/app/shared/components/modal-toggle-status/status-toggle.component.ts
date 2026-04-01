import { Component, Input, Output, EventEmitter, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { AlertService } from 'src/app/shared/services/alert.service';
import Swal from 'sweetalert2';
import {StatusEntity} from "../../../core/models/common.models";

@Component({
  selector: 'app-status-toggle',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="d-flex flex-column">
      <div class="form-check form-switch form-check-custom form-check-solid">
        <input
          class="form-check-input h-20px w-30px cursor-pointer"
          type="checkbox"
          [checked]="item.status === 'ACTIVE'"
          (change)="confirmChange($event)"
          [disabled]="loading" />
      </div>
      <span class="fs-8 fw-bold mt-1" [ngClass]="{
        'text-success': item.status === 'ACTIVE',
        'text-danger': item.status === 'INACTIVE'
      }">
        {{ item.status === 'ACTIVE' ? 'Activo' : 'Inactivo' }}
      </span>
    </div>
  `
})
export class StatusToggleComponent {
  private http = inject(HttpClient);
  private alertService = inject(AlertService);

  @Input({ required: true }) item!: StatusEntity;
  @Input({ required: true }) endpoint!: string;
  @Input({ required: true }) nameEntity!: string;

  @Output() statusChanged = new EventEmitter<'ACTIVE' | 'INACTIVE'>();

  loading = false;

  confirmChange(event: Event) {
    const inputElement = event.target as HTMLInputElement;
    const previousStatus = this.item.status as 'ACTIVE' | 'INACTIVE';
    const newStatus = previousStatus === 'ACTIVE' ? 'INACTIVE' : 'ACTIVE';

    Swal.fire({
      title: '¿Actualizar estatus?',
      html: `<strong>${this.nameEntity}</strong> pasará a estar ${newStatus === 'ACTIVE' ? 'Activa' : 'Inactiva'}`,
      icon: 'question',
      showCancelButton: true,
      confirmButtonText: 'Sí, cambiar',
      cancelButtonText: 'Cancelar',
      confirmButtonColor: newStatus === 'ACTIVE' ? '#50cd89' : '#f1416c',
    }).then((result) => {
      if (result.isConfirmed) {
        this.executeRequest(newStatus);
      } else {
        inputElement.checked = previousStatus === 'ACTIVE';
        this.item = { ...this.item, status: previousStatus };
      }
    });
  }

  private executeRequest(newStatus: 'ACTIVE' | 'INACTIVE') {
    this.loading = true;

    const url = `/api/v1/${this.endpoint}/${this.item.id}/status`;

    this.http.patch(url, { status: newStatus }).subscribe({
      next: () => {
        this.loading = false;
        this.statusChanged.emit(newStatus);
        this.alertService.success('Estatus actualizado');
      },
      error: (err) => {
        this.loading = false;
        this.alertService.error(err?.message || 'Error al actualizar');
      }
    });
  }
}
