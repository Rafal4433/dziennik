import { describe, it, expect, vi } from 'vitest';
import { toPLNGrosze, formatForeign } from '../src/domain/currency';
import { fetchNbpRate } from '../src/data/nbp';

/** Atrapa odpowiedzi HTTP — żadnych prawdziwych zapytań sieciowych. */
function fakeFetch(status: number, body: unknown = {}) {
  return vi.fn(async () => ({ ok: status >= 200 && status < 300, status, json: async () => body }) as Response);
}

describe('toPLNGrosze / formatForeign', () => {
  it('przelicza i zaokrągla do grosza', () => {
    expect(toPLNGrosze(12, 4.27)).toBe(5124);
  });
  it('formatuje kwotę w walucie obcej', () => {
    expect(formatForeign(12, 'EUR')).toBe('12,00 EUR');
    // zwykła spacja w tysiącach; pl-PL nie grupuje liczb 4-cyfrowych (tak samo jak formatPLN)
    expect(formatForeign(12345.5, 'EUR')).toBe('12 345,50 EUR');
  });
});

describe('fetchNbpRate', () => {
  it('buduje URL zakresu (dzień-7..dzień) z kodem małymi literami', async () => {
    const f = fakeFetch(200, { rates: [{ effectiveDate: '2026-11-20', mid: 4.27 }] });
    await fetchNbpRate('EUR', '2026-11-22', f as unknown as typeof fetch);
    expect(f).toHaveBeenCalledWith('https://api.nbp.pl/api/exchangerates/rates/a/eur/2026-11-15/2026-11-22/?format=json', expect.objectContaining({ signal: expect.any(AbortSignal) }));
  });
  it('bierze ostatni kurs z zakresu', async () => {
    const f = fakeFetch(200, { rates: [{ effectiveDate: '2026-11-19', mid: 4.25 }, { effectiveDate: '2026-11-20', mid: 4.27 }] });
    expect(await fetchNbpRate('EUR', '2026-11-22', f as unknown as typeof fetch)).toEqual({ rate: 4.27, rateDate: '2026-11-20' });
  });
  it('404 i inne błędy HTTP → null', async () => {
    expect(await fetchNbpRate('EUR', '2026-11-22', fakeFetch(404) as unknown as typeof fetch)).toBeNull();
    expect(await fetchNbpRate('EUR', '2026-11-22', fakeFetch(500) as unknown as typeof fetch)).toBeNull();
  });
  it('pusta lista kursów → null', async () => {
    expect(await fetchNbpRate('EUR', '2026-11-22', fakeFetch(200, { rates: [] }) as unknown as typeof fetch)).toBeNull();
  });
  it('błąd sieci → promise odrzucony', async () => {
    const f = vi.fn(async () => { throw new TypeError('Failed to fetch'); });
    await expect(fetchNbpRate('EUR', '2026-11-22', f as unknown as typeof fetch)).rejects.toThrow(TypeError);
  });
  it('niepoprawny kurs (0, ujemny, nie-liczba) → null', async () => {
    for (const mid of [0, -1, NaN, 'abc', null]) {
      const f = fakeFetch(200, { rates: [{ effectiveDate: '2026-11-20', mid }] });
      expect(await fetchNbpRate('EUR', '2026-11-22', f as unknown as typeof fetch)).toBeNull();
    }
  });
  it('przerywa zapytanie po ~8 s i odrzuca (jak błąd sieci)', async () => {
    vi.useFakeTimers();
    try {
      let signal: AbortSignal | undefined;
      const f = vi.fn((_url: string, init?: RequestInit) => {
        signal = init?.signal ?? undefined;
        return new Promise<Response>((_res, rej) => {
          signal?.addEventListener('abort', () => rej(new DOMException('Aborted', 'AbortError')));
        });
      });
      const p = fetchNbpRate('EUR', '2026-11-22', f as unknown as typeof fetch);
      const assertion = expect(p).rejects.toThrow();
      await vi.advanceTimersByTimeAsync(7999);
      expect(signal?.aborted).toBe(false);
      await vi.advanceTimersByTimeAsync(1);
      expect(signal?.aborted).toBe(true);
      await assertion;
    } finally {
      vi.useRealTimers();
    }
  });
  it('PLN → kurs 1 bez sieci', async () => {
    const f = fakeFetch(200);
    expect(await fetchNbpRate('PLN', '2026-11-22', f as unknown as typeof fetch)).toEqual({ rate: 1, rateDate: '2026-11-22' });
    expect(f).not.toHaveBeenCalled();
  });
  it('domyślnie używa globalnego fetch podmienionego w czasie wywołania', async () => {
    const f = fakeFetch(200, { rates: [{ effectiveDate: '2026-11-20', mid: 4.27 }] });
    vi.stubGlobal('fetch', f);
    try {
      expect(await fetchNbpRate('EUR', '2026-11-22')).toEqual({ rate: 4.27, rateDate: '2026-11-20' });
    } finally {
      vi.unstubAllGlobals();
    }
  });
});
