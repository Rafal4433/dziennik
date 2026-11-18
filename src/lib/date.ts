import type { DayKey } from '../data/model';

/** Wszystkie granice dnia liczymy w tej strefie, niezależnie od ustawień urządzenia. */
export const TIME_ZONE = 'Europe/Warsaw';

const partsFmt = new Intl.DateTimeFormat('en-GB', {
  timeZone: TIME_ZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  hourCycle: 'h23',
});

function zonedParts(ts: number) {
  const out: Record<string, string> = {};
  for (const p of partsFmt.formatToParts(new Date(ts))) out[p.type] = p.value;
  return out;
}

/** Dzień (Europe/Warsaw) dla danego momentu. */
export function dayKeyOf(ts: number): DayKey {
  const p = zonedParts(ts);
  return `${p.year}-${p.month}-${p.day}`;
}

export function todayKey(now: number = Date.now()): DayKey {
  return dayKeyOf(now);
}

/** Godzina 0–23 w Europe/Warsaw. */
export function hourOf(ts: number = Date.now()): number {
  return Number(zonedParts(ts).hour);
}

/** Arytmetyka na samych datach kalendarzowych (bez stref i zmian czasu). */
function keyToUTC(key: DayKey): Date {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

function utcToKey(d: Date): DayKey {
  return d.toISOString().slice(0, 10);
}

export function addDays(key: DayKey, n: number): DayKey {
  const d = keyToUTC(key);
  d.setUTCDate(d.getUTCDate() + n);
  return utcToKey(d);
}

export function diffDays(a: DayKey, b: DayKey): number {
  return Math.round((keyToUTC(a).getTime() - keyToUTC(b).getTime()) / 86_400_000);
}

/** 1 = poniedziałek … 7 = niedziela */
export function isoWeekday(key: DayKey): number {
  const wd = keyToUTC(key).getUTCDay();
  return wd === 0 ? 7 : wd;
}

export function weekStart(key: DayKey): DayKey {
  return addDays(key, 1 - isoWeekday(key));
}

const longFmt = new Intl.DateTimeFormat('pl-PL', { timeZone: 'UTC', weekday: 'long', day: 'numeric', month: 'long' });
const shortFmt = new Intl.DateTimeFormat('pl-PL', { timeZone: 'UTC', weekday: 'short', day: 'numeric', month: 'short' });
const dmFmt = new Intl.DateTimeFormat('pl-PL', { timeZone: 'UTC', day: 'numeric', month: 'long' });

/** „środa, 18 listopada” */
export function formatDayLong(key: DayKey): string {
  return longFmt.format(keyToUTC(key));
}

/** „śr., 18 lis” */
export function formatDayShort(key: DayKey): string {
  return shortFmt.format(keyToUTC(key));
}

/** „18 listopada” */
export function formatDayMonth(key: DayKey): string {
  return dmFmt.format(keyToUTC(key));
}

/** Względna nazwa dnia: Dziś / Wczoraj / Jutro / Przedwczoraj / Pojutrze albo null. */
export function relativeDayName(key: DayKey, today: DayKey): string | null {
  switch (diffDays(key, today)) {
    case 0: return 'Dziś';
    case -1: return 'Wczoraj';
    case 1: return 'Jutro';
    case -2: return 'Przedwczoraj';
    case 2: return 'Pojutrze';
    default: return null;
  }
}
