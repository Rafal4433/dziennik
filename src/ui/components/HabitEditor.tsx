import { useState } from 'preact/hooks';
import type { Habit, HabitFrequency, HabitKind } from '../../data/model';
import { addHabit, updateHabit, useAppState } from '../../data/store';
import { activeHabits } from '../../domain/habits';
import { isLive } from '../../domain/tasks';

const DAY_NAMES = ['pn', 'wt', 'śr', 'cz', 'pt', 'sb', 'nd'];
const TIMES = [1, 2, 3, 4, 5, 6];

/** Nawyki: nazwa, rodzaj, częstotliwość, kolejność, archiwizacja i dodawanie nowych. */
export function HabitEditor() {
  const s = useAppState();
  const active = activeHabits(s.data.habits);
  const archived = s.data.habits.filter((h) => isLive(h) && h.archivedAt !== null).sort((a, b) => a.order - b.order);

  /** Przesuwa nawyk o jedno miejsce i numeruje `order` od nowa. */
  const move = (id: string, dir: -1 | 1) => {
    const list = [...active];
    const i = list.findIndex((h) => h.id === id);
    const j = i + dir;
    if (i < 0 || j < 0 || j >= list.length) return;
    [list[i], list[j]] = [list[j], list[i]];
    list.forEach((h, order) => h.order !== order && updateHabit(h.id, { order }));
  };

  return (
    <div class="habit-editor">
      <ul class="plain-list">
        {active.map((h, i) => (
          <HabitItem key={h.id} habit={h} first={i === 0} last={i === active.length - 1} onMove={(d) => move(h.id, d)} />
        ))}
      </ul>
      <NewHabit />
      {archived.length > 0 && (
        <div class="cat-archived">
          <span class="field-label">W archiwum</span>
          <ul class="plain-list">
            {archived.map((h) => (
              <li key={h.id} class="plain-item">
                <span class="muted">{h.name}</span>
                <button class="btn-text" onClick={() => updateHabit(h.id, { archivedAt: null, order: active.reduce((m, a) => Math.max(m, a.order), -1) + 1 })}>Przywróć</button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

function HabitItem({ habit: h, first, last, onMove }: { habit: Habit; first: boolean; last: boolean; onMove: (dir: -1 | 1) => void }) {
  const [name, setName] = useState(h.name);
  const [unit, setUnit] = useState(h.unit ?? '');
  return (
    <li class="cat-item">
      <label class="field">
        <span class="field-label">Nazwa</span>
        <input
          value={name}
          enterKeyHint="done"
          onInput={(e) => setName(e.currentTarget.value)}
          onChange={(e) => {
            const v = e.currentTarget.value.trim();
            if (!v) return setName(h.name);
            setName(v);
            if (v !== h.name) updateHabit(h.id, { name: v });
          }}
        />
      </label>
      <KindPicker
        kind={h.kind}
        onChange={(kind) => {
          const nextUnit = kind === 'measure' ? h.unit ?? 'kg' : null;
          setUnit(nextUnit ?? '');
          updateHabit(h.id, { kind, unit: nextUnit });
        }}
      />
      {h.kind === 'measure' && (
        <label class="field habit-unit-field">
          <span class="field-label">Jednostka</span>
          <input
            value={unit}
            enterKeyHint="done"
            placeholder="brak"
            onInput={(e) => setUnit(e.currentTarget.value)}
            onChange={(e) => {
              const v = e.currentTarget.value.trim();
              setUnit(v);
              if ((v || null) !== h.unit) updateHabit(h.id, { unit: v || null });
            }}
          />
        </label>
      )}
      <FrequencyPicker value={h.frequency} onChange={(frequency) => updateHabit(h.id, { frequency })} />
      <div class="cat-actions">
        <button class="btn-text quiet" onClick={() => updateHabit(h.id, { archivedAt: Date.now() })}>Archiwizuj</button>
        <span class="cat-move">
          <button class="icon-btn" disabled={first} onClick={() => onMove(-1)} aria-label={`Przesuń „${h.name}” wyżej`}>↑</button>
          <button class="icon-btn" disabled={last} onClick={() => onMove(1)} aria-label={`Przesuń „${h.name}” niżej`}>↓</button>
        </span>
      </div>
    </li>
  );
}

function KindPicker({ kind, onChange }: { kind: HabitKind; onChange: (k: HabitKind) => void }) {
  return (
    <div class="field">
      <span class="field-label">Rodzaj</span>
      <div class="seg" role="group" aria-label="Rodzaj">
        <button type="button" class={`seg-btn${kind === 'check' ? ' is-active' : ''}`} aria-pressed={kind === 'check'} onClick={() => kind !== 'check' && onChange('check')}>
          Odhaczenie
        </button>
        <button type="button" class={`seg-btn${kind === 'measure' ? ' is-active' : ''}`} aria-pressed={kind === 'measure'} onClick={() => kind !== 'measure' && onChange('measure')}>
          Wartość
        </button>
      </div>
    </div>
  );
}

/** Częstotliwość: codziennie / X razy w tygodniu (1–6) / wybrane dni (pn…nd). */
function FrequencyPicker({ value, onChange }: { value: HabitFrequency; onChange: (f: HabitFrequency) => void }) {
  const opts: { kind: HabitFrequency['kind']; label: string; make: () => HabitFrequency }[] = [
    { kind: 'daily', label: 'Codziennie', make: () => ({ kind: 'daily' }) },
    { kind: 'timesPerWeek', label: 'X razy w tygodniu', make: () => ({ kind: 'timesPerWeek', times: 3 }) },
    { kind: 'weekdays', label: 'Wybrane dni', make: () => ({ kind: 'weekdays', days: [1, 3, 5] }) },
  ];
  return (
    <div class="field">
      <span class="field-label">Jak często</span>
      <div class="seg" role="group" aria-label="Jak często">
        {opts.map((o) => (
          <button
            key={o.kind}
            type="button"
            class={`seg-btn${value.kind === o.kind ? ' is-active' : ''}`}
            aria-pressed={value.kind === o.kind}
            onClick={() => value.kind !== o.kind && onChange(o.make())}
          >
            {o.label}
          </button>
        ))}
      </div>
      {value.kind === 'timesPerWeek' && (
        <div class="chips habit-chips" role="group" aria-label="Ile razy w tygodniu">
          {TIMES.map((n) => (
            <button
              key={n}
              type="button"
              class={`chip num${value.times === n ? ' is-current' : ''}`}
              aria-pressed={value.times === n}
              onClick={() => onChange({ kind: 'timesPerWeek', times: n })}
            >
              {n}×
            </button>
          ))}
        </div>
      )}
      {value.kind === 'weekdays' && (
        <div class="chips habit-chips" role="group" aria-label="Dni tygodnia">
          {DAY_NAMES.map((d, i) => {
            const n = i + 1;
            const on = value.days.includes(n);
            return (
              <button
                key={d}
                type="button"
                class={`chip${on ? ' is-current' : ''}`}
                aria-pressed={on}
                onClick={() => {
                  // Co najmniej jeden dzień musi zostać.
                  if (on && value.days.length === 1) return;
                  const days = on ? value.days.filter((x) => x !== n) : [...value.days, n].sort((a, b) => a - b);
                  onChange({ kind: 'weekdays', days });
                }}
              >
                {d}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

function NewHabit() {
  const [name, setName] = useState('');
  const [kind, setKind] = useState<HabitKind>('check');
  const [unit, setUnit] = useState('kg');
  const [frequency, setFrequency] = useState<HabitFrequency>({ kind: 'daily' });
  return (
    <form
      class="cat-new habit-new"
      onSubmit={(e) => {
        e.preventDefault();
        if (!name.trim()) return;
        addHabit({ name, kind, unit: kind === 'measure' ? unit.trim() || null : null, frequency });
        setName('');
        setKind('check');
        setUnit('kg');
        setFrequency({ kind: 'daily' });
      }}
    >
      <label class="field">
        <span class="field-label">Nowy nawyk</span>
        <input value={name} onInput={(e) => setName(e.currentTarget.value)} placeholder="np. Spacer" enterKeyHint="done" />
      </label>
      <KindPicker kind={kind} onChange={setKind} />
      {kind === 'measure' && (
        <label class="field habit-unit-field">
          <span class="field-label">Jednostka</span>
          <input value={unit} onInput={(e) => setUnit(e.currentTarget.value)} placeholder="brak" enterKeyHint="done" />
        </label>
      )}
      <FrequencyPicker value={frequency} onChange={setFrequency} />
      <div class="cat-actions">
        <button class="btn" type="submit" disabled={!name.trim()}>Dodaj nawyk</button>
      </div>
    </form>
  );
}
