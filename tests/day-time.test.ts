import { describe, expect, it } from 'vitest';
import type { TimeEntry } from '../src/data/model';
import { dayTime, makeTask } from '../src/domain/tasks';
import { clockOf } from '../src/lib/date';

const MIN = 60_000;
const DAY = '2026-11-18';
// 8:00 w Warszawie (CET) = 7:00 UTC
const T0 = Date.UTC(2026, 10, 18, 7, 0);

function entry(taskId: string, startMin: number, endMin: number | null, extra: Partial<TimeEntry> = {}): TimeEntry {
  return {
    id: `${taskId}-${startMin}`,
    createdAt: 0,
    updatedAt: 0,
    deletedAt: null,
    taskId,
    date: DAY,
    startedAt: T0 + startMin * MIN,
    endedAt: endMin === null ? null : T0 + endMin * MIN,
    source: 'timer',
    ...extra,
  };
}

describe('podsumowanie czasu dnia', () => {
  const done = { ...makeTask('raport', DAY, 0, { estimateMin: 60 }), status: 'done' as const };
  const open = makeTask('mail', DAY, 0);

  it('dzieli czas na zrobione i pozostałe, liczy odcinki i godziny', () => {
    const entries = [entry(done.id, 0, 50), entry(done.id, 60, 80), entry(open.id, 120, 150)];
    const t = dayTime(entries, [done, open], DAY, T0 + 600 * MIN);
    expect(t.total).toBe(100 * MIN);
    expect(t.onDone).toBe(70 * MIN);
    expect(t.onOther).toBe(30 * MIN);
    expect(t.sessions).toBe(3);
    expect(clockOf(t.span!.from)).toBe('8:00');
    expect(clockOf(t.span!.to)).toBe('10:30');
    expect(t.estimate).toEqual({ count: 1, plannedMs: 60 * MIN, actualMs: 70 * MIN });
  });

  it('pomija usunięte wpisy i inne dni, chodzący stoper liczy do teraz', () => {
    const entries = [
      entry(open.id, 0, 30, { deletedAt: 1 }),
      entry(open.id, 0, 30, { date: '2026-11-17' }),
      entry(open.id, 60, null),
    ];
    const t = dayTime(entries, [open], DAY, T0 + 75 * MIN);
    expect(t.total).toBe(15 * MIN);
    expect(t.sessions).toBe(1);
    expect(clockOf(t.span!.to)).toBe('9:15');
    expect(t.estimate).toBeNull();
  });

  it('pusty dzień nie ma godzin ani szacunku', () => {
    const t = dayTime([], [open], DAY, T0);
    expect(t).toMatchObject({ total: 0, sessions: 0, span: null, estimate: null });
  });
});
