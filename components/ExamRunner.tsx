'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { DOMAIN_MAP, FULL_MOCK_MINUTES } from '@/lib/domains';
import { PASS_BAR, computeScore, scaledScore } from '@/lib/score';
import type {
  DomainBlock,
  DomainCode,
  DomainScoreSnapshot,
  ExamMode,
  ExamState,
  OptionKey,
} from '@/lib/types';
import Results from './Results';
import SetupScreen from './SetupScreen';

const OPTION_KEYS: OptionKey[] = ['A', 'B', 'C', 'D'];
const FULL_MOCK_LIMIT_MS = FULL_MOCK_MINUTES * 60 * 1000;

interface FetchError {
  message: string;
  code: string;
}

function domainSnapshot(per: ReturnType<typeof computeScore>['per']): DomainScoreSnapshot {
  const snap: DomainScoreSnapshot = {};
  (Object.keys(per) as DomainCode[]).forEach((d) => {
    if (per[d].total > 0) snap[d] = { correct: per[d].correct, total: per[d].total };
  });
  return snap;
}

export default function ExamRunner() {
  const router = useRouter();
  const params = useSearchParams();
  const sessionId = params.get('session');

  const [state, setState] = useState<ExamState | null>(null);
  const [loading, setLoading] = useState(true);
  const [authMissing, setAuthMissing] = useState(false);
  const [notFound, setNotFound] = useState(false);
  const [apiKeyMissing, setApiKeyMissing] = useState(false);
  const [error, setError] = useState<FetchError | null>(null);
  const [now, setNow] = useState<number>(() => Date.now());
  const fetching = useRef<Set<number>>(new Set());
  const lastSaved = useRef<string | null>(null);

  // --- Load the session from the server. ---
  useEffect(() => {
    if (!sessionId) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/sessions/${sessionId}`);
        if (res.status === 401) {
          if (!cancelled) setAuthMissing(true);
          return;
        }
        if (res.status === 404) {
          if (!cancelled) setNotFound(true);
          return;
        }
        const data = await res.json().catch(() => ({}) as Record<string, unknown>);
        if (!res.ok) {
          if (!cancelled)
            setError({ message: (data.error as string) || 'Failed to load the exam.', code: 'ERROR' });
          return;
        }
        if (!cancelled) setState(data.state as ExamState);
      } catch {
        if (!cancelled) setError({ message: 'Network error loading the exam.', code: 'NETWORK' });
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [sessionId]);

  // --- Redirect to login if the session check says we're not authenticated. ---
  useEffect(() => {
    if (authMissing) router.replace(`/login?next=/exam?session=${sessionId ?? ''}`);
  }, [authMissing, router, sessionId]);

  // --- Debounced autosave of progress to the server. ---
  useEffect(() => {
    if (!state || !sessionId) return;
    const score = computeScore(state);
    const payload = {
      blockIdx: state.blockIdx,
      qIdx: state.qIdx,
      answers: state.answers,
      startedAt: state.startedAt,
      finished: state.finished,
      ...(state.finished
        ? {
            scoreCorrect: score.correct,
            scoreTotal: score.total,
            scorePerDomain: domainSnapshot(score.per),
          }
        : {}),
    };
    const key = JSON.stringify(payload);
    // Skip the first run right after loading (nothing has changed yet).
    if (lastSaved.current === null) {
      lastSaved.current = key;
      return;
    }
    if (lastSaved.current === key) return;
    const t = setTimeout(async () => {
      try {
        await fetch(`/api/sessions/${sessionId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: key,
        });
        lastSaved.current = key;
      } catch (err) {
        console.warn('[exam] autosave failed', err);
      }
    }, 700);
    return () => clearTimeout(t);
  }, [state, sessionId]);

  // --- Start the clock only once the first scenario is ready. ---
  useEffect(() => {
    if (!state || state.startedAt !== 0 || !state.blocks[0]) return;
    setState((s) => (s && s.startedAt === 0 ? { ...s, startedAt: Date.now() } : s));
  }, [state]);

  // --- Countdown tick (full mock only, once started). ---
  useEffect(() => {
    if (!state || state.mode !== 'full' || state.finished || state.startedAt === 0) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [state]);

  // --- Fetch one block (get-or-generate), with prefetch-friendly de-duplication. ---
  const loadBlock = useCallback(
    async (index: number) => {
      if (!sessionId) return;
      let snapshot: ExamState | null = null;
      setState((s) => {
        snapshot = s;
        return s;
      });
      const current = snapshot as ExamState | null;
      if (!current) return;
      if (current.blocks[index] || fetching.current.has(index)) return;
      if (index < 0 || index >= current.plan.length) return;
      fetching.current.add(index);

      const startedAt = Date.now();
      console.info(`[exam] Requesting block #${index} (generating via Claude if not cached)…`);
      try {
        const res = await fetch(`/api/sessions/${sessionId}/blocks/${index}`);
        const data = await res.json().catch(() => ({}) as Record<string, unknown>);
        const ms = Date.now() - startedAt;

        if (!res.ok) {
          console.warn(`[exam] Block #${index} failed after ${ms}ms — ${res.status} ${data?.code ?? ''}`);
          if (data?.code === 'NO_API_KEY') setApiKeyMissing(true);
          else
            setError({
              message: (data?.error as string) || `Request failed (${res.status}).`,
              code: (data?.code as string) || 'ERROR',
            });
          return;
        }

        console.info(`[exam] Block #${index} ready in ${ms}ms (cached: ${data.cached === true}).`);
        setState((s) => {
          if (!s) return s;
          const blocks = [...s.blocks];
          blocks[index] = data.block as DomainBlock;
          return { ...s, blocks };
        });
        setError(null);
      } catch (err) {
        console.error(`[exam] Block #${index} network error after ${Date.now() - startedAt}ms`, err);
        setError({
          message: 'Network error contacting the server. Check your connection and retry.',
          code: 'NETWORK',
        });
      } finally {
        fetching.current.delete(index);
      }
    },
    [sessionId],
  );

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

  // --- Timer + auto-finish. ---
  const remainingMs =
    state && state.mode === 'full'
      ? state.startedAt === 0
        ? FULL_MOCK_LIMIT_MS
        : Math.max(0, state.startedAt + FULL_MOCK_LIMIT_MS - now)
      : null;

  useEffect(() => {
    if (state && state.mode === 'full' && !state.finished && remainingMs === 0 && state.startedAt !== 0) {
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

  const retry = () => {
    setError(null);
    if (state) loadBlock(state.blockIdx);
  };

  // --- Render ---
  if (loading) {
    return (
      <main className="container">
        <p className="muted">Loading…</p>
      </main>
    );
  }
  if (apiKeyMissing) return <SetupScreen />;
  if (authMissing) {
    return (
      <main className="container">
        <p className="muted">Redirecting to log in…</p>
      </main>
    );
  }
  if (!sessionId || notFound) {
    return (
      <main className="container">
        <div className="card">
          <h1 className="serif">Exam not found</h1>
          <p className="muted">This exam doesn’t exist or isn’t yours. Start a new one from your profile.</p>
          <Link className="btn" href="/profile">
            Go to profile
          </Link>
        </div>
      </main>
    );
  }
  if (!state) {
    return (
      <main className="container">
        <div className="card error-card">
          <h1 className="serif">Couldn’t load the exam</h1>
          <p>{error?.message ?? 'Unknown error.'}</p>
          <Link className="btn" href="/profile">
            Back to profile
          </Link>
        </div>
      </main>
    );
  }
  if (state.finished) return <Results state={state} onRestart={() => router.push('/profile')} />;

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
            <button className="btn" onClick={retry} type="button">
              Retry
            </button>
          </div>
        ) : (
          <GeneratingScreen
            count={state.plan[state.blockIdx].count}
            isFirst={state.blockIdx === 0 && score.total === 0}
          />
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

/**
 * Live feedback while a scenario block is generated server-side by Claude.
 * Generation is a single long API call (often 20–60s, longer for the first
 * block), so we show an elapsed counter and rotate through the steps the
 * server is actually working through, plus reassurance once it runs long.
 */
function GeneratingScreen({ count, isFirst }: { count: number; isFirst: boolean }) {
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    const id = setInterval(() => setElapsed((e) => e + 1), 1000);
    return () => clearInterval(id);
  }, []);

  const steps = [
    'Asking Claude…',
    'Authoring an original production scenario…',
    `Writing ${count} question${count === 1 ? '' : 's'} with four options each…`,
    'Drafting the option-by-option explanations…',
    'Validating the exam block…',
  ];
  const stepIdx = Math.min(steps.length - 1, Math.floor(elapsed / 6));

  return (
    <div className="card center loading-card" role="status" aria-live="polite">
      <div className="spinner" />
      <p className="loading-step">{steps[stepIdx]}</p>
      <p className="muted small loading-meta">
        Questions are generated live by Claude — {elapsed}s elapsed
      </p>
      {elapsed >= 20 && (
        <p className="muted small loading-hint">
          {isFirst
            ? 'The first scenario takes the longest. Hang tight — your progress is saved and resumable.'
            : 'Still working — complex scenarios can take a little longer.'}
        </p>
      )}
    </div>
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
        <button className="link-btn" onClick={onEnd} type="button">
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
                type="button"
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
              <button className="btn" onClick={onNext} type="button">
                {isLastOfExam ? 'Finish & see results' : 'Next question'}
              </button>
            </div>
          </div>
        )}
      </div>
    </>
  );
}
