import { useEffect, useState } from 'preact/hooks';
import { defaultMeta, normalizeCategory, normalizeExpense, normalizeHabit, normalizeHabitLog, type Changes, type Repository } from './db';
import { logOn } from '../domain/habits';
import { COLLECTIONS, emptyData, type Category, type CollectionName, type Data, type DayKey, type Expense, type Habit, type HabitFrequency, type HabitKind, type HabitLog, type MerchantRule, type Meta, type Task, type TimeEntry } from './model';
import { fetchNbpRate } from './nbp';
import { dayKeyOf, todayKey } from '../lib/date';
import { toPLNGrosze } from '../domain/currency';
import { DEFAULT_CATEGORIES, merchantKey } from '../domain/expenses';
import { newId } from '../lib/id';
import { carryCount, makeTask, parseEstimate, rollover, runningEntry, withDuration } from '../domain/tasks';

/**
 * Cały stan trzymany jest w pamięci (dane jednej osoby to najwyżej kilka tysięcy rekordów),
 * a każda zmiana jest od razu zapisywana w IndexedDB przez `Repository`.
 */
export interface AppState {
  ready: boolean;
  data: Data;
  meta: Meta;
  today: DayKey;
  saveError: string | null;
}

let repo: Repository;
let state: AppState = { ready: false, data: emptyData(), meta: defaultMeta(), today: todayKey(), saveError: null };
const listeners = new Set<() => void>();

function emit() {
  for (const l of listeners) l();
}

export function getState() {
  return state;
}

export function useAppState(): AppState {
  const [, force] = useState(0);
  useEffect(() => {
    const l = () => force((n) => n + 1);
    listeners.add(l);
    return () => listeners.delete(l);
  }, []);
  return state;
}

/* ───────── zapis ───────── */

function mergeInto<T extends { id: string }>(list: T[], recs: T[]): T[] {
  const byId = new Map(recs.map((r) => [r.id, r]));
  const out = list.map((r) => byId.get(r.id) ?? r);
  const existing = new Set(list.map((r) => r.id));
  for (const r of recs) if (!existing.has(r.id)) out.push(r);
  return out;
}

function applyToState(changes: Changes) {
  const data = { ...state.data };
  for (const name of Object.keys(changes) as CollectionName[]) {
    (data as any)[name] = mergeInto(data[name] as any[], changes[name] as any[]);
  }
  state = { ...state, data };
  emit();
}

function commit(changes: Changes) {
  applyToState(changes);
  repo.save(changes).catch(onSaveError);
}

function onSaveError(err: unknown) {
  console.error(err);
  state = { ...state, saveError: 'Nie udało się zapisać ostatniej zmiany na urządzeniu.' };
  emit();
}

function setMeta(meta: Meta) {
  state = { ...state, meta };
  emit();
  repo.setMeta(meta).catch(onSaveError);
}

/* ───────── start i zmiana dnia ───────── */

export async function init(r: Repository) {
  repo = r;
  const { data, meta } = await repo.loadAll();
  state = { ...state, data, meta, today: todayKey(), ready: true };
  runRolloverIfNeeded();
  ensureDefaultCategories();
  ensureDefaultHabits();
  ensureJunkHabit();
  ensureBadHabits();
  emit();
}

/** Wywoływane przy powrocie do aplikacji i co minutę — łapie północ. */
export function checkDayChange() {
  const t = todayKey();
  if (t !== state.today) {
    state = { ...state, today: t };
    emit();
  }
  runRolloverIfNeeded();
}

function runRolloverIfNeeded() {
  const today = state.today;
  if (state.meta.lastRolloverDay === today) return;
  const moved = rollover(state.data.tasks, today, Date.now());
  if (moved.length) commit({ tasks: moved });
  setMeta({ ...state.meta, lastRolloverDay: today, lastRollover: { day: today, moved: moved.length } });
}

export function setPersistenceWarning() {
  state = { ...state, saveError: 'Ta przeglądarka nie pozwala zapisać danych na stałe — zmiany znikną po zamknięciu karty.' };
  emit();
}

export function dismissRolloverNote() {
  setMeta({ ...state.meta, lastRollover: null });
}

/* ───────── zadania ───────── */

function task(id: string): Task {
  const t = state.data.tasks.find((x) => x.id === id);
  if (!t) throw new Error(`Brak zadania ${id}`);
  return t;
}

