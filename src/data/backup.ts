import { COLLECTIONS, type Data, type Meta } from './model';
import { getState, replaceAllData } from './store';
import { todayKey } from '../lib/date';

const FORMAT = 'dziennik-backup';
const VERSION = 2;

export interface BackupFile {
  format: typeof FORMAT;
  version: number;
  exportedAt: string;
  meta: Meta;
  data: Data;
}

function download(name: string, content: string, type: string) {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** Pełna kopia — łącznie z usuniętymi rekordami (tombstones), żeby import był wierny. */
export function exportJSON() {
  const { data, meta } = getState();
  const file: BackupFile = { format: FORMAT, version: VERSION, exportedAt: new Date().toISOString(), meta, data };
  download(`dziennik-${todayKey()}.json`, JSON.stringify(file, null, 2), 'application/json');
}

export function parseBackup(text: string): BackupFile {
  let parsed: any;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error('To nie jest poprawny plik JSON.');
  }
  if (parsed?.format !== FORMAT || typeof parsed.data !== 'object') {
    throw new Error('Ten plik nie wygląda na kopię z Dziennika.');
  }
  if (parsed.version > VERSION) throw new Error('Kopia pochodzi z nowszej wersji aplikacji.');
  return parsed as BackupFile;
}

export async function importJSON(file: BackupFile) {
  await replaceAllData(file.data, file.meta);
}

export function countRecords(data: Data) {
  return COLLECTIONS.reduce((n, c) => n + data[c].filter((r) => r.deletedAt === null).length, 0);
}
