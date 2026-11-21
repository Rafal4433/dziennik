import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { IdbRepository } from '../src/data/db';
import { categorizeExpense, getState, importCaptured, init, resolvePendingRates, type CapturedPayment } from '../src/data/store';
import { merchantKey, suggestCategory, totals, periodRange } from '../src/domain/expenses';

const settle = () => new Promise((r) => setTimeout(r, 30));
let n = 0;
const freshRepo = () => new IdbRepository(`exp-test-${++n}`);

const pay = (over: Partial<CapturedPayment> = {}): CapturedPayment => ({
  id: 'cap-1',
  capturedAt: Date.UTC(2026, 10, 18, 10, 0),
  amount: 12.99,
  currency: 'PLN',
  merchant: 'ŻABKA Z1234',
  card: '1234',
  ...over,
});

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-11-18T12:00:00+01:00'));
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('wydatki w store', () => {
  it('tworzy 6 kategorii startowych raz', async () => {
    const repo = freshRepo();
    await init(repo);
    await settle();
    await init(repo);
    const cats = [...getState().data.categories].sort((a, b) => a.order - b.order);
    expect(cats).toHaveLength(6);
    expect(cats[0].name).toBe('Syf');
    expect(cats[0].junk).toBe(true);
    expect(getState().meta.expensesSeeded).toBe(true);
    expect(cats.map((c) => c.order)).toEqual([0, 1, 2, 3, 4, 5]);
  });

  it('importuje płatność do polskiego dnia', async () => {
    await init(freshRepo());
    const ids = await importCaptured([pay({ capturedAt: Date.UTC(2026, 10, 18, 23, 30) })]);
    expect(ids).toEqual(['cap-1']);
    const e = getState().data.expenses[0];
    expect(e.date).toBe('2026-11-19');
    expect(e.categoryId).toBeNull();
    expect(e.amount).toBe(1299);
    expect(e.source).toBe('applepay');
    expect(e.original).toBeNull();
  });

  it('import jest idempotentny', async () => {
    await init(freshRepo());
    const a = await importCaptured([pay()]);
    const b = await importCaptured([pay()]);
    expect(getState().data.expenses).toHaveLength(1);
    expect(a).toEqual(['cap-1']);
    expect(b).toEqual(['cap-1']);
  });

  it('obca waluta bez sieci czeka na kurs', async () => {
    await init(freshRepo());
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('offline')));
    await importCaptured([pay({ id: 'eur', amount: 12, currency: ' eur ' })]);
    const e = getState().data.expenses[0];
    expect(e.amount).toBeNull();
    expect(e.original!.currency).toBe('EUR');
    const range = periodRange(e.date, 'month');
    expect(totals(getState().data.expenses, getState().data.categories, range).total).toBe(0);

    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: true, json: async () => ({ rates: [{ effectiveDate: '2026-11-18', mid: 4.27 }] }) }),
    );
    await resolvePendingRates();
    const r = getState().data.expenses[0];
    expect(r.amount).toBe(5124);
    expect(r.original!.rate).toBe(4.27);
    expect(r.original!.rateDate).toBe('2026-11-18');
  });

  it('uzupełnienie zapamiętuje sklep', async () => {
    await init(freshRepo());
    await importCaptured([pay()]);
    const jedzenie = getState().data.categories.find((c) => c.name === 'Jedzenie')!;
    categorizeExpense('cap-1', jedzenie.id);
    const { merchantRules, categories, expenses } = getState().data;
    expect(merchantRules).toHaveLength(1);
    expect(merchantRules[0].merchantKey).toBe(merchantKey('ŻABKA Z1234'));
    expect(expenses[0].categoryId).toBe(jedzenie.id);
    expect(suggestCategory('Zabka Z999', merchantRules, categories)).toBe(jedzenie.id);
  });

  it('dane przetrwają ponowne otwarcie', async () => {
    const repo = freshRepo();
    await init(repo);
    await importCaptured([pay()]);
    const jedzenie = getState().data.categories.find((c) => c.name === 'Jedzenie')!;
    categorizeExpense('cap-1', jedzenie.id);
    await settle();
    await init(new IdbRepository(`exp-test-${n}`));
    expect(getState().data.expenses).toHaveLength(1);
    expect(getState().data.merchantRules).toHaveLength(1);
    expect(getState().data.categories).toHaveLength(6);
  });

  it('nieudany zapis nie oznacza rekordu jako zapisanego, ponowienie go zapisuje', async () => {
    const repo = freshRepo();
    await init(repo);
    const real = repo.save.bind(repo);
    let fail = true;
    repo.save = async (c) => {
      if (fail) throw new Error('quota');
      return real(c);
    };
    vi.spyOn(console, 'error').mockImplementation(() => {});
    await expect(importCaptured([pay()])).rejects.toThrow('quota');
    expect(getState().data.expenses).toHaveLength(0);
    fail = false;
    expect(await importCaptured([pay()])).toEqual(['cap-1']);
    await settle();
    await init(new IdbRepository(`exp-test-${n}`));
    expect(getState().data.expenses.map((e) => e.id)).toEqual(['cap-1']);
  });

  it('równoległy import tego samego rekordu daje jeden wpis i jedno pobranie kursu', async () => {
    await init(freshRepo());
    const f = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ rates: [{ effectiveDate: '2026-11-18', mid: 4.27 }] }) });
    vi.stubGlobal('fetch', f);
    const p = pay({ id: 'par', amount: 12, currency: 'EUR' });
    const [a, b] = await Promise.all([importCaptured([p]), importCaptured([p])]);
    expect(a).toEqual(['par']);
    expect(b).toEqual(['par']);
    expect(getState().data.expenses).toHaveLength(1);
    expect(f).toHaveBeenCalledTimes(1);
  });

  it('dopina znacznik zasiania, gdy kategorie już są', async () => {
    const repo = freshRepo();
    await init(repo);
    await settle();
    await repo.setMeta({ ...getState().meta, expensesSeeded: false });
    await init(repo);
    expect(getState().data.categories).toHaveLength(6);
    expect(getState().meta.expensesSeeded).toBe(true);
  });
});

describe('notatka wydatku', () => {
  it('zapisuje się od razu i przetrwa ponowne otwarcie bazy', async () => {
    const { addExpense, updateExpenseNote } = await import('../src/data/store');
    const repo = freshRepo();
    await init(repo);
    const cat = getState().data.categories[0];
    await addExpense({ amount: 12.5, currency: 'PLN', categoryId: cat.id, note: 'obiad', date: getState().today });
    const e = getState().data.expenses.find((x) => x.note === 'obiad')!;
    expect(e).toBeTruthy();
    updateExpenseNote(e.id, 'obiad z Kasią');
    await settle();
    await init(repo);
    expect(getState().data.expenses.find((x) => x.id === e.id)!.note).toBe('obiad z Kasią');
  });
});
