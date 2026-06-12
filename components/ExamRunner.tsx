'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import {
  DOMAIN_MAP,
  FULL_MOCK_MINUTES,
  buildFullMockPlan,
  buildSingleDomainPlan,
  isDomainCode,
} from '@/lib/domains';
import { PASS_BAR, computeScore, scaledScore } from '@/lib/score';
import { STORAGE_KEY } from '@/lib/storage';
import type { DomainBlock, DomainCode, ExamMode, ExamState, OptionKey } from '@/lib/types';
import Results from './Results';
import SetupScreen from './SetupScreen';

const OPTION_KEYS: OptionKey[] = ['A', 'B', 'C', 'D'];
const FULL_MOCK_LIMIT_MS = FULL_MOCK_MINUTES * 60 * 1000;

interface FetchError {
  message: string;
  code: string;
}

function initState(mode: ExamMode, singleDomain: DomainCode | null): ExamState {
  const plan = mode === 'full' ? buildFullMockPlan() : buildSingleDomainPlan(singleDomain as DomainCode);
  return {
    mode,
    singleDomain,
    plan,
    blocks: plan.map(() => null),
    blockIdx: 0,
    qIdx: 0,
    answers: {},
    startedAt: Date.now(),
    finished: false,
  };
}

export default function ExamRunner() {
  const router = useRouter();
  const params = useSearchParams();

  const [state, setState] = useState<ExamState | null>(null);
  const [hydrated, setHydrated] = useState(false);
  const [apiKeyMissing, setApiKeyMissing] = useState(false);
  const [error, setError] = useState<FetchError | null>(null);
  const [now, setNow] = useState<number>(() => Date.now());
  const fetching = useRef<Set<number>>(new Set());

  // --- Hydrate from localStorage, or initialize from URL params. ---
  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as ExamState;
        if (parsed && Array.isArray(parsed.plan) && Array.isArray(parsed.blocks)) {
          setState(parsed);
          setHydrated(true);
          return;
        }
      }
    } catch {
      // corrupt storage — fall through to a fresh init
    }

    const modeParam = params.get('mode');
    const mode: ExamMode | null = modeParam === 'domain' ? 'domain' : modeParam === 'full' ? 'full' : null;
    if (!mode) {
      setHydrated(true);
      return;
    }
    let dom: DomainCode | null = null;
    if (mode === 'domain') {
      const d = params.get('domain');
      if (isDomainCode(d)) {
        dom = d;
      } else {
        setHydrated(true);
        return;
      }
    }
    setState(initState(mode, dom));
    setHydrated(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // --- Persist on every change. ---
  useEffect(() => {
    if (!state) return;
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch {
      // ignore quota / unavailable storage
    }
  }, [state]);

  // --- Countdown tick (full mock only). ---
  useEffect(() => {
    if (!state || state.mode !== 'full' || state.finished) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [state]);

  // --- Fetch one block (with prefetch-friendly de-duplication). ---
  const loadBlock = useCallback(async (index: number) => {
    let snapshot: ExamState | null = null;
    setState((s) => {
      snapshot = s;
      return s;
    });
    const current = snapshot as ExamState | null;
    if (!current) return;
    if (current.blocks[index] || fetching.current.has(index)) return;

    const item = current.plan[index];
    if (!item) return;
    fetching.current.add(index);

    const usedTitles = current.blocks
      .filter((b): b is DomainBlock => b !== null)
      .map((b) => b.scenario_title);

    try {
      const res = await fetch('/api/generate-block', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ domain: item.domain, count: item.count, usedTitles }),
      });
      const data = await res.json().catch(() => ({}) as Record<string, unknown>);

      if (!res.ok) {
        if (data?.code === 'NO_API_KEY') {
          setApiKeyMissing(true);
        } else {
          setError({
            message: (data?.error as string) || `Request failed (${res.status}).`,
            code: (data?.code as string) || 'ERROR',
          });
        }
        return;
      }

      setState((s) => {
        if (!s) return s;
        const blocks = [...s.blocks];
        blocks[index] = data.block as DomainBlock;
        return { ...s, blocks };
      });
      setError(null);
    } catch {
      setError({
        message: 'Network error contacting the server. Check your connection and retry.',
        code: 'NETWORK',
      });
    } finally {
      fetching.current.delete(index);
    }
  }, []);

  // --- Ensure the current block is loaded, then prefetch the next. ---
  useEffect(() => {
    if (!state || state.finished || apiKeyMissing) return;
    if (!state.blocks[state.blockIdx]) {
      if (!error) loadBlock(state.blockIdx);
      return;
    }
    const next = state.blockIdx + 1;
    if (next < state.plan.length && !state.blocks[next]) {
      loadBlock(next);
    }
  }, [state, error, apiKeyMissing, loadBlock]);

  // --- Auto-finish when the timer runs out. ---
  const remainingMs =
    state && state.mode === 'full' ? Math.max(0, state.startedAt + FULL_MOCK_LIMIT_MS - now) : null;

  useEffect(() => {
    if (state && state.mode === 'full' && !state.finished && remainingMs === 0) {
      setState((s) => (s ? { ...s, finished: true } : s));
    }
  }, [remainingMs, state]);

  // --- Actions ---
  const selectOption = (key: OptionKey) => {
    setState((s) => {
      if (!s) return s;
      const id = `${s.blockIdx}:${s.qIdx}`;
      if (s.answers[id] !== undefined) return s;
      return { ...s, answers: { ...s.answers, [id]: key } };
    });
  };

  const goNext = () => {
    setState((s) => {
      if (!s) return s;
      const block = s.blocks[s.blockIdx];
      if (!block) return s;
      if (s.qIdx + 1 < block.questions.length) {
        return { ...s, qIdx: s.qIdx + 1 };
      }
      if (s.blockIdx + 1 < s.plan.length) {
        return { ...s, blockIdx: s.blockIdx + 1, qIdx: 0 };
      }
      return { ...s, finished: true };
    });
  };

  const finishNow = () => setState((s) => (s ? { ...s, finished: true } : s));

  const restart = () => {
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch {
      // ignore
    }
    router.push('/');
  };

  const retry = () => {
    setError(null);
    if (state) loadBlock(state.blockIdx);
  };

  // --- Render ---
  if (!hydrated) {
    return (
      <main className="container">
        <p className="muted">Loading…</p>
      </main>
    );
  }
  if (apiKeyMissing) return <SetupScreen />;
  if (!state) {
    return (
      <main className="container">
        <div className="card">
          <h1 className="serif">No exam in progress</h1>
          <p className="muted">Start a new practice session from the home page.</p>
          <Link className="btn" href="/">
            Go to home
          </Link>
        </div>
      </main>
    );
  }
  if (state.finished) return <Results state={state} onRestart={restart} />;

  const score = computeScore(state);
  const totalPlanned = state.plan.reduce((acc, p) => acc + p.count, 0);
  const globalNumber =
    state.plan.slice(0, state.blockIdx).reduce((acc, p) => acc + p.count, 0) + state.qIdx + 1;
  const domain = state.plan[state.blockIdx].domain;
  const block = state.blocks[state.blockIdx];

  return (
    <main className="container">
      <ExamHeader
        mode={state.mode}
        remainingMs={remainingMs}
        globalNumber={Math.min(globalNumber, totalPlanned)}
        totalPlanned={totalPlanned}
        domain={domain}
        score={score}
        onEnd={finishNow}
      />

      {!block ? (
        error ? (
          <div className="card error-card">
            <h2 className="serif">Couldn’t generate this scenario</h2>
            <p>{error.message}</p>
            <button className="btn" onClick={retry}>
              Retry
            </button>
          </div>
        ) : (
          <div className="card center loading-card">
            <div className="spinner" />
            <p className="muted">Generating your next scenario…</p>
          </div>
        )
      ) : (
        <QuestionView
          block={block}
          qIdx={state.qIdx}
          selected={state.answers[`${state.blockIdx}:${state.qIdx}`]}
          onSelect={selectOption}
          onNext={goNext}
          isLastOfExam={
            state.blockIdx === state.plan.length - 1 && state.qIdx === block.questions.length - 1
          }
        />
      )}
    </main>
  );
}