function patched(t: Task, patch: Partial<Task>, now = Date.now()): Task {
  return { ...t, ...patch, updatedAt: now };
}

/** Zatrzymuje chodzący stoper (jeśli jest) i zwraca zmieniony wpis. */
function stopRunning(now: number, onlyTaskId?: string): TimeEntry[] {
  const run = runningEntry(state.data.timeEntries);
  if (!run || (onlyTaskId && run.taskId !== onlyTaskId)) return [];
  return [{ ...run, endedAt: now, updatedAt: now }];
}

/** Zwraca id nowego zadania (np. do cofnięcia przez asystenta). */
export function addTask(rawTitle: string, date: DayKey, opts: { estimateMin?: number | null } = {}): string | undefined {
  const parsed = parseEstimate(rawTitle);
  if (!parsed.title) return;
  const t = makeTask(parsed.title, date, Date.now(), { estimateMin: opts.estimateMin ?? parsed.estimateMin });
  commit({ tasks: [t] });
  return t.id;
}

export function updateTask(id: string, patch: Partial<Pick<Task, 'title' | 'estimateMin' | 'minimalVersion'>>) {
  commit({ tasks: [patched(task(id), patch)] });
}

export function toggleDone(id: string) {
  const now = Date.now();
  const t = task(id);
  if (t.status === 'done') {
    commit({ tasks: [patched(t, { status: 'todo', closedAt: null, resolution: null }, now)] });
  } else {
    commit({
      tasks: [patched(t, { status: 'done', closedAt: now, resolution: null }, now)],
      timeEntries: stopRunning(now, id),
    });
  }
}

/** „Odpuść” — pełnoprawne zamknięcie zadania jako „nie zrobione”. */
export function letGo(id: string) {
  const now = Date.now();
  commit({
    tasks: [patched(task(id), { status: 'skipped', closedAt: now, resolution: 'let_go' }, now)],
    timeEntries: stopRunning(now, id),
  });
}

export function reopen(id: string) {
  commit({ tasks: [patched(task(id), { status: 'todo', closedAt: null, resolution: null })] });
}

/** Przełóż na konkretny dzień — świadoma decyzja, więc pytanie o rozbicie zaczyna liczyć się od nowa. */
export function reschedule(id: string, date: DayKey) {
  const now = Date.now();
  const t = task(id);
  commit({
    tasks: [patched(t, { date, status: 'todo', closedAt: null, resolution: null, carryBase: carryCount(t), promptSnoozedOn: null }, now)],
    timeEntries: stopRunning(now, id),
  });
}

/** Rozbij: duże zadanie zostaje zamknięte jako „rozbite”, na dziś trafia mniejszy krok. */
export function splitTask(id: string, smallerStep: string) {
  const step = smallerStep.trim();
  if (!step) return;
  const now = Date.now();
  const t = task(id);
  const { title, estimateMin } = parseEstimate(step);
  const child = makeTask(title, state.today, now, { parentId: t.id, order: t.order + 0.5, estimateMin });
  commit({
    tasks: [patched(t, { status: 'skipped', closedAt: now, resolution: 'split' }, now), child],
    timeEntries: stopRunning(now, id),
  });
}

export function snoozePrompt(id: string) {
  commit({ tasks: [patched(task(id), { promptSnoozedOn: state.today })] });
}

export function deleteTask(id: string) {
  const now = Date.now();
  const entries = state.data.timeEntries
    .filter((e) => e.taskId === id && e.deletedAt === null)
    .map((e) => ({ ...e, endedAt: e.endedAt ?? now, deletedAt: now, updatedAt: now }));
  commit({ tasks: [patched(task(id), { deletedAt: now }, now)], timeEntries: entries });
}

/* ───────── stoper i czas ───────── */

export function startTimer(taskId: string) {
  const now = Date.now();
  const t = task(taskId);
  const stopped = stopRunning(now);
  const entry: TimeEntry = {
    id: newId(),
    createdAt: now,
    updatedAt: now,
    deletedAt: null,
    taskId,
    date: state.today,
    startedAt: now,
    endedAt: null,
    source: 'timer',
  };
  const tasks = t.status === 'todo' ? [] : [patched(t, { status: 'todo', closedAt: null, resolution: null }, now)];
  commit({ timeEntries: [...stopped, entry], tasks });
}

