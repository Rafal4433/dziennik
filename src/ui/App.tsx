import { useEffect, useState } from 'preact/hooks';
import type { DayKey } from '../data/model';
import { checkDayChange, useAppState } from '../data/store';
import { TodayScreen } from './screens/Today';
import { TasksScreen } from './screens/Tasks';
import { PlaceholderScreen } from './screens/Placeholder';
import { DataSection } from './screens/DataSection';

type Tab = 'today' | 'tasks' | 'expenses' | 'habits' | 'stats';

const TABS: { id: Tab; label: string }[] = [
  { id: 'today', label: 'Dziś' },
  { id: 'tasks', label: 'Zadania' },
  { id: 'expenses', label: 'Wydatki' },
  { id: 'habits', label: 'Nawyki' },
  { id: 'stats', label: 'Statystyki' },
];

export function App() {
  const s = useAppState();
  const [tab, setTab] = useState<Tab>('today');
  /** null = zawsze bieżący dzień (także po północy). */
  const [viewDay, setViewDay] = useState<DayKey | null>(null);

  useEffect(() => {
    const onVisible = () => document.visibilityState === 'visible' && checkDayChange();
    document.addEventListener('visibilitychange', onVisible);
    const id = setInterval(checkDayChange, 60_000);
    return () => {
      document.removeEventListener('visibilitychange', onVisible);
      clearInterval(id);
    };
  }, []);

  useEffect(() => {
    window.scrollTo(0, 0);
  }, [tab]);

  if (!s.ready) return <div class="loading" />;

  const day = viewDay ?? s.today;
  const setDay = (d: DayKey) => setViewDay(d === s.today ? null : d);
  const openDay = (d: DayKey) => {
    setDay(d);
    setTab('today');
  };

  return (
    <div class="app">
      {s.saveError && <p class="note note-top">{s.saveError}</p>}
      {tab === 'today' && <TodayScreen day={day} setDay={setDay} />}
      {tab === 'tasks' && <TasksScreen openDay={openDay} />}
      {tab === 'expenses' && <PlaceholderScreen title="Wydatki" />}
      {tab === 'habits' && <PlaceholderScreen title="Nawyki" />}
      {tab === 'stats' && (
        <PlaceholderScreen title="Statystyki">
          <DataSection />
        </PlaceholderScreen>
      )}
      <nav class="tabbar" aria-label="Nawigacja">
        {TABS.map((t) => (
          <button
            key={t.id}
            class={`tab${tab === t.id ? ' is-active' : ''}`}
            aria-current={tab === t.id ? 'page' : undefined}
            onClick={() => {
              if (t.id === 'today' && tab === 'today') setViewDay(null);
              setTab(t.id);
            }}
          >
            {t.label}
          </button>
        ))}
      </nav>
    </div>
  );
}
