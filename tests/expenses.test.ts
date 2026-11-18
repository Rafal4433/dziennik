import { describe, expect, it } from 'vitest';
import { formatPLN } from '../src/lib/format';
import type { Category, Expense, MerchantRule } from '../src/data/model';
import {
  DEFAULT_CATEGORIES,
  expenseAmountLabel,
  groupByDay,
  pendingExpenses,
  pickableCategories,
  shiftPeriod,
  sortedCategories,
  inRange,
  isJunk,
  isPendingCategory,
  isPendingRate,
  junkComparison,
  junkFreeDays,
  junkTodayLine,
  merchantKey,
  monthlyLimitUsage,
  parseAmount,
  periodRange,
  suggestCategory,
  totals,
} from '../src/domain/expenses';

const cat = (id: string, extra: Partial<Category> = {}): Category => ({
  id, createdAt: 0, updatedAt: 0, deletedAt: null,
  name: id, monthlyLimit: null, order: 0, archived: false, junk: false, ...extra,
});
const exp = (date: string, extra: Partial<Expense> = {}): Expense => ({
  id: Math.random().toString(36), createdAt: 0, updatedAt: 0, deletedAt: null,
  amount: 1000, categoryId: 'food', note: '', date, merchant: '', source: 'manual',
  capturedAt: null, original: null, ...extra,
});
const rule = (key: string, categoryId: string, extra: Partial<MerchantRule> = {}): MerchantRule => ({
  id: key + categoryId, createdAt: 0, updatedAt: 0, deletedAt: null, merchantKey: key, categoryId, ...extra,
});

const cats = [cat('junk', { junk: true }), cat('food', { monthlyLimit: 15000 })];
const junk = (date: string, amount = 1000) => exp(date, { categoryId: 'junk', amount });

