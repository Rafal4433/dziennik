import 'fake-indexeddb/auto';
import { openDB } from 'idb';
import { describe, expect, it } from 'vitest';
import { IdbRepository, defaultMeta } from '../src/data/db';
import { emptyData } from '../src/data/model';
import { addHabit, bumpSlip, getState, init, replaceAllData, setMeasure, toggleHabit, updateHabit } from '../src/data/store';

const settle = () => new Promise((r) => setTimeout(r, 30));
let n = 0;
const name = () => `hab-test-${++n}`;

describe('nawyki: model, normalizacja i nawyki startowe', () => {
  it('tworzy Witaminy, Ważenie się i Bez syfu raz', async () => {
    const repo = new IdbRepository(name());
    await init(repo);
    await settle();
    await init(repo);
    const habits = [...getState().data.habits].sort((a, b) => a.order - b.order);
    expect(habits).toHaveLength(6);
    expect(habits[2]).toMatchObject({ name: 'Bez syfu', kind: 'quit', countsJunk: true, order: 2 });
    expect(habits.slice(3).map((h) => [h.name, h.kind, h.countsJunk])).toEqual([
      ['Prokrastynacja', 'quit', false],
      ['Scrollowanie', 'quit', false],
      ['Ciągłe sprawdzanie MT5', 'quit', false],
    ]);
    expect(getState().meta.badHabitsSeeded).toBe(true);
    expect(getState().meta.junkHabitSeeded).toBe(true);
    expect(habits[0]).toMatchObject({ name: 'Witaminy', kind: 'check', unit: null, frequency: { kind: 'daily' }, order: 0 });
    expect(habits[1]).toMatchObject({ name: 'Ważenie się', kind: 'measure', unit: 'kg', frequency: { kind: 'daily' }, order: 1 });
    expect(getState().meta.habitsSeeded).toBe(true);
  });

  it('naprawia znacznik, gdy nawyki istnieją', async () => {
    const dbName = name();
    const repo = new IdbRepository(dbName);
    await repo.save({
      habits: [
        { id: 'h1', name: 'Czytanie', frequency: { kind: 'daily' }, order: 0, archivedAt: null, kind: 'check', unit: null, countsJunk: false, createdAt: 1, updatedAt: 1, deletedAt: null },
      ],
    });
    await repo.setMeta({ ...defaultMeta(), habitsSeeded: false });
    await init(new IdbRepository(dbName));
    await settle();
    // Startowe nie wracają; dochodzi tylko „Bez syfu” (osobny znacznik).
    expect(getState().data.habits.filter((h) => h.kind !== 'quit')).toHaveLength(1);
    expect(getState().meta.habitsSeeded).toBe(true);
  });

  it('normalizuje stare rekordy', async () => {
    const dbName = name();
    const repo = new IdbRepository(dbName);
    await repo.loadAll(); // tworzy bazę
    const db = await openDB(dbName);
    await db.put('habits', { id: 'h1', name: 'Stary', frequency: { kind: 'daily' }, order: 0, archivedAt: null, createdAt: 1, updatedAt: 1, deletedAt: null });
    await db.put('habitLogs', { id: 'l1', habitId: 'h1', date: '2026-11-18', createdAt: 1, updatedAt: 1, deletedAt: null });
    db.close();
    const { data } = await new IdbRepository(dbName).loadAll();
    expect(data.habits[0]).toMatchObject({ kind: 'check', unit: null });
    expect(data.habitLogs[0].value).toBeNull();
  });

  it('import kopii bez nawyków zasiewa startowe', async () => {
    await init(new IdbRepository(name()));
    await settle();
    const { habitsSeeded: _omit, ...oldMeta } = defaultMeta();
    await replaceAllData({ ...emptyData(), habits: [] }, oldMeta as any);
    expect(getState().data.habits).toHaveLength(6);
    expect(getState().meta.habitsSeeded).toBe(true);
  });

  it('import normalizuje stare nawyki i wpisy', async () => {
    await init(new IdbRepository(name()));
    const old: any = { id: 'h1', name: 'Stary', frequency: { kind: 'daily' }, order: 0, archivedAt: null, createdAt: 1, updatedAt: 1, deletedAt: null };
    const log: any = { id: 'l1', habitId: 'h1', date: '2026-11-18', createdAt: 1, updatedAt: 1, deletedAt: null };
    await replaceAllData({ ...emptyData(), habits: [old], habitLogs: [log] }, defaultMeta());
    expect(getState().data.habits[0]).toMatchObject({ kind: 'check', unit: null });
    expect(getState().data.habitLogs[0].value).toBeNull();
  });
});

