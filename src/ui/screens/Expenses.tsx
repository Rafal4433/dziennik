import { useState } from 'preact/hooks';
import { Capacitor } from '@capacitor/core';
import { useAppState } from '../../data/store';
import { pendingExpenses, pickableCategories } from '../../domain/expenses';
import { AddExpense } from '../components/AddExpense';
import { CategoryEditor } from '../components/CategoryEditor';
import { JunkSummary } from '../components/JunkSummary';
import { PendingExpenseRow } from '../components/PendingExpenseRow';
import { PeriodView } from '../components/PeriodView';
import { ShortcutSetup } from '../components/ShortcutSetup';

/** Ekran Wydatki: do uzupełnienia, syf, okres, ręczne dodanie, kategorie. */
export function ExpensesScreen() {
  const s = useAppState();
  const { today } = s;
  const { expenses, categories: allCategories, merchantRules } = s.data;
  const categories = pickableCategories(allCategories);
  const pending = pendingExpenses(expenses);
  /** Jeden rozwinięty wiersz naraz; klucz z prefiksem, bo wpis bez kategorii jest też na liście okresu. */
  const [expanded, setExpanded] = useState<string | null>(null);
  const [editCats, setEditCats] = useState(false);
  const showSetup = Capacitor.isNativePlatform() && !expenses.some((e) => e.source === 'applepay');

  return (
    <main class="screen">
      <header class="page-head">
        <span class="eyebrow">Pieniądze</span>
        <h1 class="page-title">Wydatki</h1>
      </header>

      {pending.length > 0 && (
        <section class="section">
          <header class="section-head">
            <h2>Do uzupełnienia</h2>
            <span class="section-stat num">{pending.length}</span>
          </header>
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
        </section>
      )}

      {showSetup && (
        <section class="section">
          <ShortcutSetup />
        </section>
      )}

      <section class="section">
        <header class="section-head">
          <h2>Syf</h2>
        </header>
        <JunkSummary expenses={expenses} categories={allCategories} today={today} />
      </section>

      <PeriodView
        expenses={expenses}
        allCategories={allCategories}
        categories={categories}
        today={today}
        expanded={expanded}
        setExpanded={setExpanded}
      />

      <section class="section">
        <header class="section-head">
          <h2>Dodaj ręcznie</h2>
        </header>
        <AddExpense />
      </section>

      <section class="section">
        <header class="section-head">
          <h2>Kategorie</h2>
          <button class="btn-text" onClick={() => setEditCats(!editCats)} aria-expanded={editCats}>
            {editCats ? 'Gotowe' : 'Edytuj'}
          </button>
        </header>
        {editCats ? <CategoryEditor /> : <p class="empty">{categories.map((c) => c.name).join(' · ')}</p>}
      </section>
    </main>
  );
}