describe('wydatki', () => {
  it('kategorie startowe', () => {
    expect(DEFAULT_CATEGORIES.map((c) => c.name)).toEqual(['Syf', 'Jedzenie', 'Transport', 'Dom', 'Rozrywka', 'Inne']);
    expect(DEFAULT_CATEGORIES.map((c) => c.junk)).toEqual([true, false, false, false, false, false]);
  });

  it('parseAmount', () => {
    expect(parseAmount('12,50')).toBe(1250);
    expect(parseAmount('12.5')).toBe(1250);
    expect(parseAmount('1 299,9 zł')).toBe(129990);
    expect(parseAmount('7')).toBe(700);
    for (const bad of ['', 'abc', '-5', '0', '0,00', '12,555', '1,2,3']) expect(parseAmount(bad)).toBeNull();
  });

  it('merchantKey', () => {
    expect(merchantKey('ŻABKA Z1234 KRAKÓW')).toBe(merchantKey('Zabka Z5678 Krakow'));
    expect(merchantKey('Orlen 0042')).not.toBe(merchantKey('Żabka'));
    expect(merchantKey('  ŁÓDŹ   Kawa 12 ')).toBe('lodz kawa');
  });

  it('suggestCategory', () => {
    const key = merchantKey('Żabka');
    expect(suggestCategory('ŻABKA Z1', [rule(key, 'food')], cats)).toBe('food');
    expect(suggestCategory('Żabka', [rule(key, 'food', { deletedAt: 5 })], cats)).toBeNull();
    expect(suggestCategory('Żabka', [rule(key, 'food')], [cat('food', { archived: true })])).toBeNull();
    expect(suggestCategory('Żabka', [rule(key, 'gone')], cats)).toBeNull();
    expect(suggestCategory('Inny', [rule(key, 'food')], cats)).toBeNull();
  });

  it('periodRange i inRange', () => {
    expect(periodRange('2026-11-18', 'day')).toEqual({ start: '2026-11-18', end: '2026-11-18' });
    expect(periodRange('2026-11-18', 'week')).toEqual({ start: '2026-11-16', end: '2026-11-22' });
    expect(periodRange('2026-11-18', 'month')).toEqual({ start: '2026-11-01', end: '2026-11-30' });
    expect(periodRange('2026-02-10', 'month').end).toBe('2026-02-28');
    const r = periodRange('2026-11-18', 'week');
    expect(inRange(exp('2026-11-22'), r)).toBe(true);
    expect(inRange(exp('2026-11-23'), r)).toBe(false);
  });

  it('pending', () => {
    expect(isPendingCategory(exp('2026-11-18', { categoryId: null }))).toBe(true);
    expect(isPendingCategory(exp('2026-11-18'))).toBe(false);
    expect(isPendingRate(exp('2026-11-18', { amount: null }))).toBe(true);
  });

  it('totals', () => {
    const r = periodRange('2026-11-18', 'month');
    const list = [
      exp('2026-11-02', { amount: 500 }),
      exp('2026-11-03', { amount: 300, categoryId: null }),
      exp('2026-11-04', { amount: null }),
      exp('2026-11-05', { amount: 999, deletedAt: 1 }),
      exp('2026-10-30', { amount: 777 }),
      junk('2026-11-06', 200),
    ];
    const t = totals(list, cats, r);
    expect(t.total).toBe(1000);
    expect(t.byCategory).toContainEqual({ categoryId: null, amount: 300 });
    expect(t.byCategory).toContainEqual({ categoryId: 'food', amount: 500 });
    expect(t.byCategory).toContainEqual({ categoryId: 'junk', amount: 200 });
  });

  it('isJunk', () => {
    expect(isJunk(junk('2026-11-01'), cats)).toBe(true);
    expect(isJunk(exp('2026-11-01'), cats)).toBe(false);
    expect(isJunk(exp('2026-11-01', { categoryId: null }), cats)).toBe(false);
    expect(isJunk(junk('2026-11-01'), cats) && isJunk({ ...junk('2026-11-01'), deletedAt: 1 }, cats)).toBe(false);
  });

  it('junkFreeDays', () => {
    const today = '2026-11-18';
    expect(junkFreeDays([exp('2026-11-10'), junk('2026-11-17')], cats, today)).toBe(1);
    expect(junkFreeDays([exp('2026-11-10'), junk(today)], cats, today)).toBe(0);
    expect(junkFreeDays([exp('2026-11-13'), junk('2026-11-15')], cats, today)).toBe(3);
    expect(junkFreeDays([], cats, today)).toBe(0);
    // seria nie wychodzi przed dzień pierwszego wydatku
    expect(junkFreeDays([exp('2026-11-16')], cats, today)).toBe(3);
    // usunięty syf się nie liczy
    expect(junkFreeDays([exp('2026-11-16'), { ...junk('2026-11-17'), deletedAt: 1 }], cats, today)).toBe(3);
  });

  it('junkComparison', () => {
    const list = [
      junk('2026-11-03', 100), junk('2026-11-19', 5), // przyszłość nie liczy się do "thisMonth" do dziś
      junk('2026-10-05', 200), junk('2026-10-25', 400), exp('2026-10-06', { amount: 50 }),
    ];
    const c = junkComparison(list, cats, '2026-11-18');
    expect(c.thisMonth).toEqual({ count: 1, amount: 100 });
    expect(c.lastMonthSamePart).toEqual({ count: 1, amount: 200 });
    expect(c.lastMonthFull).toEqual({ count: 2, amount: 600 });
    const m = junkComparison([junk('2026-02-28', 10), junk('2026-03-01', 20)], cats, '2026-03-31');
    expect(m.lastMonthSamePart).toEqual({ count: 1, amount: 10 });
    expect(m.thisMonth).toEqual({ count: 1, amount: 20 });
  });

  it('monthlyLimitUsage', () => {
    const list = [exp('2026-11-02', { amount: 5000 }), exp('2026-11-10', { amount: 3940 }), exp('2026-10-10', { amount: 999 })];
    expect(monthlyLimitUsage(list, cat('junk'), '2026-11-18')).toBeNull();
    expect(monthlyLimitUsage(list, cats[1], '2026-11-18')).toEqual({ spent: 8940, limit: 15000 });
  });
});