describe('nawyki: akcje', () => {
  const D = '2026-11-18';
  const setup = async (dbName = name()) => {
    await init(new IdbRepository(dbName));
    const hs = getState().data.habits;
    return { dbName, w: hs.find((h) => h.kind === 'check')!, k: hs.find((h) => h.kind === 'measure')! };
  };
  const live = (id: string) => getState().data.habitLogs.filter((l) => l.habitId === id && l.deletedAt === null);

  it('odhaczenie i odznaczenie', async () => {
    const { w } = await setup();
    toggleHabit(w.id, D);
    expect(live(w.id)).toHaveLength(1);
    const first = live(w.id)[0].id;
    toggleHabit(w.id, D);
    expect(live(w.id)).toHaveLength(0);
    expect(getState().data.habitLogs.filter((l) => l.habitId === w.id)).toHaveLength(1);
    toggleHabit(w.id, D);
    expect(live(w.id)).toHaveLength(1);
    expect(live(w.id)[0].id).not.toBe(first);
  });

  it('poprawka wagi nadpisuje', async () => {
    const { k } = await setup();
    setMeasure(k.id, D, 82.4);
    setMeasure(k.id, D, 82.1);
    expect(live(k.id)).toHaveLength(1);
    expect(live(k.id)[0].value).toBe(82.1);
    setMeasure(k.id, D, null);
    expect(live(k.id)).toHaveLength(0);
  });

  it('ten sam zapis drugi raz (✓ + blur) nic nie zmienia', async () => {
    const { k } = await setup();
    setMeasure(k.id, D, 82.4);
    const first = live(k.id)[0];
    const count = getState().data.habitLogs.length;
    setMeasure(k.id, D, 82.4);
    expect(getState().data.habitLogs).toHaveLength(count);
    expect(live(k.id)[0].updatedAt).toBe(first.updatedAt);
    expect(live(k.id)[0]).toBe(first);
  });

  it('nie miesza rodzajów i ignoruje nieznany nawyk', async () => {
    const { w, k } = await setup();
    toggleHabit(k.id, D);
    setMeasure(w.id, D, 1);
    toggleHabit('brak', D);
    expect(getState().data.habitLogs).toHaveLength(0);
  });

  it('trwałość', async () => {
    const { dbName, w, k } = await setup();
    toggleHabit(w.id, D);
    setMeasure(k.id, D, 80);
    await settle();
    await init(new IdbRepository(dbName));
    expect(live(w.id)).toHaveLength(1);
    expect(live(k.id)[0].value).toBe(80);
  });

  it('wpadka nawyku do rzucenia: stuknięcie zapisuje, drugie cofa', async () => {
    await setup();
    const q = getState().data.habits.find((h) => h.kind === 'quit')!;
    toggleHabit(q.id, D);
    expect(live(q.id)).toHaveLength(1);
    toggleHabit(q.id, D);
    expect(live(q.id)).toHaveLength(0);
  });

  it('addHabit i archiwizacja', async () => {
    const { w } = await setup();
    addHabit({ name: ' Czytanie ', kind: 'check', unit: null, frequency: { kind: 'daily' } });
    const added = getState().data.habits.find((h) => h.name === 'Czytanie')!;
    expect(added.order).toBe(6);
    updateHabit(w.id, { archivedAt: 123 });
    expect(getState().data.habits.find((h) => h.id === w.id)!.archivedAt).toBe(123);
  });
});

describe('licznik wpadek (bumpSlip)', () => {
  it('+1 zwiększa, -1 cofa, przy zerze wpis znika', async () => {
    await init(new IdbRepository(name()));
    const q = getState().data.habits.find((h) => h.name === 'Scrollowanie')!;
    const live = () => getState().data.habitLogs.filter((l) => l.habitId === q.id && l.deletedAt === null);
    bumpSlip(q.id, '2026-11-18', -1);
    expect(live()).toHaveLength(0);
    bumpSlip(q.id, '2026-11-18', 1);
    bumpSlip(q.id, '2026-11-18', 1);
    bumpSlip(q.id, '2026-11-18', 1);
    expect(live()).toHaveLength(1);
    expect(live()[0].value).toBe(3);
    bumpSlip(q.id, '2026-11-18', -1);
    expect(live()[0].value).toBe(2);
    bumpSlip(q.id, '2026-11-18', -1);
    bumpSlip(q.id, '2026-11-18', -1);
    expect(live()).toHaveLength(0);
  });
});
