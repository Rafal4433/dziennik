import type { DayKey, HabitFrequency, HabitKind } from '../data/model';

/**
 * Asystent: zdanie po ludzku („dodaj zadanie…”, „wydałem 40 zł na…”) → lista akcji.
 * Ten moduł jest czysty (bez sieci i bez store): buduje prompt, schemat odpowiedzi
 * i sprawdza to, co zwrócił model — niczego nie zapisujemy na ślepo.
 */

export type AssistantAction =
  | { type: 'task'; title: string; date: DayKey; estimateMin: number | null }
  | { type: 'habit'; name: string; kind: HabitKind; unit: string | null; frequency: HabitFrequency }
  | { type: 'expense'; amount: number; currency: string; category: string | null; note: string; date: DayKey };

export interface AssistantContext {
  today: DayKey;
  /** Nazwy aktywnych kategorii wydatków. */
  categories: string[];
}

const WEEKDAYS = ['poniedziałek', 'wtorek', 'środa', 'czwartek', 'piątek', 'sobota', 'niedziela'];

function weekdayName(day: DayKey): string {
  const [y, m, d] = day.split('-').map(Number);
  const wd = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
  return WEEKDAYS[(wd + 6) % 7];
}

export function systemPrompt(ctx: AssistantContext): string {
  return [
    'Jesteś asystentem w osobistej aplikacji „Dziennik” (zadania, nawyki, wydatki).',
    'Użytkownik mówi po polsku (często przez dyktowanie, więc tekst może mieć błędy i brak interpunkcji).',
    'Zamień wypowiedź na listę akcji do zapisania. Jedno zdanie może zawierać kilka akcji.',
    '',
    `Dziś jest ${ctx.today} (${weekdayName(ctx.today)}). Daty zwracaj jako YYYY-MM-DD; „jutro”, „w piątek” itp. przelicz względem dziś. Bez daty = dziś.`,
    '',
    'Typy akcji:',
    '- task: zadanie do zrobienia. title krótko, w bezokoliczniku lub tak jak powiedział użytkownik, bez słów „dodaj zadanie”. estimateMin = szacowany czas w minutach, jeśli padł („pół godziny” = 30), inaczej null.',
    '- habit: nowy nawyk. kind: "check" (odhaczany), "measure" (z liczbą, np. waga — wtedy unit np. "kg"), "quit" (coś do rzucenia, np. palenie). frequency.kind: "daily", "timesPerWeek" (times 1–7) albo "weekdays" (days: 1=pon … 7=nd). Gdy nic nie powiedziano: daily.',
    '- expense: wydatek. amount = kwota w jednostkach waluty (np. 42.5), currency = kod ISO (zł/złotych = PLN, domyślnie PLN). category = DOKŁADNIE jedna z nazw z listy poniżej albo null, jeśli żadna nie pasuje. note = krótko na co / gdzie (np. „Żabka”, „kawa”).',
    '',
    `Kategorie wydatków: ${ctx.categories.length ? ctx.categories.map((c) => `„${c}”`).join(', ') : '(brak)'}.`,
    '',
    'Jeśli wypowiedź nie jest poleceniem dodania zadania, nawyku ani wydatku, zwróć pustą listę akcji i w polu reply krótko (po polsku) powiedz, co umiesz.',
    'Pole reply: jedno krótkie zdanie po polsku podsumowujące, co dodajesz.',
  ].join('\n');
}

/** JSON Schema odpowiedzi (structured outputs, tryb strict). */
export const RESPONSE_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['reply', 'actions'],
  properties: {
    reply: { type: 'string' },
    actions: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['type', 'title', 'date', 'estimateMin', 'name', 'kind', 'unit', 'frequency', 'amount', 'currency', 'category', 'note'],
        properties: {
          type: { type: 'string', enum: ['task', 'habit', 'expense'] },
          title: { type: ['string', 'null'] },
          date: { type: ['string', 'null'] },
          estimateMin: { type: ['number', 'null'] },
          name: { type: ['string', 'null'] },
          kind: { type: ['string', 'null'], enum: ['check', 'measure', 'quit', null] },
          unit: { type: ['string', 'null'] },
          frequency: {
            type: ['object', 'null'],
            additionalProperties: false,
            required: ['kind', 'times', 'days'],
            properties: {
              kind: { type: 'string', enum: ['daily', 'timesPerWeek', 'weekdays'] },
              times: { type: ['number', 'null'] },
              days: { type: ['array', 'null'], items: { type: 'number' } },
            },
          },
          amount: { type: ['number', 'null'] },
          currency: { type: ['string', 'null'] },
          category: { type: ['string', 'null'] },
          note: { type: ['string', 'null'] },
        },
      },
    },
  },
} as const;

