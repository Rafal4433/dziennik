import { Capacitor, registerPlugin } from '@capacitor/core';
import { importCaptured, resolvePendingRates, type CapturedPayment } from '../data/store';

/** Natywna wtyczka z `ios/App/App/Expenses.swift` — kolejka płatności zapisanych w tle przez Skróty. */
interface PendingExpensesPlugin {
  list(): Promise<{ items: CapturedPayment[] }>;
  remove(options: { ids: string[] }): Promise<void>;
  expiry(): Promise<{ expiresAt: number | null }>;
}

const PendingExpenses = registerPlugin<PendingExpensesPlugin>('PendingExpenses');

let inFlight: Promise<number> | null = null;

/**
 * Pobiera kolejkę natywną, zapisuje ją w IndexedDB i dopiero potem usuwa przyjęte rekordy z kolejki.
 * Zwraca liczbę przyjętych płatności. Poza aplikacją natywną (PWA) nie dotyka wtyczki,
 * tylko ponawia pobranie kursów NBP dla wpisów, które na nie czekają.
 */
export function syncPending(): Promise<number> {
  if (!Capacitor.isNativePlatform()) return resolvePendingRates().then(() => 0);
  // Start i powrót na pierwszy plan mogą zbiec się w czasie — jedna synchronizacja naraz.
  inFlight ??= doSync().finally(() => {
    inFlight = null;
  });
  return inFlight;
}

async function doSync(): Promise<number> {
  const { items } = await PendingExpenses.list();
  let ids: string[] = [];
  if (items?.length) {
    // importCaptured odrzuca przy błędzie zapisu — wtedy remove nie jest wywoływane i rekordy zostają w kolejce.
    ids = await importCaptured(items);
    if (ids.length) await PendingExpenses.remove({ ids });
  }
  // Także przy pustej kolejce: wpisy czekające na kurs NBP mogą się teraz dać przeliczyć.
  await resolvePendingRates();
  return ids.length;
}

/** Data wygaśnięcia profilu instalacyjnego (ms) albo `null`, gdy nieznana (np. symulator, PWA). */
export async function getExpiry(): Promise<number | null> {
  if (!Capacitor.isNativePlatform()) return null;
  try {
    const { expiresAt } = await PendingExpenses.expiry();
    return typeof expiresAt === 'number' ? expiresAt : null;
  } catch {
    return null;
  }
}
