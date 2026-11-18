import { useState } from 'preact/hooks';
import type { Category } from '../../data/model';
import { addCategory, updateCategory, useAppState } from '../../data/store';
import { parseAmount, sortedCategories } from '../../domain/expenses';

const limitField = (grosze: number | null) => (grosze === null ? '' : (grosze / 100).toFixed(2).replace('.', ','));

/** Kategorie: nazwa, limit miesięczny, „syf”, kolejność, archiwizacja i dodawanie nowych. */
export function CategoryEditor() {
  const s = useAppState();
  const all = sortedCategories(s.data.categories);
  const active = all.filter((c) => !c.archived);
  const archived = all.filter((c) => c.archived);

  /** Przesuwa kategorię o jedno miejsce i numeruje `order` od nowa (stare dane mogą mieć duplikaty). */
  const move = (id: string, dir: -1 | 1) => {
    const list = [...active];
    const i = list.findIndex((c) => c.id === id);
    const j = i + dir;
    if (i < 0 || j < 0 || j >= list.length) return;
    [list[i], list[j]] = [list[j], list[i]];
    list.forEach((c, order) => c.order !== order && updateCategory(c.id, { order }));
  };

  return (
    <div class="cat-editor">
      <ul class="plain-list">
        {active.map((c, i) => (
          <CategoryItem key={c.id} category={c} first={i === 0} last={i === active.length - 1} onMove={(d) => move(c.id, d)} />
        ))}
      </ul>
      <NewCategory />
      {archived.length > 0 && (
        <div class="cat-archived">
          <span class="field-label">W archiwum</span>
          <ul class="plain-list">
            {archived.map((c) => (
              <li key={c.id} class="plain-item">
                <span class="muted">{c.name}</span>
                <button class="btn-text" onClick={() => updateCategory(c.id, { archived: false, order: active.length })}>Przywróć</button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

function CategoryItem({ category: c, first, last, onMove }: { category: Category; first: boolean; last: boolean; onMove: (dir: -1 | 1) => void }) {
  const [limit, setLimit] = useState(limitField(c.monthlyLimit));
  const [badLimit, setBadLimit] = useState(false);
  return (
    <li class="cat-item">
      <div class="cat-fields">
        <label class="field">
          <span class="field-label">Nazwa</span>
          <input
            value={c.name}
            enterKeyHint="done"
            onChange={(e) => {
              const v = e.currentTarget.value.trim();
              if (v && v !== c.name) updateCategory(c.id, { name: v });
              else e.currentTarget.value = c.name;
            }}
          />
        </label>
        <label class="field">
          <span class="field-label">Limit / mies., zł</span>
          <input
            class="num"
            inputMode="decimal"
            enterKeyHint="done"
            placeholder="brak"
            value={limit}
            onInput={(e) => {
              setLimit(e.currentTarget.value);
              setBadLimit(false);
            }}
            onChange={(e) => {
              const v = e.currentTarget.value.trim();
              if (!v) return updateCategory(c.id, { monthlyLimit: null });
              const grosze = parseAmount(v);
              if (grosze === null) return setBadLimit(true);
              setLimit(limitField(grosze));
              updateCategory(c.id, { monthlyLimit: grosze });
            }}
          />
        </label>
      </div>
      {badLimit && <p class="hint">Nie rozumiem tego limitu — wpisz np. 150 albo zostaw puste.</p>}
      <div class="cat-actions">
        <label class="toggle">
          <input type="checkbox" checked={c.junk} onChange={(e) => updateCategory(c.id, { junk: e.currentTarget.checked })} />
          <span>syf</span>
        </label>
        <span class="cat-move">
          <button class="icon-btn" disabled={first} onClick={() => onMove(-1)} aria-label={`Przesuń „${c.name}” wyżej`}>↑</button>
          <button class="icon-btn" disabled={last} onClick={() => onMove(1)} aria-label={`Przesuń „${c.name}” niżej`}>↓</button>
        </span>
        <button class="btn-text quiet" onClick={() => updateCategory(c.id, { archived: true })}>Archiwizuj</button>
      </div>
    </li>
  );
}

function NewCategory() {
  const [name, setName] = useState('');
  const [junk, setJunk] = useState(false);
  return (
    <form
      class="cat-new"
      onSubmit={(e) => {
        e.preventDefault();
        if (!name.trim()) return;
        addCategory(name, junk);
        setName('');
        setJunk(false);
      }}
    >
      <label class="field">
        <span class="field-label">Nowa kategoria</span>
        <input value={name} onInput={(e) => setName(e.currentTarget.value)} placeholder="np. Kawa na mieście" enterKeyHint="done" />
      </label>
      <div class="cat-actions">
        <label class="toggle">
          <input type="checkbox" checked={junk} onChange={(e) => setJunk(e.currentTarget.checked)} />
          <span>syf</span>
        </label>
        <button class="btn" type="submit" disabled={!name.trim()}>Dodaj kategorię</button>
      </div>
    </form>
  );
}
