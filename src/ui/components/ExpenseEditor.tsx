import { useState } from 'preact/hooks';
import type { Category, Expense } from '../../data/model';
import { categorizeExpense, deleteExpense } from '../../data/store';
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
  const dirty = note.trim() !== expense.note || (foreign && pln !== toField(expense.amount));

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
        <input value={note} onInput={(e) => setNote(e.currentTarget.value)} enterKeyHint="done" />
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
