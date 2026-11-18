/** Kwota w walucie obcej × kurs → grosze PLN (zaokrąglone do grosza). */
export function toPLNGrosze(amount: number, rate: number): number {
  return Math.round(amount * rate * 100);
}

const foreign = new Intl.NumberFormat('pl-PL', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** Kwota w walucie obcej → „12,00 EUR” (zwykła spacja przed kodem). */
export function formatForeign(amount: number, currency: string): string {
  // Intl w pl-PL wstawia twarde spacje w tysiącach — normalizujemy do zwykłej.
  return `${foreign.format(amount).replace(/[  ]/g, ' ')} ${currency}`;
}
