import { useState } from 'preact/hooks';
import type { DayKey } from '../../data/model';
import { dismissRolloverNote, useAppState } from '../../data/store';
import { isLive, runningEntry, sortTasks, timeForDay } from '../../domain/tasks';
import { addDays, formatDayLong, hourOf, relativeDayName } from '../../lib/date';
import { formatHM, formatPLN, plural } from '../../lib/format';
import { useNow, useSwipe } from '../../lib/hooks';
import { TaskRow } from '../components/TaskRow';
import { AddTask } from '../components/AddTask';
import { DaySummary } from '../components/DaySummary';
import { AddExpense } from '../components/AddExpense';
import { ExpenseRow } from '../components/ExpenseRow';
import { ExpiryNote } from '../components/ExpiryNote';
import { inRange, junkTodayLine, pendingExpenses, pickableCategories, totals } from '../../domain/expenses';

/** Wieczorne podsumowanie pokazuje się samo od tej godziny. */
const EVENING_HOUR = 20;

interface Props {
  day: DayKey;
  setDay: (d: DayKey) => void;
  goToExpenses: () => void;
}

export function TodayScreen({ day, setDay, goToExpenses }: Props) {
  const s = useAppState();
  const { today } = s;
  const { tasks: allTasks, timeEntries } = s.data;
  const [expanded, setExpanded] = useState<string | null>(null);
  const [summaryOpen, setSummaryOpen] = useState(false);

  const running = runningEntry(timeEntries);
  const now = useNow(!!running, 15_000);
  const tasks = allTasks.filter((t) => isLive(t) && t.date === day).sort(sortTasks);
  const carriedAway = day < today ? allTasks.filter((t) => isLive(t) && t.carriedFrom.includes(day)) : [];
  const doneCount = tasks.filter((t) => t.status === 'done').length;
  const worked = timeForDay(timeEntries, day, now);

  const rel = relativeDayName(day, today);
  const isToday = day === today;
  const isPast = day < today;
  const showSummary = isPast || (isToday && (summaryOpen || hourOf(now) >= EVENING_HOUR));
  const rolloverNote = isToday && s.meta.lastRollover?.day === today && s.meta.lastRollover.moved > 0 ? s.meta.lastRollover.moved : 0;

  const { expenses, categories: allCategories } = s.data;
  const dayRange = { start: day, end: day };
  const dayExpenses = expenses.filter((e) => isLive(e) && inRange(e, dayRange));
  const spent = totals(expenses, allCategories, dayRange).total;
  const pendingCount = pendingExpenses(expenses).length;
  const junkLine = isToday ? junkTodayLine(expenses, allCategories, today) : null;
  const [openExpense, setOpenExpense] = useState<string | null>(null);

  const swipe = useSwipe(
    () => setDay(addDays(day, 1)),
    () => setDay(addDays(day, -1)),
  );

  return (
    <main class="screen" {...swipe}>
      <header class="page-head">
        <div class="page-head-row">
          <span class="eyebrow">{rel ?? (isPast ? 'Wcześniej' : 'Później')}</span>
          <nav class="day-nav" aria-label="Zmiana dnia">
            <button class="day-step" onClick={() => setDay(addDays(day, -1))} aria-label="Poprzedni dzień">‹</button>
            {!isToday && (
              <button class="btn-text" onClick={() => setDay(today)}>dziś</button>
            )}
            <button class="day-step" onClick={() => setDay(addDays(day, 1))} aria-label="Następny dzień">›</button>
          </nav>
        </div>
        <h1 class="page-title">{capitalize(formatDayLong(day))}</h1>
      </header>

      {isToday && <ExpiryNote now={now} />}

      {rolloverNote > 0 && (
        <p class="note">
          Z poprzedniego dnia {plural(rolloverNote, 'przeszło', 'przeszły', 'przeszło')} {rolloverNote}{' '}
          {plural(rolloverNote, 'zadanie', 'zadania', 'zadań')}.{' '}
          <button class="btn-text" onClick={dismissRolloverNote}>W porządku</button>
        </p>
      )}

      <section class="section">
        <header class="section-head">
          <h2>Zadania</h2>
          <span class="section-stat num">
            {tasks.length > 0 && `${doneCount}/${tasks.length}`}
            {worked > 0 && ` · ${formatHM(worked)}`}
          </span>
        </header>
        {tasks.length === 0 && (
          <p class="empty">{isPast ? 'Tego dnia nie było zapisanych zadań.' : 'Pusta strona.'}</p>
        )}
        <ul class="task-list">
          {tasks.map((t) => (
            <TaskRow
              key={t.id}
              task={t}
              entries={timeEntries}
              runningTaskId={running?.taskId ?? null}
              today={today}
              viewDay={day}
              expanded={expanded === t.id}
              onToggleExpand={() => setExpanded(expanded === t.id ? null : t.id)}
            />
          ))}
        </ul>
        <AddTask date={day} placeholder={isToday ? 'Dodaj zadanie' : `Dodaj zadanie na ${rel?.toLowerCase() ?? 'ten dzień'}`} />
      </section>

      {!isPast && (
        <>
          <section class="section">
            <header class="section-head">
              <h2>Nawyki</h2>
            </header>
            <p class="empty">Ten moduł powstanie w kolejnym kroku.</p>
          </section>

        </>
      )}

      <section class="section">
        <header class="section-head">
          <h2>Wydatki</h2>
          <span class="section-stat num">{formatPLN(spent)}</span>
        </header>
        {!isPast && pendingCount > 0 && (
          <p class="note">
            Do uzupełnienia: {pendingCount}{' '}
            <button class="btn-text" onClick={goToExpenses}>Uzupełnij</button>
          </p>
        )}
        {junkLine && <p class="note">{junkLine}</p>}
        {dayExpenses.length === 0 ? (
          <p class="empty">{isToday ? 'Dziś bez wydatków.' : 'Tego dnia nie zapisano wydatków.'}</p>
        ) : (
          <ul class="plain-list">
            {dayExpenses.map((e) => (
              <ExpenseRow
                key={e.id}
                expense={e}
                allCategories={allCategories}
                categories={pickableCategories(allCategories)}
                expanded={openExpense === e.id}
                onToggle={() => setOpenExpense(openExpense === e.id ? null : e.id)}
              />
            ))}
          </ul>
        )}
        {!isPast && <AddExpense compact date={day} />}
      </section>

      {showSummary ? (
        <DaySummary day={day} today={today} tasks={tasks} carriedAway={carriedAway} entries={timeEntries} now={now} />
      ) : (
        isToday && (
          <div class="section-foot">
            <button class="btn-text" onClick={() => setSummaryOpen(true)}>Podsumuj dzień</button>
          </div>
        )
      )}
    </main>
  );
}

function capitalize(s: string) {
  return s.charAt(0).toUpperCase() + s.slice(1);
}
