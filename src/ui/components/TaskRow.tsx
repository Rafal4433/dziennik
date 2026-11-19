import { useState } from 'preact/hooks';
import type { DayKey, Task, TimeEntry } from '../../data/model';
import {
  addManualTime,
  deleteTask,
  deleteTimeEntry,
  letGo,
  pauseTimer,
  reopen,
  reschedule,
  snoozePrompt,
  splitTask,
  startTimer,
  toggleDone,
  updateTask,
} from '../../data/store';
import { carryCount, entryDuration, needsDecision, timeForTask } from '../../domain/tasks';
import { useNow } from '../../lib/hooks';
import { formatClock, formatHM, formatMinutes } from '../../lib/format';
import { addDays, formatDayShort } from '../../lib/date';

interface Props {
  task: Task;
  entries: TimeEntry[];
  runningTaskId: string | null;
  today: DayKey;
  /** Dzień, który jest oglądany (czas dopisany ręcznie trafia do tego dnia). */
  viewDay: DayKey;
  expanded: boolean;
  onToggleExpand: () => void;
}

export function TaskRow({ task, entries, runningTaskId, today, viewDay, expanded, onToggleExpand }: Props) {
  const running = runningTaskId === task.id;
  const now = useNow(running);
  const total = timeForTask(entries, task.id, now);
  const carries = carryCount(task);
  const decide = needsDecision(task, today);

  // Osobne elementy z odstępem zamiast łańcucha „a · b · c”. Szacunek zapisany tak, jak się go wpisuje („~45”).
  const meta: { text: string; cls?: string }[] = [];
  if (task.status === 'skipped') meta.push({ text: task.resolution === 'split' ? 'rozbite na mniejszy krok' : 'nie zrobione' });
  if (task.estimateMin) meta.push({ text: `~${formatMinutes(task.estimateMin)}` });
  if (carries > 0) meta.push({ text: `przeniesione ${carries}×`, cls: task.status === 'todo' ? 'task-carry' : undefined });
  if (task.minimalVersion && task.status === 'todo') meta.push({ text: `wystarczy: ${shorten(task.minimalVersion, 60)}` });

  const onCheck = () => (task.status === 'skipped' ? reopen(task.id) : toggleDone(task.id));

  return (
    <li class={`task is-${task.status}${running ? ' is-running' : ''}${expanded ? ' is-open' : ''}`}>
      <div class="task-line">
        <button
          class="check"
          role="checkbox"
          aria-checked={task.status === 'done'}
          aria-label={task.status === 'done' ? 'Oznacz jako do zrobienia' : 'Oznacz jako zrobione'}
          onClick={onCheck}
        >
          <span class="check-box" aria-hidden="true" />
        </button>
        <button class="task-main" onClick={onToggleExpand} aria-expanded={expanded}>
          <span class="task-title">{task.title}</span>
          {meta.length > 0 && (
            <span class="task-meta">
              {meta.map((m) => (
                <span key={m.text} class={m.cls}>{m.text}</span>
              ))}
            </span>
          )}
        </button>
        <TimerChip task={task} total={total} running={running} />
      </div>
      {decide && !expanded && <CarryPrompt task={task} carries={carries} today={today} />}
      {expanded && <TaskDetails task={task} entries={entries} total={total} running={running} today={today} viewDay={viewDay} now={now} />}
    </li>
  );
}

function TimerChip({ task, total, running }: { task: Task; total: number; running: boolean }) {
  if (task.status !== 'todo' && !running) {
    return <span class="timer-static num">{total > 0 ? formatHM(total) : ''}</span>;
  }
  return (
    <button
      class={`timer-chip num${running ? ' is-running' : ''}`}
      onClick={() => (running ? pauseTimer() : startTimer(task.id))}
      aria-label={running ? 'Pauza' : total > 0 ? 'Wznów stoper' : 'Start stopera'}
    >
      <span class={running ? 'glyph-pause' : 'glyph-play'} aria-hidden="true" />
      {running ? formatClock(total) : total > 0 ? formatHM(total) : ''}
    </button>
  );
}

/* ───────── pytanie po 3 przeniesieniach ───────── */