export function pauseTimer() {
  const stopped = stopRunning(Date.now());
  if (stopped.length) commit({ timeEntries: stopped });
}

/** Ręczne dopisanie czasu (np. pracy bez stopera). Liczy się do wskazanego dnia. */
export function addManualTime(taskId: string, minutes: number, day: DayKey) {
  if (!(minutes > 0)) return;
  const now = Date.now();
  const endedAt = now;
  commit({
    timeEntries: [
      {
        id: newId(),
        createdAt: now,
        updatedAt: now,
        deletedAt: null,
        taskId,
        date: day,
        startedAt: endedAt - Math.round(minutes * 60_000),
        endedAt,
        source: 'manual',
      },
    ],
  });
}

/** Poprawia długość odcinka czasu (zatrzymuje go, jeśli stoper jeszcze chodzi). */
export function setTimeEntryDuration(id: string, ms: number) {
  const e = state.data.timeEntries.find((x) => x.id === id);
  if (!e) return;
  const next = withDuration(e, ms, Date.now());
  if (next) commit({ timeEntries: [next] });
}

export function deleteTimeEntry(id: string) {
  const now = Date.now();
  const e = state.data.timeEntries.find((x) => x.id === id);
  if (!e) return;
  commit({ timeEntries: [{ ...e, endedAt: e.endedAt ?? now, deletedAt: now, updatedAt: now }] });
}

/** Tylko podgląd: wstawia przykładowe dane. */
export function seedForPreview(tasks: Task[], timeEntries: TimeEntry[]) {
  commit({ tasks, timeEntries });
  state = {
    ...state,
    saveError: 'Podgląd z przykładowymi zadaniami. Dane zostają tylko w tej przeglądarce, a eksport pliku tutaj nie działa.',
  };
  emit();
}

/* ───────── kopia zapasowa ───────── */

export async function replaceAllData(data: Data, meta: Meta) {
  const clean = emptyData();
  for (const c of COLLECTIONS) (clean as any)[c] = Array.isArray((data as any)[c]) ? (data as any)[c] : [];
  // Kopie ze starszych wersji nie mają nowych pól — uzupełniamy je domyślnymi.
  clean.expenses = clean.expenses.map(normalizeExpense);
  clean.categories = clean.categories.map(normalizeCategory);
  clean.habits = clean.habits.map(normalizeHabit);
  clean.habitLogs = clean.habitLogs.map(normalizeHabitLog);
  meta = { ...defaultMeta(), ...meta };
  await repo.replaceAll(clean, meta);
  state = { ...state, data: clean, meta };
  runRolloverIfNeeded();
  // Kopia bez kategorii (np. v1) nie może zostawić aplikacji bez żadnej.
  ensureDefaultCategories();
  // Kopia bez nawyków (np. sprzed modułu) dostaje startowe.
  ensureDefaultHabits();
  ensureJunkHabit();
  ensureBadHabits();
  emit();
}

/* ───────── nawyki ───────── */

export function ensureDefaultHabits() {
  if (state.meta.habitsSeeded) return;
  // Nawyki już są (np. przerwane wcześniejsze zasianie) — tylko dopinamy znacznik.
  if (state.data.habits.length) return setMeta({ ...state.meta, habitsSeeded: true });
  const now = Date.now();
  const base = { createdAt: now, updatedAt: now, deletedAt: null, frequency: { kind: 'daily' } as const, archivedAt: null };
  const habits: Habit[] = [
    { ...base, id: newId(), name: 'Witaminy', kind: 'check', unit: null, order: 0, countsJunk: false },
    { ...base, id: newId(), name: 'Ważenie się', kind: 'measure', unit: 'kg', order: 1, countsJunk: false },
  ];
  commit({ habits });
  setMeta({ ...state.meta, habitsSeeded: true });
}

/** „Bez syfu” jako nawyk do rzucenia: zakładany raz, także dla istniejących danych. */
export function ensureJunkHabit() {
  if (state.meta.junkHabitSeeded) return;
  const now = Date.now();
  const order = state.data.habits.reduce((m, h) => Math.max(m, h.order), -1) + 1;
  const habit: Habit = {
    id: newId(), createdAt: now, updatedAt: now, deletedAt: null, name: 'Bez syfu', kind: 'quit', unit: null,
    frequency: { kind: 'daily' }, order, archivedAt: null, countsJunk: true,
  };
  commit({ habits: [habit] });
  setMeta({ ...state.meta, junkHabitSeeded: true });
}

