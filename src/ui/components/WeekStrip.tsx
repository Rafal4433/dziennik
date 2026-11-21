import type { DayKey, Task } from '../../data/model';
import { addDays, formatDayLong, weekStart } from '../../lib/date';
import { useSwipe } from '../../lib/hooks';

const LETTERS = ['pn', 'wt', 'śr', 'cz', 'pt', 'sb', 'nd'];

interface Props {
  /** Oglądany dzień — jego tydzień (pn–nd) jest pokazany. */
  day: DayKey;
  today: DayKey;
  /** Żywe zadania — kropka pod dniem: szara = coś otwarte, atrament = wszystko zamknięte. */
  tasks: Task[];
  onPick: (d: DayKey) => void;
}

/** Tydzień nad listą „Dziś”: stuknięcie wybiera dzień, przesunięcie paska zmienia tydzień. */
export function WeekStrip({ day, today, tasks, onPick }: Props) {
  const start = weekStart(day);
  const days = Array.from({ length: 7 }, (_, i) => addDays(start, i));
  // Własny gest (tydzień), więc pasek jest wyłączony z gestu całego ekranu (dzień) przez data-noswipe.
  const swipe = useSwipe(
    () => onPick(addDays(day, 7)),
    () => onPick(addDays(day, -7)),
    'input',
  );

  return (
    <div class="week" role="group" aria-label="Tydzień" data-noswipe {...swipe}>
      {days.map((d, i) => {
        const own = tasks.filter((t) => t.date === d);
        const dot = own.some((t) => t.status === 'todo') ? ' has-open' : own.some((t) => t.status === 'done') ? ' has-done' : '';
        const selected = d === day;
        return (
          <button
            key={d}
            class={`week-day${selected ? ' is-selected' : ''}${d === today ? ' is-today' : ''}`}
            aria-pressed={selected}
            aria-label={formatDayLong(d)}
            onClick={() => onPick(d)}
          >
            <span class="week-wd" aria-hidden="true">{LETTERS[i]}</span>
            <span class="week-num num" aria-hidden="true">{Number(d.slice(8))}</span>
            <span class={`week-dot${dot}`} aria-hidden="true" />
          </button>
        );
      })}
    </div>
  );
}
