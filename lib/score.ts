import { DOMAIN_CODES } from './domains';
import type { DomainCode, ExamState } from './types';

export interface DomainScore {
  total: number;
  correct: number;
}

export interface ScoreResult {
  total: number;
  correct: number;
  per: Record<DomainCode, DomainScore>;
}

export const PASS_BAR = 720;
const SCALE_MIN = 100;
const SCALE_MAX = 1000;

export function computeScore(state: ExamState): ScoreResult {
  const per = Object.fromEntries(
    DOMAIN_CODES.map((c) => [c, { total: 0, correct: 0 }]),
  ) as Record<DomainCode, DomainScore>;

  let total = 0;
  let correct = 0;

  state.blocks.forEach((block, i) => {
    if (!block) return;
    const domain = state.plan[i]?.domain ?? block.domain;
    block.questions.forEach((q, qi) => {
      const answer = state.answers[`${i}:${qi}`];
      if (answer === undefined) return;
      total += 1;
      per[domain].total += 1;
      if (answer === q.correct) {
        correct += 1;
        per[domain].correct += 1;
      }
    });
  });

  return { total, correct, per };
}

/** Linear estimate of the 100–1,000 scaled score. */
export function scaledScore(correct: number, total: number): number {
  if (total <= 0) return SCALE_MIN;
  return Math.round(SCALE_MIN + (correct / total) * (SCALE_MAX - SCALE_MIN));
}

export function accuracy(correct: number, total: number): number {
  return total > 0 ? correct / total : 0;
}
