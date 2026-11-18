# Wydatki — projekt modułu (krok 2)

Data: 2026-11-18 · Gałąź: `feat/ios-app` (aplikacja iOS przez Capacitor już działa na iPhonie 13 właściciela)

## Po co

Właściciel chce **przestać kupować batony, energetyki i inny „syf”**. Wydatki w Dzienniku mają to uwidocznić:
ile razy i za ile, oraz czy jest lepiej niż w zeszłym miesiącu. Powiadomienia z banku (Trade Republic) są lakoniczne
i łatwo je przeoczyć, więc **płatność ma sama wpaść do Dziennika** z kwotą i sklepem, a szczegóły
(kategorię, notatkę) właściciel **uzupełni później ręcznie**.

## Cele

1. Każda płatność Apple Pay (karta Trade Republic w Portfelu) zapisuje się automatycznie, **w tle** —
   aplikacja nie otwiera się przy kasie, nic nie wyskakuje.
2. Przy następnym otwarciu Dziennika te płatności czekają na liście **„Do uzupełnienia”**;
   uzupełnienie to w praktyce jedno stuknięcie: „Syf” albo zwykła kategoria (notatka opcjonalna).
3. Aplikacja zapamiętuje sklep → kategorię i przy kolejnej płatności w tym sklepie podpowiada kategorię
   (nadal trzeba ją zatwierdzić — patrz „Decyzje”).
4. Widać postęp w ograniczaniu syfu: **dni bez syfu z rzędu**, **suma i liczba zakupów syfu w tym miesiącu vs poprzedni**.
5. Zakres kroku 2 z README: ręczne szybkie dodawanie, kategorie, widok dzień / tydzień / miesiąc, miesięczne limity kategorii.

## Nie-cele

- Integracja z Trade Republic przez API, czytanie powiadomień, logowanie do banku — niemożliwe lub kruche; odpada.
- Płatności fizyczną kartą, przelewy, BLIK — nie da się ich złapać automatycznie; można je dodać ręcznie.
- Import CSV z Trade Republic — ewentualnie później, nie w tym kroku.
- Synchronizacja między urządzeniami. Kurs dokładnie taki jak bankowy (używamy średniego NBP jako szacunku).
- Powiadomienie po płatności („Żabka 12,99 zł, 4. raz w tym tygodniu”) — **nie teraz**: właściciela irytują wyskakujące okna.
  Projekt ma tego nie blokować (dane do licznika są w aplikacji), ale domyślnie nic się nie wyświetla.

## Anty-cele (porażka, nawet jeśli działa)

- Coś wyskakuje przy kasie albo aplikacja otwiera się sama.
- Uzupełnianie wydatku wymaga formularza z wieloma polami — ma być jedno stuknięcie.
- Ta sama płatność wpada dwa razy albo ginie (np. gdy aplikacja jest zamknięta przez kilka dni).
- Moralizowanie w interfejsie. Ton spokojny jak w reszcie aplikacji: fakty i liczby, bez wykrzykników.

## Ograniczenia

- Dane leżą w IndexedDB wewnątrz WKWebView. **Kod natywny nie może tam pisać** — płatności złapane w tle muszą
  poczekać w natywnej kolejce, aż strona je odbierze.
- Wersja PWA (GitHub Pages) nie ma automatycznego przechwytywania; ma działać wszystko poza nim (ręczne dodawanie).
  Kod webowy wykrywa natywną platformę (`Capacitor.isNativePlatform()`), a nie user agent.
- Darmowe konto Apple (Personal Team): App Intents działają; aplikacja wygasa po 7 dniach, reinstalacja nie kasuje danych
  ani kolejki.
- Kwoty w groszach, dni w Europe/Warsaw (`DayKey`), rekordy z `id`/`createdAt`/`updatedAt`/`deletedAt` — jak reszta modelu.
- Wygląd: istniejący styl „księgi rachunkowej” (cienkie linie, Fraunces/Source Sans/IBM Plex Mono, jeden akcent).

## Podejścia (rozważone)

| | Jak działa | Plusy | Minusy |
|---|---|---|---|
| **A. Zapis w tle — wybrane** | Automatyzacja Skrótów „Transakcja” (Portfel) uruchamia akcję aplikacji „Dodaj wydatek” (App Intent) bez otwierania aplikacji; akcja dopisuje płatność do natywnej kolejki; przy otwarciu strona pobiera kolejkę przez lokalną wtyczkę Capacitor | nic nie wyskakuje; nic nie ginie przy zamkniętej aplikacji | więcej kodu natywnego (Swift) |
| B. Skrót otwiera aplikację | Automatyzacja otwiera `dziennik://wydatek?kwota=…&sklep=…`, aplikacja pokazuje formularz | prostsze | aplikacja wyskakuje przy kasie za każdym razem — sprzeczne z anty-celem |
| C. Tylko ręcznie + import CSV | brak automatyzacji | najprościej | nie spełnia celu: wydatki giną |

