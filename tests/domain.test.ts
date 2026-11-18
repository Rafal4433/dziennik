import { describe, expect, it } from 'vitest';
import { makeTask, needsDecision, parseEstimate, rollover } from '../src/domain/tasks';
import { addDays, dayKeyOf, hourOf, isoWeekday, weekStart } from '../src/lib/date';
import { plural } from '../src/lib/format';

describe('daty w Europe/Warsaw', () => {
  it('liczy dzień według Warszawy, nie UTC', () => {
    // 23:30 UTC 18.11 = 00:30 w Warszawie 19.11 (CET, UTC+1)
    expect(dayKeyOf(Date.UTC(2026, 10, 18, 23, 30))).toBe('2026-11-19');
    expect(dayKeyOf(Date.UTC(2026, 10, 18, 22, 30))).toBe('2026-11-18');
    // lato (CEST, UTC+2): 22:30 UTC = 00:30
    expect(dayKeyOf(Date.UTC(2026, 6, 1, 22, 30))).toBe('2026-07-02');
    expect(hourOf(Date.UTC(2026, 10, 18, 19, 0))).toBe(20);
  });
  it('arytmetyka dni przez zmianę czasu i koniec miesiąca', () => {
    expect(addDays('2026-03-28', 1)).toBe('2026-03-29');
    expect(addDays('2026-03-29', 1)).toBe('2026-03-30');
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28');
  });
  it('tydzień od poniedziałku', () => {
    expect(isoWeekday('2026-11-18')).toBe(3);
    expect(isoWeekday('2026-11-22')).toBe(7);
    expect(weekStart('2026-11-22')).toBe('2026-11-16');
  });
});

describe('rollover', () => {
  const now = 1_000;
  it('przenosi tylko zadania do zrobienia z minionych dni', () => {
    const a = makeTask('stare', '2026-11-17', now);
    const b = { ...makeTask('zrobione', '2026-11-17', now), status: 'done' as const };
    const c = { ...makeTask('odpuszczone', '2026-11-16', now), status: 'skipped' as const };
    const d = makeTask('dzisiejsze', '2026-11-18', now);
    const e = makeTask('jutrzejsze', '2026-11-19', now);
    const f = { ...makeTask('usunięte', '2026-11-17', now), deletedAt: 5 };
    const moved = rollover([a, b, c, d, e, f], '2026-11-18', 2_000);
    expect(moved.map((t) => t.title)).toEqual(['stare']);
    expect(moved[0].date).toBe('2026-11-18');
    expect(moved[0].carriedFrom).toEqual(['2026-11-17']);
    expect(moved[0].originalDate).toBe('2026-11-17');
    expect(moved[0].updatedAt).toBe(2_000);
  });
  it('po kilku dniach przerwy liczy jedno przeniesienie', () => {
    const a = makeTask('x', '2026-11-10', now);
    expect(rollover([a], '2026-11-18', now)[0].carriedFrom).toEqual(['2026-11-10']);
  });
  it('pyta o decyzję od 3 przeniesień, a po decyzji liczy od nowa', () => {
    let t = makeTask('x', '2026-11-15', now);
    for (const day of ['2026-11-16', '2026-11-17', '2026-11-18']) {
      expect(needsDecision(t, t.date)).toBe(false);
      t = rollover([t], day, now)[0];
    }
    expect(needsDecision(t, '2026-11-18')).toBe(true);
    expect(needsDecision({ ...t, promptSnoozedOn: '2026-11-18' }, '2026-11-18')).toBe(false);
    expect(needsDecision({ ...t, carryBase: 3 }, '2026-11-18')).toBe(false);
  });
});

describe('szacunek w tytule', () => {
  it.each([
    ['Napisać raport ~30', 'Napisać raport', 30],
    ['Raport ~45m', 'Raport', 45],
    ['Raport ~45 min', 'Raport', 45],
    ['Raport ~1h', 'Raport', 60],
    ['Raport ~1h30', 'Raport', 90],
    ['Raport ~1,5h', 'Raport', 90],
    ['Raport', 'Raport', null],
    ['~30', '~30', null],
    ['Kupić 2 mleka', 'Kupić 2 mleka', null],
  ])('%s', (input, title, est) => {
    expect(parseEstimate(input)).toEqual({ title, estimateMin: est });
  });
});

describe('odmiana', () => {
  it('polskie liczebniki', () => {
    expect([1, 2, 5, 12, 22, 25].map((n) => plural(n, 'zadanie', 'zadania', 'zadań'))).toEqual([
      'zadanie', 'zadania', 'zadań', 'zadań', 'zadania', 'zadań',
    ]);
  });
});
