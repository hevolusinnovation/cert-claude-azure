'use client';

import { DOMAIN_MAP } from '@/lib/domains';
import { PASS_BAR, accuracy, computeScore, scaledScore } from '@/lib/score';
import type { DomainCode, ExamState } from '@/lib/types';

export default function Results({
  state,
  onRestart,
}: {
  state: ExamState;
  onRestart: () => void;
}) {
  const { total, correct, per } = computeScore(state);
  const scaled = scaledScore(correct, total);
  const passed = scaled >= PASS_BAR;

  const answeredDomains = (Object.keys(per) as DomainCode[]).filter((d) => per[d].total > 0);
  const weakest = [...answeredDomains]
    .sort((a, b) => accuracy(per[a].correct, per[a].total) - accuracy(per[b].correct, per[b].total))
    .filter((d) => accuracy(per[d].correct, per[d].total) < 1)
    .slice(0, 2);

  return (
    <main className="container">
      <div className="card">
        <span className="pill-tag">Results</span>
        <h1 className="serif">{passed ? 'Above the pass bar' : 'Below the pass bar'}</h1>

        <div className="score-hero">
          <div>
            <div className="score-big">{scaled}</div>
            <div className="muted">estimated scaled score (100–1,000)</div>
          </div>
          <div className={`verdict ${passed ? 'pass' : 'fail'}`}>
            {passed ? 'PASS' : 'BELOW'} · bar ≈ {PASS_BAR}
          </div>
        </div>

        <div className="scale-track" aria-hidden="true">
          <div className="scale-fill" style={{ width: `${((scaled - 100) / 900) * 100}%` }} />
          <div className="scale-bar" style={{ left: `${((PASS_BAR - 100) / 900) * 100}%` }} />
        </div>

        <p className="muted small">
          You answered <strong>{correct}</strong> of <strong>{total}</strong> questions correctly.
          The scaled score is a simple <em>linear</em> estimate{' '}
          <code>100 + (correct / total) × 900</code> — the real exam uses a scaling curve, so treat
          this as a rough gauge, not an official prediction.
        </p>
      </div>

      <div className="card">
        <h2 className="serif">Per-domain breakdown</h2>
        <div className="domain-rows">
          {(Object.keys(per) as DomainCode[]).map((d) => {
            const s = per[d];
            const acc = accuracy(s.correct, s.total);
            return (
              <div className="domain-row" key={d}>
                <div className="domain-row-head">
                  <span>
                    <strong>{d}</strong> · {DOMAIN_MAP[d].name}
                  </span>
                  <span className="muted small">
                    {s.total > 0 ? `${s.correct}/${s.total} · ${Math.round(acc * 100)}%` : '—'}
                  </span>
                </div>
                <div className="bar-track">
                  <div className="bar-fill" style={{ width: `${Math.round(acc * 100)}%` }} />
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {weakest.length > 0 && (
        <div className="card">
          <h2 className="serif">Re-drill these next</h2>
          <ul className="weak-list">
            {weakest.map((d) => (
              <li key={d}>
                <strong>
                  {d} — {DOMAIN_MAP[d].name}
                </strong>
                <span className="muted small">
                  {' '}
                  ({Math.round(accuracy(per[d].correct, per[d].total) * 100)}% correct)
                </span>
              </li>
            ))}
          </ul>
          <p className="muted small">
            Run a single-domain set on each of these from the home page to tighten them up.
          </p>
        </div>
      )}

      <div className="actions">
        <button className="btn" onClick={onRestart}>
          Start another session
        </button>
      </div>
    </main>
  );
}
