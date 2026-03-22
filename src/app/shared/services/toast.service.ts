import { Injectable, signal } from '@angular/core';

export interface Toast {
  id: string;
  type: 'success' | 'error';
  title: string;
  message: string;
}

@Injectable({ providedIn: 'root' })
export class ToastService {
  private _toasts = signal<Toast[]>([]);
  readonly toasts = this._toasts.asReadonly();

  show(type: 'success' | 'error', title: string, message = '', duration = 4500): void {
    const id = `${Date.now()}-${Math.random()}`;
    this._toasts.update(list => [...list, { id, type, title, message }]);
    setTimeout(() => this.remove(id), duration);
  }

  success(title: string, message = ''): void {
    this.show('success', title, message);
  }

  error(title: string, message = ''): void {
    this.show('error', title, message);
  }

  remove(id: string): void {
    this._toasts.update(list => list.filter(t => t.id !== id));
  }
}
