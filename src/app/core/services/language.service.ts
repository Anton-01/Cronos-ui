import { Injectable, computed, inject, signal } from '@angular/core';
import { Title } from '@angular/platform-browser';
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
  {
    code: 'en',
    shortLabel: 'EN',
    label: 'English',
    flag: '🇺🇸',
    documentTitle: 'Cronos — Specialty Bakery Management System',
  },
  {
    code: 'es-MX',
    shortLabel: 'ES',
    label: 'Español (México)',
    flag: '🇲🇽',
    documentTitle: 'Cronos — Sistema de Gestión para Repostería Especializada',
  },
];

function isAppLanguage(value: string | null): value is AppLanguage {
  return LANGUAGE_OPTIONS.some((option) => option.code === value);
}

/**
 * The persisted locale, or the default when nothing valid is stored.
 *
 * Deliberately a free function, not a service method: the `LOCALE_ID` factory
 * in `app.module.ts` runs before any injector exists, and both it and
 * `LanguageService.init()` must resolve the same locale from the same key —
 * otherwise Angular's pipes would format in one locale while the UI and the
 * `Accept-Language` header claimed another.
 */
export function resolveStoredLanguage(): AppLanguage {
  const stored = localStorage.getItem(LANGUAGE_STORAGE_KEY);
  return isAppLanguage(stored) ? stored : DEFAULT_LANGUAGE;
}

/**
 * The single source of truth for the active UI locale.
 *
 * Mirrors `ThemeService`: a signal for readers, `localStorage` for
 * persistence, and an `init()` the shell calls on bootstrap.
 * `LanguageInterceptor` reads `acceptLanguage()` on every outgoing API call,
 * so switching here immediately changes the locale the backend validates and
 * formats against — no reload, no re-login.
 *
 * Two document-level side effects travel with the locale, both for a11y and
 * SEO rather than for looks: `<html lang>` (screen-reader pronunciation,
 * browser translation prompts, CSS `:lang()`) and `<title>` (the tab, the
 * history entry, the crawler snippet).
 *
 * Angular's `LOCALE_ID` is *not* one of them — it is a static injection token
 * fixed at bootstrap, so `date`/`number`/`currency` pipes keep the locale
 * resolved at page load until the next reload. See `app.module.ts`.
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

  private readonly title = inject(Title);

  /** Called once from the app shell, alongside `ThemeService.init()`. */
  init(): void {
    this.apply(resolveStoredLanguage());
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
    // Same contract `ThemeService` has with the `.app-dark` class: the service
    // owns its document-level attributes, nothing else writes them.
    document.documentElement.lang = language;
    this.title.setTitle(this.currentOption().documentTitle);
  }
}