/** Startowe liczniki złych nawyków: zakładane raz; nazwy, które już są, pomijamy. */
export const BAD_HABITS = ['Prokrastynacja', 'Scrollowanie', 'Ciągłe sprawdzanie MT5'];

export function ensureBadHabits() {
  if (state.meta.badHabitsSeeded) return;
  const now = Date.now();
  let order = state.data.habits.reduce((m, h) => Math.max(m, h.order), -1) + 1;
  const taken = new Set(state.data.habits.filter((h) => h.deletedAt === null).map((h) => h.name.toLowerCase()));
  const habits: Habit[] = BAD_HABITS.filter((n) => !taken.has(n.toLowerCase())).map((name) => ({
    id: newId(), createdAt: now, updatedAt: now, deletedAt: null, name, kind: 'quit', unit: null,
    frequency: { kind: 'daily' }, order: order++, archivedAt: null, countsJunk: false,
  }));
  if (habits.length) commit({ habits });
  setMeta({ ...state.meta, badHabitsSeeded: true });
}

/** Nowy żywy wpis nawyku (nowe id — także po tombstonie). */
function newLog(habitId: string, day: DayKey, value: number | null, now: number): HabitLog {
  return { id: newId(), createdAt: now, updatedAt: now, deletedAt: null, habitId, date: day, value };
}

/** Odhaczenie / odznaczenie nawyku `check` albo wpadki nawyku `quit`. Dla `measure` i nieznanego nawyku — nic. */
export function toggleHabit(habitId: string, day: DayKey) {
  const h = state.data.habits.find((x) => x.id === habitId && x.deletedAt === null);
  if (!h || h.kind === 'measure') return;
  const now = Date.now();
  const existing = logOn(state.data.habitLogs, habitId, day);
  commit({
    habitLogs: [existing ? { ...existing, deletedAt: now, updatedAt: now } : newLog(habitId, day, null, now)],
  });
}

/**
 * Licznik wpadek nawyku `quit`: +1 dopisuje wpadkę w danym dniu, -1 cofa jedną (przy zerze wpis znika).
 * Liczba trzymana w `value` wpisu (null w starszych wpisach = 1).
 */
export function bumpSlip(habitId: string, day: DayKey, delta: 1 | -1) {
  const h = state.data.habits.find((x) => x.id === habitId && x.deletedAt === null);
  if (!h || h.kind !== 'quit') return;
  const now = Date.now();
  const existing = logOn(state.data.habitLogs, habitId, day);
  const count = existing ? (existing.value ?? 1) : 0;
  const next = count + delta;
  if (next < 0) return;
  if (next === 0) {
    if (existing) commit({ habitLogs: [{ ...existing, deletedAt: now, updatedAt: now }] });
    return;
  }
  commit({ habitLogs: [existing ? { ...existing, value: next, updatedAt: now } : newLog(habitId, day, next, now)] });
}

/** Wpis wartości nawyku `measure`: null kasuje (tombstone), liczba nadpisuje lub tworzy wpis. */
export function setMeasure(habitId: string, day: DayKey, value: number | null) {
  const h = state.data.habits.find((x) => x.id === habitId && x.deletedAt === null);
  if (!h || h.kind !== 'measure') return;
  const now = Date.now();
  const existing = logOn(state.data.habitLogs, habitId, day);
  if (value === null) {
    if (existing) commit({ habitLogs: [{ ...existing, deletedAt: now, updatedAt: now }] });
    return;
  }
  // Ta sama wartość drugi raz (np. ✓, a potem blur) — bez zapisu.
  if (existing && existing.value === value) return;
  commit({
    habitLogs: [existing ? { ...existing, value, updatedAt: now } : newLog(habitId, day, value, now)],
  });
}

export function addHabit(input: { name: string; kind: HabitKind; unit: string | null; frequency: HabitFrequency }): string | undefined {
  const name = input.name.trim();
  if (!name) return;
  const now = Date.now();
  const order = state.data.habits.reduce((m, h) => Math.max(m, h.order), -1) + 1;
  const id = newId();
  commit({
    habits: [{ id, createdAt: now, updatedAt: now, deletedAt: null, name, kind: input.kind, unit: input.unit, frequency: input.kind === 'quit' ? { kind: 'daily' } : input.frequency, order, archivedAt: null, countsJunk: false }],
  });
  return id;
}

