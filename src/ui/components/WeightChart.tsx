import type { DayKey, Habit, HabitLog } from '../../data/model';
import { formatMeasure, measurePoints, trendLabel, weightTrend } from '../../domain/habits';
import { diffDays, formatDayMonth } from '../../lib/date';

const W = 320;
const H = 132;
const PAD_X = 6;
const PAD_Y = 8;

/** Wykres wartości z ostatnich 90 dni (czyste SVG) i podsumowanie trendu pod nim. */
export function WeightChart({ habit, logs, today }: { habit: Habit; logs: HabitLog[]; today: DayKey }) {
  const points = measurePoints(logs, habit.id, today, 90);
  const trend = weightTrend(logs, habit.id, today);
  const unit = habit.unit;

  // Trzy kafelki: duża wartość, krótki opis pod spodem.
  const change = trendLabel(trend.delta, unit);
  const summary = [
    trend.last && { value: formatMeasure(trend.last.value, unit), label: 'ostatnio' },
    trend.avg7 !== null && { value: formatMeasure(trend.avg7, unit), label: 'średnia 7 dni' },
    change && { value: change.replace(' w tydzień', ''), label: 'w tydzień' },
  ].filter(Boolean) as { value: string; label: string }[];

  return (
    <div class="chart">
      {points.length < 2 ? (
        <p class="chart-empty">Wykres pojawi się po kilku pomiarach.</p>
      ) : (
        <Plot points={points} unit={unit} />
      )}
      {summary.length > 0 && (
        <dl class="stat-tiles">
          {summary.map((m) => (
            <div class="stat-tile" key={m.label}>
              <dt>{m.label}</dt>
              <dd class="num">{m.value}</dd>
            </div>
          ))}
        </dl>
      )}
    </div>
  );
}

function Plot({ points, unit }: { points: { day: DayKey; value: number }[]; unit: string | null }) {
  const values = points.map((p) => p.value);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const lo = min - 0.5;
  const hi = max + 0.5;
  const first = points[0].day;
  const last = points[points.length - 1].day;
  const span = Math.max(1, diffDays(last, first));

  const x = (d: DayKey) => PAD_X + (diffDays(d, first) / span) * (W - 2 * PAD_X);
  const y = (v: number) => PAD_Y + ((hi - v) / (hi - lo)) * (H - 2 * PAD_Y);
  const pct = (v: number) => `${(y(v) / H) * 100}%`;
  const line = points.map((p) => `${x(p.day).toFixed(1)},${y(p.value).toFixed(1)}`).join(' ');
  const end = points[points.length - 1];

  return (
    <figure class="chart-figure">
      <div class="chart-plot">
        <svg
          viewBox={`0 0 ${W} ${H}`}
          role="img"
          aria-label={`Od ${formatDayMonth(first)} do ${formatDayMonth(last)}: od ${formatMeasure(min, unit)} do ${formatMeasure(max, unit)}`}
        >
          <line class="chart-rule" x1="0" x2={W} y1={y(max)} y2={y(max)} />
          {max !== min && <line class="chart-rule" x1="0" x2={W} y1={y(min)} y2={y(min)} />}
          <polyline class="chart-line" points={line} />
          {points.map((p) => (
            <circle key={p.day} class="chart-point" cx={x(p.day)} cy={y(p.value)} r={p === end ? 3.5 : 2.25} />
          ))}
        </svg>
        <span class="chart-y num" style={{ top: pct(max) }}>{formatMeasure(max, unit)}</span>
        {max !== min && <span class="chart-y num" style={{ top: pct(min) }}>{formatMeasure(min, unit)}</span>}
      </div>
      <figcaption class="chart-x num">
        <span>{formatDayMonth(first)}</span>
        <span>{formatDayMonth(last)}</span>
      </figcaption>
    </figure>
  );
}
