import type { Category, DayKey, Expense } from '../../data/model';
import { isJunk, junkComparison, junkFreeDays, monthlyLimitUsage, pickableCategories } from '../../domain/expenses';
import { isLive } from '../../domain/tasks';
import { addDays } from '../../lib/date';
import { formatPLN, plural } from '../../lib/format';
import { LimitBar } from './LimitBar';

const monthFmt = new Intl.DateTimeFormat('pl-PL', { timeZone: 'UTC', month: 'long' });
/** „listopad” (mianownik) dla dnia. */
const monthName = (day: DayKey) => monthFmt.format(new Date(`${day}T12:00:00Z`));
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
const stat = (s: { count: number; amount: number }) => `${s.count} × ${formatPLN(s.amount)}`;

/** Sekcja „Syf”: seria dni bez syfu, ten miesiąc vs ta sama część poprzedniego, limit. */
export function JunkSummary({ expenses, categories, today }: { expenses: Expense[]; categories: Category[]; today: DayKey }) {
  if (!expenses.some(isLive)) return <p class="empty">Jeszcze nic nie zapisano.</p>;

  const free = junkFreeDays(expenses, categories, today);
  const todayJunk = expenses.filter((e) => e.date === today && isJunk(e, categories));
  const cmp = junkComparison(expenses, categories, today);

  const dayOfMonth = Number(today.slice(8, 10));
  const prevMonthDay = addDays(`${today.slice(0, 8)}01`, -1);
  const prevPart = Math.min(dayOfMonth, Number(prevMonthDay.slice(8, 10)));
  const limits = pickableCategories(categories)
    .filter((c) => c.junk)
    .map((c) => ({ c, usage: monthlyLimitUsage(expenses, c, today) }))
    .filter((x) => x.usage !== null);

  return (
    <dl class="ledger">
      <div class="ledger-row junk-streak">
        <dt>
          {free > 0
            ? `Bez syfu od ${free} ${plural(free, 'dnia', 'dni', 'dni')}`
            : `Dziś: syf ${todayJunk.length} × ${formatPLN(todayJunk.reduce((s, e) => s + (e.amount ?? 0), 0))}`}
        </dt>
      </div>
      <div class="ledger-row">
        <dt>{cap(monthName(today))} (1–{dayOfMonth})</dt>
        <dd class="num">{stat(cmp.thisMonth)}</dd>
      </div>
      <div class="ledger-row">
        <dt>{cap(monthName(prevMonthDay))} (1–{prevPart})</dt>
        <dd class="num">{stat(cmp.lastMonthSamePart)}</dd>
      </div>
      <div class="ledger-sub">
        <dt>Cały {monthName(prevMonthDay)}</dt>
        <dd class="num">{stat(cmp.lastMonthFull)}</dd>
      </div>
      {limits.map(({ c, usage }) => (
        <div class="ledger-row" key={c.id}>
          <dt>Limit · {c.name}</dt>
          <dd>
            <LimitBar spent={usage!.spent} limit={usage!.limit} />
          </dd>
        </div>
      ))}
    </dl>
  );
}
