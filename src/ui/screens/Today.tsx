import { useState } from 'preact/hooks';
import type { DayKey } from '../../data/model';
import { dismissRolloverNote, useAppState } from '../../data/store';
import { isLive, runningEntry, sortTasks, timeForDay } from '../../domain/tasks';
import { addDays, formatDayLong, hourOf, relativeDayName } from '../../lib/date';
import { WeekStrip } from '../components/WeekStrip';
import { formatHM, formatPLN, plural } from '../../lib/format';
import { useNow, useSwipe } from '../../lib/hooks';
import { TaskRow } from '../components/TaskRow';
import { AddTask } from '../components/AddTask';
import { DaySummary } from '../components/DaySummary';
import { AddExpense } from '../components/AddExpense';
import { ExpenseRow } from '../components/ExpenseRow';
import { ExpiryNote } from '../components/ExpiryNote';
import { HabitRow, QuitRow } from '../components/HabitRow';
import { activeHabits, isDue, logOn } from '../../domain/habits';
import { inRange, pendingExpenses, pickableCategories, totals } from '../../domain/expenses';

/** Wieczorne podsumowanie pokazuje się samo od tej godziny. */
const EVENING_HOUR = 20;

interface Props {
  day: DayKey;
  setDay: (d: DayKey) => void;
  goToExpenses: () => void;
  openSettings: () => void;
}

export function TodayScreen({ day, setDay, goToExpenses, openSettings }: Props) {
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
  const isFuture = day > today;
  const showSummary = isPast || (isToday && (summaryOpen || hourOf(now) >= EVENING_HOUR));
  const rolloverNote = isToday && s.meta.lastRollover?.day === today && s.meta.lastRollover.moved > 0 ? s.meta.lastRollover.moved : 0;

  const { expenses, categories: allCategories } = s.data;
  const dayRange = { start: day, end: day };
  const dayExpenses = expenses.filter((e) => isLive(e) && inRange(e, dayRange));
  const spent = totals(expenses, allCategories, dayRange).total;
  const pendingCount = pendingExpenses(expenses).length;
  const [openExpense, setOpenExpense] = useState<string | null>(null);
  /** Formularz wydatku jest zwinięty do jednego wiersza, jak „Dodaj zadanie”. */
  const [addingExpense, setAddingExpense] = useState(false);

  const { habits, habitLogs } = s.data;
  const liveHabits = activeHabits(habits);
  const dueHabits = liveHabits.filter((h) => h.kind !== 'quit' && isDue(h, habitLogs, day));
  const quitHabits = liveHabits.filter((h) => h.kind === 'quit');
  const habitsDone = dueHabits.filter((h) => logOn(habitLogs, h.id, day)).length;

  const swipe = useSwipe(
    () => setDay(addDays(day, 1)),
    () => setDay(addDays(day, -1)),
  );

  // „Dziś” + „czwartek, 19 listopada”; dalsze dni: „Poniedziałek” + „10 listopada”.
  const [weekday, dayMonth] = formatDayLong(day).split(', ');
  const title = rel ?? capitalize(weekday);
  const subtitle = rel ? formatDayLong(day) : dayMonth;

  return (
    <main class="screen" {...swipe}>
      <header class="page-head">
        <div class="page-head-row">
          <h1 class="page-title">{title}</h1>
          <span class="head-actions">
            {!isToday && (
              <button class="pill" onClick={() => setDay(today)}>Wróć do dziś</button>
            )}
            <button class="round-btn" onClick={openSettings} aria-label="Ustawienia">
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                <circle cx="12" cy="12" r="3" />
                <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09a1.65 1.65 0 0 0-1.08-1.51 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09a1.65 1.65 0 0 0 1.51-1.08 1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
              </svg>
            </button>
          </span>
        </div>
        <p class="page-sub">{subtitle}</p>
        <WeekStrip day={day} today={today} tasks={allTasks.filter(isLive)} onPick={setDay} />
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
            {worked > 0 && <span aria-label={`Czas pracy ${formatHM(worked)}`}>{formatHM(worked)}</span>}
            {tasks.length > 0 && <span aria-label={`Zrobione ${doneCount} z ${tasks.length}`}>{doneCount}/{tasks.length}</span>}
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

      {!isFuture && (
        <section class="section">
          <header class="section-head">
            <h2>Nawyki</h2>
            <span class="section-stat num">{dueHabits.length > 0 && `${habitsDone}/${dueHabits.length}`}</span>
          </header>
          {dueHabits.length === 0 && quitHabits.length === 0 ? (
            <p class="empty">
              {liveHabits.length === 0 ? 'Brak nawyków — dodasz je na karcie Nawyki.' : isToday ? 'Na dziś nic zaplanowanego.' : 'Tego dnia nic nie było zaplanowane.'}
            </p>
          ) : (
            <ul class="plain-list">
              {dueHabits.map((h) => (
                <HabitRow key={`${h.id}:${day}`} habit={h} logs={habitLogs} day={day} today={today} />
              ))}
              {quitHabits.map((h) => (
                <QuitRow key={`${h.id}:${day}`} habit={h} logs={habitLogs} expenses={expenses} categories={allCategories} day={day} />
              ))}
            </ul>
          )}
        </section>
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
        {!isPast &&
          (addingExpense ? (
            <AddExpense key={day} compact date={day} autoFocus onClose={() => setAddingExpense(false)} />
          ) : (
            <button class="add-row" onClick={() => setAddingExpense(true)}>
              <span class="add-mark" aria-hidden="true">+</span>
              <span class="add-row-label">Dodaj wydatek</span>
            </button>
          ))}
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
