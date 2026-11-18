import { useState } from 'preact/hooks';
import type { Category, DayKey, Expense } from '../../data/model';
import { groupByDay, inRange, periodRange, shiftPeriod, totals, type Period } from '../../domain/expenses';
import { isLive } from '../../domain/tasks';
import { formatDayMonth, relativeDayName } from '../../lib/date';
import { formatPLN, plural } from '../../lib/format';
import { ExpenseRow } from './ExpenseRow';
import { LimitBar } from './LimitBar';

const PERIODS: { id: Period; label: string }[] = [
  { id: 'day', label: 'Dzień' },
  { id: 'week', label: 'Tydzień' },
  { id: 'month', label: 'Miesiąc' },
];

const utc = (d: DayKey) => new Date(`${d}T12:00:00Z`);
const wdFmt = new Intl.DateTimeFormat('pl-PL', { timeZone: 'UTC', weekday: 'short' });
const monthYearFmt = new Intl.DateTimeFormat('pl-PL', { timeZone: 'UTC', month: 'long', year: 'numeric' });
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/** „Śr 18 listopada” */
export function dayHead(d: DayKey): string {
  return `${cap(wdFmt.format(utc(d)).replace('.', ''))} ${formatDayMonth(d)}`;
}

function periodLabel(anchor: DayKey, p: Period, today: DayKey): string {
  const r = periodRange(anchor, p);
  if (p === 'day') return relativeDayName(anchor, today) ?? dayHead(anchor);
  if (p === 'month') return cap(monthYearFmt.format(utc(anchor)));
  const sameMonth = r.start.slice(0, 7) === r.end.slice(0, 7);
  return sameMonth ? `${Number(r.start.slice(8))}–${formatDayMonth(r.end)}` : `${formatDayMonth(r.start)} – ${formatDayMonth(r.end)}`;
}

interface Props {
  expenses: Expense[];
  /** Wszystkie kategorie — nazwy także zarchiwizowanych. */
  allCategories: Category[];
  /** `pickableCategories` — do panelu edycji. */
  categories: Category[];
  today: DayKey;
  expanded: string | null;
  setExpanded: (key: string | null) => void;
}

/** Przełącznik Dzień / Tydzień / Miesiąc: suma, sumy kategorii (z limitem w widoku miesiąca), lista dni. */
export function PeriodView({ expenses, allCategories, categories, today, expanded, setExpanded }: Props) {
  const [period, setPeriod] = useState<Period>('month');
  const [anchor, setAnchor] = useState<DayKey>(today);
  const r = periodRange(anchor, period);
  const t = totals(expenses, allCategories, r);
  const waiting = expenses.filter((e) => isLive(e) && e.amount === null && inRange(e, r)).length;
  const days = groupByDay(expenses, r);
  const atNow = r.end >= today;

  return (
    <section class="section">
      <header class="section-head period-head">
        <h2>{periodLabel(anchor, period, today)}</h2>
        <nav class="day-nav" aria-label="Zmiana okresu">
          <button class="day-step" onClick={() => setAnchor(shiftPeriod(anchor, period, -1, today))} aria-label="Poprzedni okres">‹</button>
          {!atNow && <button class="btn-text" onClick={() => setAnchor(today)}>teraz</button>}
          <button class="day-step" disabled={atNow} onClick={() => setAnchor(shiftPeriod(anchor, period, 1, today))} aria-label="Następny okres">›</button>
        </nav>
      </header>

      <div class="seg" role="group" aria-label="Okres">
        {PERIODS.map((p) => (
          <button key={p.id} class={`seg-btn${period === p.id ? ' is-active' : ''}`} aria-pressed={period === p.id} onClick={() => setPeriod(p.id)}>
            {p.label}
          </button>
        ))}
      </div>

      <dl class="ledger">
        <div class="ledger-row">
          <dt>Razem</dt>
          <dd class="num">{formatPLN(t.total)}</dd>
        </div>
        {t.byCategory.map(({ categoryId, amount }) => {
          const c = categoryId === null ? null : allCategories.find((x) => x.id === categoryId);
          const limit = period === 'month' && c && c.monthlyLimit !== null ? c.monthlyLimit : null;
          return (
            <div class={`ledger-sub${limit !== null ? ' has-limit' : ''}`} key={categoryId ?? 'none'}>
              <dt>{categoryId === null ? 'Bez kategorii' : (c?.name ?? '—')}</dt>
              <dd>{limit !== null ? <LimitBar spent={amount} limit={limit} /> : <span class="num">{formatPLN(amount)}</span>}</dd>
            </div>
          );
        })}
      </dl>
      {waiting > 0 && (
        <p class="hint">
          {waiting} {plural(waiting, 'wpis czeka', 'wpisy czekają', 'wpisów czeka')} na kurs NBP — {plural(waiting, 'nie jest wliczony', 'nie są wliczone', 'nie są wliczone')} do sumy.
        </p>
      )}

      {days.length === 0 && <p class="empty">W tym okresie nie ma wydatków.</p>}
      {days.map(({ day, items, total }) => (
        <div class="day-group" key={day}>
          <div class="day-group-head">
            <span>{dayHead(day)}</span>
            <span class="num">{formatPLN(total)}</span>
          </div>
          <ul class="plain-list">
            {items.map((e) => (
              <ExpenseRow
                key={e.id}
                expense={e}
                allCategories={allCategories}
                categories={categories}
                expanded={expanded === `l:${e.id}`}
                onToggle={() => setExpanded(expanded === `l:${e.id}` ? null : `l:${e.id}`)}
              />
            ))}
          </ul>
        </div>
      ))}
    </section>
  );
}
