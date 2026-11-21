import { RESPONSE_SCHEMA, extractJson, parseResponse, systemPrompt, type AssistantAction, type AssistantContext } from '../domain/assistant';
import { formatMinutes } from '../lib/format';
import { relativeDayName } from '../lib/date';
import { addExpense, addHabit, addTask, deleteExpense, deleteHabit, deleteTask, getState } from './store';

/**
 * Połączenie asystenta z modelem. Dowolny dostawca zgodny z API OpenAI (`/chat/completions`):
 * OpenRouter (domyślnie), a także lokalnie Ollama / LM Studio w tej samej sieci.
 * Ustawienia trzymamy w localStorage tego urządzenia — to nie są dane dziennika i nie trafiają do kopii.
 */

export interface AssistantConfig {
  baseUrl: string;
  model: string;
  apiKey: string;
}

export const DEFAULT_CONFIG: AssistantConfig = {
  baseUrl: 'https://openrouter.ai/api/v1',
  model: 'anthropic/claude-haiku-5.5',
  apiKey: '',
};

const KEY = 'dziennik.assistant';

export function loadConfig(): AssistantConfig {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return { ...DEFAULT_CONFIG, ...JSON.parse(raw) };
  } catch {
    /* brak dostępu do localStorage — zostają domyślne */
  }
  return { ...DEFAULT_CONFIG };
}

export function saveConfig(c: AssistantConfig) {
  try {
    localStorage.setItem(KEY, JSON.stringify(c));
  } catch {
    /* np. tryb prywatny — trudno */
  }
}

const isOpenRouter = (c: AssistantConfig) => c.baseUrl.includes('openrouter.ai');

/** Czy da się wysłać zapytanie (OpenRouter wymaga klucza, lokalny serwer nie). */
export function isConfigured(c: AssistantConfig = loadConfig()): boolean {
  return !!c.baseUrl.trim() && !!c.model.trim() && (!isOpenRouter(c) || !!c.apiKey.trim());
}

export class AssistantError extends Error {}

function context(): AssistantContext {
  const s = getState();
  const categories = s.data.categories
    .filter((c) => c.deletedAt === null && !c.archived)
    .sort((a, b) => a.order - b.order)
    .map((c) => c.name);
  return { today: s.today, categories };
}

async function chat(c: AssistantConfig, ctx: AssistantContext, text: string, structured: boolean, signal?: AbortSignal): Promise<string> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (c.apiKey.trim()) headers.Authorization = `Bearer ${c.apiKey.trim()}`;
  if (isOpenRouter(c)) headers['X-Title'] = 'Dziennik';

  const system = structured
    ? systemPrompt(ctx)
    : `${systemPrompt(ctx)}\n\nOdpowiedz WYŁĄCZNIE obiektem JSON (bez komentarza) o kształcie: {"reply": string, "actions": [{"type": "task"|"habit"|"expense", "title", "date", "estimateMin", "name", "kind", "unit", "frequency": {"kind","times","days"}|null, "amount", "currency", "category", "note"}]} — pola nieużywane w danym typie ustaw na null.`;

  const body: Record<string, unknown> = {
    model: c.model.trim(),
    temperature: 0,
    max_tokens: 1200,
    messages: [
      { role: 'system', content: system },
      { role: 'user', content: text },
    ],
  };
  if (structured) body.response_format = { type: 'json_schema', json_schema: { name: 'dziennik_actions', strict: true, schema: RESPONSE_SCHEMA } };

  let res: Response;
  try {
    res = await fetch(`${c.baseUrl.trim().replace(/\/+$/, '')}/chat/completions`, { method: 'POST', headers, body: JSON.stringify(body), signal });
  } catch (err) {
    if ((err as Error).name === 'AbortError') throw err;
    throw new AssistantError('Brak połączenia z modelem. Sprawdź internet albo adres serwera w Ustawieniach.');
  }
  if (!res.ok) {
    if (res.status === 401 || res.status === 403) throw new AssistantError('Klucz API nie działa — sprawdź go w Ustawieniach.');
    if (res.status === 402) throw new AssistantError('Na koncie OpenRouter skończyły się środki.');
    if (res.status === 429) throw new AssistantError('Za dużo zapytań naraz — spróbuj za chwilę.');
    const detail = await res.text().catch(() => '');
    const err = new AssistantError(`Model zwrócił błąd ${res.status}.`);
    (err as AssistantError & { status?: number; detail?: string }).status = res.status;
    (err as AssistantError & { detail?: string }).detail = detail;
    throw err;
  }
  const json = (await res.json()) as { choices?: { message?: { content?: string | null } }[] };
  const content = json.choices?.[0]?.message?.content;
  if (!content) throw new AssistantError('Model nie odpowiedział.');
  return content;
}