/** Wyciąga obiekt JSON z odpowiedzi — także gdy model owinął go w ```json albo dopisał zdanie. */
export function extractJson(text: string): unknown {
  const t = text.trim();
  try {
    return JSON.parse(t);
  } catch {
    const start = t.indexOf('{');
    const end = t.lastIndexOf('}');
    if (start === -1 || end <= start) throw new Error('Model nie zwrócił JSON-a.');
    return JSON.parse(t.slice(start, end + 1));
  }
}

const isDayKey = (v: unknown): v is DayKey => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(Date.parse(v));
const str = (v: unknown): string => (typeof v === 'string' ? v.trim() : '');
const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : typeof v === 'string' && v.trim() !== '' && Number.isFinite(Number(v.replace(',', '.'))) ? Number(v.replace(',', '.')) : null);

function frequencyOf(v: unknown): HabitFrequency {
  const f = (v ?? {}) as { kind?: unknown; times?: unknown; days?: unknown };
  if (f.kind === 'timesPerWeek') {
    const times = Math.round(num(f.times) ?? 0);
    if (times >= 1 && times <= 6) return { kind: 'timesPerWeek', times };
    if (times >= 7) return { kind: 'daily' };
  }
  if (f.kind === 'weekdays' && Array.isArray(f.days)) {
    const days = [...new Set(f.days.map(Number).filter((d) => Number.isInteger(d) && d >= 1 && d <= 7))].sort();
    if (days.length === 7) return { kind: 'daily' };
    if (days.length) return { kind: 'weekdays', days };
  }
  return { kind: 'daily' };
}

/** Dopasowanie nazwy kategorii od modelu do istniejącej (bez wielkości liter i ogonków). */
export function matchCategory(name: string | null, categories: string[]): string | null {
  if (!name) return null;
  const norm = (s: string) => s.toLocaleLowerCase('pl').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/ł/g, 'l').trim();
  const n = norm(name);
  return categories.find((c) => norm(c) === n) ?? null;
}

/** Sprawdza odpowiedź modelu i zwraca tylko poprawne akcje. */
export function parseResponse(raw: unknown, ctx: AssistantContext): { reply: string; actions: AssistantAction[] } {
  const obj = (raw ?? {}) as { reply?: unknown; actions?: unknown };
  const list = Array.isArray(obj.actions) ? obj.actions : [];
  const actions: AssistantAction[] = [];
  for (const item of list) {
    const a = (item ?? {}) as Record<string, unknown>;
    const date = isDayKey(a.date) ? a.date : ctx.today;
    if (a.type === 'task') {
      const title = str(a.title) || str(a.name);
      if (!title) continue;
      const est = num(a.estimateMin);
      actions.push({ type: 'task', title, date, estimateMin: est && est > 0 ? Math.round(est) : null });
    } else if (a.type === 'habit') {
      const name = str(a.name) || str(a.title);
      if (!name) continue;
      const kind: HabitKind = a.kind === 'measure' || a.kind === 'quit' ? a.kind : 'check';
      const unit = kind === 'measure' ? str(a.unit) || null : null;
      actions.push({ type: 'habit', name, kind, unit, frequency: kind === 'quit' ? { kind: 'daily' } : frequencyOf(a.frequency) });
    } else if (a.type === 'expense') {
      const amount = num(a.amount);
      if (amount === null || amount <= 0) continue;
      const cur = str(a.currency).toUpperCase();
      const currency = /^[A-Z]{3}$/.test(cur) ? cur : 'PLN';
      actions.push({ type: 'expense', amount: Math.round(amount * 100) / 100, currency, category: matchCategory(str(a.category) || null, ctx.categories), note: str(a.note), date });
    }
  }
  return { reply: str(obj.reply), actions };
}
