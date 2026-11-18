import type { Category, DayKey, Expense, MerchantRule } from '../data/model';
import { addDays, weekStart } from '../lib/date';
import { isLive } from './tasks';
import { formatForeign } from './currency';
import { formatPLN } from '../lib/format';

/** Kategorie startowe — w tej kolejności. */
export const DEFAULT_CATEGORIES: { name: string; junk: boolean }[] = [
  { name: 'Syf', junk: true },
  { name: 'Jedzenie', junk: false },
  { name: 'Transport', junk: false },
  { name: 'Dom', junk: false },
  { name: 'Rozrywka', junk: false },
  { name: 'Inne', junk: false },
];

/**
 * Kwota wpisana ręcznie → grosze. Akceptuje przecinek lub kropkę, spacje i „zł”/„PLN”.
 * Śmieci, wartości ujemne i zero → null.
 */
export function parseAmount(input: string): number | null {
  const s = input
    .toLowerCase()
    .replace(/(zł|zl|pln)/g, '')
    .replace(/[\s ]/g, '')
    .replace(',', '.');
  const m = /^(\d+)(?:\.(\d{1,2}))?$/.exec(s);
  if (!m) return null;
  const grosze = Number(m[1]) * 100 + Number((m[2] ?? '').padEnd(2, '0') || '0');
  return grosze > 0 && Number.isSafeInteger(grosze) ? grosze : null;
}

/** Klucz sklepu: małe litery, bez diakrytyków, cyfr i tokenów jednoliterowych (np. „Z” z „Z1234”). */
export function merchantKey(name: string): string {
  return name
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/ł/g, 'l')
    .replace(/[^\p{L}]+/gu, ' ')
    .split(' ')
    .filter((t) => t.length > 1)
    .join(' ');
}

/** Podpowiedź kategorii dla sklepu — tylko z żywej reguły i żywej, niezarchiwizowanej kategorii. */
export function suggestCategory(merchant: string, rules: MerchantRule[], categories: Category[]): string | null {
  const key = merchantKey(merchant);
  if (!key) return null;
  const rule = rules
    .filter((r) => isLive(r) && r.merchantKey === key)
    .sort((a, b) => b.updatedAt - a.updatedAt)[0];
  if (!rule) return null;
  const c = categories.find((x) => x.id === rule.categoryId);
  return c && isLive(c) && !c.archived ? c.id : null;
}

export type Period = 'day' | 'week' | 'month';
export interface DayRange { start: DayKey; end: DayKey }

/** Zakres okresu zawierającego `day`; tydzień pon–nd, miesiąc kalendarzowy, `end` włącznie. */
export function periodRange(day: DayKey, p: Period): DayRange {
  if (p === 'day') return { start: day, end: day };
  if (p === 'week') {
    const start = weekStart(day);
    return { start, end: addDays(start, 6) };
  }
  return monthRange(day);
}

function monthRange(day: DayKey): DayRange {
  const [y, m] = day.split('-').map(Number);
  const start = `${y}-${String(m).padStart(2, '0')}-01`;
  const next = m === 12 ? `${y + 1}-01-01` : `${y}-${String(m + 1).padStart(2, '0')}-01`;
  return { start, end: addDays(next, -1) };
}

export const inRange = (e: Expense, r: DayRange) => e.date >= r.start && e.date <= r.end;

/** Wpis czeka na kategorię („do uzupełnienia”). */
export const isPendingCategory = (e: Expense) => e.categoryId === null;
/** Wpis w obcej walucie czeka na kurs. */
export const isPendingRate = (e: Expense) => e.amount === null;

/**
 * Sumy w zakresie: tylko żywe wpisy z kwotą. Wpisy bez kategorii liczą się do `total`
 * i do pozycji `categoryId: null`. Pozycje od największej kwoty.
 */
export function totals(
  expenses: Expense[],
  _categories: Category[],
  r: DayRange,
): { total: number; byCategory: { categoryId: string | null; amount: number }[] } {
  const by = new Map<string | null, number>();
  let total = 0;
  for (const e of expenses) {
    if (!isLive(e) || e.amount === null || !inRange(e, r)) continue;
    total += e.amount;
    by.set(e.categoryId, (by.get(e.categoryId) ?? 0) + e.amount);
  }
  const byCategory = [...by].map(([categoryId, amount]) => ({ categoryId, amount }));
  byCategory.sort((a, b) => b.amount - a.amount);
  return { total, byCategory };
}

/** Zakup syfu = żywy wydatek w kategorii z `junk: true`. Wpisy bez kategorii nie są syfem. */
export function isJunk(e: Expense, categories: Category[]): boolean {
  if (!isLive(e) || e.categoryId === null) return false;
  return categories.some((c) => c.id === e.categoryId && c.junk);
}

/**
 * Dni bez syfu: seria od dziś wstecz do pierwszego dnia z zakupem syfu,
 * nie dalej niż dzień pierwszego wydatku w aplikacji. Brak wydatków → 0.
 */
export function junkFreeDays(expenses: Expense[], categories: Category[], today: DayKey): number {
  const live = expenses.filter((e) => isLive(e) && e.date <= today);
  if (live.length === 0) return 0;
  const first = live.reduce((min, e) => (e.date < min ? e.date : min), live[0].date);
  const junkDays = new Set(live.filter((e) => isJunk(e, categories)).map((e) => e.date));
  let n = 0;
  for (let d = today; d >= first && !junkDays.has(d); d = addDays(d, -1)) n++;
  return n;
}

