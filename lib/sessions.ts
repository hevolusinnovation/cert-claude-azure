/** Exam-session and generated-block persistence. Server-only. */
import 'server-only';
import { randomUUID } from 'node:crypto';
import { query } from './db';
import type {
  BlockPlanItem,
  DomainBlock,
  DomainCode,
  DomainScoreSnapshot,
  ExamBlock,
  ExamMode,
  ExamState,
  OptionKey,
  SessionSummary,
  UserStats,
} from './types';

const PASS_BAR = 720;
const SCALE_MIN = 100;
const SCALE_MAX = 1000;

function scaled(correct: number, total: number): number {
  if (total <= 0) return SCALE_MIN;
  return Math.round(SCALE_MIN + (correct / total) * (SCALE_MAX - SCALE_MIN));
}

interface SessionRow {
  id: string;
  user_id: string;
  mode: ExamMode;
  single_domain: DomainCode | null;
  plan: BlockPlanItem[];
  block_idx: number;
  q_idx: number;
  answers: Record<string, OptionKey>;
  started_at: string; // bigint comes back as string
  finished: boolean;
  score_correct: number | null;
  score_total: number | null;
}

interface BlockRow {
  block_index: number;
  domain: DomainCode;
  payload: ExamBlock;
}

export async function createSession(
  userId: string,
  mode: ExamMode,
  singleDomain: DomainCode | null,
  plan: BlockPlanItem[],
): Promise<string> {
  const id = randomUUID();
  await query(
    `INSERT INTO exam_sessions (id, user_id, mode, single_domain, plan)
     VALUES ($1, $2, $3, $4, $5)`,
    [id, userId, mode, singleDomain, JSON.stringify(plan)],
  );
  return id;
}

/** Loads a session owned by userId (or null if missing / not owned). */
async function getSessionRow(id: string, userId: string): Promise<SessionRow | null> {
  const rows = await query<SessionRow>(
    `SELECT id, user_id, mode, single_domain, plan, block_idx, q_idx, answers,
            started_at, finished, score_correct, score_total
       FROM exam_sessions WHERE id = $1 AND user_id = $2 LIMIT 1`,
    [id, userId],
  );
  return rows[0] ?? null;
}

/** Full state for the runner: session fields + blocks aligned 1:1 with the plan. */
export async function getSessionState(id: string, userId: string): Promise<ExamState | null> {
  const row = await getSessionRow(id, userId);
  if (!row) return null;

  const blockRows = await query<BlockRow>(
    'SELECT block_index, domain, payload FROM exam_blocks WHERE session_id = $1',
    [id],
  );
  const blocks: (DomainBlock | null)[] = row.plan.map(() => null);
  for (const b of blockRows) {
    if (b.block_index >= 0 && b.block_index < blocks.length) {
      blocks[b.block_index] = { ...b.payload, domain: b.domain };
    }
  }

  return {
    id: row.id,
    mode: row.mode,
    singleDomain: row.single_domain,
    plan: row.plan,
    blocks,
    blockIdx: row.block_idx,
    qIdx: row.q_idx,
    answers: row.answers ?? {},
    startedAt: Number(row.started_at),
    finished: row.finished,
  };
}

export interface SessionProgressUpdate {
  blockIdx: number;
  qIdx: number;
  answers: Record<string, OptionKey>;
  startedAt: number;
  finished: boolean;
  scoreCorrect?: number | null;
  scoreTotal?: number | null;
  scorePerDomain?: DomainScoreSnapshot | null;
}

/** Persists runner progress. Returns false if the session isn't owned by userId. */
export async function updateSessionProgress(
  id: string,
  userId: string,
  u: SessionProgressUpdate,
): Promise<boolean> {
  const rows = await query<{ id: string }>(
    `UPDATE exam_sessions
        SET block_idx = $3, q_idx = $4, answers = $5, started_at = $6, finished = $7,
            score_correct = $8, score_total = $9, score_per_domain = $10, updated_at = now()
      WHERE id = $1 AND user_id = $2
      RETURNING id`,
    [
      id,
      userId,
      u.blockIdx,
      u.qIdx,
      JSON.stringify(u.answers ?? {}),
      u.startedAt,
      u.finished,
      u.scoreCorrect ?? null,
      u.scoreTotal ?? null,
      u.scorePerDomain ? JSON.stringify(u.scorePerDomain) : null,
    ],
  );
  return rows.length > 0;
}

