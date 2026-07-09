import { Injectable, inject } from '@angular/core';
import { ConfirmationService } from 'primeng/api';

export interface ConfirmOptions {
  title: string;
  message: string;
  acceptLabel?: string;
  rejectLabel?: string;
  severity?: 'danger' | 'primary';
  icon?: string;
}

/**
 * Promise-based facade over PrimeNG ConfirmationService (replaces sweetalert2).
 * Dialogs render in the global <p-confirmdialog> declared in the app root.
 */
@Injectable({ providedIn: 'root' })
export class ConfirmService {
  private readonly confirmationService = inject(ConfirmationService);

  confirm(options: ConfirmOptions): Promise<boolean> {
    return new Promise((resolve) => {
      this.confirmationService.confirm({
        header: options.title,
        message: options.message,
        icon: options.icon ?? 'pi pi-exclamation-triangle',
        acceptButtonProps: {
          label: options.acceptLabel ?? 'Sí, continuar',
          severity: options.severity ?? 'primary',
        },
        rejectButtonProps: {
          label: options.rejectLabel ?? 'Cancelar',
          severity: 'secondary',
          outlined: true,
        },
        accept: () => resolve(true),
        reject: () => resolve(false),
      });
    });
  }

  confirmDelete(entityName: string, message?: string): Promise<boolean> {
    return this.confirm({
      title: '¿Eliminar registro?',
      message: message ?? `Se eliminará "${entityName}". Esta acción no se puede deshacer.`,
      acceptLabel: 'Sí, eliminar',
      severity: 'danger',
      icon: 'pi pi-trash',
    });
  }
}
