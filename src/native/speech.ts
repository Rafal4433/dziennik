import { Capacitor, registerPlugin, type PluginListenerHandle } from '@capacitor/core';

/**
 * Słuchanie po polsku dla asystenta. W aplikacji iOS — natywna wtyczka z `ios/App/App/Speech.swift`
 * (SFSpeechRecognizer, sama kończy po chwili ciszy). W przeglądarce — Web Speech API, jeśli jest.
 */

interface SpeechPlugin {
  available(): Promise<{ available: boolean }>;
  start(): Promise<void>;
  stop(): Promise<void>;
  addListener(event: 'partial' | 'end', fn: (data: { text: string }) => void): Promise<PluginListenerHandle>;
}

const NativeSpeech = registerPlugin<SpeechPlugin>('Speech');

type WebRecognition = {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  onresult: ((e: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null;
  onerror: ((e: { error: string }) => void) | null;
  onend: (() => void) | null;
  start(): void;
  stop(): void;
  abort(): void;
};

const WebCtor: (new () => WebRecognition) | undefined =
  typeof window !== 'undefined' ? ((window as any).SpeechRecognition ?? (window as any).webkitSpeechRecognition) : undefined;

const native = () => Capacitor.isNativePlatform();

/** Czy pokazać przycisk mikrofonu. */
export const canListen = (): boolean => native() || !!WebCtor;

export interface ListenHandlers {
  onPartial: (text: string) => void;
  /** Koniec wypowiedzi (cisza albo stop) — z całym tekstem; pusty, gdy nic nie padło. */
  onEnd: (text: string) => void;
  onError: (message: string) => void;
}

export interface Listening {
  /** Kończy i wysyła to, co już padło. */
  stop(): void;
  /** Przerywa bez wysyłania. */
  cancel(): void;
}

export function listen(h: ListenHandlers): Listening {
  return native() ? listenNative(h) : listenWeb(h);
}

function listenNative(h: ListenHandlers): Listening {
  let handles: PluginListenerHandle[] = [];
  let done = false;
  const cleanup = () => {
    done = true;
    handles.forEach((x) => void x.remove());
    handles = [];
  };
  void (async () => {
    handles = [
      await NativeSpeech.addListener('partial', ({ text }) => !done && h.onPartial(text)),
      await NativeSpeech.addListener('end', ({ text }) => {
        if (done) return;
        cleanup();
        h.onEnd(text ?? '');
      }),
    ];
    try {
      await NativeSpeech.start();
    } catch (err) {
      cleanup();
      h.onError((err as Error).message || 'Nie udało się uruchomić mikrofonu.');
    }
  })();
  return {
    stop: () => void NativeSpeech.stop(),
    cancel: () => {
      cleanup();
      void NativeSpeech.stop();
    },
  };
}

function listenWeb(h: ListenHandlers): Listening {
  if (!WebCtor) {
    h.onError('Ta przeglądarka nie rozpoznaje mowy — podyktuj z klawiatury.');
    return { stop() {}, cancel() {} };
  }
  const rec = new WebCtor();
  rec.lang = 'pl-PL';
  rec.interimResults = true;
  rec.continuous = false;
  let text = '';
  let cancelled = false;
  let failed = false;
  rec.onresult = (e) => {
    text = '';
    for (let i = 0; i < e.results.length; i++) text += e.results[i][0].transcript;
    h.onPartial(text);
  };
  rec.onerror = (e) => {
    if (e.error === 'aborted' || e.error === 'no-speech') return;
    failed = true;
    h.onError(e.error === 'not-allowed' || e.error === 'service-not-allowed' ? 'Brak dostępu do mikrofonu — wpisz albo podyktuj z klawiatury.' : 'Nie udało się rozpoznać mowy.');
  };
  rec.onend = () => {
    if (!cancelled && !failed) h.onEnd(text);
  };
  try {
    rec.start();
  } catch {
    failed = true;
    h.onError('Nie udało się uruchomić mikrofonu.');
  }
  return {
    stop: () => rec.stop(),
    cancel: () => {
      cancelled = true;
      rec.abort();
    },
  };
}
