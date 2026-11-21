import { describe, expect, it } from 'vitest';
import type { TimeEntry } from '../src/data/model';
import { withDuration } from '../src/domain/tasks';
import { parseDuration } from '../src/lib/format';

const MIN = 60_000;
const H = 60 * MIN;

function entry(extra: Partial<TimeEntry> = {}): TimeEntry {
  return {
    id: 'e1', createdAt: 0, updatedAt: 0, deletedAt: null, taskId: 't1', date: '2026-11-20',
    startedAt: 1_000_000, endedAt: null, source: 'timer', ...extra,
  };
}

describe('wpisywanie czasu', () => {
  it('rozumie różne zapisy', () => {
    expect(parseDuration('1:30')).toBe(90 * MIN);
    expect(parseDuration('0:05')).toBe(5 * MIN);
    expect(parseDuration('45')).toBe(45 * MIN);
    expect(parseDuration('45 min')).toBe(45 * MIN);
    expect(parseDuration('2h')).toBe(2 * H);
    expect(parseDuration('1h30')).toBe(90 * MIN);
    expect(parseDuration('1 h 30 min')).toBe(90 * MIN);
    expect(parseDuration('1,5h')).toBe(90 * MIN);
  });
  it('odrzuca śmieci', () => {
    for (const s of ['', 'abc', '1:75', '-5', '1:30:00']) expect(parseDuration(s)).toBeNull();
  });
});

describe('poprawka długości odcinka', () => {
  const now = 1_000_000 + 24 * H;

  it('stoper zostawiony na noc: skraca i zatrzymuje', () => {
    const fixed = withDuration(entry(), 40 * MIN, now)!;
    expect(fixed.endedAt).toBe(1_000_000 + 40 * MIN);
    expect(fixed.updatedAt).toBe(now);
    expect(fixed.startedAt).toBe(1_000_000);
  });
  it('zmienia zakończony odcinek', () => {
    const e = entry({ endedAt: 1_000_000 + 10 * H });
    expect(withDuration(e, 2 * H, now)!.endedAt).toBe(1_000_000 + 2 * H);
  });
  it('koniec nie wypada w przyszłości', () => {
    expect(withDuration(entry(), 30 * H, now)!.endedAt).toBe(now);
  });
  it('ignoruje zero, bzdury, usunięte i brak zmiany', () => {
    expect(withDuration(entry(), 0, now)).toBeNull();
    expect(withDuration(entry(), NaN, now)).toBeNull();
    expect(withDuration(entry({ deletedAt: 5 }), MIN, now)).toBeNull();
    expect(withDuration(entry({ endedAt: 1_000_000 + MIN }), MIN, now)).toBeNull();
  });
});
