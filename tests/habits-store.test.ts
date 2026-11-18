import 'fake-indexeddb/auto';
import { openDB } from 'idb';
import { describe, expect, it } from 'vitest';
import { IdbRepository, defaultMeta } from '../src/data/db';
import { emptyData } from '../src/data/model';
import { getState, init, replaceAllData } from '../src/data/store';

const settle = () => new Promise((r) => setTimeout(r, 30));
let n = 0;
const name = () => `hab-test-${++n}`;

describe('nawyki: model, normalizacja i nawyki startowe', () => {
  it('tworzy Witaminy i Ważenie się raz', async () => {
    const repo = new IdbRepository(name());
    await init(repo);
    await settle();
    await init(repo);
    const habits = [...getState().data.habits].sort((a, b) => a.order - b.order);
    expect(habits).toHaveLength(2);
    expect(habits[0]).toMatchObject({ name: 'Witaminy', kind: 'check', unit: null, frequency: { kind: 'daily' }, order: 0 });
    expect(habits[1]).toMatchObject({ name: 'Ważenie się', kind: 'measure', unit: 'kg', frequency: { kind: 'daily' }, order: 1 });
    expect(getState().meta.habitsSeeded).toBe(true);
  });

  it('naprawia znacznik, gdy nawyki istnieją', async () => {
    const dbName = name();
    const repo = new IdbRepository(dbName);
    await repo.save({
      habits: [
        { id: 'h1', name: 'Czytanie', frequency: { kind: 'daily' }, order: 0, archivedAt: null, kind: 'check', unit: null, createdAt: 1, updatedAt: 1, deletedAt: null },
      ],
    });
    await repo.setMeta({ ...defaultMeta(), habitsSeeded: false });
    await init(new IdbRepository(dbName));
    await settle();
    expect(getState().data.habits).toHaveLength(1);
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
    expect(getState().data.habits).toHaveLength(2);
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
