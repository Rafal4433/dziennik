import type { Category, Expense, MerchantRule } from '../../data/model';
import { expenseAmountLabel, suggestCategory } from '../../domain/expenses';
import { ExpenseEditor } from './ExpenseEditor';

interface Props {
  expense: Expense;
  /** `pickableCategories`. */
  categories: Category[];
  rules: MerchantRule[];
  expanded: boolean;
  onToggle: () => void;
}

const timeFmt = new Intl.DateTimeFormat('pl-PL', { timeZone: 'Europe/Warsaw', hour: '2-digit', minute: '2-digit' });

/** Wpis „do uzupełnienia”: sklep, godzina, kwota; stuknięcie rozwija przyciski kategorii. */
export function PendingExpenseRow({ expense, categories, rules, expanded, onToggle }: Props) {
  const suggested = expense.merchant ? suggestCategory(expense.merchant, rules, categories) : null;
  return (
    <li class={`expense${expanded ? ' is-open' : ''}`}>
      <button class="expense-line" onClick={onToggle} aria-expanded={expanded}>
        <span class="expense-name">{expense.merchant || expense.note || 'Wydatek'}</span>
        {expense.capturedAt !== null && <span class="expense-time num">{timeFmt.format(expense.capturedAt)}</span>}
        <span class={`expense-amount num${expense.amount === null ? ' muted' : ''}`}>{expenseAmountLabel(expense)}</span>
      </button>
      {expanded && <ExpenseEditor expense={expense} categories={categories} suggested={suggested} onDone={onToggle} />}
    </li>
  );
}