function CarryPrompt({ task, carries, today }: { task: Task; carries: number; today: DayKey }) {
  const [mode, setMode] = useState<'ask' | 'split' | 'move'>('ask');
  return (
    <div class="prompt" data-noswipe>
      {mode === 'ask' && (
        <>
          <p>
            Przeniesione {carries}×. Rozbić na mniejszy krok, przełożyć na konkretny dzień czy odpuścić?
          </p>
          <div class="prompt-actions">
            <button class="btn" onClick={() => setMode('split')}>Rozbij</button>
            <button class="btn" onClick={() => setMode('move')}>Przełóż</button>
            <button class="btn" onClick={() => letGo(task.id)}>Odpuść</button>
            <button class="btn-text" onClick={() => snoozePrompt(task.id)}>Nie teraz</button>
          </div>
        </>
      )}
      {mode === 'split' && <SplitForm task={task} onCancel={() => setMode('ask')} />}
      {mode === 'move' && <RescheduleForm today={today} onPick={(d) => reschedule(task.id, d)} onCancel={() => setMode('ask')} />}
    </div>
  );
}

function SplitForm({ task, onCancel }: { task: Task; onCancel: () => void }) {
  const [step, setStep] = useState(task.minimalVersion);
  return (
    <form
      class="inline-form"
      onSubmit={(e) => {
        e.preventDefault();
        splitTask(task.id, step);
      }}
    >
      <label class="field">
        <span class="field-label">Najmniejszy następny krok</span>
        <input
          value={step}
          onInput={(e) => setStep(e.currentTarget.value)}
          placeholder="np. otworzyć plik i napisać pierwsze zdanie"
          autoFocus
        />
      </label>
      <p class="hint">Duże zadanie zostanie zamknięte jako rozbite, a ten krok trafi na dziś.</p>
      <div class="prompt-actions">
        <button class="btn primary" type="submit" disabled={!step.trim()}>Dodaj krok na dziś</button>
        <button class="btn-text" type="button" onClick={onCancel}>Wróć</button>
      </div>
    </form>
  );
}

function RescheduleForm({ today, onPick, onCancel }: { today: DayKey; onPick: (d: DayKey) => void; onCancel: () => void }) {
  const [date, setDate] = useState(addDays(today, 1));
  return (
    <form
      class="inline-form"
      onSubmit={(e) => {
        e.preventDefault();
        if (date) onPick(date);
      }}
    >
      <label class="field">
        <span class="field-label">Na który dzień</span>
        <input type="date" value={date} min={addDays(today, 1)} onInput={(e) => setDate(e.currentTarget.value)} />
      </label>
      <div class="prompt-actions">
        <button class="btn primary" type="submit" disabled={!date}>Przełóż na {date ? formatDayShort(date) : '…'}</button>
        <button class="btn-text" type="button" onClick={onCancel}>Wróć</button>
      </div>
    </form>
  );
}

/* ───────── szczegóły zadania ───────── */

interface DetailsProps {
  task: Task;
  entries: TimeEntry[];
  total: number;
  running: boolean;
  today: DayKey;
  viewDay: DayKey;
  now: number;
}

const timeFmt = new Intl.DateTimeFormat('pl-PL', { timeZone: 'Europe/Warsaw', hour: '2-digit', minute: '2-digit' });

