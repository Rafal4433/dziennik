import type { DayKey } from '../../data/model';
import type { CalendarState } from '../../domain/habits';
import { formatDayMonth } from '../../lib/date';
import { plural } from '../../lib/format';

const DAY_LETTERS = ['pn', 'wt', 'śr', 'cz', 'pt', 'sb', 'nd'];

type Cell = { day: DayKey; state: CalendarState };

/**
 * Siatka ostatnich tygodni (pon–nd). Kropka = wykonany, pusty kontur = zaplanowany bez wpisu
 * (spokojnie, bez koloru), dziś jeszcze nie odhaczony = „w toku”, nic = niezaplanowany / przyszły.
 */
export function HabitGrid({ weeks, today }: { weeks: Cell[][]; today: DayKey }) {
  const cells = weeks.flat();
  const done = cells.filter((c) => c.state === 'done').length;
  const planned = cells.filter((c) => c.state === 'done' || (c.state === 'missed' && c.day !== today)).length;
  const first = cells[0]?.day;
  const label = first
    ? `Od ${formatDayMonth(first)}: ${done} z ${planned} ${plural(planned, 'zaplanowanego dnia', 'zaplanowanych dni', 'zaplanowanych dni')}`
    : '';

  return (
    <div class="habit-grid" role="img" aria-label={label}>
      {DAY_LETTERS.map((d) => (
        <span key={d} class="habit-grid-head" aria-hidden="true">{d}</span>
      ))}
      {cells.map((c) => {
        const state = c.state === 'missed' && c.day === today ? 'pending' : c.state;
        return (
          <span key={c.day} class={`habit-cell is-${state}${c.day === today ? ' is-today' : ''}`} aria-hidden="true">
            <span class="habit-dot" />
          </span>
        );
      })}
    </div>
  );
}
