import { useEffect, useState } from 'preact/hooks';
import type { DayKey } from '../data/model';
import { checkDayChange, useAppState } from '../data/store';
import { syncPending } from '../native/pending';
import { TodayScreen } from './screens/Today';
import { TasksScreen } from './screens/Tasks';
import { ExpensesScreen } from './screens/Expenses';
import { HabitsScreen } from './screens/Habits';
import { SettingsScreen } from './screens/Settings';
import { Assistant } from './components/Assistant';

type Tab = 'today' | 'tasks' | 'expenses' | 'habits';
type Screen = Tab | 'settings';

/** Ikony zakładek: obrys 1,75 px, rysowane kolorem tekstu. */
const ICONS: Record<Tab, preact.JSX.Element> = {
  today: (
    <>
      <rect x="3.5" y="5" width="17" height="15.5" rx="3.5" />
      <path d="M3.5 10h17M8 3v4M16 3v4" />
      <circle cx="12" cy="15.2" r="1.6" fill="currentColor" stroke="none" />
    </>
  ),
  tasks: (
    <>
      <path d="M3.5 6.5l1.7 1.7 3.1-3.2M3.5 13l1.7 1.7 3.1-3.2M12 6.8h8.5M12 13.3h8.5M12 19.5h8.5" />
      <circle cx="5.9" cy="19.5" r="1.5" fill="currentColor" stroke="none" />
    </>
  ),
  expenses: (
    <>
      <rect x="2.75" y="5.5" width="18.5" height="13.5" rx="3" />
      <path d="M2.75 10h18.5M6.5 15h3.5" />
    </>
  ),
  habits: <path d="M17 3l3 3-3 3M4 11.5v-1A4.5 4.5 0 0 1 8.5 6H20M7 21l-3-3 3-3M20 12.5v1a4.5 4.5 0 0 1-4.5 4.5H4" />,
};

const TABS: { id: Tab; label: string }[] = [
  { id: 'today', label: 'Dziś' },
  { id: 'tasks', label: 'Zadania' },
  { id: 'expenses', label: 'Wydatki' },
  { id: 'habits', label: 'Nawyki' },
];

export function App() {
  const s = useAppState();
  const [tab, setTab] = useState<Screen>('today');
  /** null = zawsze bieżący dzień (także po północy). */
  const [viewDay, setViewDay] = useState<DayKey | null>(null);

  useEffect(() => {
    // Płatności zapisane w tle przez Skróty (tylko w aplikacji natywnej). Błąd zapisu pokazuje store,
    // a rekordy zostają w kolejce do następnej próby.
    const sync = () => void syncPending().catch((err) => console.warn('Synchronizacja kolejki płatności nie powiodła się', err));
    const onVisible = () => {
      if (document.visibilityState !== 'visible') return;
      checkDayChange();
      sync();
    };
    sync();
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
      {tab === 'today' && <TodayScreen day={day} setDay={setDay} goToExpenses={() => setTab('expenses')} openSettings={() => setTab('settings')} />}
      {tab === 'tasks' && <TasksScreen openDay={openDay} />}
      {tab === 'expenses' && <ExpensesScreen />}
      {tab === 'habits' && <HabitsScreen />}
      {tab === 'settings' && <SettingsScreen onClose={() => setTab('today')} />}
      {tab !== 'settings' && <Assistant openSettings={() => setTab('settings')} />}
      <div class="tabbar-fade" aria-hidden="true" />
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
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
              {ICONS[t.id]}
            </svg>
            <span>{t.label}</span>
          </button>
        ))}
      </nav>
    </div>
  );
}
