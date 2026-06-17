import Anthropic from '@anthropic-ai/sdk';
import { domainBrief } from './domain-briefs';
import { DOMAIN_CODES, DOMAIN_MAP } from './domains';
import { EXAM_SYSTEM_PROMPT } from './exam-prompt';
import { extractJson } from './json-extract';
import type { DomainCode, ExamBlock } from './types';
import { validateBlock } from './validate';

const DEFAULT_MODEL = 'claude-sonnet-4-6';
/** Wall-clock cap per streamed call; we abort and surface a clean timeout after this. */
const DEFAULT_TIMEOUT_MS = 240_000;

/** Lightweight server log helper. Prefixed + never includes the API key. */
function log(message: string, extra?: Record<string, unknown>) {
  const suffix = extra ? ' ' + JSON.stringify(extra) : '';
  console.info(`[generate-block] ${message}${suffix}`);
}

function requestTimeoutMs(): number {
  const raw = Number(process.env.ANTHROPIC_TIMEOUT_MS);
  return Number.isFinite(raw) && raw > 0 ? raw : DEFAULT_TIMEOUT_MS;
}

const EFFORT_LEVELS = ['low', 'medium', 'high', 'xhigh', 'max'] as const;
type Effort = (typeof EFFORT_LEVELS)[number];

/**
 * How hard Opus thinks before answering. Default `medium` keeps generation
 * fast (high/xhigh can take 1–2 minutes per block); raise it for tougher
 * questions, lower it for snappier sessions. Override via ANTHROPIC_EFFORT.
 */
function effortLevel(): Effort {
  const raw = process.env.ANTHROPIC_EFFORT?.trim();
  return (EFFORT_LEVELS as readonly string[]).includes(raw ?? '') ? (raw as Effort) : 'medium';
}

/** Budget output tokens by question count (4 options + 4 explanations each). */
function maxTokensFor(count: number, attempt: number): number {
  // Streaming lifts the non-streaming timeout ceiling, so we can be generous;
  // a retry gets extra headroom in case the first response was truncated.
  const base = 4_000 + count * 2_400;
  return Math.min(32_000, attempt === 0 ? base : Math.round(base * 1.5));
}

/**
 * JSON Schema for one scenario block, enforced via structured outputs so the
 * model cannot emit malformed JSON (eliminating the parse-retry path that was
 * the main source of slow, looping generations).
 */
const OPTIONS_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    A: { type: 'string' },
    B: { type: 'string' },
    C: { type: 'string' },
    D: { type: 'string' },
  },
  required: ['A', 'B', 'C', 'D'],
} as const;

const BLOCK_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    scenario_title: { type: 'string' },
    scenario: { type: 'string' },
    questions: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        properties: {
          stem: { type: 'string' },
          options: OPTIONS_SCHEMA,
          correct: { type: 'string', enum: ['A', 'B', 'C', 'D'] },
          explanations: OPTIONS_SCHEMA,
        },
        required: ['stem', 'options', 'correct', 'explanations'],
      },
    },
  },
  required: ['scenario_title', 'scenario', 'questions'],
} as const;

/** Carries an HTTP status + machine code so the route can map it to clean JSON. */
export class GenerationError extends Error {
  status: number;
  code: string;
  constructor(message: string, status: number, code: string) {
    super(message);
    this.name = 'GenerationError';
    this.status = status;
    this.code = code;
  }
}

/** Returns the key only if present and non-empty. Never logged. */
export function getApiKey(): string | null {
  const key = process.env.ANTHROPIC_API_KEY;
  return key && key.trim() ? key.trim() : null;
}

