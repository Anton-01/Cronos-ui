import { Injectable, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Title } from '@angular/platform-browser';
import { TranslateService } from '@ngx-translate/core';
import { AppLanguage, LanguageOption } from '../models/language.model';

const LANGUAGE_STORAGE_KEY = 'cronos_language';

/**
 * Spanish is the product's primary market (Mexico), so it is what a first-time
 * visitor gets. The browser's own `navigator.language` is deliberately not
 * consulted: the preference is an explicit user choice, persisted on first
 * switch, not something inferred from the machine.
 */
export const DEFAULT_LANGUAGE: AppLanguage = 'es-MX';

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
 * and the `provideTranslateService({ lang })` call in `app.module.ts` both run
 * before any injector exists, and all three of them — plus
 * `LanguageService.init()` — must resolve the same locale from the same key.
 * Otherwise Angular's pipes would format in one locale while the UI bundle,
 * the `<html lang>` and the `Accept-Language` header claimed another.
 */
export function resolveStoredLanguage(): AppLanguage {
  const stored = localStorage.getItem(LANGUAGE_STORAGE_KEY);
  return isAppLanguage(stored) ? stored : DEFAULT_LANGUAGE;
}

/** Interpolation values accepted by a translation key (`{{ count }}`, `{{ name }}`). */
export type TranslationParams = Record<string, string | number>;

/**
 * The single source of truth for the active UI locale.
 *
 * Mirrors `ThemeService`: a signal for readers, `localStorage` for
 * persistence, and an `init()` the shell calls on bootstrap.
 * `LanguageInterceptor` reads `acceptLanguage()` on every outgoing API call,
 * so switching here immediately changes the locale the backend validates and
 * formats against — no reload, no re-login.
 *
 * Per Context.md §16.5 `@ngx-translate` is driven *from* this service rather
 * than holding a second copy of the state: `use()` is the only writer, and it
 * moves the header, the bundle, `<html lang>` and the `<title>` together.
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
  private readonly translate = inject(TranslateService);

  /**
   * Bumped once per *loaded* bundle, not once per `use()` call.
   *
   * `current` flips synchronously while the new bundle is still in flight, so
   * a `computed` that keyed off it would call `t()` too early and cache the
   * raw key forever. `onLangChange` fires only after the JSON has landed,
   * which makes this the correct dependency for translated `computed`s — and
   * `t()` reads it for them, so callers never touch it directly.
   */
  private readonly revision = signal(0);

  constructor() {
    this.translate.onLangChange
      .pipe(takeUntilDestroyed())
      .subscribe(() => this.revision.update((value) => value + 1));
  }

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

  /**
   * Translate a key to a string, reactively.
   *
   * `TranslateService.instant()` is typed to return `any`, which Context.md §
   * "Strict Typing" forbids from spreading into call sites — this is the one
   * place that `unknown`-narrows it, so every consumer gets a real `string`.
   * A missing key falls back to the key itself, which is both a visible
   * defect in the UI and a stable, non-empty label.
   *
   * Reading `revision` here is what makes the whole app re-translate on a
   * switch: any `computed` that calls `t()` inherits the dependency without
   * having to know it exists.
   */
  t(key: string, params?: TranslationParams): string {
    this.revision();
    const value: unknown = this.translate.instant(key, params);
    return typeof value === 'string' ? value : key;
  }

  private apply(language: AppLanguage): void {
    this.current.set(language);
    localStorage.setItem(LANGUAGE_STORAGE_KEY, language);
    // Same contract `ThemeService` has with the `.app-dark` class: the service
    // owns its document-level attributes, nothing else writes them.
    document.documentElement.lang = language;
    this.title.setTitle(this.currentOption().documentTitle);
    // `use()` subscribes to its own loader internally, so the returned
    // observable is deliberately dropped — `onLangChange` is what tells the UI
    // the bundle actually landed.
    this.translate.use(language);
  }
}
