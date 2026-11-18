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
| 2 | Wydatki: szybkie dodawanie, Apple Pay przez Skróty, kategorie, widok dzień/tydzień/miesiąc, limity, licznik dni bez syfu | **gotowe** |
| 3 | Nawyki: częstotliwości, odhaczanie i wpis wartości z DZIŚ, seria, siatka kalendarza, % z 30 dni, wykres wagi z trendem | **gotowe** |
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
Category      name, monthlyLimit? (gr), order, archived, junk (syf)
Expense       amount (gr | null = czeka na kurs), categoryId → Category | null (= do uzupełnienia), note, date,
              merchant, source: manual|applepay, original? {amount, currency, rate?, rateDate?}
MerchantRule  sklep (znormalizowany) → kategoria; podpowiada kategorię przy kolejnych płatnościach
Habit         name, kind: check|measure, unit? (np. 'kg'), frequency: daily | timesPerWeek(n) | weekdays([1..7]),
              order, archivedAt?
HabitLog      habitId → Habit, date, value? (liczba dla measure) — jeden żywy wpis na nawyk i dzień
WeeklyReview  weekStart (poniedziałek), wentWell, blockers, experiment
```

Najważniejsze decyzje:

- **Licznik przeniesień** to `carriedFrom.length`. Lista dni pozwala w widoku minionego dnia pokazać, co z niego „przeszło dalej”.
- **Pytanie o decyzję** pojawia się, gdy `carriedFrom.length − carryBase ≥ 3`. Rozbicie albo przełożenie ustawia `carryBase`, więc licznik zostaje, a pytanie wraca dopiero po kolejnych trzech przeniesieniach. „Nie teraz” ukrywa je do końca dnia.
- **Stoper** to seria odcinków `TimeEntry`. Pauza zamyka odcinek, wznowienie otwiera nowy. Naraz chodzi najwyżej jeden stoper, a start innego zadania pauzuje poprzednie. Chodzący stoper przetrwa zamknięcie aplikacji, bo w bazie zapisany jest tylko moment startu.
- **Rollover** (`src/domain/tasks.ts → rollover`) uruchamia się przy pierwszym otwarciu w nowym dniu (Europe/Warsaw), przy powrocie do aplikacji i co minutę, więc łapie też północ. Każde zadanie `todo` z wcześniejszego dnia dostaje dzisiejszą datę i jedno przeniesienie, także po kilku dniach przerwy.

## Wydatki i przechwytywanie płatności

Płatności Apple Pay trafiają do aplikacji same, bez jej otwierania (tylko wersja iOS):

1. Automatyzacja w **Skrótach** uruchamia App Intent „Dodaj wydatek” przy każdej płatności kartą.
2. Intent zapisuje płatność (kwota, waluta, sklep) w natywnej kolejce, także gdy aplikacja jest zamknięta.
3. Po otwarciu aplikacji (start i powrót na pierwszy plan) strona wczytuje kolejkę do IndexedDB i dopiero wtedy usuwa ją z kolejki.
4. Wpis bez kategorii czeka w „Do uzupełnienia” na ekranie Wydatki (także jako licznik na Dziś). Wybór kategorii zapisuje regułę `merchantRules`,
   więc ten sam sklep dostanie kategorię od razu.

Płatności w obcej walucie przeliczane są po kursie średnim NBP z ostatniego dnia roboczego przed płatnością. Gdy kursu nie da się pobrać,
wpis ma `amount: null` i „kurs do pobrania”, a przeliczenie ponawia się przy kolejnej synchronizacji.

Kategorie z `junk: true` to „syf”. Ekran Wydatki i Dziś pokazują serię dni bez syfu oraz zestawienie miesiąca.

Wersja na iPhone'a (Capacitor): `npm run build:ios` buduje stronę bez service workera i robi `cap sync ios`; potem uruchomienie z Xcode.
Darmowe konto deweloperskie podpisuje aplikację na 7 dni — na dwa dni przed końcem Dziś pokazuje przypomnienie, żeby podłączyć telefon do Maca i zainstalować ją ponownie.

## Nawyki

Na start są dwa nawyki: „Witaminy” (odhaczenie) i „Ważenie się” (wartość w kg). Na **Dziś** odhaczenie to jedno stuknięcie w wiersz,
a waga to wpisanie liczby („82,4” albo „82.4”) i ✓ lub Enter; stuknięcie w zapisaną wartość pozwala ją poprawić, pusta wartość usuwa wpis.
Wartość spoza 20–400 kg nie zapisuje się, zostaje tylko spokojna podpowiedź. Minione dni można uzupełnić wstecz.

Ekran **Nawyki** pokazuje dla każdego nawyku częstotliwość, serię, % z 30 dni i siatkę 5 tygodni (kropka = wykonany,
pusty kontur = zaplanowany bez wpisu, bez czerwieni). Pod nawykiem z wartością jest wykres z 90 dni (czyste SVG)
i trend: ostatni pomiar, średnia 7 dni i zmiana względem średniej z poprzednich 7 dni („bez zmian” przy różnicy poniżej 0,1).
Przez „Edytuj” dodaje się nawyki (odhaczenie albo wartość z jednostką; codziennie, X razy w tygodniu lub wybrane dni),
zmienia kolejność i archiwizuje — historia zarchiwizowanych zostaje i można je przywrócić.

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
