import { type NextRequest } from 'next/server';
import { GenerationError, getApiKey } from '@/lib/anthropic';
import { currentUserId } from '@/lib/auth';
import { interpretStats } from '@/lib/coach';
import { errorResponse, json } from '@/lib/http';
import { rateLimit } from '@/lib/rate-limit';
import { getUserStats } from '@/lib/sessions';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function clientIp(req: NextRequest): string {
  const forwarded = req.headers.get('x-forwarded-for');
  if (forwarded) return forwarded.split(',')[0].trim();
  return req.headers.get('x-real-ip')?.trim() || 'unknown';
}

export async function POST(req: NextRequest) {
  try {
    const uid = await currentUserId();
    if (!uid) return json({ error: 'Not authenticated.', code: 'UNAUTHENTICATED' }, 401);

    if (!getApiKey()) {
      return json({ error: 'ANTHROPIC_API_KEY is not configured on the server.', code: 'NO_API_KEY' }, 500);
    }

    const stats = await getUserStats(uid);
    if (stats.finishedSessions < 1) {
      return json(
        { error: 'Finish at least one exam to get an AI interpretation.', code: 'NOT_ENOUGH_DATA' },
        400,
      );
    }

    const rl = rateLimit(`coach:${clientIp(req)}`);
    if (!rl.allowed) {
      return json(
        { error: `Rate limit exceeded. Try again in ${rl.retryAfter}s.`, code: 'RATE_LIMITED' },
        429,
        { 'Retry-After': String(rl.retryAfter) },
      );
    }

    const interpretation = await interpretStats(stats);
    return json({ interpretation, stats });
  } catch (err) {
    if (err instanceof GenerationError) {
      return json({ error: err.message, code: err.code }, err.status);
    }
    return errorResponse(err);
  }
}
