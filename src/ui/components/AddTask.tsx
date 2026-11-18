import { useRef, useState } from 'preact/hooks';
import type { DayKey } from '../../data/model';
import { addTask } from '../../data/store';

/** Dodanie zadania: tapnięcie w pole, wpisanie, Enter. Pole zostaje aktywne na kolejne zadanie. */
export function AddTask({ date, placeholder = 'Dodaj zadanie' }: { date: DayKey; placeholder?: string }) {
  const [value, setValue] = useState('');
  const [focused, setFocused] = useState(false);
  const ref = useRef<HTMLInputElement>(null);
  return (
    <form
      class="add-task"
      onSubmit={(e) => {
        e.preventDefault();
        if (!value.trim()) return;
        addTask(value, date);
        setValue('');
        ref.current?.focus();
      }}
    >
      <span class="add-mark" aria-hidden="true">+</span>
      <input
        ref={ref}
        value={value}
        onInput={(e) => setValue(e.currentTarget.value)}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        placeholder={placeholder}
        enterKeyHint="done"
        aria-label="Nowe zadanie"
      />
      {focused && <span class="add-hint">szacunek na końcu: ~30, ~1h</span>}
    </form>
  );
}
