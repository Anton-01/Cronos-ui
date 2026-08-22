/**
 * UI locales Cronos ships.
 *
 * These tags are sent verbatim as `Accept-Language` on every API call, so the
 * union must stay in lockstep with the locales the backend resolves its
 * validation bundles from. Adding one here without a matching backend bundle
 * silently degrades to the server's default locale.
 */
export type AppLanguage = 'en' | 'es-MX';

/** Everything the topbar switcher needs to render one locale. */
export interface LanguageOption {
  /** BCP 47 tag, also the `Accept-Language` value and the `<html lang>` value. */
  code: AppLanguage;
  /** Short display code shown next to the flag ("EN", "ES"). */
  shortLabel: string;
  /** Full name for the menu row. */
  label: string;
  /** Regional-indicator emoji — no image asset, no icon font, no request. */
  flag: string;
}
