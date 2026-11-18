import type { DayKey, Habit, HabitFrequency, HabitLog } from '../data/model';
import { addDays, dayKeyOf, diffDays, isoWeekday, weekStart } from '../lib/date';
import { plural } from '../lib/format';
import { isLive } from './tasks';

/** Żywe wpisy danego nawyku. */
export function logsFor(logs: HabitLog[], habitId: string): HabitLog[] {
  return logs.filter((l) => l.habitId === habitId && isLive(l));
}

/** Żywy wpis nawyku w danym dniu (jest co najwyżej jeden). */
export function logOn(logs: HabitLog[], habitId: string, day: DayKey): HabitLog | undefined {
  return logs.find((l) => l.habitId === habitId && l.date === day && isLive(l));
}

/**
 * Początek historii nawyku: dzień utworzenia (Europe/Warsaw) albo wcześniejszy pierwszy wpis
 * (wpisy dopisane wstecz z „Dziś”). Przed tym dniem nic nie liczy się jako zaplanowane.
 */
function createdDay(habit: Habit, logs: HabitLog[]): DayKey {
  let start = dayKeyOf(habit.createdAt);
  for (const l of logs) if (l.habitId === habit.id && isLive(l) && l.date < start) start = l.date;
  return start;
}

/** Liczba żywych wpisów w tygodniu (pon–nd) zawierającym `day`. */
function weekCount(habit: Habit, logs: HabitLog[], day: DayKey): number {
  const from = weekStart(day);
  const to = addDays(from, 6);
  return logsFor(logs, habit.id).filter((l) => l.date >= from && l.date <= to).length;
}

/** Czy dzień wynika z samego harmonogramu (daily/weekdays); dla timesPerWeek zawsze true. */
function scheduledByRule(habit: Habit, day: DayKey): boolean {
  const f = habit.frequency;
  if (f.kind === 'weekdays') return f.days.includes(isoWeekday(day));
  return true;
}

/**
 * Czy nawyk jest „zaplanowany” danego dnia. Dzień z własnym wpisem jest zawsze
 * zaplanowany (żeby odhaczenie było widać). `timesPerWeek`: każdy dzień tygodnia,
 * dopóki w tym tygodniu jest mniej niż n żywych wpisów.
 */
export function isDue(habit: Habit, logs: HabitLog[], day: DayKey): boolean {
  if (logOn(logs, habit.id, day)) return true;
  const f = habit.frequency;
  if (f.kind === 'timesPerWeek') return weekCount(habit, logs, day) < f.times;
  return scheduledByRule(habit, day);
}

/**
 * Seria. daily/weekdays: kolejne zaplanowane dni z wpisem wstecz od wczoraj, plus dziś
 * jeśli już jest wpis (brak wpisu dziś nie przerywa serii). timesPerWeek: kolejne pełne
 * tygodnie z >= n wpisami, plus bieżący, jeśli już ma >= n. Nie sięga przed początek historii (utworzenie lub pierwszy wpis).
 */
export function streak(habit: Habit, logs: HabitLog[], today: DayKey): number {
  const start = createdDay(habit, logs);
  const f = habit.frequency;
  let count = 0;

  if (f.kind === 'timesPerWeek') {
    let ws = weekStart(today);
    if (weekCount(habit, logs, ws) >= f.times) count++;
    ws = addDays(ws, -7);
    // Tydzień liczymy, dopóki jego koniec nie wypada przed dniem utworzenia.
    while (addDays(ws, 6) >= start) {
      if (weekCount(habit, logs, ws) < f.times) break;
      count++;
      ws = addDays(ws, -7);
    }
    return count;
  }

  if (logOn(logs, habit.id, today)) count++;
  for (let d = addDays(today, -1); d >= start; d = addDays(d, -1)) {
    if (logOn(logs, habit.id, d)) count++;
    else if (scheduledByRule(habit, d)) break;
  }
  return count;
}

/**
 * Ułamek 0..1 wykonania z ostatnich 30 dni (dziś włącznie), albo null przy 0 zaplanowanych.
 * Okno: [max(dziś−29, dzień utworzenia) .. dziś]; dziś liczy się tylko, gdy już wykonany.
 * daily/weekdays: wykonane / zaplanowane dni (dzień z wpisem zawsze liczy się jako zaplanowany).
 * timesPerWeek: dla każdego tygodnia dotykającego okna kredyt = min(wpisy, n) / n, ważony
 * liczbą dni tego tygodnia w oknie; wynik = suma(waga·kredyt) / suma(waga).
 */
export function completion30(habit: Habit, logs: HabitLog[], today: DayKey): number | null {
  const first = addDays(today, -29);
  const created = createdDay(habit, logs);
  const start = first > created ? first : created;
  const end = logOn(logs, habit.id, today) ? today : addDays(today, -1);
  if (end < start) return null;
  const f = habit.frequency;

  if (f.kind === 'timesPerWeek') {
    let weighted = 0;
    let total = 0;
    for (let ws = weekStart(start); ws <= end; ws = addDays(ws, 7)) {
      const from = ws > start ? ws : start;
      const we = addDays(ws, 6);
      const to = we < end ? we : end;
      const w = diffDays(to, from) + 1;
      weighted += w * (Math.min(weekCount(habit, logs, ws), f.times) / f.times);
      total += w;
    }
    return total === 0 ? null : weighted / total;
  }

  let planned = 0;
  let done = 0;
  for (let d = start; d <= end; d = addDays(d, 1)) {
    const has = !!logOn(logs, habit.id, d);
    if (has || scheduledByRule(habit, d)) planned++;
    if (has) done++;
  }
  return planned === 0 ? null : done / planned;
}

