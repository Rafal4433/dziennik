import { DataSection } from './DataSection';
import { AssistantSection } from './AssistantSection';

/** Ustawienia (kółko na „Dziś”): rzadko używane rzeczy — statystyki i kopia danych. */
export function SettingsScreen({ onClose }: { onClose: () => void }) {
  return (
    <main class="screen">
      <header class="page-head">
        <div class="page-head-row">
          <h1 class="page-title">Ustawienia</h1>
          <button class="pill" onClick={onClose}>Gotowe</button>
        </div>
      </header>
      <section class="section">
        <header class="section-head">
          <h2>Statystyki</h2>
        </header>
        <p class="empty">Tygodniowy przegląd i statystyki pojawią się tu w kolejnej wersji.</p>
      </section>
      <AssistantSection />
      <DataSection />
    </main>
  );
}
