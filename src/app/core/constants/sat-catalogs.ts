import { MexicanStateCode, TaxRegimeCode, TaxpayerType } from '../models';

/**
 * SAT reference catalogs used by the Fiscal Data form (CFDI 4.0).
 *
 * Codes are data the API validates against; display names come from the
 * i18n bundles (`ACCOUNT.FISCAL.REGIMES.<code>`) so the selector re-labels
 * itself on a language switch (§16.5).
 */

export interface TaxRegimeOption {
  code: TaxRegimeCode;
  /** Taxpayer types SAT allows this regime for (`c_RegimenFiscal` Física/Moral columns). */
  appliesTo: readonly TaxpayerType[];
}

const INDIVIDUAL: readonly TaxpayerType[] = ['INDIVIDUAL'];
const LEGAL_ENTITY: readonly TaxpayerType[] = ['LEGAL_ENTITY'];
const BOTH: readonly TaxpayerType[] = ['INDIVIDUAL', 'LEGAL_ENTITY'];

export const TAX_REGIMES: readonly TaxRegimeOption[] = [
  { code: '601', appliesTo: LEGAL_ENTITY },
  { code: '603', appliesTo: LEGAL_ENTITY },
  { code: '605', appliesTo: INDIVIDUAL },
  { code: '606', appliesTo: INDIVIDUAL },
  { code: '607', appliesTo: INDIVIDUAL },
  { code: '608', appliesTo: INDIVIDUAL },
  { code: '610', appliesTo: BOTH },
  { code: '611', appliesTo: INDIVIDUAL },
  { code: '612', appliesTo: INDIVIDUAL },
  { code: '614', appliesTo: INDIVIDUAL },
  { code: '615', appliesTo: INDIVIDUAL },
  { code: '616', appliesTo: INDIVIDUAL },
  { code: '620', appliesTo: LEGAL_ENTITY },
  { code: '621', appliesTo: INDIVIDUAL },
  { code: '622', appliesTo: LEGAL_ENTITY },
  { code: '623', appliesTo: LEGAL_ENTITY },
  { code: '624', appliesTo: LEGAL_ENTITY },
  { code: '625', appliesTo: INDIVIDUAL },
  { code: '626', appliesTo: BOTH },
];

export function findTaxRegime(code: string | null | undefined): TaxRegimeOption | undefined {
  return TAX_REGIMES.find((regime) => regime.code === code);
}

export interface MexicanStateOption {
  code: MexicanStateCode;
  /** Official name — a proper noun, identical in every UI language. */
  name: string;
}

export const MEXICAN_STATES: readonly MexicanStateOption[] = [
  { code: 'AGU', name: 'Aguascalientes' },
  { code: 'BCN', name: 'Baja California' },
  { code: 'BCS', name: 'Baja California Sur' },
  { code: 'CAM', name: 'Campeche' },
  { code: 'CHP', name: 'Chiapas' },
  { code: 'CHH', name: 'Chihuahua' },
  { code: 'CMX', name: 'Ciudad de México' },
  { code: 'COA', name: 'Coahuila' },
  { code: 'COL', name: 'Colima' },
  { code: 'DUR', name: 'Durango' },
  { code: 'GUA', name: 'Guanajuato' },
  { code: 'GRO', name: 'Guerrero' },
  { code: 'HID', name: 'Hidalgo' },
  { code: 'JAL', name: 'Jalisco' },
  { code: 'MEX', name: 'Estado de México' },
  { code: 'MIC', name: 'Michoacán' },
  { code: 'MOR', name: 'Morelos' },
  { code: 'NAY', name: 'Nayarit' },
  { code: 'NLE', name: 'Nuevo León' },
  { code: 'OAX', name: 'Oaxaca' },
  { code: 'PUE', name: 'Puebla' },
  { code: 'QUE', name: 'Querétaro' },
  { code: 'ROO', name: 'Quintana Roo' },
  { code: 'SLP', name: 'San Luis Potosí' },
  { code: 'SIN', name: 'Sinaloa' },
  { code: 'SON', name: 'Sonora' },
  { code: 'TAB', name: 'Tabasco' },
  { code: 'TAM', name: 'Tamaulipas' },
  { code: 'TLA', name: 'Tlaxcala' },
  { code: 'VER', name: 'Veracruz' },
  { code: 'YUC', name: 'Yucatán' },
  { code: 'ZAC', name: 'Zacatecas' },
];
