import { useEffect, useState } from 'preact/hooks';
import { defaultMeta, type Changes, type Repository } from './db';
import { COLLECTIONS, emptyData, type CollectionName, type Data, type DayKey, type Meta, type Task, type TimeEntry } from './model';
import { todayKey } from '../lib/date';
import { newId } from '../lib/id';
import { carryCount, makeTask, parseEstimate, rollover, runningEntry } from '../domain/tasks';

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

function commit(changes: Changes) {
  const data = { ...state.data };
  for (const name of Object.keys(changes) as CollectionName[]) {
    (data as any)[name] = mergeInto(data[name] as any[], changes[name] as any[]);
  }
  state = { ...state, data };
  emit();
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

export function addTask(rawTitle: string, date: DayKey) {
  const { title, estimateMin } = parseEstimate(rawTitle);
  if (!title) return;
  commit({ tasks: [makeTask(title, date, Date.now(), { estimateMin })] });
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
  await repo.replaceAll(clean, meta);
  state = { ...state, data: clean, meta };
  runRolloverIfNeeded();
  emit();
}
