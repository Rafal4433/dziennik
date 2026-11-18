import { describe, expect, it } from 'vitest';
import type { DayKey, Habit, HabitLog } from '../src/data/model';
import {
  activeHabits,
  calendarWeeks,
  goalWeeks,
  completion30,
  formatMeasure,
  frequencyLabel,
  isDue,
  logOn,
  logsFor,
  measurePoints,
  parseMeasure,
  streak,
  trendLabel,
  weightTrend,
} from '../src/domain/habits';

const TODAY: DayKey = '2026-11-19'; // czwartek
const CREATED = Date.UTC(2026, 10, 1, 12); // 2026-11-01

function habit(over: Partial<Habit> = {}): Habit {
  return {
    id: 'h1',
    createdAt: CREATED,
    updatedAt: CREATED,
    deletedAt: null,
    name: 'Witaminy',
    kind: 'check',
    unit: null,
    frequency: { kind: 'daily' },
    order: 0,
    archivedAt: null,
    ...over,
  };
}

let n = 0;
function log(date: DayKey, over: Partial<HabitLog> = {}): HabitLog {
  return {
    id: `l${n++}`,
    createdAt: CREATED,
    updatedAt: CREATED,
    deletedAt: null,
    habitId: 'h1',
    date,
    value: null,
    ...over,
  };
}
const logs = (...days: DayKey[]) => days.map((d) => log(d));

describe('logsFor / logOn', () => {
  it('zwraca tylko żywe wpisy danego nawyku', () => {
    const all = [log('2026-11-18'), log('2026-11-17', { deletedAt: 5 }), log('2026-11-16', { habitId: 'h2' })];
    expect(logsFor(all, 'h1').map((l) => l.date)).toEqual(['2026-11-18']);
    expect(logOn(all, 'h1', '2026-11-18')).toBeDefined();
    expect(logOn(all, 'h1', '2026-11-17')).toBeUndefined();
  });
});

describe('isDue', () => {
  it('daily: zawsze', () => {
    expect(isDue(habit(), [], TODAY)).toBe(true);
  });
  it('weekdays [1,3,5]', () => {
    const h = habit({ frequency: { kind: 'weekdays', days: [1, 3, 5] } });
    expect(isDue(h, [], '2026-11-18')).toBe(true);
    expect(isDue(h, [], '2026-11-19')).toBe(false);
  });
  it('timesPerWeek 3 po 3 wpisach znika, dzień z wpisem nadal widać, nowy tydzień wraca', () => {
    const h = habit({ frequency: { kind: 'timesPerWeek', times: 3 } });
    const l = logs('2026-11-16', '2026-11-17', '2026-11-18');
    expect(isDue(h, l, '2026-11-19')).toBe(false);
    expect(isDue(h, l, '2026-11-18')).toBe(true);
    expect(isDue(h, l, '2026-11-23')).toBe(true);
    expect(isDue(h, l.slice(0, 2), '2026-11-19')).toBe(true);
  });
});

describe('streak', () => {
  it('daily: dziś bez wpisu nie przerywa serii', () => {
    expect(streak(habit(), logs('2026-11-16', '2026-11-17', '2026-11-18'), TODAY)).toBe(3);
  });
  it('daily: z wpisem dziś', () => {
    expect(streak(habit(), logs('2026-11-16', '2026-11-17', '2026-11-18', '2026-11-19'), TODAY)).toBe(4);
  });
  it('daily: luka przerywa', () => {
    expect(streak(habit(), logs('2026-11-16', '2026-11-18'), TODAY)).toBe(1);
  });
  it('nie sięga przed dzień utworzenia', () => {
    const h = habit({ createdAt: Date.UTC(2026, 10, 18, 12) });
    expect(streak(h, logs('2026-11-18'), TODAY)).toBe(1);
  });
  it('brak wpisów → 0', () => {
    expect(streak(habit(), [], TODAY)).toBe(0);
  });
  it('weekdays: pomija niezaplanowane dni', () => {
    const h = habit({ frequency: { kind: 'weekdays', days: [1, 3, 5] } });
    // wczoraj śr, pn 16 oraz pt 13 zaliczone; wt/czw pomijane
    expect(streak(h, logs('2026-11-18', '2026-11-16', '2026-11-13'), TODAY)).toBe(3);
    expect(streak(h, logs('2026-11-18', '2026-11-13'), TODAY)).toBe(1);
  });
  it('timesPerWeek(2): pełne tygodnie z >= n wpisami', () => {
    const h = habit({ frequency: { kind: 'timesPerWeek', times: 2 } });
    const l = logs('2026-11-09', '2026-11-12', '2026-11-03');
    expect(streak(h, l, TODAY)).toBe(1);
    expect(streak(h, [...l, ...logs('2026-11-16', '2026-11-17')], TODAY)).toBe(2);
  });
});