Właściciel wybrał **A**.

## Projekt

### Przechwytywanie (natywne, iOS)

1. **App Intent „Dodaj wydatek”** (`openAppWhenRun = false`), parametry: kwota (z walutą, tak jak podaje wyzwalacz
   „Transakcja”), sklep (tekst), karta (tekst, opcjonalnie). `perform()` dopisuje rekord do natywnej kolejki
   i kończy się bez dialogu (lub z najkrótszym możliwym, jeśli iOS wymaga wyniku).
2. **Kolejka**: plik JSON w katalogu Application Support aplikacji (przeżywa reinstalację przy tym samym bundle ID).
   Każdy rekord: `id` (UUID nadany przy przechwyceniu), `capturedAt` (ms), `amount` (liczba w jednostkach waluty),
   `currency` (kod ISO), `merchant`, `card`. Zapis atomowy.
3. **Wtyczka Capacitor `PendingExpenses`** zarejestrowana w `ViewController` (AppDelegate.swift): `list()` zwraca
   kolejkę, `remove({ ids })` usuwa przyjęte rekordy. Strona usuwa z kolejki **dopiero po** zapisaniu do IndexedDB —
   rekord nigdy nie ginie; ponowne pobranie tego samego `id` jest ignorowane (idempotencja po `id`).
4. Strona pobiera kolejkę przy starcie i przy każdym powrocie aplikacji na pierwszy plan (`visibilitychange`
   — już używane w `App.tsx`).
5. **Instrukcja konfiguracji** w aplikacji (ekran Wydatki, gdy brak automatycznych wpisów, tylko w wersji natywnej):
   krótko, jak w Skrótach dodać automatyzację „Transakcja” → wybrać kartę → „Uruchom natychmiast” →
   akcja „Dodaj wydatek” z polami Kwota / Sklep. (Automatyzacji nie da się utworzyć programowo.)

### Model danych

- `Expense`:
  - `categoryId: string | null` — `null` = **do uzupełnienia**.
  - nowe: `merchant: string` (pusty przy ręcznym), `source: 'manual' | 'applepay'`,
    `capturedAt: number | null` (moment płatności; `date` liczone z niego w Europe/Warsaw).
  - waluta: `amount` zawsze w groszach PLN (sumy, limity, syf liczone w PLN); dla obcej waluty dodatkowo
    `original: { amount, currency, rate, rateDate } | null` — patrz „Wiele walut” niżej.
- `Category`: nowe `junk: boolean`. Przy pierwszym uruchomieniu modułu tworzone są kategorie startowe:
  **Syf** (`junk: true`), Jedzenie, Transport, Dom, Rozrywka, Inne. Można je zmieniać, dodawać, archiwizować.
- Nowa kolekcja **`merchantRules`**: `merchantKey` (znormalizowana nazwa sklepu), `categoryId`. Aktualizowana
  przy każdym uzupełnieniu wpisu ze sklepem.
- Migracja: `DB_VERSION` 2 (nowy object store), stare rekordy `expenses` (obecnie brak) uzupełnione o domyślne pola
  przy odczycie. Kopia JSON (`backup.ts`) obejmuje nowe pola i kolekcję; import starej kopii działa.

### Interfejs

**Dziś → sekcja Wydatki** (zastępuje zaślepkę):
- suma dnia (jak teraz w nagłówku sekcji),
- wiersz „Do uzupełnienia: N” (gdy N > 0) — stuknięcie przenosi do ekranu Wydatki,
- jedna linijka o syfie: „Bez syfu od 4 dni” albo „Dziś: syf 2 × 15,98 zł”,
- szybkie dodanie ręczne (kwota + kategoria) jak „Dodaj zadanie”.

**Ekran Wydatki** (zakładka):
1. **Do uzupełnienia** na górze: wiersz = sklep, godzina, kwota. Stuknięcie rozwija rząd przycisków kategorii;
   podpowiedziana kategoria (z `merchantRules`) jest wyróżniona, ale **wymaga stuknięcia** — nic nie zatwierdza się samo.
   „Syf” jest zawsze pierwszy. Opcjonalnie notatka. Można też usunąć wpis (np. zwrot, pomyłka).
2. **Syf**: dni bez syfu z rzędu; ten miesiąc vs poprzedni (liczba zakupów i kwota); limit miesięczny, jeśli ustawiony.
3. **Przełącznik Dzień / Tydzień / Miesiąc** z nawigacją ‹ ›: suma okresu, sumy kategorii z paskiem limitu
   (limit miesięczny; w widoku dnia/tygodnia tylko sumy), lista wydatków pogrupowana po dniach.
4. **Dodaj ręcznie**: kwota (`inputmode="decimal"`, 16 px), kategoria, notatka opcjonalna, dzień domyślnie dziś.
5. **Kategorie**: edycja nazwy, limitu, oznaczenia „syf”, kolejności, archiwizacja.

