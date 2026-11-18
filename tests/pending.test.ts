import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { IdbRepository } from '../src/data/db';
import { getState, init, type CapturedPayment } from '../src/data/store';

const mocks = vi.hoisted(() => ({
  native: true,
  items: [] as unknown[],
  removedWhenStored: -1,
  list: vi.fn(),
  remove: vi.fn(),
}));

vi.mock('@capacitor/core', () => ({
  Capacitor: { isNativePlatform: () => mocks.native },
  registerPlugin: () => ({
    list: mocks.list,
    remove: mocks.remove,
    expiry: async () => ({ expiresAt: null }),
  }),
}));

import { syncPending } from '../src/native/pending';

const pay = (id: string): CapturedPayment => ({
  id,
  capturedAt: Date.UTC(2026, 10, 18, 10, 0),
  amount: 12.99,
  currency: 'PLN',
  merchant: 'Żabka',
  card: '',
});

let n = 0;

beforeEach(async () => {
  mocks.list.mockReset().mockImplementation(async () => ({ items: mocks.items }));
  mocks.remove.mockReset().mockImplementation(async () => {
    mocks.removedWhenStored = getState().data.expenses.length;
  });
  mocks.removedWhenStored = -1;
  await init(new IdbRepository(`pending-test-${++n}`));
});

describe('syncPending', () => {
  it('importuje kolejkę i usuwa rekordy dopiero po zapisie', async () => {
    mocks.native = true;
    mocks.items = [pay('a'), pay('b')];
    const count = await syncPending();
    expect(count).toBe(2);
    expect(getState().data.expenses.map((e) => e.id).sort()).toEqual(['a', 'b']);
    expect(mocks.remove).toHaveBeenCalledTimes(1);
    expect(mocks.remove).toHaveBeenCalledWith({ ids: ['a', 'b'] });
    expect(mocks.removedWhenStored).toBe(2);
  });

  it('przy pustej kolejce nie wywołuje remove', async () => {
    mocks.native = true;
    mocks.items = [];
    expect(await syncPending()).toBe(0);
    expect(mocks.remove).not.toHaveBeenCalled();
  });

  it('poza aplikacją natywną nic nie robi', async () => {
    mocks.native = false;
    mocks.items = [pay('a')];
    expect(await syncPending()).toBe(0);
    expect(mocks.list).not.toHaveBeenCalled();
  });
});
