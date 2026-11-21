import 'fake-indexeddb/auto';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { extractJson, matchCategory, parseResponse } from '../src/domain/assistant';
import { IdbRepository } from '../src/data/db';
import { getState, init } from '../src/data/store';

const ctx = { today: '2026-11-19', categories: ['Jedzenie', 'Transport', 'Syf'] };

describe('asystent: sprawdzanie odpowiedzi modelu', () => {
  it('przepuszcza poprawne zadanie, nawyk i wydatek', () => {
    const r = parseResponse(
      {
        reply: 'Dodaję trzy rzeczy.',
        actions: [
          { type: 'task', title: 'Zadzwonić do mamy', date: '2026-11-20', estimateMin: 15 },
          { type: 'habit', name: 'Siłownia', kind: 'check', unit: null, frequency: { kind: 'timesPerWeek', times: 3, days: null } },
          { type: 'expense', amount: 23.5, currency: 'pln', category: 'jedzenie', note: 'Żabka', date: null },
        ],
      },
      ctx,
    );
    expect(r.reply).toBe('Dodaję trzy rzeczy.');
    expect(r.actions).toEqual([
      { type: 'task', title: 'Zadzwonić do mamy', date: '2026-11-20', estimateMin: 15 },
      { type: 'habit', name: 'Siłownia', kind: 'check', unit: null, frequency: { kind: 'timesPerWeek', times: 3 } },
      { type: 'expense', amount: 23.5, currency: 'PLN', category: 'Jedzenie', note: 'Żabka', date: '2026-11-19' },
    ]);
  });

  it('odrzuca śmieci i naprawia złe pola', () => {
    const r = parseResponse(
      {
        actions: [
          { type: 'task', title: '' },
          { type: 'expense', amount: -5 },
          { type: 'expense', amount: '12,5', currency: 'zł', category: 'Nieistniejąca', date: 'jutro' },
          { type: 'habit', name: 'Palenie', kind: 'quit', frequency: { kind: 'timesPerWeek', times: 3 } },
          { type: 'habit', name: 'Bieganie', kind: 'check', frequency: { kind: 'weekdays', days: [5, 1, 1, 9] } },
          { type: 'delete_everything' },
        ],
      },
      ctx,
    );
    expect(r.actions).toEqual([
      { type: 'expense', amount: 12.5, currency: 'PLN', category: null, note: '', date: '2026-11-19' },
      { type: 'habit', name: 'Palenie', kind: 'quit', unit: null, frequency: { kind: 'daily' } },
      { type: 'habit', name: 'Bieganie', kind: 'check', unit: null, frequency: { kind: 'weekdays', days: [1, 5] } },
    ]);
  });

  it('wyciąga JSON owinięty w tekst', () => {
    expect(extractJson('Oto wynik:\n```json\n{"reply":"ok","actions":[]}\n```')).toEqual({ reply: 'ok', actions: [] });
    expect(() => extractJson('nie wiem')).toThrow();
  });

  it('dopasowuje kategorię bez wielkości liter i ogonków', () => {
    expect(matchCategory('SYF', ctx.categories)).toBe('Syf');
    expect(matchCategory('Zakupy', ctx.categories)).toBeNull();
  });
});

describe('asystent: zapis i cofanie', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('wysyła wypowiedź, zapisuje akcje i pozwala je cofnąć', async () => {
    await init(new IdbRepository('assistant-test'));
    const store = new Map<string, string>();
    vi.stubGlobal('localStorage', { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => store.set(k, v) });
    const fetchMock = vi.fn(async (_url: string, _init: RequestInit) =>
      new Response(
        JSON.stringify({
          choices: [
            {
              message: {
                content: JSON.stringify({
                  reply: 'Dodaję.',
                  actions: [
                    { type: 'task', title: 'Kupić mleko', date: null, estimateMin: null },
                    { type: 'habit', name: 'Czytanie', kind: 'check', unit: null, frequency: { kind: 'daily', times: null, days: null } },
                    { type: 'expense', amount: 40, currency: 'PLN', category: 'Jedzenie', note: 'obiad', date: null },
                  ],
                }),
              },
            },
          ],
        }),
      ),
    );
    vi.stubGlobal('fetch', fetchMock);

    const { applyActions, interpret, saveConfig, DEFAULT_CONFIG } = await import('../src/data/assistant');
    saveConfig({ ...DEFAULT_CONFIG, apiKey: 'test-key' });
    const res = await interpret('kup mleko, nawyk czytanie, wydałem 40 zł na obiad');

    const [url, req] = fetchMock.mock.calls[0];
    expect(url).toBe('https://openrouter.ai/api/v1/chat/completions');
    const body = JSON.parse(req.body as string);
    expect(body.model).toBe(DEFAULT_CONFIG.model);
    expect(body.response_format.type).toBe('json_schema');
    expect((req.headers as Record<string, string>).Authorization).toBe('Bearer test-key');

    const applied = await applyActions(res.actions);
    expect(applied).toHaveLength(3);
    const s = getState();
    const task = s.data.tasks.find((t) => t.title === 'Kupić mleko');
    const habit = s.data.habits.find((h) => h.name === 'Czytanie');
    const expense = s.data.expenses.find((e) => e.note === 'obiad');
    expect(task?.date).toBe(s.today);
    expect(habit?.deletedAt).toBeNull();
    expect(expense?.amount).toBe(4000);
    expect(s.data.categories.find((c) => c.id === expense?.categoryId)?.name).toBe('Jedzenie');

    applied.forEach((a) => a.undo());
    const after = getState().data;
    expect(after.tasks.find((t) => t.id === task!.id)?.deletedAt).not.toBeNull();
    expect(after.habits.find((h) => h.id === habit!.id)?.deletedAt).not.toBeNull();
    expect(after.expenses.find((e) => e.id === expense!.id)?.deletedAt).not.toBeNull();
  });
});