function buildUserMessage(domain: DomainCode, count: number, usedTitles: string[]): string {
  const info = DOMAIN_MAP[domain];
  const avoid = usedTitles.length ? usedTitles.map((t) => `- ${t}`).join('\n') : '(none yet)';
  // Enumerate the OTHER four domains so the model has a concrete out-of-scope
  // list, not just a vague "don't drift". Most cross-domain leakage is a
  // question tagged for this domain whose actual decision belongs to one of
  // these — naming them is the strongest lever against that.
  const otherDomains = DOMAIN_CODES.filter((c) => c !== domain).map((c) => `${c} (${DOMAIN_MAP[c].name})`);
  return [
    `Target domain: ${domain} — ${info.name}`,
    `Domain scope: ${info.blurb}`,
    `STRICT: the question MUST test ${info.name} specifically. The scenario and the decision being asked about must sit squarely within this domain — do not drift into another domain's topic.`,
    `OUT OF SCOPE for this question — do NOT make the tested decision hinge on any of these: ${otherDomains.join('; ')}. They are covered by their own questions.`,
    `DOMAIN SELF-CHECK before you answer: the single decision the candidate must make has to hinge on a ${info.name} mechanism. If the correct answer could be reached using mainly another domain's knowledge, the question is mis-targeted — rewrite it so the crux is squarely ${info.name}. The scenario may mention adjacent concepts as flavor, but the crux and the discriminating distractor must live in ${info.name}.`,
    `Questions in this block: ${count}`,
    `Already-used scenario titles/industries to avoid repeating:`,
    avoid,
    ``,
    // Keep output tight: generation time scales directly with characters
    // produced, and verbose explanations are the bulk of it.
    `BE CONCISE (speed matters): scenario ≤ 2 sentences; each option ≤ 1 short sentence; each explanation ≤ 1 sentence (the single strongest distractor may use 2). State the mechanism, no preamble, no padding.`,
    ``,
    count === 1
      ? `Generate EXACTLY ONE question. The "questions" array MUST contain a SINGLE object — never 2, never more. Ignore any general guidance about 3–6 questions per scenario: for THIS request the count is 1. Author one new, original production scenario for domain ${domain} with that single question anchored to it. Respond with ONLY the JSON object — no prose, no code fences.`
      : `Author exactly ONE new, original production scenario for domain ${domain} and EXACTLY ${count} questions (no more, no fewer) anchored to it. Respond with ONLY the JSON object — no prose, no code fences.`,
  ].join('\n');
}

/**
 * Generate one validated scenario block.
 *
 * Uses streaming (so a long, high-`max_tokens` Opus generation can't hit the
 * SDK's request-timeout) plus structured outputs (so the model can't emit
 * malformed JSON). `maxRetries: 0` keeps the SDK from silently retrying a slow
 * request several times over — we control retries here, with a hard wall-clock
 * abort per attempt. Retries ONCE (with extra token headroom) on truncation.
 */
