import { useState } from 'preact/hooks';
import { useAppState } from '../../data/store';
import { expenseAmountLabel, pendingExpenses, pickableCategories } from '../../domain/expenses';
import { plural } from '../../lib/format';
import { AddExpense } from '../components/AddExpense';
import { CategoryEditor } from '../components/CategoryEditor';
import { PendingExpenseRow } from '../components/PendingExpenseRow';
import { PeriodView } from '../components/PeriodView';

/** Ekran Wydatki w stylu „Dziś”: suma okresu, kategorie, ostatnie wpisy, zwijane dodawanie. */
export function ExpensesScreen() {
  const s = useAppState();
  const { today } = s;
  const { expenses, categories: allCategories, merchantRules } = s.data;
  const categories = pickableCategories(allCategories);
  const pending = pendingExpenses(expenses);
  /** Jeden rozwinięty wiersz naraz; klucz z prefiksem, bo wpis bez kategorii jest też na liście okresu. */
  const [expanded, setExpanded] = useState<string | null>(null);
  const [editCats, setEditCats] = useState(false);
  const [showPending, setShowPending] = useState(false);
  const [adding, setAdding] = useState(false);

  const first = pending[0];
  const pendingNote = pending.length > 0 && (
    <>
      <div class="note pending-note">
        <span>
          {pending.length === 1
            ? `${first.merchant || first.note || 'Wydatek'}, ${expenseAmountLabel(first)} czeka na kategorię`
            : `${pending.length} ${plural(pending.length, 'płatność czeka', 'płatności czekają', 'płatności czeka')} na kategorię`}
        </span>
        <button class="btn" onClick={() => setShowPending(!showPending)} aria-expanded={showPending}>
          {showPending ? 'Zwiń' : 'Uzupełnij'}
        </button>
      </div>
      {showPending && (
        <ul class="plain-list">
          {pending.map((e) => (
            <PendingExpenseRow
              key={e.id}
              expense={e}
              categories={categories}
              rules={merchantRules}
              expanded={expanded === `p:${e.id}`}
              onToggle={() => setExpanded(expanded === `p:${e.id}` ? null : `p:${e.id}`)}
            />
          ))}
        </ul>
      )}
    </>
  );

  return (
    <main class="screen">
      <header class="page-head">
        <h1 class="page-title">Wydatki</h1>
      </header>

      <PeriodView
        expenses={expenses}
        allCategories={allCategories}
        categories={categories}
        today={today}
        expanded={expanded}
        setExpanded={setExpanded}
        pendingNote={pendingNote}
        editingCategories={editCats}
        onToggleCategories={() => setEditCats(!editCats)}
        categoryEditor={<CategoryEditor />}
      />

      <div class="section-foot">
        {adding ? (
          <AddExpense onClose={() => setAdding(false)} autoFocus />
        ) : (
          <button class="add-row" onClick={() => setAdding(true)}>
            <span class="add-mark" aria-hidden="true">+</span>
            <span class="add-row-label">Dodaj wydatek</span>
          </button>
        )}
      </div>

    </main>
  );
}
