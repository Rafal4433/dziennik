import { useState } from 'preact/hooks';
import { useAppState } from '../../data/store';
import { activeHabits } from '../../domain/habits';
import { HabitCard } from '../components/HabitCard';
import { HabitEditor } from '../components/HabitEditor';

/** Ekran Nawyki: karty nawyków (seria, %, siatka, wykres wartości) i ich edycja. */
export function HabitsScreen() {
  const s = useAppState();
  const { today } = s;
  const { habits, habitLogs } = s.data;
  const list = activeHabits(habits);
  const [editing, setEditing] = useState(false);

  return (
    <main class="screen">
      <header class="page-head">
        <h1 class="page-title">Nawyki</h1>
      </header>

      <section class="section">
        <header class="section-head">
          <h2>Na co dzień</h2>
          <button class="btn-text" onClick={() => setEditing(!editing)} aria-expanded={editing}>
            {editing ? 'Gotowe' : 'Edytuj'}
          </button>
        </header>
        {editing ? (
          <HabitEditor />
        ) : list.length === 0 ? (
          <p class="empty">Brak nawyków. Dodasz je przez „Edytuj”.</p>
        ) : (
          <ul class="plain-list">
            {list.map((h) => (
              <HabitCard key={h.id} habit={h} logs={habitLogs} today={today} />
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}
