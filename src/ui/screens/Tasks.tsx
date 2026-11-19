import { useState } from 'preact/hooks';
import type { DayKey, Task } from '../../data/model';
import { useAppState } from '../../data/store';
import { carryCount, isLive, needsDecision, sortTasks, timeForDay } from '../../domain/tasks';
import { addDays, formatDayShort, relativeDayName } from '../../lib/date';
import { formatHM, formatMinutes } from '../../lib/format';
import { AddTask } from '../components/AddTask';

/** Przegląd: co czeka na decyzję, co zaplanowane na kolejne dni, jak wyglądały ostatnie dni. */
export function TasksScreen({ openDay }: { openDay: (d: DayKey) => void }) {
  const s = useAppState();
  const { today } = s;
  const live = s.data.tasks.filter(isLive);
  const [planDay, setPlanDay] = useState(addDays(today, 1));

  const toDecide = live.filter((t) => needsDecision(t, today));
  const upcoming = groupByDay(live.filter((t) => t.date > today && t.status === 'todo'));
  const now = Date.now();
  const recent = Array.from({ length: 7 }, (_, i) => addDays(today, -1 - i)).map((d) => {
    const dayTasks = live.filter((t) => t.date === d);
    return {
      day: d,
      done: dayTasks.filter((t) => t.status === 'done').length,
      carried: live.filter((t) => t.carriedFrom.includes(d)).length,
      time: timeForDay(s.data.timeEntries, d, now),
    };
  });

  const label = (d: DayKey) => relativeDayName(d, today) ?? formatDayShort(d);

  return (
    <main class="screen">
      <header class="page-head">
        <h1 class="page-title">Zadania</h1>
      </header>

      {toDecide.length > 0 && (
        <section class="section">
          <header class="section-head">
            <h2>Czekają na decyzję</h2>
          </header>
          <ul class="plain-list">
            {toDecide.map((t) => (
              <li key={t.id}>
                <button class="list-link" onClick={() => openDay(today)}>
                  <span>{t.title}</span>
                  <span class="num muted">{carryCount(t)}×</span>
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section class="section">
        <header class="section-head">
          <h2>Zaplanuj na inny dzień</h2>
        </header>
        <div class="plan-row">
          <input
            type="date"
            value={planDay}
            min={addDays(today, 1)}
            onInput={(e) => e.currentTarget.value && setPlanDay(e.currentTarget.value)}
            aria-label="Dzień"
          />
          <span class="muted">{label(planDay)}</span>
        </div>
        <AddTask date={planDay} placeholder="Dodaj zadanie" />
      </section>

      <section class="section">
        <header class="section-head">
          <h2>Nadchodzące</h2>
        </header>
        {upcoming.length === 0 && <p class="empty">Nic jeszcze nie zaplanowano na kolejne dni.</p>}
        {upcoming.map(([day, tasks]) => (
          <div class="day-group" key={day}>
            <button class="day-group-head" onClick={() => openDay(day)}>
              <span>{label(day)}</span>
              <span class="num muted">{tasks.length}</span>
            </button>
            <ul class="plain-list">
              {tasks.map((t) => (
                <li key={t.id} class="plain-item">
                  <span>{t.title}</span>
                  {t.estimateMin && <span class="num muted">{formatMinutes(t.estimateMin)}</span>}
                </li>
              ))}
            </ul>
          </div>
        ))}
      </section>

      <section class="section">
        <header class="section-head">
          <h2>Ostatnie dni</h2>
        </header>
        <table class="ledger-table">
          <thead>
            <tr>
              <th>Dzień</th>
              <th class="r">Zrobione</th>
              <th class="r">Dalej</th>
              <th class="r">Czas</th>
            </tr>
          </thead>
          <tbody>
            {recent.map((r) => (
              <tr key={r.day} onClick={() => openDay(r.day)}>
                <td>{label(r.day)}</td>
                <td class="r num">{r.done}</td>
                <td class="r num">{r.carried}</td>
                <td class="r num">{formatHM(r.time)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </main>
  );
}

function groupByDay(tasks: Task[]): [DayKey, Task[]][] {
  const map = new Map<DayKey, Task[]>();
  for (const t of [...tasks].sort(sortTasks)) {
    if (!map.has(t.date)) map.set(t.date, []);
    map.get(t.date)!.push(t);
  }
  return [...map.entries()].sort(([a], [b]) => a.localeCompare(b));
}