describe('completion30', () => {
  it('utworzony dziś bez wpisu → null', () => {
    const h = habit({ createdAt: Date.UTC(2026, 10, 19, 8) });
    expect(completion30(h, [], TODAY)).toBeNull();
  });
  it('utworzony dziś z wpisem → 1', () => {
    const h = habit({ createdAt: Date.UTC(2026, 10, 19, 8) });
    expect(completion30(h, logs('2026-11-19'), TODAY)).toBe(1);
  });
  it('15 z 29 dni (dziś bez wpisu nie liczy się)', () => {
    const h = habit({ createdAt: Date.UTC(2026, 9, 1, 12) });
    const days: DayKey[] = [];
    for (let i = 1; i <= 15; i++) days.push(`2026-11-${String(i).padStart(2, '0')}` as DayKey);
    expect(completion30(h, logs(...days), TODAY)).toBeCloseTo(15 / 29, 9);
  });
  it('weekdays: liczy tylko zaplanowane dni', () => {
    const h = habit({ frequency: { kind: 'weekdays', days: [1] } }); // pn od 01.11: 2,9,16
    expect(completion30(h, logs('2026-11-02', '2026-11-09'), TODAY)).toBeCloseTo(2 / 3, 9);
  });
  it('timesPerWeek: min(wpisy, n)/n ważone dniami tygodnia w oknie', () => {
    // okno 01.11 (nd) .. 18.11 (dziś bez wpisu): tygodnie 26.10 (1 dzień), 02.11, 09.11 (po 7), 16.11 (3 dni)
    const h = habit({ frequency: { kind: 'timesPerWeek', times: 2 } });
    const l = logs('2026-11-03', '2026-11-04', '2026-11-10'); // tydz. 02: 2/2, 09: 1/2, 16: 0
    const expected = (1 * 0 + 7 * 1 + 7 * 0.5 + 3 * 0) / (1 + 7 + 7 + 3);
    expect(completion30(h, l, TODAY)).toBeCloseTo(expected, 9);
  });
});

describe('calendarWeeks', () => {
  it('5 tygodni pon–nd, ostatni z dziś; future i off', () => {
    const h = habit({ createdAt: Date.UTC(2026, 10, 10, 12) });
    const w = calendarWeeks(h, logs('2026-11-18'), TODAY, 5);
    expect(w).toHaveLength(5);
    expect(w.every((x) => x.length === 7)).toBe(true);
    expect(w[4][0].day).toBe('2026-11-16');
    expect(w[0][0].day).toBe('2026-10-19');
    const flat = w.flat();
    const st = (d: DayKey) => flat.find((c) => c.day === d)!.state;
    expect(st('2026-11-20')).toBe('future');
    expect(st('2026-11-09')).toBe('off');
    expect(st('2026-11-10')).toBe('missed');
    expect(st('2026-11-18')).toBe('done');
  });
  it('weekdays: niezaplanowany dzień to off', () => {
    const h = habit({ frequency: { kind: 'weekdays', days: [1, 3, 5] } });
    const flat = calendarWeeks(h, [], TODAY).flat();
    expect(flat.find((c) => c.day === '2026-11-17')!.state).toBe('off');
    expect(flat.find((c) => c.day === '2026-11-16')!.state).toBe('missed');
  });
  it('timesPerWeek: niezalogowane minione dni to off, dziś w toku, daily bez zmian', () => {
    const h = habit({ frequency: { kind: 'timesPerWeek', times: 3 } });
    const flat = calendarWeeks(h, logs('2026-11-10', '2026-11-17'), TODAY).flat();
    const st = (d: DayKey) => flat.find((c) => c.day === d)!.state;
    expect(st('2026-11-11')).toBe('off');
    expect(st('2026-11-16')).toBe('off');
    expect(st('2026-11-18')).toBe('off');
    expect(st('2026-11-17')).toBe('done');
    expect(st(TODAY)).toBe('missed');
    const d = calendarWeeks(habit(), logs('2026-11-17'), TODAY).flat();
    expect(d.find((c) => c.day === '2026-11-18')!.state).toBe('missed');
  });
});

