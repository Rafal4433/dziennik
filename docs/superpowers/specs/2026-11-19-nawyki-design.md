# Nawyki — projekt modułu (krok 3)

Data: 2026-11-19 · Gałąź: do utworzenia z `main` (moduł Wydatki już scalony)

## Po co

Właściciel chce codziennie pilnować prostych rzeczy. Na start dwa nawyki:
**Witaminy** (odhaczam, że wziąłem) i **Ważenie się** (wpisuję, ile ważę).
Waga ma docelowo pokazywać **wykres i trend w czasie** — robimy to od razu w prostej formie.

## Cele

1. Moduł Nawyki z dwoma rodzajami nawyków (wybór właściciela: wariant A):
   - **do odhaczenia** (`check`) — jedno stuknięcie,
   - **z wartością** (`measure`) — wpisanie liczby z jednostką (np. kg) jednocześnie odhacza nawyk.
2. Na start (raz, przy pierwszym uruchomieniu modułu) tworzą się: **Witaminy** (`check`, codziennie)
   i **Ważenie się** (`measure`, jednostka `kg`, codziennie).
3. **Dziś → sekcja Nawyki** (zastępuje zaślepkę): nawyki zaplanowane na oglądany dzień; odhaczanie i wpisywanie wagi
   bez przechodzenia do innego ekranu.
4. **Zakładka Nawyki**: lista nawyków z serią, % z 30 dni i siatką kalendarza; dodawanie, edycja, archiwizacja.
5. **Karta wagi**: wykres z ostatnich 90 dni, średnia z 7 dni i zmiana względem poprzednich 7 dni, ostatni pomiar.
6. Zakres kroku 3 z README: częstotliwości (codziennie / X razy w tygodniu / wybrane dni tygodnia),
   odhaczanie z DZIŚ, siatka kalendarza, % z 30 dni.

## Nie-cele

- Przypomnienia i powiadomienia (właściciela irytują wyskakujące okna).
- Integracja z Apple Zdrowie / wagą Bluetooth — ewentualnie później (HealthKit), nie teraz.
- Cel wagowy, BMI, kalorie.
- Wiele pomiarów jednego nawyku dziennie (jeden wpis na dzień; poprawka nadpisuje).

## Anty-cele

- Poczucie winy: czerwone kolory, „zawaliłeś”, wykrzykniki. Ton jak w reszcie aplikacji — spokojne fakty.
- Odhaczenie wymaga więcej niż jednego stuknięcia; wpis wagi wymaga więcej niż wpisania liczby i zatwierdzenia.
- Klawiatura przybliża stronę albo zasłania pole (pole ≥ 16 px, `inputmode="decimal"`).

## Ograniczenia

- Istniejący model (`src/data/model.ts`): `Habit { name, frequency, order, archivedAt }`,
  `HabitLog { habitId, date }`, `HabitFrequency` (daily / timesPerWeek(n) / weekdays([1..7])). Kolekcje już są w bazie.
- Rekordy jak wszędzie: `id`, `createdAt`, `updatedAt`, `deletedAt` (tombstone); dni jako `DayKey` w Europe/Warsaw.
- Wygląd: styl księgi rachunkowej (linie, Fraunces / Source Sans / IBM Plex Mono dla liczb, akcent `--accent`),
  tryb ciemny przez zmienne. Wykres w czystym SVG, bez nowej biblioteki.
- Wersja PWA i iOS — ten sam kod, nic natywnego.

## Podejścia (rozważone)

| | Jak | Plusy | Minusy |
|---|---|---|---|
| **A. Waga jako nawyk z liczbą — wybrane** | `Habit.kind: 'check' \| 'measure'`, `unit`; `HabitLog.value` | jeden rytuał dnia na „Dziś”; seria i % działają też dla ważenia; łatwo dodać kolejny pomiar | wykres trzeba zmieścić w karcie nawyku |
| B. Osobny moduł Pomiary | nawyki tylko do odhaczania, waga osobno | więcej miejsca na statystyki | drugi ekran; „czy się zważyłem” liczone w dwóch miejscach |

## Projekt

### Model danych

- `Habit`: nowe `kind: 'check' | 'measure'` (domyślnie `'check'`), `unit: string | null` (dla `measure`, np. `'kg'`).
- `HabitLog`: nowe `value: number | null` (dla `measure`: liczba w jednostce nawyku, max 1 miejsce po przecinku dla kg;
  dla `check`: `null`).
- **Jeden żywy `HabitLog` na nawyk i dzień.** Odhaczenie = utworzenie; odznaczenie = tombstone; ponowny wpis wagi
  w tym samym dniu = aktualizacja `value` istniejącego wpisu.
