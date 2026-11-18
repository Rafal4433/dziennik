import type { DayKey, Habit, HabitLog } from '../../data/model';
import { calendarWeeks, completion30, frequencyLabel, streak } from '../../domain/habits';
import { plural } from '../../lib/format';
import { HabitGrid } from './HabitGrid';
import { WeightChart } from './WeightChart';

/** Karta nawyku: częstotliwość, seria, % z 30 dni, siatka 5 tygodni; dla wartości — wykres. */
export function HabitCard({ habit, logs, today }: { habit: Habit; logs: HabitLog[]; today: DayKey }) {
  const weekly = habit.frequency.kind === 'timesPerWeek';
  const series = streak(habit, logs, today);
  const pct = completion30(habit, logs, today);

  const meta = [frequencyLabel(habit.frequency)];
  if (series > 0) {
    meta.push(weekly ? `seria ${series} ${plural(series, 'tydzień', 'tygodnie', 'tygodni')}` : `seria ${series} ${plural(series, 'dzień', 'dni', 'dni')}`);
  }

  return (
    <li class="habit-card">
      <div class="habit-card-head">
        <h3 class="habit-card-name">{habit.name}</h3>
        {pct !== null && (
          <span class="habit-card-pct">
            <span class="num">{Math.round(pct * 100)}%</span> <span class="muted">z 30 dni</span>
          </span>
        )}
      </div>
      <p class="habit-card-meta">{meta.join(' · ')}</p>
      <HabitGrid weeks={calendarWeeks(habit, logs, today, 5)} today={today} />
      {habit.kind === 'measure' && <WeightChart habit={habit} logs={logs} today={today} />}
    </li>
  );
}