export type CalendarState = 'done' | 'missed' | 'off' | 'future';

/** Tygodnie pon–nd (ostatni zawiera `today`). `off` = niezaplanowany lub przed utworzeniem. */
export function calendarWeeks(
  habit: Habit,
  logs: HabitLog[],
  today: DayKey,
  weeks = 5,
): { day: DayKey; state: CalendarState }[][] {
  const created = createdDay(habit, logs);
  const first = addDays(weekStart(today), -7 * (weeks - 1));
  const out: { day: DayKey; state: CalendarState }[][] = [];
  for (let w = 0; w < weeks; w++) {
    const row: { day: DayKey; state: CalendarState }[] = [];
    for (let i = 0; i < 7; i++) {
      const day = addDays(first, w * 7 + i);
      let state: CalendarState;
      if (day > today) state = 'future';
      else if (day < created) state = 'off';
      else if (logOn(logs, habit.id, day)) state = 'done';
      else state = isDue(habit, logs, day) ? 'missed' : 'off';
      row.push({ day, state });
    }
    out.push(row);
  }
  return out;
}

/**
 * Wartość z pola tekstowego: przecinek lub kropka, maks. 1 miejsce po przecinku.
 * Dla 'kg' zakres 20–400, dla innych jednostek liczba > 0. Błąd → null.
 */
export function parseMeasure(input: string, unit: string | null): number | null {
  const s = input.trim();
  if (!/^\d+([.,]\d)?$/.test(s)) return null;
  const v = Number(s.replace(',', '.'));
  if (!Number.isFinite(v)) return null;
  if (unit === 'kg') return v >= 20 && v <= 400 ? v : null;
  return v > 0 ? v : null;
}

function avgIn(values: { value: number; day: DayKey }[], from: DayKey, to: DayKey): number | null {
  const v = values.filter((x) => x.day >= from && x.day <= to);
  if (v.length === 0) return null;
  return v.reduce((s, x) => s + x.value, 0) / v.length;
}

/**
 * Trend: średnia z [dziś−6 .. dziś] vs średnia z [dziś−13 .. dziś−7].
 * `delta` = avg7 − poprzednia średnia; null, gdy któreś okno puste.
 * Etykietę „bez zmian” (|Δ| < 0,1) ustala UI.
 */
export function weightTrend(
  logs: HabitLog[],
  habitId: string,
  today: DayKey,
): { last: { value: number; day: DayKey } | null; avg7: number | null; delta: number | null } {
  const vals = logsFor(logs, habitId)
    .filter((l) => l.value !== null && l.date <= today)
    .map((l) => ({ value: l.value as number, day: l.date }))
    .sort((a, b) => (a.day < b.day ? -1 : a.day > b.day ? 1 : 0));
  const last = vals.length ? vals[vals.length - 1] : null;
  const avg7 = avgIn(vals, addDays(today, -6), today);
  const prev = avgIn(vals, addDays(today, -13), addDays(today, -7));
  return { last, avg7, delta: avg7 !== null && prev !== null ? avg7 - prev : null };
}

const DAY_NAMES = ['pn', 'wt', 'śr', 'cz', 'pt', 'sb', 'nd'];

/** „codziennie”, „raz w tygodniu”, „3 razy w tygodniu”, „pn, śr, pt”. */
export function frequencyLabel(f: HabitFrequency): string {
  if (f.kind === 'daily') return 'codziennie';
  if (f.kind === 'timesPerWeek') {
    if (f.times === 1) return 'raz w tygodniu';
    return `${f.times} ${plural(f.times, 'raz', 'razy', 'razy')} w tygodniu`;
  }
  return [...f.days]
    .sort((a, b) => a - b)
    .map((d) => DAY_NAMES[d - 1])
    .join(', ');
}

/** „82,4 kg” (pl-PL, 1 miejsce po przecinku, zwykła spacja). */
export function formatMeasure(value: number, unit: string | null): string {
  const num = value.toLocaleString('pl-PL', { minimumFractionDigits: 1, maximumFractionDigits: 1, useGrouping: false });
  return unit ? `${num} ${unit}` : num;
}

/** Nawyki do pokazania na „Dziś” i w liście: żywe, niezarchiwizowane, wg `order`. */
export function activeHabits(habits: Habit[]): Habit[] {
  return habits.filter((h) => isLive(h) && h.archivedAt === null).sort((a, b) => a.order - b.order);
}

/**
 * Zmiana tydzień do tygodnia słownie: „bez zmian” przy |Δ| < 0,1, inaczej „−0,5 kg w tydzień”
 * (prawdziwy minus, przecinek dziesiętny). null, gdy trendu brak.
 */
export function trendLabel(delta: number | null, unit: string | null): string | null {
  if (delta === null) return null;
  if (Math.abs(delta) < 0.1) return 'bez zmian';
  return `${delta < 0 ? '−' : '+'}${formatMeasure(Math.abs(delta), unit)} w tydzień`;
}

/** Punkty wykresu: żywe wpisy z wartością z ostatnich `days` dni (dziś włącznie), rosnąco po dniu. */
export function measurePoints(logs: HabitLog[], habitId: string, today: DayKey, days = 90): { day: DayKey; value: number }[] {
  const from = addDays(today, -(days - 1));
  return logsFor(logs, habitId)
    .filter((l) => l.value !== null && l.date >= from && l.date <= today)
    .map((l) => ({ day: l.date, value: l.value as number }))
    .sort((a, b) => (a.day < b.day ? -1 : a.day > b.day ? 1 : 0));
}