/** Wysyła wypowiedź do modelu i zwraca sprawdzone akcje (jeszcze niezapisane). */
export async function interpret(text: string, signal?: AbortSignal): Promise<{ reply: string; actions: AssistantAction[] }> {
  const c = loadConfig();
  if (!isConfigured(c)) throw new AssistantError('Asystent nie jest skonfigurowany — dodaj klucz w Ustawieniach.');
  const ctx = context();
  let content: string;
  try {
    content = await chat(c, ctx, text, true, signal);
  } catch (err) {
    // Część modeli (zwłaszcza lokalnych) nie zna response_format — wtedy prosimy o JSON w samym prompcie.
    if ((err as { status?: number }).status === 400 || (err as { status?: number }).status === 422) content = await chat(c, ctx, text, false, signal);
    else throw err;
  }
  try {
    return parseResponse(extractJson(content), ctx);
  } catch {
    throw new AssistantError('Nie zrozumiałem odpowiedzi modelu — spróbuj powiedzieć to inaczej.');
  }
}

/* ───────── zapis i cofanie ───────── */

export interface AppliedAction {
  action: AssistantAction;
  /** Krótki opis do listy „Dodano”. */
  label: string;
  detail: string;
  undo: () => void;
}

const FREQ_LABEL = (a: Extract<AssistantAction, { type: 'habit' }>): string => {
  if (a.kind === 'quit') return 'do rzucenia';
  const f = a.frequency;
  const base = f.kind === 'daily' ? 'codziennie' : f.kind === 'timesPerWeek' ? `${f.times}× w tygodniu` : f.days.map((d) => ['pn', 'wt', 'śr', 'cz', 'pt', 'sb', 'nd'][d - 1]).join(', ');
  return a.kind === 'measure' ? `${base} · pomiar${a.unit ? ` w ${a.unit}` : ''}` : base;
};

function dayLabel(day: string): string {
  const today = getState().today;
  return relativeDayName(day, today) ?? day.split('-').reverse().slice(0, 2).join('.');
}

function money(amount: number, currency: string): string {
  return `${amount.toLocaleString('pl-PL', { minimumFractionDigits: amount % 1 ? 2 : 0, maximumFractionDigits: 2 })} ${currency === 'PLN' ? 'zł' : currency}`;
}

/** Zapisuje akcje od razu (płynnie, bez dodatkowego potwierdzania) — każdą da się cofnąć. */
export async function applyActions(actions: AssistantAction[]): Promise<AppliedAction[]> {
  const out: AppliedAction[] = [];
  const categories = getState().data.categories;
  for (const a of actions) {
    if (a.type === 'task') {
      const id = addTask(a.title, a.date, { estimateMin: a.estimateMin });
      if (!id) continue;
      out.push({ action: a, label: a.title, detail: ['Zadanie', dayLabel(a.date), a.estimateMin ? formatMinutes(a.estimateMin) : ''].filter(Boolean).join(' · '), undo: () => deleteTask(id) });
    } else if (a.type === 'habit') {
      const id = addHabit({ name: a.name, kind: a.kind, unit: a.unit, frequency: a.frequency });
      if (!id) continue;
      out.push({ action: a, label: a.name, detail: `Nawyk · ${FREQ_LABEL(a)}`, undo: () => deleteHabit(id) });
    } else {
      const cat = a.category ? categories.find((c) => c.deletedAt === null && c.name === a.category) : undefined;
      const id = await addExpense({ amount: a.amount, currency: a.currency, categoryId: cat?.id ?? null, note: a.note, date: a.date });
      out.push({
        action: a,
        label: `${money(a.amount, a.currency)}${a.note ? ` · ${a.note}` : ''}`,
        detail: ['Wydatek', cat?.name ?? 'bez kategorii', dayLabel(a.date)].join(' · '),
        undo: () => deleteExpense(id),
      });
    }
  }
  return out;
}