export async function generateBlock(
  domain: DomainCode,
  count: number,
  usedTitles: string[],
  onText?: (delta: string) => void,
): Promise<ExamBlock> {
  const apiKey = getApiKey();
  if (!apiKey) {
    throw new GenerationError('ANTHROPIC_API_KEY is not configured', 500, 'NO_API_KEY');
  }

  const model = process.env.ANTHROPIC_MODEL?.trim() || DEFAULT_MODEL;
  const timeout = requestTimeoutMs();
  const effort = effortLevel();
  // We control retries ourselves; the SDK's default (2) would re-run a slow
  // request on timeout and stack the waits, which is what caused the long hang.
  const client = new Anthropic({ apiKey, maxRetries: 0 });
  const userMessage = buildUserMessage(domain, count, usedTitles);

  log('Generating block', {
    domain,
    count,
    model,
    effort,
    timeoutMs: timeout,
    usedTitles: usedTitles.length,
  });

  let lastParseError: unknown;
  for (let attempt = 0; attempt < 2; attempt++) {
    const maxTokens = maxTokensFor(count, attempt);
    const content =
      attempt === 0
        ? userMessage
        : `${userMessage}\n\nYour previous response was incomplete. Produce the full JSON object for all ${count} questions.`;

    // Hard wall-clock cap: abort the stream if it stalls past the timeout.
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeout);
    const startedAt = Date.now();
    let response: Anthropic.Message;
    try {
      log('Stream opened — waiting for Claude to produce the block', { domain, attempt, model, maxTokens });
      // Structured outputs guarantee valid JSON but add constrained-decoding
      // latency on this nested schema. Default ON; set ANTHROPIC_STRUCTURED_OUTPUT=off
      // to fall back to free-form JSON (parsed by extractJson, retried on failure).
      const useStructured = process.env.ANTHROPIC_STRUCTURED_OUTPUT?.trim() !== 'off';
      const outputConfig = useStructured
        ? { effort, format: { type: 'json_schema' as const, schema: BLOCK_SCHEMA } }
        : { effort };
      const stream = client.messages.stream(
        {
          model,
          max_tokens: maxTokens,
          // Two cached system blocks. The first is the generic prompt — a stable
          // prefix shared across ALL domains, so its cache holds for the whole
          // session. The second is domain-specific reference material so the
          // questions are inherent to the domain under analysis (scenario,
          // decision, and distractors all anchored in that domain's mechanisms).
          // A full mock generates blocks grouped by domain, so the brief's cache
          // also holds across each domain's consecutive calls.
          system: [
            { type: 'text', text: EXAM_SYSTEM_PROMPT, cache_control: { type: 'ephemeral' } },
            { type: 'text', text: domainBrief(domain), cache_control: { type: 'ephemeral' } },
          ],
          // No extended thinking: the system prompt fully specifies the task, so
          // thinking only adds latency for this generation.
          thinking: { type: 'disabled' },
          output_config: outputConfig,
          messages: [{ role: 'user', content }],
        },
        { signal: controller.signal },
      );

      // Heartbeat so the container logs show progress during the (slow) stream
      // instead of going silent for ~100s on Opus.
      let streamedChars = 0;
      let lastBeat = Date.now();
      stream.on('text', (delta) => {
        onText?.(delta);
        streamedChars += delta.length;
        const now = Date.now();
        if (now - lastBeat >= 5_000) {
          lastBeat = now;
          log('Streaming…', { domain, attempt, chars: streamedChars, elapsedMs: now - startedAt });
        }
      });

      response = await stream.finalMessage();
    } catch (err) {
      log('Upstream call failed', { domain, attempt, ms: Date.now() - startedAt, error: errLabel(err) });
      if (controller.signal.aborted) {
        throw new GenerationError(
          'Generating this scenario took too long and timed out. Try again.',
          504,
          'UPSTREAM_TIMEOUT',
        );
      }
      throw mapUpstreamError(err);
    } finally {
      clearTimeout(timer);
    }

    const elapsed = Date.now() - startedAt;
    const text = response.content
      .filter((b): b is Anthropic.TextBlock => b.type === 'text')
      .map((b) => b.text)
      .join('');

    log('Upstream response received', {
      domain,
      attempt,
      ms: elapsed,
      stopReason: response.stop_reason,
      inputTokens: response.usage?.input_tokens,
      outputTokens: response.usage?.output_tokens,
      chars: text.length,
    });

    if (response.stop_reason === 'max_tokens') {
      log('Response truncated at max_tokens — retrying with more headroom', { domain, attempt, maxTokens });
    }

    try {
      const block = validateBlock(extractJson(text));
      if (block.questions.length > count) {
        log('Model over-generated — trimming to requested count', {
          domain,
          got: block.questions.length,
          count,
        });
        block.questions = block.questions.slice(0, count);
      }
      log('Block validated', { domain, count, attempt, questions: block.questions.length, ms: elapsed });
      return block;
    } catch (err) {
      lastParseError = err;
      log('Parse/validation failed', { domain, attempt, error: errLabel(err) });
    }
  }

  const detail = lastParseError instanceof Error ? lastParseError.message : 'unknown error';
  log('Giving up after retries', { domain, count, detail });
  throw new GenerationError(
    `The model returned malformed exam data (${detail}).`,
    502,
    'BAD_MODEL_OUTPUT',
  );
}

function errLabel(err: unknown): string {
  if (err instanceof Anthropic.APIError) return `${err.name}(${err.status ?? '?'})`;
  if (err instanceof Error) return `${err.name}: ${err.message}`;
  return 'unknown';
}

export function mapUpstreamError(err: unknown): GenerationError {
  if (err instanceof Anthropic.AuthenticationError) {
    return new GenerationError(
      'The configured Anthropic API key was rejected (401). Check ANTHROPIC_API_KEY.',
      502,
      'UPSTREAM_AUTH',
    );
  }
  if (err instanceof Anthropic.RateLimitError) {
    return new GenerationError(
      'The Anthropic API rate-limited this request. Try again in a moment.',
      502,
      'UPSTREAM_RATE_LIMIT',
    );
  }
  if (err instanceof Anthropic.APIConnectionTimeoutError) {
    return new GenerationError(
      'Generating this scenario took too long and timed out. Try again.',
      504,
      'UPSTREAM_TIMEOUT',
    );
  }
  if (err instanceof Anthropic.APIError) {
    if (err.status === 529) {
      return new GenerationError(
        'The Anthropic API is temporarily overloaded. Try again in a moment.',
        502,
        'UPSTREAM_OVERLOADED',
      );
    }
    return new GenerationError(
      `The Anthropic API returned an error (${err.status ?? 'unknown'}).`,
      502,
      'UPSTREAM_ERROR',
    );
  }
  return new GenerationError('Could not reach the Anthropic API.', 502, 'UPSTREAM_UNREACHABLE');
}
