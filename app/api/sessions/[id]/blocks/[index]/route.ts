import { type NextRequest } from 'next/server';
import { GenerationError, generateBlock, getApiKey } from '@/lib/anthropic';
import { currentUserId } from '@/lib/auth';
import { errorResponse, json } from '@/lib/http';
import { rateLimit } from '@/lib/rate-limit';
import { getSessionPlanItem, getStoredBlock, listBlockTitles, saveBlock } from '@/lib/sessions';
import type { DomainCode } from '@/lib/types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Params = { params: Promise<{ id: string; index: string }> };

function clientIp(req: NextRequest): string {
  const forwarded = req.headers.get('x-forwarded-for');
  if (forwarded) return forwarded.split(',')[0].trim();
  return req.headers.get('x-real-ip')?.trim() || 'unknown';
}

/**
 * Returns the scenario block at `index` for this session. If already generated
 * it is served straight from the DB (no model call, no tokens). Otherwise it is
 * generated once, persisted, and returned — so a resumed exam never regenerates.
 */
export async function GET(req: NextRequest, { params }: Params) {
  try {
    const uid = await currentUserId();
    if (!uid) return json({ error: 'Not authenticated.', code: 'UNAUTHENTICATED' }, 401);

    const { id, index: indexStr } = await params;
    const index = Number(indexStr);
    if (!Number.isInteger(index) || index < 0) {
      return json({ error: 'Invalid block index.', code: 'BAD_REQUEST' }, 400);
    }

    // Ownership + range check via the session plan.
    const item = await getSessionPlanItem(id, uid, index);
    if (!item) return json({ error: 'Block not found.', code: 'NOT_FOUND' }, 404);

    // Already generated → serve from storage.
    const stored = await getStoredBlock(id, index);
    if (stored) return json({ block: stored, cached: true });

    // Need the API key only when we actually have to generate.
    if (!getApiKey()) {
      return json(
        {
          error: 'ANTHROPIC_API_KEY is not configured on the server.',
          code: 'NO_API_KEY',
        },
        500,
      );
    }

    const rl = rateLimit(clientIp(req));
    if (!rl.allowed) {
      return json(
        { error: `Rate limit exceeded. Try again in ${rl.retryAfter}s.`, code: 'RATE_LIMITED' },
        429,
        { 'Retry-After': String(rl.retryAfter) },
      );
    }

    const usedTitles = await listBlockTitles(id);
    const block = await generateBlock(item.domain as DomainCode, item.count, usedTitles);
    await saveBlock(id, index, item.domain as DomainCode, block);

    return json({ block: { ...block, domain: item.domain }, cached: false });
  } catch (err) {
    if (err instanceof GenerationError) {
      return json({ error: err.message, code: err.code }, err.status);
    }
    return errorResponse(err);
  }
}
