/**
 * Account Settings contracts — self-service endpoints under `/users/me`.
 * Shapes mirror `docs/api/account-settings.md`; change both together.
 */

// ─── Async section state ───

/** Lifecycle of one independently-loaded section of the settings page. */
export type SectionStatus = 'idle' | 'loading' | 'ready' | 'error';

/**
 * State held per settings section. Each tab owns one of these, so a save in
 * one section never flips a spinner or re-renders another.
 */
export interface SectionState<T> {
  readonly data: T | null;
  readonly status: SectionStatus;
  readonly saving: boolean;
}

export function initialSectionState<T>(): SectionState<T> {
  return { data: null, status: 'idle', saving: false };
}

// ─── Tabs ───

export const ACCOUNT_SETTINGS_TABS = ['profile', 'security', 'fiscal'] as const;
export type AccountSettingsTab = (typeof ACCOUNT_SETTINGS_TABS)[number];

export function isAccountSettingsTab(value: unknown): value is AccountSettingsTab {
  return typeof value === 'string' && (ACCOUNT_SETTINGS_TABS as readonly string[]).includes(value);
}

// ─── Avatar ───

export interface AvatarResponse {
  /** Absolute or API-relative URL of the stored image, cache-busted by the server. */
  avatarUrl: string;
  updatedAt: string;
}

/** What the cropper dialog hands back: a server-ready file plus a local preview. */
export interface CroppedAvatar {
  file: File;
  /** `blob:` URL for immediate preview; the owner must revoke it. */
  previewUrl: string;
  width: number;
  height: number;
}

// ─── Fiscal data (Mexico SAT / CFDI 4.0) ───

/** Persona física (13-char RFC) or persona moral (12-char RFC). */
export type TaxpayerType = 'INDIVIDUAL' | 'LEGAL_ENTITY';

/** SAT catalog `c_RegimenFiscal` keys accepted for an issuer/receiver. */
export type TaxRegimeCode =
  | '601' | '603' | '605' | '606' | '607' | '608' | '610' | '611' | '612' | '614'
  | '615' | '616' | '620' | '621' | '622' | '623' | '624' | '625' | '626';

/** ISO 3166-2:MX subdivision codes (without the `MX-` prefix). */
export type MexicanStateCode =
  | 'AGU' | 'BCN' | 'BCS' | 'CAM' | 'CHP' | 'CHH' | 'CMX' | 'COA' | 'COL' | 'DUR'
  | 'GUA' | 'GRO' | 'HID' | 'JAL' | 'MEX' | 'MIC' | 'MOR' | 'NAY' | 'NLE' | 'OAX'
  | 'PUE' | 'QUE' | 'ROO' | 'SLP' | 'SIN' | 'SON' | 'TAB' | 'TAM' | 'TLA' | 'VER'
  | 'YUC' | 'ZAC';

export interface FiscalAddress {
  street: string;
  exteriorNumber: string;
  interiorNumber: string | null;
  neighborhood: string;
  municipality: string;
  state: MexicanStateCode;
  /** SAT `DomicilioFiscalReceptor` — 5 digits. */
  zipCode: string;
  /** ISO 3166-1 alpha-3. Fixed to MEX while only CFDI is supported. */
  country: 'MEX';
}

export interface UpdateFiscalDataRequest {
  /** Exactly as registered with SAT, uppercase, without the corporate regime suffix. */
  legalName: string;
  /** RFC, uppercase. */
  taxId: string;
  taxRegime: TaxRegimeCode;
  address: FiscalAddress;
}

export interface FiscalDataResponse extends UpdateFiscalDataRequest {
  /** Derived server-side from the RFC length; never sent by the client. */
  taxpayerType: TaxpayerType;
  updatedAt: string;
}
