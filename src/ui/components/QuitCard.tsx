import type { Category, DayKey, Expense, Habit, HabitLog } from '../../data/model';
import { quitStats } from '../../domain/quit';
import { plural } from '../../lib/format';
import { HabitGrid } from './HabitGrid';

const days = (n: number) => `${n} ${plural(n, 'dzień', 'dni', 'dni')}`;

/** Karta nawyku do rzucenia: seria bez wpadki, rekord i siatka 5 tygodni (kropka = czysty dzień, szara = wpadka). */
export function QuitCard({ habit, logs, expenses, categories, today }: { habit: Habit; logs: HabitLog[]; expenses: Expense[]; categories: Category[]; today: DayKey }) {
  const { current, best, weeks, todayCount, weekCount } = quitStats(habit, logs, expenses, categories, today);
  const window = weeks.flat().filter((c) => c.state === 'done' || c.state === 'missed');
  const clean = window.filter((c) => c.state === 'done').length;
  return (
    <li class="habit-card">
      <div class="habit-card-head">
        <h3 class="habit-card-name">{habit.name}</h3>
        {window.length > 0 && (
          <span class="habit-card-pct">
            <span class="num">{Math.round((clean / window.length) * 100)}%</span> <span class="muted">dni czystych</span>
          </span>
        )}
      </div>
      <p class="habit-card-meta">
        <span class="habit-card-streak">{current > 0 ? `${days(current)} bez wpadki` : 'dziś wpadka'}</span>
        {todayCount > 0 && <span class="num">dziś {todayCount}×</span>}
        {weekCount > 0 && <span class="num">w tym tygodniu {weekCount}×</span>}
        {best > current && <span>najdłużej {days(best)}</span>}
        {habit.countsJunk && <span>liczy też wydatki na syf</span>}
      </p>
      <HabitGrid weeks={weeks} today={today} />
    </li>
  );
}