describe('goalWeeks', () => {
  it('liczy tygodnie z celem: pełne minione od utworzenia + bieżący, gdy już spełniony', () => {
    const h = habit({ frequency: { kind: 'timesPerWeek', times: 2 } });
    // tygodnie od pon: 10-26 (sb+nd → cel), 11-02 (1 wpis), 11-09 (cel), bieżący 11-16; 10-19 przed historią
    const l = logs('2026-11-01', '2026-10-31', '2026-11-03', '2026-11-10', '2026-11-12');
    expect(goalWeeks(h, l, TODAY, 5)).toEqual({ met: 2, total: 3 });
    expect(goalWeeks(h, [...l, ...logs('2026-11-16', '2026-11-17')], TODAY, 5)).toEqual({ met: 3, total: 4 });
    expect(goalWeeks(h, logs('2026-11-03'), TODAY, 5)).toEqual({ met: 0, total: 3 });
  });
});

describe('parseMeasure', () => {
  it('przypadki z briefu', () => {
    expect(parseMeasure('82,4', 'kg')).toBe(82.4);
    expect(parseMeasure('82.4', 'kg')).toBe(82.4);
    expect(parseMeasure('82,45', 'kg')).toBeNull();
    expect(parseMeasure('19', 'kg')).toBeNull();
    expect(parseMeasure('401', 'kg')).toBeNull();
    expect(parseMeasure('abc', 'kg')).toBeNull();
    expect(parseMeasure('7,5', 'h')).toBe(7.5);
    expect(parseMeasure('0', 'h')).toBeNull();
  });
});

describe('weightTrend', () => {
  const w = (date: DayKey, value: number) => log(date, { value });
  it('okna 7 dni: avg7 i delta względem poprzednich 7 dni', () => {
    const l = [w('2026-11-12', 82.0), w('2026-11-13', 82.4), w('2026-11-18', 81.8), w('2026-11-19', 81.6)];
    const t = weightTrend(l, 'h1', TODAY);
    expect(t.last).toEqual({ value: 81.6, day: '2026-11-19' });
    const avg = (82.4 + 81.8 + 81.6) / 3;
    expect(t.avg7!).toBeCloseTo(avg, 9);
    expect(t.delta!).toBeCloseTo(avg - 82.0, 9);
  });
  it('małą różnicę (< 0,1) też zwraca liczbowo', () => {
    const t = weightTrend([w('2026-11-10', 80.0), w('2026-11-19', 80.04)], 'h1', TODAY);
    expect(Math.abs(t.delta!)).toBeLessThan(0.1);
    expect(t.delta!).toBeCloseTo(0.04, 9);
  });
  it('brak wpisów w poprzednim oknie → delta null', () => {
    const t = weightTrend([w('2026-11-18', 81.8)], 'h1', TODAY);
    expect(t.avg7).toBeCloseTo(81.8, 9);
    expect(t.delta).toBeNull();
  });
  it('brak wpisów → wszystko null; tombstone i inne nawyki ignorowane', () => {
    const l = [w('2026-11-18', 81), log('2026-11-19', { value: 80, deletedAt: 1 }), log('2026-11-19', { value: 70, habitId: 'h2' })];
    expect(weightTrend([], 'h1', TODAY)).toEqual({ last: null, avg7: null, delta: null });
    expect(weightTrend(l, 'h1', TODAY).last).toEqual({ value: 81, day: '2026-11-18' });
  });
});

