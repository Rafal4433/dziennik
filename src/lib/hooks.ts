import { useEffect, useRef, useState } from 'preact/hooks';

/** Aktualny czas, odświeżany co `intervalMs` — tylko gdy `active`. */
export function useNow(active: boolean, intervalMs = 1000): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!active) return;
    setNow(Date.now());
    const id = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(id);
  }, [active, intervalMs]);
  return active ? now : Date.now();
}

/** Poziomy gest przesunięcia (np. poprzedni / następny dzień). */
export function useSwipe(onLeft: () => void, onRight: () => void) {
  const start = useRef<{ x: number; y: number; t: number } | null>(null);
  return {
    onTouchStart(e: TouchEvent) {
      const target = e.target as HTMLElement;
      if (target.closest('input, textarea, select, [data-noswipe]')) return;
      const p = e.touches[0];
      start.current = { x: p.clientX, y: p.clientY, t: Date.now() };
    },
    onTouchEnd(e: TouchEvent) {
      const s = start.current;
      start.current = null;
      if (!s) return;
      const p = e.changedTouches[0];
      const dx = p.clientX - s.x;
      const dy = p.clientY - s.y;
      if (Math.abs(dx) > 70 && Math.abs(dy) < 45 && Date.now() - s.t < 600) {
        dx < 0 ? onLeft() : onRight();
      }
    },
  };
}
