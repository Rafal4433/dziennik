/** Tylko dla podglądu (build `npm run build:preview`): przykładowe zadania na pustym urządzeniu. */
import { getState, seedForPreview } from './data/store';
import { addDays } from './lib/date';
import { makeTask } from './domain/tasks';
import { newId } from './lib/id';

export function seedPreview() {
  const s = getState();
  if (s.data.tasks.length) return;
  const today = s.today;
  const now = Date.now();
  const offer = makeTask('Napisać ofertę dla klienta', today, now, {
    originalDate: addDays(today, -3),
    carriedFrom: [addDays(today, -3), addDays(today, -2), addDays(today, -1)],
    estimateMin: 45,
    minimalVersion: 'Jeden akapit i cena',
    order: now,
  });
  const shopping = makeTask('Zrobić zakupy na tydzień', today, now, { estimateMin: 30, status: 'done', closedAt: now, order: now + 1 });
  const invoices = makeTask('Przejrzeć faktury za październik', today, now, { estimateMin: 20, order: now + 2 });
  const tomorrow = makeTask('Umówić przegląd samochodu', addDays(today, 1), now, { order: now + 3 });
  const entry = {
    id: newId(), createdAt: now, updatedAt: now, deletedAt: null, taskId: shopping.id, date: today,
    startedAt: now - 38 * 60_000, endedAt: now - 2 * 60_000, source: 'timer' as const,
  };
  seedForPreview([offer, shopping, invoices, tomorrow], [entry]);
}
