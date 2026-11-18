import type { Category } from '../../data/model';

interface Props {
  /** Już przefiltrowane i posortowane (`pickableCategories`). */
  categories: Category[];
  /** Obecna kategoria wpisu — zaznaczona. */
  current?: string | null;
  /** Podpowiedź ze sklepu — tylko obrys, nic nie zatwierdza się samo. */
  suggested?: string | null;
  disabled?: boolean;
  label: string;
  onPick: (categoryId: string) => void;
}

/** Rząd przycisków kategorii; jedno stuknięcie = wybór. */
export function CategoryChips({ categories, current, suggested, disabled, label, onPick }: Props) {
  return (
    <div class="chips" role="group" aria-label={label}>
      {categories.map((c) => (
        <button
          key={c.id}
          type="button"
          class={`chip${c.id === current ? ' is-current' : ''}${c.id === suggested && c.id !== current ? ' is-suggested' : ''}`}
          aria-pressed={c.id === current}
          disabled={disabled}
          onClick={() => onPick(c.id)}
        >
          {c.name}
          {c.id === suggested && c.id !== current && <span class="visually-hidden"> (podpowiedź)</span>}
        </button>
      ))}
    </div>
  );
}
