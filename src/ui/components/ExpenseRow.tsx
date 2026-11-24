import type { Category, Expense } from '../../data/model';
import { expenseAmountLabel } from '../../domain/expenses';
import { ExpenseEditor } from './ExpenseEditor';

interface Props {
  expense: Expense;
  /** Wszystkie kategorie (także zarchiwizowane) — do nazwy na wpisie. */
  allCategories: Category[];
  /** `pickableCategories` — do panelu edycji. */
  categories: Category[];
  expanded: boolean;
  onToggle: () => void;
}

/** Wiersz listy okresu: sklep, pod nim kategoria, kwota po prawej; stuknięcie otwiera ten sam panel co „Do uzupełnienia”. */
export function ExpenseRow({ expense, allCategories, categories, expanded, onToggle }: Props) {
  const cat = expense.categoryId === null ? null : allCategories.find((c) => c.id === expense.categoryId);
  // Bez sklepu i notatki nazwą wiersza jest sama kategoria (nie „Wydatek” pod nagłówkiem „Wydatki”).
  const name = expense.merchant || expense.note || null;
  const catName = expense.categoryId === null ? 'do uzupełnienia' : (cat?.name ?? '—');
  return (
    <li class={`expense${expanded ? ' is-open' : ''}`}>
      <button class="expense-line" onClick={onToggle} aria-expanded={expanded}>
        <span class="expense-name">
          <span>{name ?? catName.charAt(0).toUpperCase() + catName.slice(1)}</span>
          {name && (
            <span class="expense-cat">
              {catName}
              {/* Przy płatności ze sklepem notatka nie jest nazwą wiersza — bez tego wyglądała na niezapisaną. */}
              {expense.merchant && expense.note ? ` · ${expense.note}` : ''}
            </span>
          )}
        </span>
        <span class={`expense-amount num${expense.amount === null ? ' muted' : ''}`}>{expenseAmountLabel(expense)}</span>
      </button>
      {expanded && <ExpenseEditor expense={expense} categories={categories} suggested={null} onDone={onToggle} />}
    </li>
  );
}