interface JunkStat { count: number; amount: number }

function junkStat(expenses: Expense[], categories: Category[], r: DayRange): JunkStat {
  let count = 0;
  let amount = 0;
  for (const e of expenses) {
    if (!isJunk(e, categories) || !inRange(e, r)) continue;
    count++;
    amount += e.amount ?? 0;
  }
  return { count, amount };
}

/** Syf w tym miesiącu (do dziś) vs ta sama część poprzedniego miesiąca vs cały poprzedni miesiąc. */
export function junkComparison(
  expenses: Expense[],
  categories: Category[],
  today: DayKey,
): { thisMonth: JunkStat; lastMonthSamePart: JunkStat; lastMonthFull: JunkStat } {
  const cur = monthRange(today);
  const lastFull = monthRange(addDays(cur.start, -1));
  const dayOfMonth = Number(today.slice(8, 10));
  const lastDay = Number(lastFull.end.slice(8, 10));
  const samePartEnd = `${lastFull.start.slice(0, 8)}${String(Math.min(dayOfMonth, lastDay)).padStart(2, '0')}`;
  return {
    thisMonth: junkStat(expenses, categories, { start: cur.start, end: today }),
    lastMonthSamePart: junkStat(expenses, categories, { start: lastFull.start, end: samePartEnd }),
    lastMonthFull: junkStat(expenses, categories, lastFull),
  };
}

/** Wydane w kategorii w bieżącym miesiącu vs limit; null, gdy kategoria nie ma limitu. */
export function monthlyLimitUsage(
  expenses: Expense[],
  category: Category,
  today: DayKey,
): { spent: number; limit: number } | null {
  if (category.monthlyLimit === null) return null;
  const r = monthRange(today);
  let spent = 0;
  for (const e of expenses) {
    if (isLive(e) && e.amount !== null && e.categoryId === category.id && inRange(e, r)) spent += e.amount;
  }
  return { spent, limit: category.monthlyLimit };
}

/* ───────── pomocnicze dla ekranu Wydatki ───────── */

/** Kategorie do wyboru: żywe, niezarchiwizowane; syf pierwszy, dalej wg `order`. */
export function pickableCategories(categories: Category[]): Category[] {
  return categories
    .filter((c) => isLive(c) && !c.archived)
    .sort((a, b) => Number(b.junk) - Number(a.junk) || a.order - b.order);
}

/** Wszystkie żywe kategorie wg `order` (także zarchiwizowane — do edycji). */
export function sortedCategories(categories: Category[]): Category[] {
  return categories.filter(isLive).sort((a, b) => a.order - b.order);
}

/** Moment wpisu do sortowania: płatność, a dla ręcznych — utworzenie. */
const momentOf = (e: Expense) => e.capturedAt ?? e.createdAt;

/** Wpisy „do uzupełnienia”, najnowsze pierwsze. */
export function pendingExpenses(expenses: Expense[]): Expense[] {
  return expenses.filter((e) => isLive(e) && isPendingCategory(e)).sort((a, b) => momentOf(b) - momentOf(a));
}

/** Żywe wpisy z zakresu pogrupowane po dniach — dni malejąco, w dniu najnowsze pierwsze. */
export function groupByDay(expenses: Expense[], r: DayRange): { day: DayKey; items: Expense[]; total: number }[] {
  const map = new Map<DayKey, Expense[]>();
  for (const e of expenses) {
    if (!isLive(e) || !inRange(e, r)) continue;
    if (!map.has(e.date)) map.set(e.date, []);
    map.get(e.date)!.push(e);
  }
  return [...map.entries()]
    .sort(([a], [b]) => b.localeCompare(a))
    .map(([day, items]) => ({
      day,
      items: items.sort((a, b) => momentOf(b) - momentOf(a)),
      total: items.reduce((s, e) => s + (e.amount ?? 0), 0),
    }));
}

/**
 * Sąsiedni okres (dir = -1 / 1). Dzień ±1, tydzień ±7, miesiąc → pierwszy dzień sąsiedniego miesiąca;
 * gdy wynikowy okres zawiera dziś, zwraca dziś (żeby powrót do bieżącego okresu wracał na dziś).
 */
export function shiftPeriod(day: DayKey, p: Period, dir: -1 | 1, today: DayKey): DayKey {
  let next: DayKey;
  if (p === 'day') next = addDays(day, dir);
  else if (p === 'week') next = addDays(day, 7 * dir);
  else {
    const r = monthRange(day);
    next = dir > 0 ? addDays(r.end, 1) : monthRange(addDays(r.start, -1)).start;
  }
  const r = periodRange(next, p);
  return today >= r.start && today <= r.end ? today : next;
}

/** Kwota wpisu do wyświetlenia: „12,99 zł”, „12,00 EUR ≈ 51,24 zł” albo „12,00 EUR · kurs do pobrania”. */
export function expenseAmountLabel(e: Expense): string {
  if (!e.original) return formatPLN(e.amount ?? 0);
  const f = formatForeign(e.original.amount, e.original.currency);
  return e.amount === null ? `${f} · kurs do pobrania` : `${f} ≈ ${formatPLN(e.amount)}`;
}
