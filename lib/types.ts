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

/** The complete, refresh-survivable exam state persisted in localStorage. */
export interface ExamState {
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
