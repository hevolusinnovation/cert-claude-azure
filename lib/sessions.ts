/** Exam-session and generated-block persistence (Cosmos DB). Server-only. */
import 'server-only';
import { randomUUID } from 'node:crypto';
import { CONTAINERS, getContainer, isConflict, isNotFound } from './db';
import type {
  BlockPlanItem,
  DomainBlock,
  DomainCode,
  DomainScoreSnapshot,
  ExamBlock,
  ExamMode,
  ExamState,
  GenerationHistory,
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

/** A session document — `userId` is the partition key. */
interface SessionDoc {
  id: string;
  userId: string;
  mode: ExamMode;
  singleDomain: DomainCode | null;
  plan: BlockPlanItem[];
  blockIdx: number;
  qIdx: number;
  answers: Record<string, OptionKey>;
  startedAt: number;
  finished: boolean;
  scoreCorrect: number | null;
  scoreTotal: number | null;
  scorePerDomain: DomainScoreSnapshot | null;
  createdAt: string;
  updatedAt: string;
}

/** A generated block — `sessionId` is the partition key, `id` is the index. */
interface BlockDoc {
  id: string;
  sessionId: string;
  blockIndex: number;
  domain: DomainCode;
  payload: ExamBlock;
}

const sessions = () => getContainer(CONTAINERS.sessions);
const blocks = () => getContainer(CONTAINERS.blocks);

/** Reads a session owned by userId (partition key), or null if missing. */
async function getSessionDoc(id: string, userId: string): Promise<SessionDoc | null> {
  try {
    const { resource } = await sessions().item(id, userId).read<SessionDoc>();
    return resource ?? null;
  } catch (err) {
    if (isNotFound(err)) return null;
    throw err;
  }
}

export async function createSession(
  userId: string,
  mode: ExamMode,
  singleDomain: DomainCode | null,
  plan: BlockPlanItem[],
): Promise<string> {
  const id = randomUUID();
  const now = new Date().toISOString();
  const doc: SessionDoc = {
    id,
    userId,
    mode,
    singleDomain,
    plan,
    blockIdx: 0,
    qIdx: 0,
    answers: {},
    startedAt: 0,
    finished: false,
    scoreCorrect: null,
    scoreTotal: null,
    scorePerDomain: null,
    createdAt: now,
    updatedAt: now,
  };
  await sessions().items.create(doc);
  return id;
}

/** Full state for the runner: session fields + blocks aligned 1:1 with the plan. */
export async function getSessionState(id: string, userId: string): Promise<ExamState | null> {
  const doc = await getSessionDoc(id, userId);
  if (!doc) return null;

  const { resources } = await blocks()
    .items.query<BlockDoc>(
      { query: 'SELECT * FROM c WHERE c.sessionId = @sid', parameters: [{ name: '@sid', value: id }] },
      { partitionKey: id },
    )
    .fetchAll();

  const aligned: (DomainBlock | null)[] = doc.plan.map(() => null);
  for (const b of resources) {
    if (b.blockIndex >= 0 && b.blockIndex < aligned.length) {
      aligned[b.blockIndex] = { ...b.payload, domain: b.domain };
    }
  }

  return {
    id: doc.id,
    mode: doc.mode,
    singleDomain: doc.singleDomain,
    plan: doc.plan,
    blocks: aligned,
    blockIdx: doc.blockIdx,
    qIdx: doc.qIdx,
    answers: doc.answers ?? {},
    startedAt: Number(doc.startedAt),
    finished: doc.finished,
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
  const doc = await getSessionDoc(id, userId);
  if (!doc) return false;

  const updated: SessionDoc = {
    ...doc,
    blockIdx: u.blockIdx,
    qIdx: u.qIdx,
    answers: u.answers ?? {},
    startedAt: u.startedAt,
    finished: u.finished,
    scoreCorrect: u.scoreCorrect ?? null,
    scoreTotal: u.scoreTotal ?? null,
    scorePerDomain: u.scorePerDomain ?? null,
    updatedAt: new Date().toISOString(),
  };
  await sessions().item(id, userId).replace(updated);
  return true;
}

/** All of a user's sessions (single-partition query). */
async function listSessionDocs(userId: string): Promise<SessionDoc[]> {
  const { resources } = await sessions()
    .items.query<SessionDoc>(
      { query: 'SELECT * FROM c WHERE c.userId = @uid', parameters: [{ name: '@uid', value: userId }] },
      { partitionKey: userId },
    )
    .fetchAll();
  return resources;
}

/** Aggregated performance stats over a user's finished exams. */
export async function getUserStats(userId: string): Promise<UserStats> {
  const rows = await listSessionDocs(userId);

  const finished = rows.filter((r) => r.finished && r.scoreTotal && r.scoreTotal > 0);
  const scaledScores = finished.map((r) => scaled(r.scoreCorrect ?? 0, r.scoreTotal ?? 0));

  const perDomain: UserStats['perDomain'] = {};
  for (const r of finished) {
    const snap = r.scorePerDomain ?? {};
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
    .sort((a, b) => new Date(a.updatedAt).getTime() - new Date(b.updatedAt).getTime())
    .slice(-20)
    .map((r) => ({
      id: r.id,
      scaled: scaled(r.scoreCorrect ?? 0, r.scoreTotal ?? 0),
      finishedAt: new Date(r.updatedAt).toISOString(),
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
  const rows = await listSessionDocs(userId);
  return rows
    .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
    .map((r) => ({
      id: r.id,
      mode: r.mode,
      singleDomain: r.singleDomain,
      plannedTotal: r.plan.reduce((acc, p) => acc + p.count, 0),
      answered: Object.keys(r.answers ?? {}).length,
      finished: r.finished,
      scoreCorrect: r.scoreCorrect,
      scoreTotal: r.scoreTotal,
      createdAt: new Date(r.createdAt).toISOString(),
      updatedAt: new Date(r.updatedAt).toISOString(),
    }));
}

/** The plan item (domain + count) for a given block index, if in range. */
export async function getSessionPlanItem(
  id: string,
  userId: string,
  index: number,
): Promise<BlockPlanItem | null> {
  const doc = await getSessionDoc(id, userId);
  if (!doc) return null;
  return doc.plan[index] ?? null;
}

export async function getStoredBlock(id: string, index: number): Promise<DomainBlock | null> {
  try {
    const { resource } = await blocks().item(String(index), id).read<BlockDoc>();
    return resource ? { ...resource.payload, domain: resource.domain } : null;
  } catch (err) {
    if (isNotFound(err)) return null;
    throw err;
  }
}

/**
 * Everything already generated in this session, so the next block can steer
 * clear of it. Returns both scenario titles AND question stems: titles alone
 * let the model reuse the same notion under a fresh title (even across
 * domains), so we feed back the stems too and ask it to vary the concept.
 */
export async function listSessionHistory(id: string): Promise<GenerationHistory> {
  const { resources } = await blocks()
    .items.query<BlockDoc>(
      { query: 'SELECT * FROM c WHERE c.sessionId = @sid', parameters: [{ name: '@sid', value: id }] },
      { partitionKey: id },
    )
    .fetchAll();
  const titles = resources.map((b) => b.payload?.scenario_title).filter((t): t is string => Boolean(t));
  const questions = resources.flatMap((b) => b.payload?.questions ?? []);
  const stems = questions.map((q) => q?.stem).filter((s): s is string => Boolean(s));
  const concepts = questions.map((q) => q?.concept).filter((c): c is string => Boolean(c));
  return { titles, stems, concepts };
}

/** Stores a generated block. Idempotent: a re-generated index is ignored. */
export async function saveBlock(
  id: string,
  index: number,
  domain: DomainCode,
  block: ExamBlock,
): Promise<void> {
  const doc: BlockDoc = { id: String(index), sessionId: id, blockIndex: index, domain, payload: block };
  try {
    await blocks().items.create(doc);
  } catch (err) {
    if (isConflict(err)) return; // already generated — leave the original
    throw err;
  }
}