/** Aggregated performance stats over a user's finished exams. */
export async function getUserStats(userId: string): Promise<UserStats> {
  const rows = await query<{
    id: string;
    finished: boolean;
    score_correct: number | null;
    score_total: number | null;
    score_per_domain: DomainScoreSnapshot | null;
    updated_at: Date;
  }>(
    `SELECT id, finished, score_correct, score_total, score_per_domain, updated_at
       FROM exam_sessions WHERE user_id = $1`,
    [userId],
  );

  const finished = rows.filter((r) => r.finished && r.score_total && r.score_total > 0);
  const scaledScores = finished.map((r) => scaled(r.score_correct ?? 0, r.score_total ?? 0));

  const perDomain: UserStats['perDomain'] = {};
  for (const r of finished) {
    const snap = r.score_per_domain ?? {};
    for (const [code, s] of Object.entries(snap)) {
      if (!s) continue;
      const d = code as DomainCode;
      const acc = perDomain[d] ?? { correct: 0, total: 0 };
      acc.correct += s.correct;
      acc.total += s.total;
      perDomain[d] = acc;
    }
  }

  const trend = [...finished]
    .sort((a, b) => new Date(a.updated_at).getTime() - new Date(b.updated_at).getTime())
    .slice(-20)
    .map((r) => ({
      id: r.id,
      scaled: scaled(r.score_correct ?? 0, r.score_total ?? 0),
      finishedAt: new Date(r.updated_at).toISOString(),
    }));

  return {
    totalSessions: rows.length,
    finishedSessions: finished.length,
    passedCount: scaledScores.filter((s) => s >= PASS_BAR).length,
    avgScaled: scaledScores.length
      ? Math.round(scaledScores.reduce((a, b) => a + b, 0) / scaledScores.length)
      : null,
    bestScaled: scaledScores.length ? Math.max(...scaledScores) : null,
    perDomain,
    trend,
  };
}

export async function listSessions(userId: string): Promise<SessionSummary[]> {
  const rows = await query<{
    id: string;
    mode: ExamMode;
    single_domain: DomainCode | null;
    plan: BlockPlanItem[];
    answers: Record<string, OptionKey>;
    finished: boolean;
    score_correct: number | null;
    score_total: number | null;
    created_at: Date;
    updated_at: Date;
  }>(
    `SELECT id, mode, single_domain, plan, answers, finished,
            score_correct, score_total, created_at, updated_at
       FROM exam_sessions WHERE user_id = $1 ORDER BY updated_at DESC`,
    [userId],
  );

  return rows.map((r) => ({
    id: r.id,
    mode: r.mode,
    singleDomain: r.single_domain,
    plannedTotal: r.plan.reduce((acc, p) => acc + p.count, 0),
    answered: Object.keys(r.answers ?? {}).length,
    finished: r.finished,
    scoreCorrect: r.score_correct,
    scoreTotal: r.score_total,
    createdAt: new Date(r.created_at).toISOString(),
    updatedAt: new Date(r.updated_at).toISOString(),
  }));
}

/** The plan item (domain + count) for a given block index, if in range. */
export async function getSessionPlanItem(
  id: string,
  userId: string,
  index: number,
): Promise<BlockPlanItem | null> {
  const row = await getSessionRow(id, userId);
  if (!row) return null;
  return row.plan[index] ?? null;
}

export async function getStoredBlock(id: string, index: number): Promise<DomainBlock | null> {
  const rows = await query<BlockRow>(
    'SELECT block_index, domain, payload FROM exam_blocks WHERE session_id = $1 AND block_index = $2 LIMIT 1',
    [id, index],
  );
  return rows[0] ? { ...rows[0].payload, domain: rows[0].domain } : null;
}

/** Scenario titles already generated in this session, to avoid repeats. */
export async function listBlockTitles(id: string): Promise<string[]> {
  const rows = await query<{ title: string }>(
    `SELECT payload->>'scenario_title' AS title FROM exam_blocks WHERE session_id = $1`,
    [id],
  );
  return rows.map((r) => r.title).filter((t): t is string => Boolean(t));
}

/** Stores a generated block. Idempotent: a re-generated index is ignored. */
export async function saveBlock(
  id: string,
  index: number,
  domain: DomainCode,
  block: ExamBlock,
): Promise<void> {
  await query(
    `INSERT INTO exam_blocks (session_id, block_index, domain, payload)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (session_id, block_index) DO NOTHING`,
    [id, index, domain, JSON.stringify(block)],
  );
}