function formatTime(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000);
  const m = Math.floor(totalSeconds / 60);
  const s = totalSeconds % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

function ExamHeader({
  mode,
  remainingMs,
  globalNumber,
  totalPlanned,
  domain,
  score,
  onEnd,
}: {
  mode: ExamMode;
  remainingMs: number | null;
  globalNumber: number;
  totalPlanned: number;
  domain: DomainCode;
  score: ReturnType<typeof computeScore>;
  onEnd: () => void;
}) {
  const running = score.total > 0 ? scaledScore(score.correct, score.total) : null;
  const lowTime = remainingMs !== null && remainingMs < 5 * 60 * 1000;
  return (
    <div className="exam-header">
      <div className="exam-header-top">
        <span className="pill-tag">
          {mode === 'full' ? 'Full mock' : 'Single domain'} · {domain} — {DOMAIN_MAP[domain].name}
        </span>
        {remainingMs !== null && (
          <span className={`timer ${lowTime ? 'timer-low' : ''}`}>{formatTime(remainingMs)}</span>
        )}
      </div>
      <div className="progress-track">
        <div
          className="progress-fill"
          style={{ width: `${Math.round((globalNumber / totalPlanned) * 100)}%` }}
        />
      </div>
      <div className="exam-header-bottom">
        <span className="muted small">
          Question {globalNumber} of {totalPlanned}
        </span>
        <span className="muted small">
          Score {score.correct}/{score.total}
          {running !== null ? ` · ~${running} (vs ${PASS_BAR})` : ''}
        </span>
        <button className="link-btn" onClick={onEnd}>
          End &amp; see results
        </button>
      </div>
    </div>
  );
}

