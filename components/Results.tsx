'use client';

import { DOMAIN_MAP } from '@/lib/domains';
import { PASS_BAR, accuracy, computeScore, scaledScore } from '@/lib/score';
import type { DomainCode, ExamState, OptionKey, Question } from '@/lib/types';

const OPTION_KEYS: OptionKey[] = ['A', 'B', 'C', 'D'];

type Outcome = 'correct' | 'wrong' | 'unanswered';

interface ReviewItem {
  number: number;
  domain: DomainCode;
  scenarioTitle: string;
  scenario: string;
  q: Question;
  chosen: OptionKey | undefined;
  outcome: Outcome;
}

/**
 * Flatten the (already-hydrated) blocks + answers into a per-question review
 * list, numbered like the live exam. Skips not-yet-generated blocks (a session
 * ended before later blocks streamed in) so the review never shows blanks.
 */
function buildReviewItems(state: ExamState): ReviewItem[] {
  const items: ReviewItem[] = [];
  let number = 0;
  state.blocks.forEach((block, i) => {
    if (!block) return;
    const domain = (state.plan[i]?.domain ?? block.domain) as DomainCode;
    block.questions.forEach((q, qi) => {
      number += 1;
      const chosen = state.answers[`${i}:${qi}`];
      const outcome: Outcome =
        chosen === undefined ? 'unanswered' : chosen === q.correct ? 'correct' : 'wrong';
      items.push({
        number,
        domain,
        scenarioTitle: block.scenario_title,
        scenario: block.scenario,
        q,
        chosen,
        outcome,
      });
    });
  });
  return items;
}

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

  const review = buildReviewItems(state);
  const missed = review.filter((r) => r.outcome !== 'correct').length;

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

      {review.length > 0 && (
        <div className="card">
          <h2 className="serif">Review answers</h2>
          <p className="muted small">
            {review.length} question{review.length === 1 ? '' : 's'} ·{' '}
            {missed === 0 ? 'all correct' : `${missed} to review`}. Click any row to expand the
            scenario, your answer, and the explanations.
          </p>
          <div className="review-list">
            {review.map((item) => (
              <ReviewItemRow key={item.number} item={item} />
            ))}
          </div>
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

function outcomeBadge(outcome: Outcome): { cls: string; label: string } {
  if (outcome === 'correct') return { cls: 'pass', label: '✓ Correct' };
  if (outcome === 'wrong') return { cls: 'fail', label: '✗ Wrong' };
  return { cls: 'neutral', label: '— Not answered' };
}

function ReviewItemRow({ item }: { item: ReviewItem }) {
  const { q, chosen, outcome } = item;
  const badge = outcomeBadge(outcome);
  return (
    <details className="review-item">
      <summary className="review-summary">
        <span className="review-num">#{item.number}</span>
        <span className="review-domain muted small">{item.domain}</span>
        <span className={`verdict-mini ${badge.cls}`}>{badge.label}</span>
        <span className="review-stem">{item.scenarioTitle}</span>
      </summary>

      <div className="review-body">
        <p className="scenario-text">{item.scenario}</p>
        <p className="stem">{q.stem}</p>
        <div className="options">
          {OPTION_KEYS.map((key) => {
            const isCorrect = key === q.correct;
            const isChosen = key === chosen;
            let cls = 'option';
            if (isCorrect) cls += ' option-correct';
            else if (isChosen) cls += ' option-incorrect';
            else cls += ' option-dim';
            return (
              <div key={key} className={cls}>
                <span className="option-key">{key}</span>
                <span className="option-text">{q.options[key]}</span>
                {isCorrect && <span className="mark mark-correct">✓</span>}
                {isChosen && !isCorrect && <span className="mark mark-incorrect">✗</span>}
              </div>
            );
          })}
        </div>

        <div className="explanations">
          <div className={`verdict-line ${outcome === 'correct' ? 'pass' : 'fail'}`}>
            {outcome === 'correct'
              ? '✓ You answered correctly'
              : outcome === 'wrong'
                ? `✗ You chose ${chosen} — the best answer is ${q.correct}`
                : `— Not answered — the best answer is ${q.correct}`}
          </div>
          {OPTION_KEYS.map((key) => (
            <div key={key} className={`explanation ${key === q.correct ? 'explanation-correct' : ''}`}>
              <span className="explanation-key">{key}</span>
              <span>{q.explanations[key]}</span>
            </div>
          ))}
        </div>
      </div>
    </details>
  );
}