- `Meta.habitsSeeded: boolean` — kategorie startowe raz, jak `expensesSeeded` w Wydatkach (z naprawą, gdy nawyki
  już istnieją, a znacznik nie jest ustawiony; także po imporcie kopii).
- Migracja: brak nowego magazynu w IndexedDB; brakujące pola uzupełniane przy odczycie i imporcie
  (`normalizeHabit`, `normalizeHabitLog` — jak `normalizeExpense`).

### Definicje

- **Dzień zaplanowany** (`isDue(habit, day)`):
  `daily` — każdy dzień; `weekdays` — gdy `isoWeekday(day)` jest na liście; `timesPerWeek(n)` — każdy dzień tygodnia,
  dopóki w tym tygodniu (pon–nd) jest mniej niż n wpisów (po osiągnięciu n nawyk znika z „Dziś” do końca tygodnia,
  ale wcześniejsze odhaczenie dalej widać).
- **Seria**:
  `daily`/`weekdays` — liczba kolejnych zaplanowanych dni z wpisem, licząc wstecz od wczoraj, plus dziś, jeśli dziś
  już jest wpis (brak wpisu dziś nie przerywa serii przed końcem dnia);
  `timesPerWeek` — liczba kolejnych pełnych tygodni z ≥ n wpisami, plus bieżący, jeśli już ma ≥ n.
  Seria nie sięga przed dzień utworzenia nawyku.
- **% z 30 dni**: wykonane / zaplanowane w ostatnich 30 dniach (dziś włącznie tylko, jeśli dziś już wykonany),
  nie wcześniej niż od dnia utworzenia; `timesPerWeek` liczy tygodnie: min(wpisy, n) / n na tydzień, proporcjonalnie.
  Gdy zaplanowanych 0 — brak liczby („za mało danych”).
- **Waga — trend**: średnia z wpisów w ostatnich 7 dniach (dziś włącznie) vs średnia z 7 dni wcześniej;
  zmiana pokazana jako „−0,6 kg w tydzień” albo „bez zmian” (|Δ| < 0,1). Gdy w którymś oknie brak wpisów — brak trendu.

### Interfejs

**Dziś → Nawyki** (dla dnia oglądanego, także minionych — można odhaczyć wstecz; nie dla przyszłych):
```
Nawyki                                  1/2
  [✓] Witaminy                       seria 4
  [ ] Ważenie się   [ 82,4 ] kg  ✓    ostatnio 82,6
```
- `check`: cały wiersz jest przyciskiem (≥ 44 px), stan zaznaczony = akcent.
- `measure`: pole liczby (`inputmode="decimal"`, 16 px, `enterkeyhint="done"`), zatwierdzenie Enterem lub ✓;
  po zapisie wiersz pokazuje „82,4 kg” i można go stuknąć, żeby poprawić; usunięcie wartości = odznaczenie.
  Parsowanie przecinka i kropki („82,4”, „82.4”); poza 20–400 kg — spokojna podpowiedź, bez zapisu.

**Zakładka Nawyki**:
1. Lista nawyków (wg `order`): nazwa, częstotliwość słownie („codziennie”, „3 razy w tygodniu”, „pn, śr, pt”),
   seria, % z 30 dni, siatka ostatnich 5 tygodni (pon–nd, kropka = wykonany, pusta = zaplanowany bez wpisu,
   brak = niezaplanowany).
2. Karta **Ważenie się** (dla każdego nawyku `measure`): wykres liniowy z ostatnich 90 dni (punkty wpisów,
   oś Y dopasowana do min–max z marginesem, bez kolorów alarmowych), pod nim: ostatni pomiar, średnia 7 dni, zmiana
   tydzień do tygodnia.
3. Dodawanie i edycja nawyku: nazwa, rodzaj (odhaczenie / wartość + jednostka), częstotliwość, kolejność,
   archiwizacja. Zarchiwizowane nie pojawiają się na „Dziś”, ich historia zostaje.

## Testy

Czysta logika w `src/domain/habits.ts` (Vitest): `isDue` dla trzech częstotliwości, seria (z przerwą, z dziś bez
wpisu, `timesPerWeek` przez granicę tygodnia, od dnia utworzenia), % z 30 dni, trend wagi (brak danych, „bez zmian”),
parsowanie wagi. Akcje w store (fake-indexeddb): jeden wpis na dzień, poprawka nadpisuje, odznaczenie = tombstone,
nawyki startowe raz, normalizacja starych rekordów i kopii.

## Zostawione builderowi

Układ plików i komponentów, nazwy, dokładne teksty, rysowanie SVG, wygląd siatki, kolejność prac.
