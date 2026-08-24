import { Injectable, inject } from '@angular/core';
import { MessageService } from 'primeng/api';
import { LanguageService } from 'src/app/core/services/language.service';

type AlertType = 'success' | 'danger' | 'warning' | 'info';

const SEVERITY_MAP: Record<AlertType, 'success' | 'error' | 'warn' | 'info'> = {
  success: 'success',
  danger: 'error',
  warning: 'warn',
  info: 'info',
};

/** Translation keys for the default toast summaries, one per severity. */
const DEFAULT_TITLE_KEYS: Record<AlertType, string> = {
  success: 'COMMON.TOAST.SUCCESS',
  danger: 'COMMON.TOAST.ERROR',
  warning: 'COMMON.TOAST.WARNING',
  info: 'COMMON.TOAST.INFO',
};

/**
 * Facade over PrimeNG MessageService. Messages render in the global
 * <p-toast> declared in the app root.
 *
 * Callers pass the detail text and normally let the summary default, so the
 * default is resolved through `LanguageService` rather than being a Spanish
 * literal — otherwise an English UI would show "Éxito" over an English body.
 */
@Injectable({ providedIn: 'root' })
export class AlertService {
  private readonly messageService = inject(MessageService);
  private readonly language = inject(LanguageService);

  private show(type: AlertType, title: string, message = '', duration = 5000): void {
    this.messageService.add({
      severity: SEVERITY_MAP[type],
      summary: title,
      detail: message,
      life: duration,
    });
  }

  success(message: string, title?: string): void {
    this.show('success', title ?? this.defaultTitle('success'), message);
  }

  error(message: string, title?: string): void {
    this.show('danger', title ?? this.defaultTitle('danger'), message);
  }

  warning(message: string, title?: string): void {
    this.show('warning', title ?? this.defaultTitle('warning'), message);
  }

  info(message: string, title?: string): void {
    this.show('info', title ?? this.defaultTitle('info'), message);
  }

  private defaultTitle(type: AlertType): string {
    return this.language.t(DEFAULT_TITLE_KEYS[type]);
  }
}
