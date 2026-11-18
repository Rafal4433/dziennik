import type { DayKey, Task, TimeEntry } from '../data/model';
import { newId } from '../lib/id';

/** Po tylu automatycznych przeniesieniach aplikacja pyta o decyzję. */
export const CARRY_PROMPT_THRESHOLD = 3;

export const isLive = <T extends { deletedAt: number | null }>(r: T) => r.deletedAt === null;

export function carryCount(t: Task): number {
  return t.carriedFrom.length;
}

export function makeTask(title: string, date: DayKey, now: number, extra: Partial<Task> = {}): Task {
  return {
    id: newId(),
    createdAt: now,
    updatedAt: now,
    deletedAt: null,
    title,
    date,
    originalDate: date,
    status: 'todo',
    estimateMin: null,
    minimalVersion: '',
    carriedFrom: [],
    carryBase: 0,
    promptSnoozedOn: null,
    closedAt: null,
    resolution: null,
    parentId: null,
    order: now,
    ...extra,
  };
}

/**
 * Rollover: każde zadanie „do zrobienia” z dnia wcześniejszego niż `today`
 * przechodzi na `today`. Jedno przeniesienie na każde uruchomienie w nowym dniu
 * (dni, w których aplikacja nie była otwierana, nie podbijają licznika).
 * Zwraca tylko zmienione rekordy.
 */
export function rollover(tasks: Task[], today: DayKey, now: number): Task[] {
  const moved: Task[] = [];
  for (const t of tasks) {
    if (t.deletedAt !== null || t.status !== 'todo' || t.date >= today) continue;
    moved.push({ ...t, date: today, carriedFrom: [...t.carriedFrom, t.date], updatedAt: now });
  }
  return moved;
}

/** Czy przy zadaniu pokazać spokojne pytanie: rozbić / przełożyć / odpuścić? */
export function needsDecision(t: Task, today: DayKey): boolean {
  return (
    t.status === 'todo' &&
    t.date === today &&
    carryCount(t) - t.carryBase >= CARRY_PROMPT_THRESHOLD &&
    t.promptSnoozedOn !== today
  );
}

export function entryDuration(e: TimeEntry, now: number): number {
  return (e.endedAt ?? now) - e.startedAt;
}

export function timeForTask(entries: TimeEntry[], taskId: string, now: number): number {
  let sum = 0;
  for (const e of entries) if (e.taskId === taskId && e.deletedAt === null) sum += entryDuration(e, now);
  return sum;
}

export function timeForDay(entries: TimeEntry[], day: DayKey, now: number): number {
  let sum = 0;
  for (const e of entries) if (e.date === day && e.deletedAt === null) sum += entryDuration(e, now);
  return sum;
}

export function runningEntry(entries: TimeEntry[]): TimeEntry | undefined {
  return entries.find((e) => e.endedAt === null && e.deletedAt === null);
}

/**
 * Szacunek wpisany na końcu tytułu: „Napisać raport ~30”, „~45m”, „~1h”, „~1h30”, „~1,5h”.
 * Zwraca tytuł bez szacunku i minuty (albo null).
 */
export function parseEstimate(input: string): { title: string; estimateMin: number | null } {
  const m = input.match(/\s*~\s*(\d+(?:[.,]\d+)?)\s*(h|godz|m|min)?\s*(\d+)?\s*(?:m|min)?\s*$/i);
  if (!m) return { title: input.trim(), estimateMin: null };
  const num = parseFloat(m[1].replace(',', '.'));
  const unit = (m[2] ?? '').toLowerCase();
  let minutes = unit === 'h' || unit === 'godz' ? num * 60 + (m[3] ? Number(m[3]) : 0) : num;
  minutes = Math.round(minutes);
  const title = input.slice(0, m.index).trim();
  if (!title || minutes <= 0) return { title: input.trim(), estimateMin: null };
  return { title, estimateMin: minutes };
}

export function sortTasks(a: Task, b: Task): number {
  return a.order - b.order;
}
