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
      <dl class="summary-tiles">
        <div class="stat-tile">
          <dt>zrobione</dt>
          <dd class="num">{done.length}</dd>
        </div>
        <div class="stat-tile">
          <dt>czas pracy</dt>
          <dd class="num">{formatHM(worked)}</dd>
        </div>
        <div class="stat-tile">
          <dt>{day === today ? 'na jutro' : 'dalej'}</dt>
          <dd class="num">{goingOn.length}</dd>
        </div>
      </dl>

      {done.length > 0 && (
        <>
          <h3 class="group-title">Zrobione</h3>
          <ul class="group">
            {done.map((t) => (
              <li class="group-row" key={t.id}>
                <span class="group-mark is-done" aria-hidden="true" />
                <span class="group-text">{t.title}</span>
                <span class="group-side num">{formatHM(timeForTask(entries, t.id, now))}</span>
              </li>
            ))}
          </ul>
        </>
      )}

      {letGo.length > 0 && (
        <>
          <h3 class="group-title">Odpuszczone lub rozbite</h3>
          <ul class="group">
            {letGo.map((t) => (
              <li class="group-row" key={t.id}>
                <span class="group-mark is-skipped" aria-hidden="true" />
                <span class="group-text">{t.title}</span>
              </li>
            ))}
          </ul>
        </>
      )}

      {goingOn.length > 0 && (
        <>
          <h3 class="group-title">{day === today ? 'Przechodzi na jutro' : 'Przeszło dalej'}</h3>
          <ul class="group">
            {goingOn.map((t) => (
              <li class="group-row" key={t.id}>
                <span class="group-mark" aria-hidden="true" />
                <span class="group-text">{t.title}</span>
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
}
