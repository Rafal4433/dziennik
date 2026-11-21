import { describe, expect, it } from 'vitest';
import type { Category, Expense, Habit, HabitLog } from '../src/data/model';
import { quitStats, slipCount } from '../src/domain/quit';

const TODAY = '2026-11-19';
const habit = (over: Partial<Habit> = {}): Habit => ({
  id: 'q', createdAt: Date.UTC(2026, 10, 10, 12), updatedAt: 0, deletedAt: null, name: 'Bez syfu', kind: 'quit',
  unit: null, frequency: { kind: 'daily' }, order: 0, archivedAt: null, countsJunk: false, ...over,
});
const log = (date: string, over: Partial<HabitLog> = {}): HabitLog => ({ id: date, createdAt: 0, updatedAt: 0, deletedAt: null, habitId: 'q', date, value: null, ...over });
const junkCat: Category = { id: 'syf', createdAt: 0, updatedAt: 0, deletedAt: null, name: 'Syf', monthlyLimit: null, order: 0, archived: false, junk: true };
const expense = (date: string): Expense => ({
  id: `e${date}`, createdAt: 0, updatedAt: 0, deletedAt: null, amount: 500, categoryId: 'syf', note: '', date, merchant: '', source: 'manual', original: null, capturedAt: null,
} as unknown as Expense);

describe('quitStats', () => {
  it('liczy dni od utworzenia, gdy nie było wpadki', () => {
    const s = quitStats(habit(), [], [], [], TODAY);
    expect(s.current).toBe(10);
    expect(s.best).toBe(10);
    expect(s.slippedToday).toBe(false);
  });

  it('wpadka zeruje serię, najdłuższa zostaje', () => {
    const s = quitStats(habit(), [log('2026-11-16')], [], [], TODAY);
    expect(s.current).toBe(3);
    expect(s.best).toBe(6);
  });

  it('dzisiejsza wpadka daje serię 0', () => {
    const s = quitStats(habit(), [log(TODAY)], [], [], TODAY);
    expect(s.current).toBe(0);
    expect(s.slippedToday).toBe(true);
  });

  it('usunięty wpis nie jest wpadką', () => {
    expect(quitStats(habit(), [log(TODAY, { deletedAt: 1 })], [], [], TODAY).current).toBe(10);
  });

  it('przy countsJunk wydatek na syf jest wpadką, a historia sięga pierwszego wydatku', () => {
    const s = quitStats(habit({ countsJunk: true }), [], [expense('2026-11-01'), expense('2026-11-17')], [junkCat], TODAY);
    expect(s.current).toBe(2);
    expect(s.best).toBe(15);
  });

  it('bez countsJunk wydatki się nie liczą', () => {
    expect(quitStats(habit(), [], [expense('2026-11-18')], [junkCat], TODAY).current).toBe(10);
  });
});

describe('licznik wpadek', () => {
  it('liczy wpadki dnia z value (null = 1) i sumę tygodnia', () => {
    const logs = [log(TODAY, { value: 3 }), log('2026-11-17'), log('2026-11-15', { value: 5 })];
    expect(slipCount(habit(), logs, TODAY)).toBe(3);
    expect(slipCount(habit(), logs, '2026-11-18')).toBe(0);
    const s = quitStats(habit(), logs, [], [], TODAY);
    expect(s.todayCount).toBe(3);
    // tydzień od poniedziałku 2026-11-16: 1 + 3
    expect(s.weekCount).toBe(4);
  });
});
