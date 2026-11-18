import 'fake-indexeddb/auto';
import { openDB } from 'idb';
import { describe, expect, it } from 'vitest';
import { IdbRepository, defaultMeta } from '../src/data/db';
import { parseBackup, importJSON } from '../src/data/backup';
import { emptyData } from '../src/data/model';
import { getState, init } from '../src/data/store';

describe('wydatki: baza v2 i kopia JSON', () => {
  it('migruje bazę v1 do v2', async () => {
    const v1 = ['tasks', 'timeEntries', 'categories', 'expenses', 'habits', 'habitLogs', 'weeklyReviews'];
    const old = await openDB('mig-1', 1, {
      upgrade(db) {
        for (const c of v1) db.createObjectStore(c, { keyPath: 'id' }).createIndex('updatedAt', 'updatedAt');
        db.createObjectStore('meta');
      },
    });
    await old.put('expenses', {
      id: 'e1', amount: 500, categoryId: 'c1', note: '', date: '2026-11-18',
      createdAt: 1, updatedAt: 1, deletedAt: null,
    });
    old.close();

    const { data } = await new IdbRepository('mig-1').loadAll();
    expect(data.merchantRules).toEqual([]);
    expect(data.expenses[0]).toMatchObject({
      merchant: '', source: 'manual', capturedAt: null, original: null, amount: 500,
    });
  });

  it('domyślne meta ma expensesSeeded false', () => {
    expect(defaultMeta().expensesSeeded).toBe(false);
  });

  it('importuje kopię v1 bez merchantRules', async () => {
    const { merchantRules, ...v1data } = emptyData();
    const file = parseBackup(
      JSON.stringify({
        format: 'dziennik-backup', version: 1, exportedAt: 'x',
        meta: { lastRolloverDay: null, lastRollover: null }, data: v1data,
      }),
    );
    await init(new IdbRepository('imp-1'));
    await importJSON(file);
    expect(getState().data.merchantRules).toEqual([]);
  });
});
