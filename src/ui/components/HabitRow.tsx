import { Fragment } from 'preact';
import { useLayoutEffect, useRef, useState } from 'preact/hooks';
import type { DayKey, Habit, HabitLog } from '../../data/model';
import { setMeasure, toggleHabit } from '../../data/store';
import { formatMeasure, logOn, parseMeasure, streak, weightTrend } from '../../domain/habits';

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
  const seriesText = series > 1 ? `seria ${series}` : null;

  if (habit.kind === 'check') {
    const done = !!log;
    return (
      <li class={`habit-row${done ? ' is-done' : ''}`}>
        <button class="habit-toggle" aria-pressed={done} onClick={() => toggleHabit(habit.id, day)}>
          <span class="check-box" aria-hidden="true" />
          <span class="habit-name">{habit.name}</span>
          {seriesText && <span class="habit-side num">{seriesText}</span>}
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
  /** Żywy wpis bez wartości (np. odhaczony, zanim nawyk zmienił rodzaj). */
  const doneNoValue = !!log && saved === null;
  const meta = [doneNoValue ? 'zrobione, bez wartości' : last && `ostatnio ${formatMeasure(last.value, null)}`, seriesText].filter(
    (x): x is string => !!x,
  );
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
          {seriesText && <span class="habit-side num">{seriesText}</span>}
          <span class="habit-value num">{formatMeasure(saved, habit.unit)}</span>
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
          <span class="habit-text">
            <label class="habit-name" for={`m-${habit.id}`}>{habit.name}</label>
            {meta.length > 0 && (
              <span class="habit-meta num">
                {/* Każda część w całości — łamanie tylko między nimi. */}
                {meta.map((m, i) => (
                  <Fragment key={m}>
                    {i > 0 && ' '}
                    <span class="habit-meta-part">{i > 0 ? `· ${m}` : m}</span>
                  </Fragment>
                ))}
              </span>
            )}
          </span>
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
            onInput={(e) => {
              setText(e.currentTarget.value);
              setBad(false);
            }}
            onBlur={() => submit(true)}
          />
          {unitLabel && <span class="habit-unit">{unitLabel}</span>}
          <button
            class="icon-btn habit-save"
            type="submit"
            aria-label={`Zapisz: ${habit.name}`}
            // Fokus zostaje w polu, więc stuknięcie ✓ nie wywołuje najpierw blur.
            onPointerDown={(e) => e.preventDefault()}
          >
            ✓
          </button>
        </span>
      </form>
      {bad && <p class="hint habit-hint">{habit.unit === 'kg' ? 'Podaj wagę, np. 82,4.' : 'Podaj liczbę.'}</p>}
    </li>
  );
}
