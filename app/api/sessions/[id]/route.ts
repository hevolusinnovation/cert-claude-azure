import { type NextRequest } from 'next/server';
import { currentUserId } from '@/lib/auth';
import { errorResponse, json } from '@/lib/http';
import { getSessionState, updateSessionProgress } from '@/lib/sessions';
import type { DomainScoreSnapshot, OptionKey } from '@/lib/types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Params = { params: Promise<{ id: string }> };

export async function GET(_req: NextRequest, { params }: Params) {
  try {
    const uid = await currentUserId();
    if (!uid) return json({ error: 'Not authenticated.', code: 'UNAUTHENTICATED' }, 401);
    const { id } = await params;
    const state = await getSessionState(id, uid);
    if (!state) return json({ error: 'Session not found.', code: 'NOT_FOUND' }, 404);
    return json({ state });
  } catch (err) {
    return errorResponse(err);
  }
}

function isAnswers(v: unknown): v is Record<string, OptionKey> {
  if (typeof v !== 'object' || v === null) return false;
  return Object.values(v).every((x) => x === 'A' || x === 'B' || x === 'C' || x === 'D');
}

function isDomainScore(v: unknown): v is DomainScoreSnapshot {
  if (typeof v !== 'object' || v === null) return false;
  return Object.values(v).every(
    (s) =>
      typeof s === 'object' &&
      s !== null &&
      typeof (s as { correct?: unknown }).correct === 'number' &&
      typeof (s as { total?: unknown }).total === 'number',
  );
}

export async function PATCH(req: NextRequest, { params }: Params) {
  try {
    const uid = await currentUserId();
    if (!uid) return json({ error: 'Not authenticated.', code: 'UNAUTHENTICATED' }, 401);
    const { id } = await params;

    let body: Record<string, unknown>;
    try {
      body = await req.json();
    } catch {
      return json({ error: 'Invalid JSON body.', code: 'BAD_REQUEST' }, 400);
    }

    const blockIdx = Number(body.blockIdx);
    const qIdx = Number(body.qIdx);
    const startedAt = Number(body.startedAt);
    if (!Number.isInteger(blockIdx) || blockIdx < 0) {
      return json({ error: 'blockIdx must be a non-negative integer.', code: 'BAD_REQUEST' }, 400);
    }
    if (!Number.isInteger(qIdx) || qIdx < 0) {
      return json({ error: 'qIdx must be a non-negative integer.', code: 'BAD_REQUEST' }, 400);
    }
    if (!Number.isFinite(startedAt) || startedAt < 0) {
      return json({ error: 'startedAt must be a non-negative number.', code: 'BAD_REQUEST' }, 400);
    }
    if (!isAnswers(body.answers)) {
      return json({ error: 'answers must map ids to A–D.', code: 'BAD_REQUEST' }, 400);
    }

    const ok = await updateSessionProgress(id, uid, {
      blockIdx,
      qIdx,
      answers: body.answers,
      startedAt,
      finished: body.finished === true,
      scoreCorrect: typeof body.scoreCorrect === 'number' ? body.scoreCorrect : null,
      scoreTotal: typeof body.scoreTotal === 'number' ? body.scoreTotal : null,
      scorePerDomain: isDomainScore(body.scorePerDomain) ? body.scorePerDomain : null,
    });
    if (!ok) return json({ error: 'Session not found.', code: 'NOT_FOUND' }, 404);
    return json({ ok: true });
  } catch (err) {
    return errorResponse(err);
  }
}
