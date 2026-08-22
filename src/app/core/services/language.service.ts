import { Injectable, computed, signal } from '@angular/core';
import { AppLanguage, LanguageOption } from '../models/language.model';

const LANGUAGE_STORAGE_KEY = 'cronos_language';

/**
 * Spanish is the product's primary market (Mexico), so it is what a first-time
 * visitor gets. The browser's own `navigator.language` is deliberately not
 * consulted: the preference is an explicit user choice, persisted on first
 * switch, not something inferred from the machine.
 */
const DEFAULT_LANGUAGE: AppLanguage = 'es-MX';

/**
 * The full catalog, in display order. Order here is the order in the topbar
 * switcher — there is no second list to keep in sync.
 */
export const LANGUAGE_OPTIONS: LanguageOption[] = [
  { code: 'en', shortLabel: 'EN', label: 'English', flag: '🇺🇸' },
  { code: 'es-MX', shortLabel: 'ES', label: 'Español (México)', flag: '🇲🇽' },
];

function isAppLanguage(value: string | null): value is AppLanguage {
  return LANGUAGE_OPTIONS.some((option) => option.code === value);
}

/**
 * The single source of truth for the active UI locale.
 *
 * Mirrors `ThemeService`: a signal for readers, `localStorage` for
 * persistence, one DOM side effect, and an `init()` the shell calls on
 * bootstrap. `LanguageInterceptor` reads `acceptLanguage()` on every outgoing
 * API call, so switching here immediately changes the locale the backend
 * validates and formats against — no reload, no re-login.
 */
@Injectable({ providedIn: 'root' })
export class LanguageService {
  /** Active locale. Read this from components; write only through `use()`. */
  readonly current = signal<AppLanguage>(DEFAULT_LANGUAGE);

  /** The active locale's display metadata (flag, labels). */
  readonly currentOption = computed<LanguageOption>(
    () => LANGUAGE_OPTIONS.find((option) => option.code === this.current()) ?? LANGUAGE_OPTIONS[0],
  );

  /**
   * Exactly what goes on the wire. The backend negotiates on these two tags,
   * so the header carries the tag alone rather than a weighted list.
   */
  readonly acceptLanguage = computed<string>(() => this.current());

  readonly options: readonly LanguageOption[] = LANGUAGE_OPTIONS;

  /** Called once from the app shell, alongside `ThemeService.init()`. */
  init(): void {
    const stored = localStorage.getItem(LANGUAGE_STORAGE_KEY);
    this.apply(isAppLanguage(stored) ? stored : DEFAULT_LANGUAGE);
  }

  /** Switch locale and persist the choice. No-op when already active. */
  use(language: AppLanguage): void {
    if (language === this.current()) {
      return;
    }
    this.apply(language);
  }

  private apply(language: AppLanguage): void {
    this.current.set(language);
    localStorage.setItem(LANGUAGE_STORAGE_KEY, language);
    // Keeps `<html lang>` honest for screen readers, browser translation
    // prompts and CSS `:lang()` — the same contract `ThemeService` has with
    // the `.app-dark` class.
    document.documentElement.lang = language;
  }
}
