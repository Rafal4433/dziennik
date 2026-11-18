import type { DayKey } from './model';
import { addDays } from '../lib/date';

export interface NbpRate {
  rate: number;
  rateDate: DayKey;
}

/**
 * Średni kurs NBP (tabela A) na dzień płatności albo ostatni wcześniejszy dzień publikacji.
 * Pytamy o zakres 7 dni wstecz i bierzemy ostatni kurs. `fetchFn` jest wyliczany przy wywołaniu
 * (nie przy ładowaniu modułu), więc da się go podmienić w testach.
 * - PLN → kurs 1, bez sieci
 * - HTTP 404 / inny błąd HTTP / pusty zakres → null (brak kursu)
 * - błąd sieci → wyjątek (wołający zostawia wpis jako „kurs do pobrania”)
 */
export async function fetchNbpRate(
  currency: string,
  day: DayKey,
  fetchFn: typeof fetch = fetch,
): Promise<NbpRate | null> {
  if (currency === 'PLN') return { rate: 1, rateDate: day };
  const url = `https://api.nbp.pl/api/exchangerates/rates/a/${currency.toLowerCase()}/${addDays(day, -7)}/${day}/?format=json`;
  const res = await fetchFn(url);
  if (!res.ok) return null;
  const data = (await res.json()) as { rates?: { effectiveDate: string; mid: number }[] };
  const last = data.rates?.[data.rates.length - 1];
  if (!last) return null;
  return { rate: last.mid, rateDate: last.effectiveDate };
}