/** Usuwa nawyk (tombstone) — używane przy cofaniu wpisu asystenta. */
export function deleteHabit(id: string) {
  const h = state.data.habits.find((x) => x.id === id);
  if (!h) return;
  const now = Date.now();
  commit({ habits: [{ ...h, deletedAt: now, updatedAt: now }] });
}

export function updateHabit(id: string, patch: Partial<Pick<Habit, 'name' | 'kind' | 'unit' | 'frequency' | 'order' | 'archivedAt'>>) {
  const h = state.data.habits.find((x) => x.id === id);
  if (!h) throw new Error(`Brak nawyku ${id}`);
  commit({ habits: [{ ...h, ...patch, updatedAt: Date.now() }] });
}

/* ───────── wydatki ───────── */

/** Kształt rekordu kolejki natywnej (Apple Pay przechwycone w tle). */
export type CapturedPayment = { id: string; capturedAt: number; amount: number; currency: string; merchant: string; card: string };

export function ensureDefaultCategories() {
  if (state.meta.expensesSeeded) return;
  // Kategorie już są (np. przerwane wcześniejsze zasianie) — tylko dopinamy znacznik.
  if (state.data.categories.length) return setMeta({ ...state.meta, expensesSeeded: true });
  const now = Date.now();
  const cats: Category[] = DEFAULT_CATEGORIES.map((c, order) => ({
    id: newId(),
    createdAt: now,
    updatedAt: now,
    deletedAt: null,
    name: c.name,
    monthlyLimit: null,
    order,
    archived: false,
    junk: c.junk,
  }));
  commit({ categories: cats });
  setMeta({ ...state.meta, expensesSeeded: true });
}

const normCurrency = (c: string) => c.trim().toUpperCase() || 'PLN';

type Priced = Pick<Expense, 'amount' | 'original'>;

/** Wycenia kwotę w PLN; dla obcej waluty próbuje pobrać kurs, a przy braku zostawia `amount: null`. */
async function price(amount: number, currency: string, day: DayKey, fetchFn?: typeof fetch): Promise<Priced> {
  if (currency === 'PLN') return { amount: Math.round(amount * 100), original: null };
  const original = { amount, currency, rate: null as number | null, rateDate: null as DayKey | null };
  try {
    const r = await fetchNbpRate(currency, day, fetchFn);
    if (r) return { amount: toPLNGrosze(amount, r.rate), original: { ...original, rate: r.rate, rateDate: r.rateDate } };
  } catch {
    /* brak sieci — kurs zostanie pobrany później */
  }
  return { amount: null, original };
}

function newExpense(now: number, fields: Pick<Expense, 'date' | 'categoryId' | 'note' | 'merchant' | 'source' | 'capturedAt'> & Priced & { id?: string }): Expense {
  const { id, ...rest } = fields;
  return { id: id ?? newId(), createdAt: now, updatedAt: now, deletedAt: null, ...rest };
}

/**
 * Importuje płatności z kolejki natywnej. Zwraca id zapisane (lub już istniejące) — tylko te wolno
 * usunąć z kolejki. Czeka na zapis w IndexedDB przed zwróceniem.
 */
export function importCaptured(list: CapturedPayment[]): Promise<string[]> {
  // Wywołania są szeregowane, żeby dwa równoległe importy nie zapisały i nie wyceniły tego samego rekordu.
  const run = importQueue.then(() => doImport(list));
  importQueue = run.then(
    () => undefined,
    () => undefined,
  );
  return run;
}

let importQueue: Promise<void> = Promise.resolve();