describe('frequencyLabel / formatMeasure', () => {
  it('etykiety', () => {
    expect(frequencyLabel({ kind: 'daily' })).toBe('codziennie');
    expect(frequencyLabel({ kind: 'timesPerWeek', times: 1 })).toBe('raz w tygodniu');
    expect(frequencyLabel({ kind: 'timesPerWeek', times: 3 })).toBe('3 razy w tygodniu');
    expect(frequencyLabel({ kind: 'weekdays', days: [1, 3, 5] })).toBe('pn, śr, pt');
    expect(frequencyLabel({ kind: 'weekdays', days: [5, 1] })).toBe('pn, pt');
  });
  it('formatMeasure', () => {
    expect(formatMeasure(82.4, 'kg')).toBe('82,4 kg');
    expect(formatMeasure(82, 'kg')).toBe('82,0 kg');
    expect(formatMeasure(7.5, null)).toBe('7,5');
  });
});

describe('activeHabits / trendLabel / measurePoints', () => {
  it('pomija zarchiwizowane i usunięte, sortuje wg order', () => {
    const list = activeHabits([
      habit({ id: 'b', order: 2 }),
      habit({ id: 'a', order: 0 }),
      habit({ id: 'x', order: 1, archivedAt: CREATED }),
      habit({ id: 'y', order: 1, deletedAt: CREATED }),
    ]);
    expect(list.map((h) => h.id)).toEqual(['a', 'b']);
  });

  it('trend słownie: bez zmian przy |Δ| < 0,1, minus jako „−”', () => {
    expect(trendLabel(null, 'kg')).toBeNull();
    expect(trendLabel(0.05, 'kg')).toBe('bez zmian');
    expect(trendLabel(-0.09, 'kg')).toBe('bez zmian');
    expect(trendLabel(-0.5, 'kg')).toBe('−0,5 kg w tydzień');
    expect(trendLabel(0.3, 'kg')).toBe('+0,3 kg w tydzień');
  });

  it('punkty z 90 dni, bez pustych wartości i tombstone’ów, rosnąco', () => {
    const logs = [
      log('2026-11-19', { value: 81.6 }),
      log('2026-11-10', { value: 82.0 }),
      log('2026-08-21', { value: 85.0 }), // dziś − 90 → poza oknem
      log('2026-08-22', { value: 84.0 }), // dziś − 89 → w oknie
      log('2026-11-12', { value: 83.0, deletedAt: CREATED }),
      log('2026-11-13', { value: null }),
      log('2026-11-14', { habitId: 'h2', value: 70 }),
    ];
    expect(measurePoints(logs, 'h1', TODAY)).toEqual([
      { day: '2026-08-22', value: 84.0 },
      { day: '2026-11-10', value: 82.0 },
      { day: '2026-11-19', value: 81.6 },
    ]);
  });
});

describe('wpisy dopisane sprzed dnia utworzenia', () => {
  // Nawyk utworzony 2026-11-17, wpisy dopisane wstecz na 15 i 16 listopada.
  const h = habit({ createdAt: Date.UTC(2026, 10, 17, 12) });
  const back = logs('2026-11-15', '2026-11-16', '2026-11-17', '2026-11-18', '2026-11-19');

  it('liczą się do serii i siatki', () => {
    expect(streak(h, back, TODAY)).toBe(5);
    const cells = calendarWeeks(h, back, TODAY).flat();
    expect(cells.find((c) => c.day === '2026-11-15')?.state).toBe('done');
    expect(cells.find((c) => c.day === '2026-11-14')?.state).toBe('off');
  });

  it('% z 30 dni zaczyna się od pierwszego wpisu', () => {
    expect(completion30(h, back, TODAY)).toBe(1);
  });
});