Szkic ekranu Wydatki:

```
WYDATKI                                 ‹ listopad ›
Do uzupełnienia
  Żabka            14:32        12,99 zł
   [Syf] [Jedzenie] [Transport] [Dom] [Inne]   ← podpowiedź wyróżniona
  Orlen            08:10       214,50 zł
──────────────────────────────────────────────
Syf
  Bez syfu od 2 dni
  Listopad  7 × 89,40 zł      Październik  12 × 151,20 zł
──────────────────────────────────────────────
[Dzień] [Tydzień] [Miesiąc]
  Razem                              1 842,10 zł
  Jedzenie  ████████░░  612,00 / 800 zł
  Syf       ███░░░░░░░   89,40 / 150 zł
  …
  Śr 18 listopada
    Żabka · Syf                         12,99 zł
```

### Definicje

- **Zakup syfu** = wydatek w kategorii z `junk: true`. Wpisy „do uzupełnienia” nie liczą się ani jako syf, ani jako nie-syf.
- **Dni bez syfu** = liczba pełnych dni wstecz od wczoraj bez zakupu syfu + dziś, jeśli dziś nie było syfu.
  Seria liczy się od pierwszego dnia z jakimkolwiek wydatkiem w aplikacji (żeby nowa instalacja nie pokazywała „od 400 dni”).
- **Normalizacja sklepu** (`merchantKey`): małe litery, bez diakrytyków, bez cyfr i nadmiarowych spacji
  (np. „ŻABKA Z1234 KRAKÓW” i „Zabka Z5678” → podobny klucz). Dokładny algorytm — decyzja buildera, z testami.

### Decyzje po przeglądzie (moje — do sprawdzenia przez właściciela)

- **Wpisy „do uzupełnienia” liczą się do sum** dnia/tygodnia/miesiąca (pieniądze już wydane), jako osobna linia
  „Bez kategorii”; nie liczą się do limitów kategorii ani do syfu. Wpis w obcej walucie bez pobranego kursu nie liczy się do sum, dopóki kurs się nie pobierze.
- **Porównanie miesięcy: ta sama część miesiąca** (np. 1–18 listopada vs 1–18 października) jako główna liczba;
  pełny poprzedni miesiąc mniejszym drukiem. Inaczej w połowie miesiąca zawsze wyglądałoby „lepiej”.
- **Wygaśnięcie aplikacji (darmowe konto, 7 dni):** w tym czasie automatyzacja nie zadziała i płatności przepadną.
  Aplikacja czyta datę wygaśnięcia z profilu (`embedded.mobileprovision`) i na 2 dni przed końcem pokazuje
  na „Dziś” spokojną linijkę „Aplikacja wygasa w czwartek — podłącz telefon do Maca”. Ryzyko pozostaje i jest jawne.
- **Waluta karty Trade Republic: złotówki** (potwierdził właściciel). Płatności w PLN wpadają bez przeliczania.
- **Wiele walut (na prośbę właściciela) — automatyczne przeliczanie:** płatność w obcej walucie (EUR, USD, CZK…)
  przelicza się na PLN po **średnim kursie NBP** (tabela A, `api.nbp.pl`, bez klucza) z dnia płatności,
  a jeśli tego dnia nie ma tabeli (weekend, święto) — z ostatniego wcześniejszego dnia. Wpis zapisuje oryginalną
  kwotę, walutę, użyty kurs i jego datę; w liście widać „12,00 EUR ≈ 51,24 zł”. Kwota w PLN jest **szacunkiem**
  (bank liczy po kursie karty, zwykle trochę innym) — można ją poprawić ręcznie przy uzupełnianiu.
  Bez internetu wpis czeka jako „kurs do pobrania”, nie liczy się do sum i przelicza się przy następnym połączeniu.
  Do NBP idzie tylko kod waluty i data. Ręczne dodawanie też pozwala wybrać walutę.
  To zastępuje wcześniejszą regułę „obca waluta = ręczna kwota w PLN”.

## Testy

- Logika domenowa (czysta, jak `src/domain/tasks.ts`): sumy okresów, limity, dni bez syfu, normalizacja sklepu,
  podpowiedź kategorii, import kolejki (idempotencja, waluta obca, `date` z `capturedAt` w Europe/Warsaw
  — płatność 23:30 UTC liczy się do właściwego polskiego dnia).
- Migracja bazy v1 → v2 i import starej kopii JSON (`fake-indexeddb`).
- Część natywną sprawdzić ręcznie: symulator (wywołanie intencji ze Skrótów) i telefon (prawdziwa płatność Apple Pay).

## Zostawione builderowi

Układ plików i komponentów, nazwy, dokładne teksty UI (po polsku, spokojnym tonem), algorytm normalizacji sklepu,
sposób zapisu waluty w modelu, wygląd instrukcji konfiguracji Skrótu, kolejność prac.
