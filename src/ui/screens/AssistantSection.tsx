import { useState } from 'preact/hooks';
import { DEFAULT_CONFIG, loadConfig, saveConfig, type AssistantConfig } from '../../data/assistant';

const PRESETS: { label: string; config: Omit<AssistantConfig, 'apiKey'> }[] = [
  { label: 'OpenRouter', config: { baseUrl: DEFAULT_CONFIG.baseUrl, model: DEFAULT_CONFIG.model } },
  { label: 'Lokalnie (Ollama)', config: { baseUrl: 'http://192.168.1.10:11434/v1', model: 'qwen3:8b' } },
];

/** Ustawienia asystenta: dostawca zgodny z API OpenAI, model i klucz (tylko na tym urządzeniu). */
export function AssistantSection() {
  const [c, setC] = useState<AssistantConfig>(loadConfig);
  const [saved, setSaved] = useState(false);

  const set = (patch: Partial<AssistantConfig>) => {
    setC((prev) => ({ ...prev, ...patch }));
    setSaved(false);
  };

  return (
    <section class="section">
      <header class="section-head">
        <h2>Asystent</h2>
      </header>
      <p class="hint">
        Przycisk z mikrofonem dodaje zadania, nawyki i wydatki z jednego zdania. Wypowiedź trafia do wybranego modelu — klucz i ustawienia zostają tylko na tym urządzeniu.
      </p>
      <div class="inline-form">
        <div class="chips">
          {PRESETS.map((p) => (
            <button key={p.label} class={`chip${c.baseUrl === p.config.baseUrl ? ' is-current' : ''}`} onClick={() => set(p.config)}>
              {p.label}
            </button>
          ))}
        </div>
        <label class="field">
          <span class="field-label">Klucz API {c.baseUrl.includes('openrouter.ai') ? '(openrouter.ai/keys)' : '(opcjonalny)'}</span>
          <input type="password" autocomplete="off" spellcheck={false} value={c.apiKey} placeholder="sk-or-…" onInput={(e) => set({ apiKey: (e.currentTarget as HTMLInputElement).value })} />
        </label>
        <label class="field">
          <span class="field-label">Model</span>
          <input autocomplete="off" autocapitalize="off" spellcheck={false} value={c.model} onInput={(e) => set({ model: (e.currentTarget as HTMLInputElement).value })} />
        </label>
        <label class="field">
          <span class="field-label">Adres serwera</span>
          <input type="url" autocomplete="off" autocapitalize="off" spellcheck={false} value={c.baseUrl} onInput={(e) => set({ baseUrl: (e.currentTarget as HTMLInputElement).value })} />
        </label>
        <div class="detail-actions">
          <button
            class="btn primary"
            onClick={() => {
              saveConfig({ baseUrl: c.baseUrl.trim(), model: c.model.trim(), apiKey: c.apiKey.trim() });
              setSaved(true);
            }}
          >
            Zapisz
          </button>
          {saved && <span class="hint">Zapisane.</span>}
        </div>
      </div>
    </section>
  );
}
