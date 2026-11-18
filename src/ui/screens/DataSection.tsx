import { useState } from 'preact/hooks';
import { countRecords, exportJSON, importJSON, parseBackup, type BackupFile } from '../../data/backup';
import { useAppState } from '../../data/store';

/** Kopia zapasowa: eksport i import wszystkich danych w JSON. */
export function DataSection() {
  const s = useAppState();
  const [pending, setPending] = useState<BackupFile | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  async function onFile(e: Event) {
    const input = e.currentTarget as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;
    try {
      setPending(parseBackup(await file.text()));
      setMsg(null);
    } catch (err) {
      setMsg((err as Error).message);
    }
  }

  return (
    <section class="section">
      <header class="section-head">
        <h2>Dane i kopia zapasowa</h2>
        <span class="section-stat num">{countRecords(s.data)}</span>
      </header>
      <p class="hint">Wszystko jest zapisane tylko na tym urządzeniu. Kopia w pliku JSON pozwala przenieść dane albo je odtworzyć.</p>
      <div class="detail-actions">
        <button class="btn" onClick={exportJSON}>Eksportuj JSON</button>
        <label class="btn">
          Importuj JSON
          <input type="file" accept="application/json,.json" onChange={onFile} hidden />
        </label>
      </div>
      {pending && (
        <div class="inline-form">
          <p>
            Kopia z {new Date(pending.exportedAt).toLocaleString('pl-PL', { timeZone: 'Europe/Warsaw' })}, rekordów: {countRecords(pending.data)}.
            Import zastąpi obecne dane na tym urządzeniu.
          </p>
          <div class="prompt-actions">
            <button
              class="btn primary"
              onClick={async () => {
                await importJSON(pending);
                setPending(null);
                setMsg('Dane zaimportowane.');
              }}
            >
              Zastąp dane
            </button>
            <button class="btn-text" onClick={() => setPending(null)}>Anuluj</button>
          </div>
        </div>
      )}
      {msg && <p class="hint">{msg}</p>}
    </section>
  );
}
