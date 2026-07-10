import { Injectable, inject } from '@angular/core';
import { MessageService } from 'primeng/api';

type AlertType = 'success' | 'danger' | 'warning' | 'info';

const SEVERITY_MAP: Record<AlertType, 'success' | 'error' | 'warn' | 'info'> = {
  success: 'success',
  danger: 'error',
  warning: 'warn',
  info: 'info',
};

/**
 * Facade over PrimeNG MessageService. Messages render in the global
 * <p-toast> declared in the app root.
 */
@Injectable({ providedIn: 'root' })
export class AlertService {
  private readonly messageService = inject(MessageService);

  private show(type: AlertType, title: string, message = '', duration = 5000): void {
    this.messageService.add({
      severity: SEVERITY_MAP[type],
      summary: title,
      detail: message,
      life: duration,
    });
  }

  success(message: string, title = 'Éxito'): void {
    this.show('success', title, message);
  }

  error(message: string, title = 'Error'): void {
    this.show('danger', title, message);
  }

  warning(message: string, title = 'Advertencia'): void {
    this.show('warning', title, message);
  }

  info(message: string, title = 'Información'): void {
    this.show('info', title, message);
  }
}
