import type { Category, DayKey, Expense, Habit, HabitLog } from '../data/model';
import { addDays, dayKeyOf, weekStart } from '../lib/date';
import { isJunk } from './expenses';
import type { CalendarState } from './habits';
import { isLive } from './tasks';

/**
 * Nawyk do rzucenia (`quit`): wpadka = żywy wpis nawyku w danym dniu, a przy `countsJunk`
 * także wydatek w kategorii syf. Historia zaczyna się od utworzenia nawyku, pierwszego wpisu
 * albo (przy `countsJunk`) pierwszego wydatku — co wcześniej.
 */
export function quitSlips(habit: Habit, logs: HabitLog[], expenses: Expense[], categories: Category[], today: DayKey) {
  const slips = new Set<DayKey>();
  let start = dayKeyOf(habit.createdAt);
  for (const l of logs) {
    if (!isLive(l) || l.habitId !== habit.id || l.date > today) continue;
    slips.add(l.date);
    if (l.date < start) start = l.date;
  }
  if (habit.countsJunk) {
    for (const e of expenses) {
      if (!isLive(e) || e.date > today) continue;
      if (e.date < start) start = e.date;
      if (isJunk(e, categories)) slips.add(e.date);
    }
  }
  return { slips, start };
}

/** Seria (dni bez wpadki do dziś włącznie), najdłuższa seria i siatka 5 tygodni (done = czysty dzień, missed = wpadka). */
export function quitStats(habit: Habit, logs: HabitLog[], expenses: Expense[], categories: Category[], today: DayKey) {
  const { slips, start } = quitSlips(habit, logs, expenses, categories, today);
  let current = 0;
  for (let d = today; d >= start && !slips.has(d); d = addDays(d, -1)) current++;
  let best = 0;
  let run = 0;
  for (let d = start; d <= today; d = addDays(d, 1)) {
    run = slips.has(d) ? 0 : run + 1;
    if (run > best) best = run;
  }
  const first = addDays(weekStart(today), -28);
  const weeks = Array.from({ length: 5 }, (_, w) =>
    Array.from({ length: 7 }, (_, i) => {
      const day = addDays(first, w * 7 + i);
      const state: CalendarState = day > today ? 'future' : day < start ? 'off' : slips.has(day) ? 'missed' : 'done';
      return { day, state };
    }),
  );
  const countOn = (day: DayKey) => slipCount(habit, logs, day);
  const todayCount = countOn(today);
  let weekCount = 0;
  for (let d = weekStart(today); d <= today; d = addDays(d, 1)) weekCount += countOn(d);
  return { current, best, weeks, slippedToday: slips.has(today), todayCount, weekCount };
}

/** Ile razy danego dnia zapisano wpadkę (licznik z `value`, starszy wpis bez liczby = 1). Bez wydatków na syf. */
export function slipCount(habit: Habit, logs: HabitLog[], day: DayKey): number {
  const l = logs.find((x) => isLive(x) && x.habitId === habit.id && x.date === day);
  return l ? Math.max(1, l.value ?? 1) : 0;
}
