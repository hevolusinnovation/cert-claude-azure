import { NextResponse, type NextRequest } from 'next/server';
import { GenerationError, generateBlock, getApiKey } from '@/lib/anthropic';
import { rateLimit } from '@/lib/rate-limit';
import { validateGenerateRequest } from '@/lib/request-validation';
import type { DomainCode } from '@/lib/types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const MAX_BODY_BYTES = 100_000;

function clientIp(req: NextRequest): string {
  const forwarded = req.headers.get('x-forwarded-for');
  if (forwarded) return forwarded.split(',')[0].trim();
  return req.headers.get('x-real-ip')?.trim() || 'unknown';
}

function json(body: unknown, status: number, headers?: Record<string, string>) {
  return NextResponse.json(body, { status, headers });
}

export async function POST(req: NextRequest) {
  // 1. Setup check first, so the UI can show a friendly "configure your key" screen.
  if (!getApiKey()) {
    return json(
      {
        error:
          'ANTHROPIC_API_KEY is not configured on the server. Copy .env.example to .env.local and set your key.',
        code: 'NO_API_KEY',
      },
      500,
    );
  }

  // 2. Per-IP rate limit (protects the deployer's own key).
  const rl = rateLimit(clientIp(req));
  if (!rl.allowed) {
    return json(
      { error: `Rate limit exceeded. Try again in ${rl.retryAfter}s.`, code: 'RATE_LIMITED' },
      429,
      { 'Retry-After': String(rl.retryAfter) },
    );
  }

  // 3. Read + size-guard + parse the body.
  let raw: string;
  try {
    raw = await req.text();
  } catch {
    return json({ error: 'Could not read request body.', code: 'BAD_REQUEST' }, 400);
  }
  if (raw.length > MAX_BODY_BYTES) {
    return json({ error: 'Request body too large.', code: 'PAYLOAD_TOO_LARGE' }, 413);
  }
  let body: unknown;
  try {
    body = JSON.parse(raw);
  } catch {
    return json({ error: 'Request body is not valid JSON.', code: 'BAD_REQUEST' }, 400);
  }

  // 4. Validate the request shape.
  const validated = validateGenerateRequest(body);
  if (!validated.ok || !validated.value) {
    return json({ error: validated.error ?? 'Invalid request.', code: 'BAD_REQUEST' }, 400);
  }
  const { domain, count, usedTitles } = validated.value;

  // 5. Generate.
  try {
    const block = await generateBlock(domain as DomainCode, count, usedTitles);
    return json({ block: { ...block, domain } }, 200);
  } catch (err) {
    if (err instanceof GenerationError) {
      return json({ error: err.message, code: err.code }, err.status);
    }
    return json({ error: 'Unexpected server error.', code: 'INTERNAL' }, 500);
  }
}
