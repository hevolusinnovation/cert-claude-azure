import type { ExamBlock, OptionKey, Question } from './types';

const OPTION_KEYS: OptionKey[] = ['A', 'B', 'C', 'D'];

/**
 * Validate and normalize a parsed scenario block against the required schema.
 * Throws a descriptive Error on the first problem found.
 *
 * Uses only `import type`, so it carries no runtime imports and can be
 * unit-tested directly under Node's native TypeScript support.
 */
export function validateBlock(data: unknown): ExamBlock {
  if (!isObject(data)) {
    throw new Error('Block is not a JSON object');
  }
  const { scenario_title, scenario, questions } = data;

  if (typeof scenario_title !== 'string' || !scenario_title.trim()) {
    throw new Error('Missing or empty scenario_title');
  }
  if (typeof scenario !== 'string' || !scenario.trim()) {
    throw new Error('Missing or empty scenario');
  }
  if (!Array.isArray(questions) || questions.length < 1) {
    throw new Error('Missing or empty questions array');
  }
  if (questions.length > 6) {
    throw new Error('Block has more than 6 questions');
  }

  const validated = questions.map((q, i) => validateQuestion(q, i));
  return {
    scenario_title: scenario_title.trim(),
    scenario: scenario.trim(),
    questions: validated,
  };
}

function validateQuestion(q: unknown, i: number): Question {
  if (!isObject(q)) {
    throw new Error(`Question ${i} is not an object`);
  }
  const { stem, options, correct, explanations } = q;

  if (typeof stem !== 'string' || !stem.trim()) {
    throw new Error(`Question ${i} is missing a stem`);
  }
  const opts = validateOptionRecord(options, `Question ${i} options`);
  const expl = validateOptionRecord(explanations, `Question ${i} explanations`);
  if (typeof correct !== 'string' || !OPTION_KEYS.includes(correct as OptionKey)) {
    throw new Error(`Question ${i} has an invalid "correct" value`);
  }
  return {
    stem: stem.trim(),
    options: opts,
    correct: correct as OptionKey,
    explanations: expl,
  };
}

function validateOptionRecord(v: unknown, label: string): Record<OptionKey, string> {
  if (!isObject(v)) {
    throw new Error(`${label} is missing`);
  }
  const out = {} as Record<OptionKey, string>;
  for (const key of OPTION_KEYS) {
    const value = v[key];
    if (typeof value !== 'string' || !value.trim()) {
      throw new Error(`${label} is missing option ${key}`);
    }
    out[key] = value.trim();
  }
  return out;
}

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}
