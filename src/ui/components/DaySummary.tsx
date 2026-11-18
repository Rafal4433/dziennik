import type { DayKey, Task, TimeEntry } from '../../data/model';
import { timeForDay, timeForTask } from '../../domain/tasks';
import { formatHM } from '../../lib/format';

interface Props {
  day: DayKey;
  today: DayKey;
  tasks: Task[];
  /** Zadania, które z tego (minionego) dnia przeszły dalej. */
  carriedAway: Task[];
  entries: TimeEntry[];
  now: number;
}

/** Podsumowanie dnia: same fakty, bez oceny. */
export function DaySummary({ day, today, tasks, carriedAway, entries, now }: Props) {
  const done = tasks.filter((t) => t.status === 'done');
  const letGo = tasks.filter((t) => t.status === 'skipped');
  const stillOpen = tasks.filter((t) => t.status === 'todo');
  const goingOn = day === today ? stillOpen : [...carriedAway, ...stillOpen];
  const worked = timeForDay(entries, day, now);

  return (
    <section class="section summary">
      <header class="section-head">
        <h2>Podsumowanie dnia</h2>
      </header>
      <dl class="ledger">
        <div class="ledger-row">
          <dt>Zrobione</dt>
          <dd class="num">{done.length}</dd>
        </div>
        {done.map((t) => (
          <div class="ledger-sub" key={t.id}>
            <dt>{t.title}</dt>
            <dd class="num">{formatHM(timeForTask(entries, t.id, now))}</dd>
          </div>
        ))}
        <div class="ledger-row">
          <dt>Czas pracy</dt>
          <dd class="num">{formatHM(worked)}</dd>
        </div>
        {letGo.length > 0 && (
          <div class="ledger-row">
            <dt>Odpuszczone lub rozbite</dt>
            <dd class="num">{letGo.length}</dd>
          </div>
        )}
        <div class="ledger-row">
          <dt>{day === today ? 'Przechodzi na jutro' : 'Przeszło dalej'}</dt>
          <dd class="num">{goingOn.length}</dd>
        </div>
        {goingOn.map((t) => (
          <div class="ledger-sub" key={t.id}>
            <dt>{t.title}</dt>
            <dd />
          </div>
        ))}
      </dl>
    </section>
  );
}
