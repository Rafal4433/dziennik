import { openDB, type IDBPDatabase } from 'idb';
import { COLLECTIONS, emptyData, type CollectionName, type Collections, type Data, type Meta } from './model';

/**
 * Warstwa trwałości. Reszta aplikacji zna tylko interfejs `Repository`,
 * więc później można dodać implementację synchronizującą (np. IndexedDB + Supabase)
 * bez zmian w UI ani w logice domenowej.
 */
export interface Repository {
  loadAll(): Promise<{ data: Data; meta: Meta }>;
  /** Zapisuje (upsert) rekordy — wiele kolekcji w jednej transakcji. */
  save(changes: Changes): Promise<void>;
  setMeta(meta: Meta): Promise<void>;
  /** Zastępuje wszystkie dane (import kopii). */
  replaceAll(data: Data, meta: Meta): Promise<void>;
}

export type Changes = { [K in CollectionName]?: Collections[K][] };

const DB_NAME = 'dziennik';
const DB_VERSION = 1;
const META_KEY = 'app';

export const defaultMeta = (): Meta => ({ lastRolloverDay: null, lastRollover: null });

export class IdbRepository implements Repository {
  private dbp: Promise<IDBPDatabase>;

  constructor(name = DB_NAME) {
    this.dbp = openDB(name, DB_VERSION, {
      upgrade(db, oldVersion) {
        if (oldVersion < 1) {
          for (const c of COLLECTIONS) {
            const store = db.createObjectStore(c, { keyPath: 'id' });
            // Indeks pod przyszłą synchronizację: „daj mi wszystko zmienione od X”.
            store.createIndex('updatedAt', 'updatedAt');
          }
          db.createObjectStore('meta');
        }
      },
    });
  }

  async loadAll() {
    const db = await this.dbp;
    const data = emptyData();
    const tx = db.transaction([...COLLECTIONS, 'meta'], 'readonly');
    await Promise.all(
      COLLECTIONS.map(async (c) => {
        (data as any)[c] = await tx.objectStore(c).getAll();
      }),
    );
    const meta = ((await tx.objectStore('meta').get(META_KEY)) as Meta | undefined) ?? defaultMeta();
    await tx.done;
    return { data, meta: { ...defaultMeta(), ...meta } };
  }

  async save(changes: Changes) {
    const names = Object.keys(changes) as CollectionName[];
    if (!names.length) return;
    const db = await this.dbp;
    const tx = db.transaction(names, 'readwrite');
    for (const n of names) {
      const store = tx.objectStore(n);
      for (const rec of changes[n] as any[]) store.put(rec);
    }
    await tx.done;
  }

  async setMeta(meta: Meta) {
    const db = await this.dbp;
    await db.put('meta', meta, META_KEY);
  }

  async replaceAll(data: Data, meta: Meta) {
    const db = await this.dbp;
    const tx = db.transaction([...COLLECTIONS, 'meta'], 'readwrite');
    for (const c of COLLECTIONS) {
      const store = tx.objectStore(c);
      store.clear();
      for (const rec of data[c] as any[]) store.put(rec);
    }
    tx.objectStore('meta').put(meta, META_KEY);
    await tx.done;
  }
}

/**
 * Zapas, gdy IndexedDB jest niedostępne (np. tryb prywatny w niektórych przeglądarkach).
 * Dane żyją tylko do zamknięcia karty — aplikacja o tym informuje.
 */
export class MemoryRepository implements Repository {
  private data: Data = emptyData();
  private meta: Meta = defaultMeta();
  async loadAll() {
    return { data: structuredClone(this.data), meta: { ...this.meta } };
  }
  async save() {}
  async setMeta(meta: Meta) {
    this.meta = meta;
  }
  async replaceAll(data: Data, meta: Meta) {
    this.data = data;
    this.meta = meta;
  }
}

export async function openRepository(): Promise<{ repo: Repository; persistent: boolean }> {
  try {
    const repo = new IdbRepository();
    await repo.loadAll();
    return { repo, persistent: true };
  } catch (err) {
    console.warn('IndexedDB niedostępne, dane tylko w pamięci', err);
    return { repo: new MemoryRepository(), persistent: false };
  }
}