function TaskDetails({ task, entries, total, running, today, viewDay, now }: DetailsProps) {
  const [manual, setManual] = useState('');
  const [mode, setMode] = useState<'none' | 'move' | 'split' | 'delete'>('none');
  const own = entries.filter((e) => e.taskId === task.id && e.deletedAt === null).sort((a, b) => a.startedAt - b.startedAt);
  const isTodo = task.status === 'todo';
  const estimateMs = task.estimateMin ? task.estimateMin * 60_000 : null;

  return (
    <div class="details" data-noswipe>
      <label class="field">
        <span class="field-label">Zadanie</span>
        <input
          value={task.title}
          onChange={(e) => {
            const v = e.currentTarget.value.trim();
            if (v && v !== task.title) updateTask(task.id, { title: v });
          }}
        />
      </label>

      <div class="clock-block">
        <div class="clock num">{formatClock(total)}</div>
        <div class="clock-side">
          {estimateMs && (
            <span class="clock-compare num">
              szacunek {formatHM(estimateMs)}
              {total > 0 && <>, {total <= estimateMs ? `zostało ${formatHM(estimateMs - total)}` : `dłużej o ${formatHM(total - estimateMs)}`}</>}
            </span>
          )}
          <button class={`btn${running ? '' : ' primary'}`} onClick={() => (running ? pauseTimer() : startTimer(task.id))}>
            {running ? 'Pauza' : total > 0 ? 'Wznów' : 'Start'}
          </button>
        </div>
      </div>

      <div class="field-row">
        <label class="field">
          <span class="field-label">Szacunek, min</span>
          <input
            type="number"
            inputMode="numeric"
            min={0}
            value={task.estimateMin ?? ''}
            placeholder="—"
            onChange={(e) => {
              const n = parseInt(e.currentTarget.value, 10);
              updateTask(task.id, { estimateMin: Number.isFinite(n) && n > 0 ? n : null });
            }}
          />
        </label>
        <form
          class="field"
          onSubmit={(e) => {
            e.preventDefault();
            addManualTime(task.id, parseFloat(manual.replace(',', '.')), viewDay);
            setManual('');
          }}
        >
          <span class="field-label">Dopisz czas, min</span>
          <span class="input-with-btn">
            <input type="number" inputMode="numeric" min={1} value={manual} placeholder="—" onInput={(e) => setManual(e.currentTarget.value)} />
            <button class="btn" type="submit" disabled={!(parseFloat(manual) > 0)}>Dodaj</button>
          </span>
        </form>
      </div>

      <label class="field">
        <span class="field-label">Najmniejsza wersja</span>
        <textarea
          rows={2}
          value={task.minimalVersion}
          placeholder="Jak wygląda wersja wystarczająco dobra?"
          onChange={(e) => updateTask(task.id, { minimalVersion: e.currentTarget.value.trim() })}
        />
      </label>

      {own.length > 0 && (
        <ol class="entries">
          {own.map((e) => (
            <li key={e.id} class="num">
              <span>{e.source === 'manual' ? 'dopisane' : `${timeFmt.format(e.startedAt)}–${e.endedAt ? timeFmt.format(e.endedAt) : 'teraz'}`}</span>
              <span class="entry-dur">{formatHM(entryDuration(e, now))}</span>
              {e.endedAt !== null && (
                <button class="btn-x" aria-label="Usuń ten odcinek czasu" onClick={() => deleteTimeEntry(e.id)}>×</button>
              )}
            </li>
          ))}
        </ol>
      )}

      {mode === 'move' && <RescheduleForm today={today} onPick={(d) => reschedule(task.id, d)} onCancel={() => setMode('none')} />}
      {mode === 'split' && <SplitForm task={task} onCancel={() => setMode('none')} />}
      {mode === 'delete' && (
        <div class="inline-form">
          <p>Usunąć zadanie razem z zapisanym czasem?</p>
          <div class="prompt-actions">
            <button class="btn" onClick={() => deleteTask(task.id)}>Usuń</button>
            <button class="btn-text" onClick={() => setMode('none')}>Zostaw</button>
          </div>
        </div>
      )}

      {mode === 'none' && (
        <div class="detail-actions">
          {isTodo ? (
            <>
              <button class="btn-text" onClick={() => setMode('move')}>Przełóż</button>
              <button class="btn-text" onClick={() => setMode('split')}>Rozbij</button>
              <button class="btn-text" onClick={() => letGo(task.id)}>Odpuść</button>
            </>
          ) : (
            <button class="btn-text" onClick={() => reopen(task.id)}>Przywróć do zrobienia</button>
          )}
          <button class="btn-text quiet" onClick={() => setMode('delete')}>Usuń</button>
        </div>
      )}
    </div>
  );
}

function shorten(s: string, max: number) {
  return s.length > max ? `${s.slice(0, max - 1).trimEnd()}…` : s;
}
