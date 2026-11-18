/**
 * Model danych aplikacji Dziennik.
 *
 * Zasady wspólne dla wszystkich encji (przygotowanie pod przyszłą synchronizację, np. Supabase):
 *  - `id` to UUID generowany na urządzeniu — rekord ma tożsamość, zanim trafi na serwer.
 *  - `updatedAt` zmienia się przy każdym zapisie — wystarczy do synchronizacji „last write wins”.
 *  - Usunięcie to `deletedAt` (tombstone), a nie fizyczne skasowanie — usunięcie też da się zsynchronizować.
 *  - Kwoty pieniężne w groszach (liczby całkowite), czasy jako znaczniki epoki w ms.
 *  - Dni jako `DayKey` ('YYYY-MM-DD') liczone w strefie Europe/Warsaw.
 */

/** Dzień kalendarzowy w strefie Europe/Warsaw, format 'YYYY-MM-DD'. */
export type DayKey = string;

export interface BaseRecord {
  id: string;
  createdAt: number;
  updatedAt: number;
  deletedAt: number | null;
}

/* ───────────── Zadania ───────────── */

/** todo = do zrobienia, done = zrobione, skipped = nie zrobione (świadomie odpuszczone). */
export type TaskStatus = 'todo' | 'done' | 'skipped';

export interface Task extends BaseRecord {
  title: string;
  /** Dzień, na który zadanie jest aktualnie zaplanowane. */
  date: DayKey;
  /** Dzień, na który zadanie zaplanowano pierwotnie. */
  originalDate: DayKey;
  status: TaskStatus;
  /** Szacunek czasu w minutach (opcjonalny). */
  estimateMin: number | null;
  /** „Najmniejsza wersja” — jak wygląda wersja wystarczająco dobra. */
  minimalVersion: string;
  /** Dni, z których zadanie automatycznie przeszło dalej. Licznik przeniesień = długość tablicy. */
  carriedFrom: DayKey[];
  /** Liczba przeniesień w chwili ostatniej decyzji (rozbij / przełóż). Pytanie wraca po kolejnych 3. */
  carryBase: number;
  /** Dzień, w którym pytanie o decyzję odłożono („nie teraz”). */
  promptSnoozedOn: DayKey | null;
  /** Kiedy zadanie zmieniło status na done/skipped. */
  closedAt: number | null;
  /** Jak zamknięto zadanie inaczej niż „zrobione”. */
  resolution: 'let_go' | 'split' | null;
  /** Zadanie, z którego to zostało wydzielone jako mniejszy krok. */
  parentId: string | null;
  /** Kolejność na liście dnia (rosnąco). */
  order: number;
}

/** Odcinek pracy nad zadaniem. Pauza = zamknięcie odcinka, wznowienie = nowy odcinek. */
export interface TimeEntry extends BaseRecord {
  taskId: string;
  /** Dzień, do którego liczy się czas pracy. */
  date: DayKey;
  startedAt: number;
  /** null = stoper właśnie chodzi. */
  endedAt: number | null;
  source: 'timer' | 'manual';
}

/* ───────────── Wydatki (kolejny krok) ───────────── */

export interface Category extends BaseRecord {
  name: string;
  /** Miesięczny limit w groszach (opcjonalny). */
  monthlyLimit: number | null;
  order: number;
  archived: boolean;
}

export interface Expense extends BaseRecord {
  /** Kwota w groszach. */
  amount: number;
  categoryId: string;
  note: string;
  date: DayKey;
}

/* ───────────── Nawyki (kolejny krok) ───────────── */

export type HabitFrequency =
  | { kind: 'daily' }
  | { kind: 'timesPerWeek'; times: number }
  /** 1 = poniedziałek … 7 = niedziela */
  | { kind: 'weekdays'; days: number[] };

export interface Habit extends BaseRecord {
  name: string;
  frequency: HabitFrequency;
  order: number;
  archivedAt: number | null;
}

/** Jedno odhaczenie nawyku w danym dniu. */
export interface HabitLog extends BaseRecord {
  habitId: string;
  date: DayKey;
}

/* ───────────── Przegląd tygodnia (kolejny krok) ───────────── */

export interface WeeklyReview extends BaseRecord {
  /** Poniedziałek tygodnia, którego dotyczy przegląd. */
  weekStart: DayKey;
  wentWell: string;
  blockers: string;
  experiment: string;
}

/* ───────────── Kolekcje ───────────── */

export interface Collections {
  tasks: Task;
  timeEntries: TimeEntry;
  categories: Category;
  expenses: Expense;
  habits: Habit;
  habitLogs: HabitLog;
  weeklyReviews: WeeklyReview;
}

export type CollectionName = keyof Collections;

export const COLLECTIONS: CollectionName[] = [
  'tasks',
  'timeEntries',
  'categories',
  'expenses',
  'habits',
  'habitLogs',
  'weeklyReviews',
];

export type Data = { [K in CollectionName]: Collections[K][] };

/** Stan techniczny aplikacji (nie jest danymi użytkownika do synchronizacji). */
export interface Meta {
  /** Ostatni dzień, dla którego wykonano rollover. */
  lastRolloverDay: DayKey | null;
  /** Wynik ostatniego rolloveru — do spokojnej informacji na ekranie DZIŚ. */
  lastRollover: { day: DayKey; moved: number } | null;
}

export const emptyData = (): Data => ({
  tasks: [],
  timeEntries: [],
  categories: [],
  expenses: [],
  habits: [],
  habitLogs: [],
  weeklyReviews: [],
});
