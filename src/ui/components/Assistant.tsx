import { useEffect, useRef, useState } from 'preact/hooks';
import { AssistantError, applyActions, interpret, isConfigured, type AppliedAction } from '../../data/assistant';
import { canListen, listen as startListening, type Listening } from '../../native/speech';

type Phase = 'idle' | 'listening' | 'thinking' | 'done' | 'error';

interface Props {
  openSettings: () => void;
}

const EXAMPLES = ['Dodaj zadanie zadzwonić do mamy jutro', 'Wydałem 23 zł w Żabce', 'Nowy nawyk: siłownia 3 razy w tygodniu'];

export function Assistant({ openSettings }: Props) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState('');
  const [phase, setPhase] = useState<Phase>('idle');
  const [reply, setReply] = useState('');
  const [applied, setApplied] = useState<(AppliedAction & { undone?: boolean })[]>([]);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const recRef = useRef<Listening | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const configured = open && isConfigured();

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && close();
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open]);

  function reset() {
    setText('');
    setReply('');
    setApplied([]);
    setPhase('idle');
  }

  function start() {
    reset();
    setOpen(true);
    // Jeśli przeglądarka umie słuchać — od razu słuchamy; inaczej fokus na pole (mikrofon na klawiaturze iOS).
    if (canListen() && isConfigured()) setTimeout(listen, 50);
    else setTimeout(() => inputRef.current?.focus(), 60);
  }

  function close() {
    recRef.current?.cancel();
    recRef.current = null;
    abortRef.current?.abort();
    setOpen(false);
  }

  function listen() {
    recRef.current?.cancel();
    setText('');
    setReply('');
    setPhase('listening');
    recRef.current = startListening({
      onPartial: (t) => setText(t),
      onEnd: (t) => {
        recRef.current = null;
        if (t.trim()) void send(t);
        else setPhase((p) => (p === 'listening' ? 'idle' : p));
      },
      onError: (msg) => {
        recRef.current = null;
        setReply(msg);
        setPhase('error');
        setTimeout(() => inputRef.current?.focus(), 0);
      },
    });
  }

  async function send(input = text) {
    const said = input.trim();
    if (!said) return;
    recRef.current?.cancel();
    recRef.current = null;
    abortRef.current?.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    setPhase('thinking');
    setReply('');
    try {
      const res = await interpret(said, ctrl.signal);
      if (ctrl.signal.aborted) return;
      const done = await applyActions(res.actions);
      setApplied((prev) => [...done, ...prev]);
      setReply(done.length ? res.reply || 'Gotowe.' : res.reply || 'Nie znalazłem nic do dodania. Powiedz np. „dodaj zadanie…”, „wydałem…” albo „nowy nawyk…”.');
      setPhase(done.length ? 'done' : 'error');
      if (done.length) setText('');
    } catch (err) {
      if ((err as Error).name === 'AbortError') return;
      console.warn('Asystent', err);
      setReply(err instanceof AssistantError ? err.message : 'Coś poszło nie tak — spróbuj jeszcze raz.');
      setPhase('error');
    }
  }

  function undo(i: number) {
    setApplied((list) =>
      list.map((a, j) => {
        if (j !== i || a.undone) return a;
        a.undo();
        return { ...a, undone: true };
      }),
    );
  }

  const busy = phase === 'thinking';

  return (
    <>
      <button class="assistant-fab" aria-label="Asystent — dodaj głosem" onClick={start}>
        <MicIcon />
      </button>
      {open && (
        <div class="assistant-layer" role="dialog" aria-modal="true" aria-label="Asystent">
          <div class="assistant-backdrop" onClick={close} />
          <div class="assistant-sheet">
            <div class="assistant-head">
              <h2>Asystent</h2>
              <button class="btn-text quiet" onClick={close}>Zamknij</button>
            </div>

            {!configured ? (
              <div class="inline-form">
                <p class="hint">Żeby asystent rozumiał, co mówisz, potrzebuje modelu językowego. Wklej klucz OpenRouter (albo adres lokalnego serwera) w Ustawieniach.</p>
                <div>
                  <button
                    class="btn primary"
                    onClick={() => {
                      close();
                      openSettings();
                    }}
                  >
                    Otwórz Ustawienia
                  </button>
                </div>
              </div>
            ) : (
              <>
                <form
                  class="assistant-input"
                  onSubmit={(e) => {
                    e.preventDefault();
                    void send();
                  }}
                >
                  <textarea
                    ref={inputRef}
                    rows={2}
                    value={text}
                    placeholder={phase === 'listening' ? 'Słucham…' : 'Powiedz albo wpisz, co dodać'}
                    enterkeyhint="send"
                    onInput={(e) => setText((e.currentTarget as HTMLTextAreaElement).value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && !e.shiftKey) {
                        e.preventDefault();
                        void send();
                      }
                    }}
                    disabled={busy}
                  />
                  <div class="assistant-buttons">
                    {canListen() && (
                      <button
                        type="button"
                        class={`assistant-mic${phase === 'listening' ? ' is-on' : ''}`}
                        aria-label={phase === 'listening' ? 'Zakończ słuchanie' : 'Mów'}
                        onClick={() => (phase === 'listening' ? recRef.current?.stop() : listen())}
                        disabled={busy}
                      >
                        <MicIcon />
                      </button>
                    )}
                    <button type="submit" class="btn primary" disabled={busy || !text.trim()}>
                      {busy ? 'Myślę…' : 'Dodaj'}
                    </button>
                  </div>
                </form>

                {reply && <p class={`assistant-reply${phase === 'error' ? ' is-error' : ''}`} aria-live="polite">{reply}</p>}

                {applied.length > 0 && (
                  <ul class="assistant-list">
                    {applied.map((a, i) => (
                      <li key={i} class={a.undone ? 'is-undone' : ''}>
                        <div class="assistant-item">
                          <span class="assistant-item-title">{a.label}</span>
                          <span class="assistant-item-detail">{a.undone ? 'Cofnięto' : a.detail}</span>
                        </div>
                        {!a.undone && (
                          <button class="btn-text" onClick={() => undo(i)}>
                            Cofnij
                          </button>
                        )}
                      </li>
                    ))}
                  </ul>
                )}

                {phase === 'idle' && applied.length === 0 && !text && (
                  <ul class="assistant-examples">
                    {EXAMPLES.map((ex) => (
                      <li key={ex}>
                        <button
                          type="button"
                          class="assistant-example"
                          onClick={() => {
                            setText(ex);
                            inputRef.current?.focus();
                          }}
                        >
                          „{ex}”
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </>
            )}
          </div>
        </div>
      )}
    </>
  );
}

function MicIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
      <rect x="9" y="3" width="6" height="11.5" rx="3" />
      <path d="M5.5 11a6.5 6.5 0 0 0 13 0M12 17.5V21" />
    </svg>
  );
}
