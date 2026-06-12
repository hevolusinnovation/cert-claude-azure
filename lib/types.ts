export type DomainCode = 'D1' | 'D2' | 'D3' | 'D4' | 'D5';
export type OptionKey = 'A' | 'B' | 'C' | 'D';

export interface Question {
  stem: string;
  options: Record<OptionKey, string>;
  correct: OptionKey;
  explanations: Record<OptionKey, string>;
}

/** A scenario block as authored by the model (no domain attached yet). */
export interface ExamBlock {
  scenario_title: string;
  scenario: string;
  questions: Question[];
}

/** A block once the server tags it with the requested domain. */
export interface DomainBlock extends ExamBlock {
  domain: DomainCode;
}

export interface BlockPlanItem {
  domain: DomainCode;
  count: number;
}

export type ExamMode = 'full' | 'domain';

/**
 * The complete exam state. For a logged-in user this mirrors a row in
 * `exam_sessions` (+ its `exam_blocks`); the server is the source of truth and
 * `id` is the session UUID.
 */
export interface ExamState {
  id: string;
  mode: ExamMode;
  singleDomain: DomainCode | null;
  plan: BlockPlanItem[];
  /** Aligned 1:1 with `plan`; null until a block has been fetched. */
  blocks: (DomainBlock | null)[];
  blockIdx: number;
  qIdx: number;
  /** Keyed by `${blockIdx}:${qIdx}` -> the option the student chose. */
  answers: Record<string, OptionKey>;
  startedAt: number;
  finished: boolean;
}

/** Authenticated user, as exposed to the client (never includes the hash). */
export interface User {
  id: string;
  username: string;
}

/** Per-domain correct/total snapshot, stored when an exam finishes. */
export type DomainScoreSnapshot = Partial<Record<DomainCode, { correct: number; total: number }>>;

/** Lightweight row for the profile listing (no blocks loaded). */
export interface SessionSummary {
  id: string;
  mode: ExamMode;
  singleDomain: DomainCode | null;
  plannedTotal: number;
  answered: number;
  finished: boolean;
  scoreCorrect: number | null;
  scoreTotal: number | null;
  createdAt: string;
  updatedAt: string;
}

/** Aggregated performance statistics across a user's finished exams. */
export interface UserStats {
  totalSessions: number;
  finishedSessions: number;
  passedCount: number;
  avgScaled: number | null;
  bestScaled: number | null;
  perDomain: Partial<Record<DomainCode, { correct: number; total: number }>>;
  /** Most recent finished exams (oldest→newest) for a simple trend. */
  trend: { id: string; scaled: number; finishedAt: string }[];
}
