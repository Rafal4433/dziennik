/** Instrukcja automatyzacji w Skrótach — pokazywana tylko w aplikacji natywnej, dopóki nie wpadła żadna płatność. */
export function ShortcutSetup() {
  return (
    <details class="setup">
      <summary>
        <span>Automatyczny zapis płatności Apple Pay</span>
        <span class="setup-more muted">jak włączyć</span>
      </summary>
      <ol class="setup-steps">
        <li>Otwórz Skróty → Automatyzacja → Nowa.</li>
        <li>Wybierz „Transakcja” i zaznacz kartę Trade Republic.</li>
        <li>Zaznacz „Uruchom natychmiast” i stuknij Dalej.</li>
        <li>Dodaj akcję „Dodaj wydatek” (Dziennik).</li>
        <li>
          Ustaw pola: Kwota — <em>Kwota</em>, Sklep — <em>Sprzedawca</em>, Karta — <em>Karta</em>.
        </li>
      </ol>
      <p class="hint">Płatności zapiszą się w tle, bez otwierania aplikacji, i poczekają tutaj w „Do uzupełnienia”.</p>
    </details>
  );
}