async function doImport(list: CapturedPayment[]): Promise<string[]> {
  // Stan w pamięci zmieniamy dopiero po udanym zapisie, więc obecność id w stanie = zapisane w IndexedDB.
  const known = new Set(state.data.expenses.map((e) => e.id));
  const ids: string[] = [];
  const fresh: Expense[] = [];
  for (const p of list) {
    if (!ids.includes(p.id)) ids.push(p.id);
    if (known.has(p.id)) continue;
    known.add(p.id);
    const day = dayKeyOf(p.capturedAt);
    const priced = await price(p.amount, normCurrency(p.currency), day);
    fresh.push(
      newExpense(Date.now(), {
        id: p.id,
        ...priced,
        date: day,
        categoryId: null,
        note: '',
        merchant: p.merchant,
        source: 'applepay',
        capturedAt: p.capturedAt,
      }),
    );
  }
  if (fresh.length) {
    const changes: Changes = { expenses: fresh };
    try {
      await repo.save(changes);
    } catch (err) {
      onSaveError(err);
      throw err;
    }
    applyToState(changes);
  }
  return ids;
}

/** Ponawia pobranie kursu dla wpisów w obcej walucie czekających na przeliczenie. */
export async function resolvePendingRates(fetchFn?: typeof fetch): Promise<void> {
  const pending = state.data.expenses.filter((e) => e.deletedAt === null && e.amount === null && e.original);
  for (const e of pending) {
    const o = e.original!;
    let r;
    try {
      r = await fetchNbpRate(o.currency, e.date, fetchFn);
    } catch {
      continue;
    }
    if (!r) continue;
    // Wpis mógł się zmienić w trakcie pobierania — bierzemy aktualną wersję.
    const cur = state.data.expenses.find((x) => x.id === e.id);
    if (!cur || cur.deletedAt !== null || cur.amount !== null) continue;
    commit({
      expenses: [{ ...cur, amount: toPLNGrosze(o.amount, r.rate), original: { ...o, rate: r.rate, rateDate: r.rateDate }, updatedAt: Date.now() }],
    });
  }
}

export async function addExpense(input: { amount: number; currency: string; categoryId: string | null; note: string; date: DayKey; merchant?: string }): Promise<string> {
  const priced = await price(input.amount, normCurrency(input.currency), input.date);
  const id = newId();
  commit({
    expenses: [
      newExpense(Date.now(), {
        id,
        ...priced,
        date: input.date,
        categoryId: input.categoryId,
        note: input.note,
        merchant: input.merchant ?? '',
        source: 'manual',
        capturedAt: null,
      }),
    ],
  });
  return id;
}

export function categorizeExpense(id: string, categoryId: string, patch?: { note?: string; amount?: number }) {
  const e = state.data.expenses.find((x) => x.id === id);
  if (!e) throw new Error(`Brak wydatku ${id}`);
  const now = Date.now();
  const changes: Changes = { expenses: [{ ...e, ...patch, categoryId, updatedAt: now }] };
  const key = e.merchant ? merchantKey(e.merchant) : '';
  if (key) {
    const rule = state.data.merchantRules.find((r) => r.deletedAt === null && r.merchantKey === key);
    const next: MerchantRule = rule
      ? { ...rule, categoryId, updatedAt: now }
      : { id: newId(), createdAt: now, updatedAt: now, deletedAt: null, merchantKey: key, categoryId };
    changes.merchantRules = [next];
  }
  commit(changes);
}

/** Notatka wydatku zapisywana od razu (bez wybierania kategorii). */
export function updateExpenseNote(id: string, note: string) {
  const e = state.data.expenses.find((x) => x.id === id);
  if (!e || e.note === note) return;
  commit({ expenses: [{ ...e, note, updatedAt: Date.now() }] });
}

export function deleteExpense(id: string) {
  const e = state.data.expenses.find((x) => x.id === id);
  if (!e) return;
  const now = Date.now();
  commit({ expenses: [{ ...e, deletedAt: now, updatedAt: now }] });
}

export function addCategory(name: string, junk: boolean) {
  const clean = name.trim();
  if (!clean) return;
  const now = Date.now();
  const order = state.data.categories.reduce((m, c) => Math.max(m, c.order), -1) + 1;
  commit({
    categories: [{ id: newId(), createdAt: now, updatedAt: now, deletedAt: null, name: clean, monthlyLimit: null, order, archived: false, junk }],
  });
}

export function updateCategory(id: string, patch: Partial<Pick<Category, 'name' | 'monthlyLimit' | 'junk' | 'order' | 'archived'>>) {
  const c = state.data.categories.find((x) => x.id === id);
  if (!c) throw new Error(`Brak kategorii ${id}`);
  commit({ categories: [{ ...c, ...patch, updatedAt: Date.now() }] });
}
