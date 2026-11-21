import { useRef, useState } from 'preact/hooks';
import type { DayKey } from '../../data/model';
import { addExpense, useAppState } from '../../data/store';
import { parseAmount, pickableCategories } from '../../domain/expenses';
import { formatForeign } from '../../domain/currency';
import { formatPLN } from '../../lib/format';
import { CategoryChips } from './CategoryChips';

const CURRENCIES = ['PLN', 'EUR', 'USD', 'GBP', 'CZK', 'CHF'];

interface Props {
  /** Dzień wpisu; domyślnie dziś. W trybie pełnym to tylko wartość startowa pola „Dzień”. */
  date?: DayKey;
  /** Tylko kwota + kategoria (PLN, dzień z `date`) — do sekcji na „Dziś”. */
  compact?: boolean;
  /** Fokus na kwocie od razu (formularz rozwinięty stuknięciem). */
  autoFocus?: boolean;
  /** Zwinięcie formularza (na „Dziś”). */
  onClose?: () => void;
}

/**
 * Ręczne dodanie wydatku. Kwota, potem stuknięcie kategorii zapisuje wpis.
 * Kwotę parsujemy dopiero przy zapisie — w trakcie pisania „12,” jest w porządku.
 */
export function AddExpense({ date, compact = false, autoFocus = false, onClose }: Props) {
  const s = useAppState();
  const categories = pickableCategories(s.data.categories);
  const [amount, setAmount] = useState('');
  const [currency, setCurrency] = useState('PLN');
  const [note, setNote] = useState('');
  const [day, setDay] = useState<DayKey>(date ?? s.today);
  const [hint, setHint] = useState<string | null>(null);
  const [saved, setSaved] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const amountRef = useRef<HTMLInputElement>(null);

  const targetDay = compact ? (date ?? s.today) : day || s.today;
  const cur = compact ? 'PLN' : currency;

  const save = async (categoryId: string) => {
    const grosze = parseAmount(amount);
    if (grosze === null) {
      setHint(amount.trim() ? 'Nie rozumiem tej kwoty — wpisz np. 12,50.' : 'Wpisz kwotę, np. 12,50 — potem stuknij kategorię.');
      amountRef.current?.focus();
      return;
    }
    setBusy(true);
    try {
      await addExpense({ amount: grosze / 100, currency: cur, categoryId, note: note.trim(), date: targetDay });
    } finally {
      setBusy(false);
    }
    const name = categories.find((c) => c.id === categoryId)?.name ?? '';
    setSaved(`Zapisano ${cur === 'PLN' ? formatPLN(grosze) : formatForeign(grosze / 100, cur)} w kategorii ${name}.`);
    setAmount('');
    setNote('');
    setHint(null);
  };

  return (
    <form
      class={`add-expense${compact ? ' is-compact' : ''}`}
      onSubmit={(e) => {
        e.preventDefault();
        setHint(parseAmount(amount) === null ? 'Wpisz kwotę, np. 12,50 — potem stuknij kategorię.' : 'Stuknij kategorię, aby zapisać.');
      }}
    >
      <div class="add-expense-row">
        <label class="field add-expense-amount">
          {!compact && <span class="field-label">Kwota</span>}
          <input
            aria-label={compact ? 'Kwota wydatku w zł' : undefined}
            ref={amountRef}
            autoFocus={autoFocus}
            class="num"
            inputMode="decimal"
            enterKeyHint="done"
            autoComplete="off"
            placeholder="0,00"
            value={amount}
            onInput={(e) => {
              setAmount(e.currentTarget.value);
              setHint(null);
              setSaved(null);
            }}
          />
        </label>
        {!compact && (
          <label class="field add-expense-currency">
            <span class="field-label">Waluta</span>
            <select value={currency} onChange={(e) => setCurrency(e.currentTarget.value)}>
              {CURRENCIES.map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
          </label>
        )}
      </div>

      {compact && (
        <input
          class="add-expense-note"
          aria-label="Notatka (opcjonalnie)"
          placeholder="Notatka, np. obiad z Kasią (opcjonalnie)"
          value={note}
          onInput={(e) => setNote(e.currentTarget.value)}
          enterKeyHint="done"
        />
      )}

      {!compact && (
        <div class="field-row">
          <label class="field">
            <span class="field-label">Notatka (opcjonalnie)</span>
            <input value={note} onInput={(e) => setNote(e.currentTarget.value)} enterKeyHint="done" />
          </label>
          <label class="field">
            <span class="field-label">Dzień</span>
            <input type="date" class="num" value={day} max={s.today} onInput={(e) => setDay(e.currentTarget.value)} />
          </label>
        </div>
      )}

      <div class="field">
        {!compact && <span class="field-label">Kategoria (stuknięcie zapisuje)</span>}
        <CategoryChips categories={categories} label="Zapisz w kategorii" disabled={busy} onPick={(id) => void save(id)} />
      </div>

      {(hint || saved || onClose) && (
        <div class="add-expense-foot">
          {hint && <p class="hint" role="status">{hint}</p>}
          {saved && !hint && <p class="hint" role="status">{saved}</p>}
          {onClose && (
            <button type="button" class="btn-text quiet" onClick={onClose}>Zwiń</button>
          )}
        </div>
      )}
    </form>
  );
}
