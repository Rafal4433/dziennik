import { useEffect, useRef, useState } from 'preact/hooks';
import type { Category, Expense } from '../../data/model';
import { categorizeExpense, deleteExpense, updateExpenseNote } from '../../data/store';
import { parseAmount } from '../../domain/expenses';
import { CategoryChips } from './CategoryChips';

interface Props {
  expense: Expense;
  /** `pickableCategories` — syf pierwszy, bez zarchiwizowanych. */
  categories: Category[];
  suggested: string | null;
  onDone: () => void;
}

const toField = (grosze: number | null) => (grosze === null ? '' : (grosze / 100).toFixed(2).replace('.', ','));

/**
 * Panel uzupełniania / edycji wydatku: stuknięcie kategorii zapisuje (razem z notatką i kwotą w zł).
 * Ten sam w „Do uzupełnienia” i na liście okresu.
 */
export function ExpenseEditor({ expense, categories, suggested, onDone }: Props) {
  const [note, setNote] = useState(expense.note);
  const foreign = expense.original !== null;
  const [pln, setPln] = useState(toField(expense.amount));
  const [invalid, setInvalid] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  // Notatka zapisuje się sama (chwilę po wpisaniu i przy zamknięciu panelu); stuknięcia kategorii wymaga
  // tylko zmiana kwoty w zł. Nie polegamy na `blur`: na iPhonie stuknięcie wiersza (przycisku) nie zdejmuje
  // fokusu z pola, panel się zwija, pole znika bez `blur` i notatka przepadała.
  const latestNote = useRef(note);
  latestNote.current = note;
  useEffect(() => {
    const t = setTimeout(() => updateExpenseNote(expense.id, note.trim()), 400);
    return () => clearTimeout(t);
  }, [note, expense.id]);
  useEffect(() => () => updateExpenseNote(expense.id, latestNote.current.trim()), [expense.id]);
  const dirty = foreign && pln !== toField(expense.amount);

  const pick = (categoryId: string) => {
    const patch: { note?: string; amount?: number } = {};
    if (note.trim() !== expense.note) patch.note = note.trim();
    if (foreign && pln !== toField(expense.amount) && pln.trim()) {
      const grosze = parseAmount(pln);
      if (grosze === null) return setInvalid(true);
      patch.amount = grosze;
    }
    categorizeExpense(expense.id, categoryId, patch);
    onDone();
  };

  return (
    <div class="expense-panel">
      <CategoryChips
        categories={categories}
        current={expense.categoryId}
        suggested={suggested}
        label="Kategoria"
        onPick={pick}
      />
      {dirty && expense.categoryId !== null && <p class="hint">Stuknij kategorię, aby zapisać zmiany.</p>}

      <label class="field">
        <span class="field-label">Notatka (opcjonalnie)</span>
        <input
          value={note}
          onInput={(e) => setNote(e.currentTarget.value)}
          onBlur={() => updateExpenseNote(expense.id, note.trim())}
          enterKeyHint="done"
          placeholder="np. obiad z Kasią"
        />
      </label>

      {foreign && (
        <label class="field">
          <span class="field-label">Kwota w zł</span>
          <input
            class="num"
            inputMode="decimal"
            enterKeyHint="done"
            value={pln}
            placeholder={expense.amount === null ? 'kurs do pobrania' : ''}
            onInput={(e) => {
              setPln(e.currentTarget.value);
              setInvalid(false);
            }}
          />
          {invalid && <span class="hint">Nie rozumiem tej kwoty — wpisz np. 51,24.</span>}
        </label>
      )}

      {confirmDelete ? (
        <div class="prompt-actions">
          <span class="muted">Usunąć ten wydatek?</span>
          <button class="btn" type="button" onClick={() => deleteExpense(expense.id)}>Usuń</button>
          <button class="btn-text" type="button" onClick={() => setConfirmDelete(false)}>Zostaw</button>
        </div>
      ) : (
        <div class="detail-actions">
          <button class="btn-text quiet" type="button" onClick={() => setConfirmDelete(true)}>Usuń</button>
        </div>
      )}
    </div>
  );
}
