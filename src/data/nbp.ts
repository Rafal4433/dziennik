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
 * - kurs niebędący dodatnią liczbą → null
 * - błąd sieci albo brak odpowiedzi w ciągu 8 s (przerwane) → wyjątek
 *   (wołający zostawia wpis jako „kurs do pobrania”)
 */
const NBP_TIMEOUT_MS = 8000;

export async function fetchNbpRate(
  currency: string,
  day: DayKey,
  fetchFn: typeof fetch = fetch,
): Promise<NbpRate | null> {
  if (currency === 'PLN') return { rate: 1, rateDate: day };
  const url = `https://api.nbp.pl/api/exchangerates/rates/a/${currency.toLowerCase()}/${addDays(day, -7)}/${day}/?format=json`;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), NBP_TIMEOUT_MS);
  try {
    const res = await fetchFn(url, { signal: ctrl.signal });
    if (!res.ok) return null;
    const data = (await res.json()) as { rates?: { effectiveDate: string; mid: unknown }[] };
    const last = data.rates?.[data.rates.length - 1];
    if (!last) return null;
    const mid = last.mid;
    if (typeof mid !== 'number' || !Number.isFinite(mid) || mid <= 0) return null;
    return { rate: mid, rateDate: last.effectiveDate };
  } finally {
    clearTimeout(timer);
  }
}
