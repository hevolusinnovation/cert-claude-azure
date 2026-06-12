/**
 * Server-side validation for the POST /api/generate-block request body.
 * Import-free so it can be unit-tested directly under Node's native
 * TypeScript support.
 */

export interface GenerateRequest {
  domain: string;
  count: number;
  usedTitles: string[];
}

export interface ValidationResult {
  ok: boolean;
  error?: string;
  value?: GenerateRequest;
}

const VALID_DOMAINS = ['D1', 'D2', 'D3', 'D4', 'D5'];
const MAX_USED_TITLES = 200;
const MAX_TITLE_LENGTH = 200;

export function validateGenerateRequest(body: unknown): ValidationResult {
  if (typeof body !== 'object' || body === null || Array.isArray(body)) {
    return { ok: false, error: 'Request body must be a JSON object' };
  }
  const b = body as Record<string, unknown>;

  if (typeof b.domain !== 'string' || !VALID_DOMAINS.includes(b.domain)) {
    return { ok: false, error: 'Invalid or missing domain (expected one of D1–D5)' };
  }

  if (
    typeof b.count !== 'number' ||
    !Number.isInteger(b.count) ||
    b.count < 3 ||
    b.count > 6
  ) {
    return { ok: false, error: 'count must be an integer between 3 and 6' };
  }

  let usedTitles: string[] = [];
  if (b.usedTitles !== undefined) {
    if (!Array.isArray(b.usedTitles)) {
      return { ok: false, error: 'usedTitles must be an array of strings' };
    }
    if (b.usedTitles.length > MAX_USED_TITLES) {
      return { ok: false, error: 'usedTitles is too large' };
    }
    for (const t of b.usedTitles) {
      if (typeof t !== 'string') {
        return { ok: false, error: 'usedTitles must contain only strings' };
      }
    }
    usedTitles = (b.usedTitles as string[]).map((t) => t.slice(0, MAX_TITLE_LENGTH));
  }

  return { ok: true, value: { domain: b.domain, count: b.count, usedTitles } };
}