describe('pomocnicze ekranu Wydatki', () => {
  it('pickableCategories: bez zarchiwizowanych i usuniętych, syf pierwszy, dalej wg order', () => {
    const list = [
      cat('food', { order: 1 }),
      cat('junk', { order: 5, junk: true }),
      cat('home', { order: 0 }),
      cat('old', { order: 2, archived: true }),
      cat('gone', { order: 3, deletedAt: 1 }),
    ];
    expect(pickableCategories(list).map((c) => c.id)).toEqual(['junk', 'home', 'food']);
    expect(sortedCategories(list).map((c) => c.id)).toEqual(['home', 'food', 'old', 'junk']);
  });

  it('pendingExpenses: tylko żywe bez kategorii, najnowsze pierwsze', () => {
    const a = exp('2026-11-18', { id: 'a', categoryId: null, capturedAt: 100 });
    const b = exp('2026-11-18', { id: 'b', categoryId: null, capturedAt: 300 });
    const c = exp('2026-11-18', { id: 'c', categoryId: null, createdAt: 200 });
    const done = exp('2026-11-18', { id: 'd' });
    const dead = exp('2026-11-18', { id: 'e', categoryId: null, deletedAt: 1 });
    expect(pendingExpenses([a, b, c, done, dead]).map((e) => e.id)).toEqual(['b', 'c', 'a']);
  });

  it('groupByDay: dni malejąco, sumy bez wpisów czekających na kurs', () => {
    const list = [
      exp('2026-11-17', { id: 'x', amount: 500 }),
      exp('2026-11-18', { id: 'y', amount: 1299, createdAt: 1 }),
      exp('2026-11-18', { id: 'z', amount: null, createdAt: 2 }),
      exp('2026-11-10', { id: 'out' }),
      exp('2026-11-18', { id: 'dead', deletedAt: 1 }),
    ];
    const g = groupByDay(list, { start: '2026-11-16', end: '2026-11-22' });
    expect(g.map((d) => d.day)).toEqual(['2026-11-18', '2026-11-17']);
    expect(g[0].items.map((e) => e.id)).toEqual(['z', 'y']);
    expect(g[0].total).toBe(1299);
  });

  it('shiftPeriod: dzień, tydzień, miesiąc i powrót na dziś', () => {
    const today = '2026-11-18';
    expect(shiftPeriod(today, 'day', -1, today)).toBe('2026-11-17');
    expect(shiftPeriod('2026-11-17', 'day', 1, today)).toBe(today);
    expect(shiftPeriod(today, 'week', -1, today)).toBe('2026-11-11');
    expect(shiftPeriod(today, 'month', -1, today)).toBe('2026-10-01');
    expect(shiftPeriod('2026-10-01', 'month', 1, today)).toBe(today);
    expect(shiftPeriod('2026-01-15', 'month', -1, today)).toBe('2025-12-01');
    expect(shiftPeriod('2026-03-31', 'month', -1, today)).toBe('2026-02-01');
  });

  it('expenseAmountLabel: PLN, obca waluta z kursem i bez kursu', () => {
    expect(expenseAmountLabel(exp('2026-11-18', { amount: 1299 }))).toBe('12,99 zł');
    const eur = { amount: 12, currency: 'EUR', rate: 4.27, rateDate: '2026-11-18' };
    expect(expenseAmountLabel(exp('2026-11-18', { amount: 5124, original: eur }))).toBe('12,00 EUR ≈ 51,24 zł');
    expect(expenseAmountLabel(exp('2026-11-18', { amount: null, original: { ...eur, rate: null, rateDate: null } }))).toBe(
      '12,00 EUR · kurs do pobrania',
    );
  });
});

describe('junkTodayLine', () => {
  const cats = [cat('j', { junk: true }), cat('f')];
  const ex = (id: string, date: string, categoryId: string, amount: number) => exp(date, { id, categoryId, amount });
  it('null bez wydatków', () => {
    expect(junkTodayLine([], cats, '2026-11-18')).toBeNull();
  });
  it('syf dziś: liczba i suma', () => {
    const e = [ex('1', '2026-11-18', 'j', 999), ex('2', '2026-11-18', 'j', 599), ex('3', '2026-11-18', 'f', 100)];
    expect(junkTodayLine(e, cats, '2026-11-18')).toBe(`Dziś: syf 2 × ${formatPLN(1598)}`);
  });
  it('seria dni bez syfu z odmianą', () => {
    const e = [ex('1', '2026-11-13', 'j', 500), ex('2', '2026-11-18', 'f', 100)];
    expect(junkTodayLine(e, cats, '2026-11-18')).toBe('Bez syfu od 5 dni');
    expect(junkTodayLine([ex('3', '2026-11-18', 'f', 100)], cats, '2026-11-18')).toBe('Bez syfu od 1 dnia');
  });
});
