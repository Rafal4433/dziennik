import 'fake-indexeddb/auto';
import { describe, expect, it, vi } from 'vitest';
import { IdbRepository } from '../src/data/db';
import { addTask, getState, init, pauseTimer, startTimer, toggleDone, splitTask, letGo } from '../src/data/store';

describe('store + IndexedDB', () => {
  it('zapisuje, przenosi o północy i odtwarza dane', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-11-17T10:00:00+01:00'));
    const repo = new IdbRepository('test-1');
    await init(repo);
    addTask('Pierwsze ~25', getState().today);
    addTask('Drugie', getState().today);
    const [a, b] = getState().data.tasks;
    expect(a.estimateMin).toBe(25);

    startTimer(a.id);
    vi.setSystemTime(new Date('2026-11-17T10:20:00+01:00'));
    startTimer(b.id); // przełączenie zatrzymuje poprzedni stoper
    vi.setSystemTime(new Date('2026-11-17T10:30:00+01:00'));
    pauseTimer();
    toggleDone(a.id);
    const entries = getState().data.timeEntries;
    expect(entries).toHaveLength(2);
    expect(entries.every((e) => e.endedAt !== null)).toBe(true);
    expect(entries.find((e) => e.taskId === a.id)!.endedAt! - entries.find((e) => e.taskId === a.id)!.startedAt).toBe(20 * 60_000);

    await new Promise((r) => setTimeout(r, 20));
    // nowy dzień: ponowne uruchomienie aplikacji
    vi.setSystemTime(new Date('2026-11-18T07:00:00+01:00'));
    await init(new IdbRepository('test-1'));
    const s = getState();
    expect(s.today).toBe('2026-11-18');
    const b2 = s.data.tasks.find((t) => t.id === b.id)!;
    expect(b2.date).toBe('2026-11-18');
    expect(b2.carriedFrom).toEqual(['2026-11-17']);
    expect(s.data.tasks.find((t) => t.id === a.id)!.date).toBe('2026-11-17');
    expect(s.meta.lastRollover).toEqual({ day: '2026-11-18', moved: 1 });

    // drugie otwarcie tego samego dnia nic nie zmienia
    await new Promise((r) => setTimeout(r, 20));
    await init(new IdbRepository('test-1'));
    expect(getState().data.tasks.find((t) => t.id === b.id)!.carriedFrom).toHaveLength(1);

    splitTask(b.id, 'Mniejszy krok ~10');
    const child = getState().data.tasks.find((t) => t.parentId === b.id)!;
    expect(child.title).toBe('Mniejszy krok');
    expect(child.estimateMin).toBe(10);
    expect(getState().data.tasks.find((t) => t.id === b.id)!.resolution).toBe('split');
    letGo(child.id);
    expect(getState().data.tasks.find((t) => t.id === child.id)!.status).toBe('skipped');
    vi.useRealTimers();
  });
});
