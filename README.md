# Dziennik

Osobista aplikacja PWA (mobile-first, po polsku) do prowadzenia codziennego życia: zadania, wydatki, nawyki.
Domyślny ekran to zawsze **Dziś**. Dane leżą lokalnie w IndexedDB, nie ma logowania ani backendu.

## Uruchomienie

```bash
npm install
npm run dev        # serwer deweloperski
npm test           # testy logiki (rollover, daty, szacunki, zapis)
npm run build      # produkcyjny build do dist/ (z service workerem)
```

Folder `dist/` to statyczna strona. Wystarczy go wrzucić na dowolny hosting z HTTPS (GitHub Pages, Netlify, Cloudflare Pages),
otworzyć w przeglądarce telefonu i wybrać „Dodaj do ekranu głównego”. Po pierwszym otwarciu aplikacja działa offline.

## Stan prac

| Krok | Zakres | Stan |
|---|---|---|
| 1 | Ekran DZIŚ, zadania: statusy, stoper, ręczny czas, szacunek, najmniejsza wersja, rollover z licznikiem, pytanie po 3 przeniesieniach, podsumowanie dnia, kopia JSON | **gotowe** |
| 2 | Wydatki: szybkie dodawanie, kategorie, widok dzień/tydzień/miesiąc, limity | następny |
| 3 | Nawyki: częstotliwości, odhaczanie z DZIŚ, siatka kalendarza, % z 30 dni | |
| 4 | Statystyki i cotygodniowy przegląd, eksport CSV | |

## Model danych (`src/data/model.ts`)

Wspólne pola każdej encji: `id` (UUID z urządzenia), `createdAt`, `updatedAt`, `deletedAt` (usunięcie = tombstone).
Kwoty w groszach, dni jako `'YYYY-MM-DD'` w strefie Europe/Warsaw.

```
Task          title, date, originalDate, status: todo|done|skipped,
              estimateMin?, minimalVersion, carriedFrom[], carryBase,
              promptSnoozedOn?, closedAt?, resolution: let_go|split|null,
              parentId?, order
TimeEntry     taskId → Task, date, startedAt, endedAt? (null = stoper chodzi), source: timer|manual
Category      name, monthlyLimit? (gr), order, archived
Expense       amount (gr), categoryId → Category, note, date
Habit         name, frequency: daily | timesPerWeek(n) | weekdays([1..7]), order, archivedAt?
HabitLog      habitId → Habit, date                (jedno odhaczenie w danym dniu)
WeeklyReview  weekStart (poniedziałek), wentWell, blockers, experiment
```

Najważniejsze decyzje:

- **Licznik przeniesień** to `carriedFrom.length`. Lista dni pozwala w widoku minionego dnia pokazać, co z niego „przeszło dalej”.
- **Pytanie o decyzję** pojawia się, gdy `carriedFrom.length − carryBase ≥ 3`. Rozbicie albo przełożenie ustawia `carryBase`, więc licznik zostaje, a pytanie wraca dopiero po kolejnych trzech przeniesieniach. „Nie teraz” ukrywa je do końca dnia.
- **Stoper** to seria odcinków `TimeEntry`. Pauza zamyka odcinek, wznowienie otwiera nowy. Naraz chodzi najwyżej jeden stoper, a start innego zadania pauzuje poprzednie. Chodzący stoper przetrwa zamknięcie aplikacji, bo w bazie zapisany jest tylko moment startu.
- **Rollover** (`src/domain/tasks.ts → rollover`) uruchamia się przy pierwszym otwarciu w nowym dniu (Europe/Warsaw), przy powrocie do aplikacji i co minutę, więc łapie też północ. Każde zadanie `todo` z wcześniejszego dnia dostaje dzisiejszą datę i jedno przeniesienie, także po kilku dniach przerwy.

## Architektura

```
src/
  data/model.ts     typy encji
  data/db.ts        Repository (interfejs) + IdbRepository (IndexedDB) + MemoryRepository (zapas)
  data/store.ts     stan w pamięci + akcje; każda akcja zapisuje zmienione rekordy przez Repository
  data/backup.ts    eksport/import JSON
  domain/           czysta logika bez UI i bazy (rollover, czasy, szacunki) — pokryta testami
  lib/              daty w Europe/Warsaw, formatowanie, hooki
  ui/               ekrany i komponenty (Preact)
```

**Pod przyszłą synchronizację (np. Supabase):** UI i logika znają tylko interfejs `Repository`. Każdy rekord ma UUID z urządzenia,
`updatedAt` (indeks w IndexedDB) i tombstone `deletedAt`. Synchronizacja to nowa implementacja `Repository`:
lokalny zapis jak teraz, wysyłka rekordów z `updatedAt > ostatniaSynchronizacja` i pobranie zmian z serwera
z regułą „nowszy `updatedAt` wygrywa”. Tabele w Postgresie mogą mieć 1:1 te same kolumny.

## Wygląd

Papierowy notes albo księga rachunkowa: tło `#F5F1E8`, tekst `#1C1B19` i jeden akcent, zieleń butelkowa `#1F4D3A`.
Fraunces w nagłówkach, Source Sans 3 w treści, IBM Plex Mono z cyframi tabelarycznymi w czasach i kwotach.
Zamiast kart są cienkie linie, zaokrąglenia mają 2–3 px, animacje trwają najwyżej 120 ms.
Tryb ciemny włącza się według ustawień systemu i używa ciepłego grafitu.
