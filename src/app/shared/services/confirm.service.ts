import { Injectable, inject } from '@angular/core';
import { ConfirmationService } from 'primeng/api';
import { LanguageService } from 'src/app/core/services/language.service';

export interface ConfirmOptions {
  title: string;
  message: string;
  acceptLabel?: string;
  rejectLabel?: string;
  severity?: 'danger' | 'primary';
  icon?: string;
}

/**
 * Promise-based facade over PrimeNG ConfirmationService.
 * Dialogs render in the global <p-confirmdialog> declared in the app root.
 */
@Injectable({ providedIn: 'root' })
export class ConfirmService {
  private readonly confirmationService = inject(ConfirmationService);
  private readonly language = inject(LanguageService);

  confirm(options: ConfirmOptions): Promise<boolean> {
    return new Promise((resolve) => {
      this.confirmationService.confirm({
        header: options.title,
        message: options.message,
        icon: options.icon ?? 'pi pi-exclamation-triangle',
        acceptButtonProps: {
          label: options.acceptLabel ?? this.language.t('COMMON.CONFIRM.ACCEPT'),
          severity: options.severity ?? 'primary',
        },
        rejectButtonProps: {
          label: options.rejectLabel ?? this.language.t('COMMON.CANCEL'),
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
      title: this.language.t('COMMON.CONFIRM.DELETE_TITLE'),
      message: message ?? this.language.t('COMMON.CONFIRM.DELETE_MESSAGE', { name: entityName }),
      acceptLabel: this.language.t('COMMON.CONFIRM.ACCEPT_DELETE'),
      severity: 'danger',
      icon: 'pi pi-trash',
    });
  }
}
