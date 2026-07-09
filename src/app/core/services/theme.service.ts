import { Injectable, signal } from '@angular/core';

const THEME_STORAGE_KEY = 'cronos_theme_mode';

export type ThemeMode = 'light' | 'dark';

@Injectable({ providedIn: 'root' })
export class ThemeService {
  readonly mode = signal<ThemeMode>('light');

  init(): void {
    const stored = localStorage.getItem(THEME_STORAGE_KEY) as ThemeMode | null;
    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    this.apply(stored ?? (prefersDark ? 'dark' : 'light'));
  }

  toggle(): void {
    this.apply(this.mode() === 'dark' ? 'light' : 'dark');
  }

  private apply(mode: ThemeMode): void {
    this.mode.set(mode);
    localStorage.setItem(THEME_STORAGE_KEY, mode);
    document.documentElement.classList.toggle('app-dark', mode === 'dark');
  }
}
