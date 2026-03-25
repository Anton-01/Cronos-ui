import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { AlertService } from '../../services/alert.service';

@Component({
  selector: 'app-global-alert-container',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="position-fixed top-0 end-0 p-5" style="z-index: 9999; max-width: 450px;">
      @for (alert of alertService.alerts(); track alert.id) {
        <div class="alert d-flex align-items-center p-5 mb-3 shadow-sm"
          [class.bg-light-success]="alert.type === 'success'"
          [class.text-success]="alert.type === 'success'"
          [class.bg-light-danger]="alert.type === 'danger'"
          [class.text-danger]="alert.type === 'danger'"
          [class.bg-light-warning]="alert.type === 'warning'"
          [class.text-warning]="alert.type === 'warning'"
          [class.bg-light-info]="alert.type === 'info'"
          [class.text-info]="alert.type === 'info'"
          style="border: none !important;">
          <i class="ki-duotone fs-2hx me-4"
            [class]="alert.icon"
            [class.text-success]="alert.type === 'success'"
            [class.text-danger]="alert.type === 'danger'"
            [class.text-warning]="alert.type === 'warning'"
            [class.text-info]="alert.type === 'info'">
            <span class="path1"></span><span class="path2"></span><span class="path3"></span>
          </i>
          <div class="d-flex flex-column">
            <span class="fw-bold">{{ alert.title }}</span>
            @if (alert.message) {
              <span>{{ alert.message }}</span>
            }
          </div>
          <button type="button" class="btn-close ms-auto" (click)="alertService.remove(alert.id)"></button>
        </div>
      }
    </div>
  `,
})
export class GlobalAlertContainerComponent {
  alertService = inject(AlertService);
}
