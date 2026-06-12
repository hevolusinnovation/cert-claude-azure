import Anthropic from '@anthropic-ai/sdk';
import { DOMAIN_MAP } from './domains';
import { EXAM_SYSTEM_PROMPT } from './exam-prompt';
import { extractJson } from './json-extract';
import type { DomainCode, ExamBlock } from './types';
import { validateBlock } from './validate';

const DEFAULT_MODEL = 'claude-sonnet-4-6';

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
  return [
    `Target domain: ${domain} — ${info.name}`,
    `Questions in this block: ${count}`,
    `Already-used scenario titles/industries to avoid repeating:`,
    avoid,
    ``,
    `Author exactly ONE new, original production scenario for domain ${domain} and ${count} questions anchored to it. Respond with ONLY the JSON object — no prose, no code fences.`,
  ].join('\n');
}

/**
 * Generate one validated scenario block. Calls the model, robustly extracts
 * JSON, validates the schema, and retries ONCE on malformed output before
 * giving up with a 502.
 */
export async function generateBlock(
  domain: DomainCode,
  count: number,
  usedTitles: string[],
): Promise<ExamBlock> {
  const apiKey = getApiKey();
  if (!apiKey) {
    throw new GenerationError('ANTHROPIC_API_KEY is not configured', 500, 'NO_API_KEY');
  }

  const model = process.env.ANTHROPIC_MODEL?.trim() || DEFAULT_MODEL;
  const client = new Anthropic({ apiKey });
  const userMessage = buildUserMessage(domain, count, usedTitles);

  let lastParseError: unknown;
  for (let attempt = 0; attempt < 2; attempt++) {
    const content =
      attempt === 0
        ? userMessage
        : `${userMessage}\n\nYour previous response could not be parsed as the required JSON. Respond again with ONLY the JSON object described in the system prompt.`;

    let response;
    try {
      response = await client.messages.create({
        model,
        max_tokens: 8000,
        system: EXAM_SYSTEM_PROMPT,
        messages: [{ role: 'user', content }],
      });
    } catch (err) {
      throw mapUpstreamError(err);
    }

    const text = response.content
      .filter((b): b is Anthropic.TextBlock => b.type === 'text')
      .map((b) => b.text)
      .join('');

    try {
      return validateBlock(extractJson(text));
    } catch (err) {
      lastParseError = err;
    }
  }

  const detail = lastParseError instanceof Error ? lastParseError.message : 'unknown error';
  throw new GenerationError(
    `The model returned malformed exam data (${detail}).`,
    502,
    'BAD_MODEL_OUTPUT',
  );
}

function mapUpstreamError(err: unknown): GenerationError {
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
