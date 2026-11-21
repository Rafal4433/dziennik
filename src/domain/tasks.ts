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

/** Rozkład czasu pracy jednego dnia: same liczby do podsumowania. */
export interface DayTime {
  /** Cały czas zapisany na ten dzień. */
  total: number;
  /** Czas tego dnia przy zadaniach zrobionych. */
  onDone: number;
  /** Czas tego dnia przy wszystkim innym (niedokończone, odpuszczone, przeniesione). */
  onOther: number;
  /** Liczba odcinków pracy (startów stopera i wpisów ręcznych). */
  sessions: number;
  /** Najwcześniejszy start i najpóźniejszy koniec (chodzący stoper liczy się do `now`). */
  span: { from: number; to: number } | null;
  /** Szacunek kontra całkowity czas zrobionych zadań, które miały szacunek. */
  estimate: { count: number; plannedMs: number; actualMs: number } | null;
}

export function dayTime(entries: TimeEntry[], tasks: Task[], day: DayKey, now: number): DayTime {
  const doneIds = new Set(tasks.filter((t) => t.status === 'done').map((t) => t.id));
  let total = 0;
  let onDone = 0;
  let sessions = 0;
  let from = Infinity;
  let to = -Infinity;
  for (const e of entries) {
    if (e.date !== day || e.deletedAt !== null) continue;
    const d = entryDuration(e, now);
    total += d;
    if (doneIds.has(e.taskId)) onDone += d;
    sessions++;
    from = Math.min(from, e.startedAt);
    to = Math.max(to, e.endedAt ?? now);
  }

  let count = 0;
  let plannedMs = 0;
  let actualMs = 0;
  for (const t of tasks) {
    if (t.status !== 'done' || t.estimateMin === null) continue;
    count++;
    plannedMs += t.estimateMin * 60_000;
    actualMs += timeForTask(entries, t.id, now);
  }

  return {
    total,
    onDone,
    onOther: total - onDone,
    sessions,
    span: sessions > 0 ? { from, to } : null,
    estimate: count > 0 ? { count, plannedMs, actualMs } : null,
  };
}

/**
 * Poprawka długości odcinka (np. stoper zostawiony na noc): koniec = start + `ms`.
 * Chodzący stoper zostaje przy tym zatrzymany. Koniec nie może wypaść w przyszłości.
 * Zwraca null, gdy długość jest niepoprawna albo nic się nie zmienia.
 */
export function withDuration(e: TimeEntry, ms: number, now: number): TimeEntry | null {
  if (!Number.isFinite(ms) || ms <= 0 || e.deletedAt !== null) return null;
  const endedAt = Math.min(e.startedAt + Math.round(ms), now);
  if (endedAt <= e.startedAt || endedAt === e.endedAt) return null;
  return { ...e, endedAt, updatedAt: now };
}
