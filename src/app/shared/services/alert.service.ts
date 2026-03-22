import { Injectable, signal } from '@angular/core';

export interface AppAlert {
  id: string;
  type: 'success' | 'danger' | 'warning' | 'info';
  title: string;
  message: string;
  icon: string;
}

const ICON_MAP: Record<string, string> = {
  success: 'ki-check-circle',
  danger: 'ki-information-5',
  warning: 'ki-information-2',
  info: 'ki-notification-bing',
};

@Injectable({ providedIn: 'root' })
export class AlertService {
  private _alerts = signal<AppAlert[]>([]);
  readonly alerts = this._alerts.asReadonly();

  private show(type: AppAlert['type'], title: string, message = '', duration = 5000): void {
    const id = `${Date.now()}-${Math.random()}`;
    const icon = ICON_MAP[type];
    this._alerts.update(list => [...list, { id, type, title, message, icon }]);
    setTimeout(() => this.remove(id), duration);
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

  remove(id: string): void {
    this._alerts.update(list => list.filter(a => a.id !== id));
  }
}