function QuestionView({
  block,
  qIdx,
  selected,
  onSelect,
  onNext,
  isLastOfExam,
}: {
  block: DomainBlock;
  qIdx: number;
  selected: OptionKey | undefined;
  onSelect: (key: OptionKey) => void;
  onNext: () => void;
  isLastOfExam: boolean;
}) {
  const q = block.questions[qIdx];
  const answered = selected !== undefined;
  const isFirstOfBlock = qIdx === 0;

  return (
    <>
      <div className={`card scenario-card ${isFirstOfBlock ? 'scenario-new' : ''}`}>
        {isFirstOfBlock && <span className="pill-tag">New scenario</span>}
        <h2 className="serif scenario-title">{block.scenario_title}</h2>
        <p className="scenario-text">{block.scenario}</p>
      </div>

      <div className="card question-card">
        <p className="stem">{q.stem}</p>
        <div className="options">
          {OPTION_KEYS.map((key) => {
            const isCorrect = key === q.correct;
            const isChosen = key === selected;
            let cls = 'option';
            if (answered) {
              if (isCorrect) cls += ' option-correct';
              else if (isChosen) cls += ' option-incorrect';
              else cls += ' option-dim';
            }
            return (
              <button
                key={key}
                className={cls}
                onClick={() => onSelect(key)}
                disabled={answered}
                aria-pressed={isChosen}
              >
                <span className="option-key">{key}</span>
                <span className="option-text">{q.options[key]}</span>
                {answered && isCorrect && <span className="mark mark-correct">✓</span>}
                {answered && isChosen && !isCorrect && <span className="mark mark-incorrect">✗</span>}
              </button>
            );
          })}
        </div>

        {answered && (
          <div className="explanations">
            <div className={`verdict-line ${selected === q.correct ? 'pass' : 'fail'}`}>
              {selected === q.correct
                ? '✓ Correct'
                : `✗ Incorrect — the best answer is ${q.correct}`}
            </div>
            {OPTION_KEYS.map((key) => (
              <div
                key={key}
                className={`explanation ${key === q.correct ? 'explanation-correct' : ''}`}
              >
                <span className="explanation-key">{key}</span>
                <span>{q.explanations[key]}</span>
              </div>
            ))}
            <div className="actions">
              <button className="btn" onClick={onNext}>
                {isLastOfExam ? 'Finish & see results' : 'Next question'}
              </button>
            </div>
          </div>
        )}
      </div>
    </>
  );
}
