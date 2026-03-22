import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ToastService } from '../../services/toast.service';

@Component({
  selector: 'app-toast-container',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="position-fixed top-0 end-0 p-3" style="z-index: 9999;">
      @for (toast of toastService.toasts(); track toast.id) {
        <div class="toast show mb-2" role="alert"
          [class.bg-light-success]="toast.type === 'success'"
          [class.bg-light-danger]="toast.type === 'error'">
          <div class="toast-header">
            <i class="ki-duotone fs-3 me-2"
              [class.ki-check-circle]="toast.type === 'success'"
              [class.ki-cross-circle]="toast.type === 'error'"
              [class.text-success]="toast.type === 'success'"
              [class.text-danger]="toast.type === 'error'"></i>
            <strong class="me-auto">{{ toast.title }}</strong>
            <button type="button" class="btn-close" (click)="toastService.remove(toast.id)"></button>
          </div>
          @if (toast.message) {
            <div class="toast-body">{{ toast.message }}</div>
          }
        </div>
      }
    </div>
  `,
})
export class ToastContainerComponent {
  toastService = inject(ToastService);
}
