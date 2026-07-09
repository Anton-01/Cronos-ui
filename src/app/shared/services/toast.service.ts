import { Injectable, inject } from '@angular/core';
import { MessageService } from 'primeng/api';

/**
 * Facade over PrimeNG MessageService. Messages render in the global
 * <p-toast> declared in the app root.
 */
@Injectable({ providedIn: 'root' })
export class ToastService {
  private readonly messageService = inject(MessageService);

  show(type: 'success' | 'error', title: string, message = '', duration = 4500): void {
    this.messageService.add({
      severity: type,
      summary: title,
      detail: message,
      life: duration,
    });
  }

  success(title: string, message = ''): void {
    this.show('success', title, message);
  }

  error(title: string, message = ''): void {
    this.show('error', title, message);
  }
}
