/** Czas trwania jako „1:05” (godziny:minuty). */
export function formatHM(ms: number): string {
  const totalMin = Math.floor(Math.max(0, ms) / 60_000);
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  return `${h}:${String(m).padStart(2, '0')}`;
}

/** Stoper: zawsze „0:04:07” — ten sam układ godzina:minuty co w sumach, plus sekundy. */
export function formatClock(ms: number): string {
  const totalSec = Math.floor(Math.max(0, ms) / 1000);
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

/** Minuty jako „45 min” / „1 h 30 min”. */
export function formatMinutes(min: number): string {
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60);
  const m = min % 60;
  return m ? `${h} h ${m} min` : `${h} h`;
}

const pln = new Intl.NumberFormat('pl-PL', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** Grosze → „1 234,50 zł” */
export function formatPLN(grosze: number): string {
  return `${pln.format(grosze / 100)} zł`;
}

/** Odmiana: 1 zadanie, 2 zadania, 5 zadań. */
export function plural(n: number, one: string, few: string, many: string): string {
  if (n === 1) return one;
  const d = n % 10;
  const dd = n % 100;
  if (d >= 2 && d <= 4 && !(dd >= 12 && dd <= 14)) return few;
  return many;
}

/**
 * Czas wpisany przez człowieka → ms. Przyjmuje „1:30”, „1h30”, „1,5h”, „1 h 30 min”, „45”, „45 min”.
 * Sama liczba to minuty. Zwraca null, gdy nie da się odczytać.
 */
export function parseDuration(input: string): number | null {
  const s = input.trim().toLowerCase().replace(',', '.');
  if (!s) return null;
  let m = s.match(/^(\d+):([0-5]?\d)$/);
  if (m) return (Number(m[1]) * 60 + Number(m[2])) * 60_000;
  m = s.match(/^(\d+(?:\.\d+)?)\s*(?:h|godz)\.?\s*(?:(\d+)\s*(?:m|min)?)?$/);
  if (m) return Math.round((parseFloat(m[1]) * 60 + (m[2] ? Number(m[2]) : 0)) * 60_000);
  m = s.match(/^(\d+(?:\.\d+)?)\s*(?:m|min)?$/);
  if (m) return Math.round(parseFloat(m[1]) * 60_000);
  return null;
}
