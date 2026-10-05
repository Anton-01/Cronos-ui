import { SymbolPosition } from 'src/app/core/models/finance.models';

export interface MoneyFormat {
  symbol: string;
  decimalPlaces: number;
  symbolPosition: SymbolPosition;
}

/**
 * Formats an amount with a catalog currency's own symbol, minor units and
 * symbol position, grouped per the active UI locale. Used where `Intl`'s
 * currency style would ignore the tenant's configured symbol/decimals.
 */
export function formatMoney(amount: number, format: MoneyFormat, locale: string): string {
  const digits = Math.min(4, Math.max(0, format.decimalPlaces));
  const number = new Intl.NumberFormat(locale, { minimumFractionDigits: digits, maximumFractionDigits: digits }).format(amount);
  return format.symbolPosition === 'AFTER' ? `${number} ${format.symbol}` : `${format.symbol}${number}`;
}
