import { useLayoutEffect, useRef, useState } from 'preact/hooks';
import type { Category, DayKey, Expense, Habit, HabitLog } from '../../data/model';
import { quitStats, slipCount } from '../../domain/quit';
import { bumpSlip, setMeasure, toggleHabit } from '../../data/store';
import { formatMeasure, logOn, parseMeasure, streak, weightTrend } from '../../domain/habits';
import { plural } from '../../lib/format';

interface Props {
  habit: Habit;
  logs: HabitLog[];
  /** Oglądany dzień (wpis trafia do niego). */
  day: DayKey;
  today: DayKey;
}

/** Wiersz nawyku na „Dziś”: odhaczenie jednym stuknięciem albo wpis wartości. */
export function HabitRow({ habit, logs, day, today }: Props) {
  const log = logOn(logs, habit.id, day);
  const series = streak(habit, logs, today);
  const weekly = habit.frequency.kind === 'timesPerWeek';
  const seriesText = series > 0 ? (weekly ? `${series} tyg. z rzędu` : `${series} ${plural(series, 'dzień', 'dni', 'dni')} z rzędu`) : null;

  if (habit.kind === 'check') {
    const done = !!log;
    return (
      <li class={`habit-row${done ? ' is-done' : ''}`}>
        <button class="habit-toggle" aria-pressed={done} onClick={() => toggleHabit(habit.id, day)}>
          <span class="check-box" aria-hidden="true" />
          <span class="habit-name">{habit.name}</span>
          {seriesText && <span class="streak num">{seriesText}</span>}
        </button>
      </li>
    );
  }

  return <MeasureRow habit={habit} logs={logs} day={day} log={log} seriesText={seriesText} />;
}

const fieldValue = (v: number | null | undefined) => (v == null ? '' : formatMeasure(v, null));

function MeasureRow({ habit, logs, day, log, seriesText }: { habit: Habit; logs: HabitLog[]; day: DayKey; log: HabitLog | undefined; seriesText: string | null }) {
  const saved = log?.value ?? null;
  const [editing, setEditing] = useState(saved === null);
  const [text, setText] = useState(fieldValue(saved));
  const [bad, setBad] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  /** Fokus tylko po stuknięciu w zapisaną wartość, nie przy pierwszym wyświetleniu. */
  const focusNext = useRef(false);

  /** Bez zapisanej wartości zawsze pole (także gdy wpis zniknął z innego miejsca, np. po imporcie). */
  const showInput = editing || saved === null;

  useLayoutEffect(() => {
    if (showInput && focusNext.current) {
      focusNext.current = false;
      input.current?.focus();
      input.current?.select();
    }
  }, [showInput]);

  const last = saved === null ? weightTrend(logs, habit.id, day).last : null;
  const unitLabel = habit.unit ?? '';

  /**
   * Zapis z pola — wspólny dla ✓/Enter i opuszczenia pola (na iPhonie klawiatura dziesiętna nie ma
   * Return, „Gotowe” tylko zdejmuje fokus). Podwójne wywołanie (✓, potem blur) jest nieszkodliwe:
   * `setMeasure` pomija tę samą wartość, a usuwanie — brak żywego wpisu.
   */
  const submit = (fromBlur = false) => {
    const v = text.trim();
    if (!v) {
      setBad(false);
      // Puste pole usuwa każdy żywy wpis tego dnia (także bez wartości). Samo wejście i wyjście
      // z pustego pola przy wpisie „bez wartości” go nie kasuje — tylko wyczyszczona wartość albo ✓.
      if (log && (!fromBlur || saved !== null)) setMeasure(habit.id, day, null);
      return;
    }
    const value = parseMeasure(v, habit.unit);
    if (value === null) return setBad(true);
    setBad(false);
    setText(fieldValue(value));
    setEditing(false);
    setMeasure(habit.id, day, value);
  };

  if (!showInput && saved !== null) {
    return (
      <li class="habit-row is-done">
        <button
          class="habit-toggle"
          onClick={() => {
            focusNext.current = true;
            setText(fieldValue(saved));
            setEditing(true);
          }}
          aria-label={`${habit.name}: ${formatMeasure(saved, habit.unit)}. Popraw`}
        >
          <span class="check-box" aria-hidden="true" />
          <span class="habit-name">{habit.name}</span>
          <span class="habit-value num">{formatMeasure(saved, habit.unit)}</span>
          {seriesText && <span class="streak num">{seriesText}</span>}
        </button>
      </li>
    );
  }

  return (
    <li class={`habit-row is-measure${saved !== null ? ' is-done' : ''}`}>
      <form
        class="habit-measure"
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
      >
        <span class="habit-label">
          <span class="check-box" aria-hidden="true" />
          <label class="habit-name" for={`m-${habit.id}`}>{habit.name}</label>
        </span>
        <span class="habit-entry">
          <input
            ref={input}
            id={`m-${habit.id}`}
            class="habit-input num"
            inputMode="decimal"
            enterKeyHint="done"
            autoComplete="off"
            value={text}
            placeholder={last ? formatMeasure(last.value, null) : ''}
            onInput={(e) => {
              setText(e.currentTarget.value);
              setBad(false);
            }}
            onBlur={() => submit(true)}
          />
          {unitLabel && <span class="habit-unit">{unitLabel}</span>}
        </span>
        {seriesText && <span class="streak num">{seriesText}</span>}
      </form>
      {bad && <p class="hint habit-hint">{habit.unit === 'kg' ? 'Podaj wagę, np. 82,4.' : 'Podaj liczbę.'}</p>}
    </li>
  );
}

/**
 * Nawyk do rzucenia na „Dziś” jako licznik: stuknięcie = +1 wpadka w oglądanym dniu, „−” cofa jedną.
 * Po prawej liczba dzisiejszych wpadek albo seria dni bez; wpadka z wydatku na syf cofa się tylko w wydatkach.
 */
export function QuitRow({ habit, logs, expenses, categories, day }: { habit: Habit; logs: HabitLog[]; expenses: Expense[]; categories: Category[]; day: DayKey }) {
  const count = slipCount(habit, logs, day);
  const { current, slippedToday } = quitStats(habit, logs, expenses, categories, day);
  return (
    <li class={`habit-row habit-quit${slippedToday ? ' is-slipped' : ''}`}>
      <button class="habit-toggle" aria-label={`${habit.name}: dodaj wpadkę (teraz ${count})`} onClick={() => bumpSlip(habit.id, day, 1)}>
        <svg class="quit-mark" width="22" height="22" viewBox="0 0 22 22" aria-hidden="true">
          <circle cx="11" cy="11" r="10.25" fill="none" stroke="currentColor" stroke-width="1.5" />
          <path d="M4.2 17.8L17.8 4.2" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" />
        </svg>
        <span class="habit-name">{habit.name}</span>
        <span class={`streak num${slippedToday ? ' is-broken' : ''}`}>
          {count > 0 ? `${count}×` : slippedToday ? 'wpadka' : `${current} ${plural(current, 'dzień', 'dni', 'dni')} bez`}
        </span>
      </button>
      {count > 0 && (
        <button class="quit-undo" aria-label={`${habit.name}: cofnij jedną wpadkę`} onClick={() => bumpSlip(habit.id, day, -1)}>
          −
        </button>
      )}
    </li>
  );
}
