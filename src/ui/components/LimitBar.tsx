import { formatPLN } from '../../lib/format';

/** Pasek wydane / limit. Powyżej limitu pasek jest pełny i ciemniejszy — bez czerwieni i alarmu. */
export function LimitBar({ spent, limit }: { spent: number; limit: number }) {
  const over = spent > limit;
  const pct = limit > 0 ? Math.min(100, (spent / limit) * 100) : 100;
  return (
    <span class={`limit${over ? ' is-over' : ''}`}>
      <span class="limit-bar" aria-hidden="true">
        <span class="limit-fill" style={{ width: `${pct}%` }} />
      </span>
      <span class="limit-text num">
        {formatPLN(spent).replace(' zł', '')} / {formatPLN(limit)}
      </span>
    </span>
  );
}
