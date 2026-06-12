/**
 * Postgres access layer. A single shared pool per server process, plus an
 * idempotent schema bootstrap that runs once on first use — so the app works
 * both under docker-compose (Postgres service) and with a locally-run Postgres
 * during `make dev`, with no separate migration step.
 *
 * Server-only: never import this from a client component.
 */
import 'server-only';
import { Pool, type PoolClient, type QueryResultRow } from 'pg';

let pool: Pool | null = null;
let schemaReady: Promise<void> | null = null;

export function getDatabaseUrl(): string | null {
  const url = process.env.DATABASE_URL;
  return url && url.trim() ? url.trim() : null;
}

/** Thrown when the server has no DATABASE_URL configured. */
export class DbNotConfiguredError extends Error {
  constructor() {
    super('DATABASE_URL is not configured on the server.');
    this.name = 'DbNotConfiguredError';
  }
}

function getPool(): Pool {
  const url = getDatabaseUrl();
  if (!url) throw new DbNotConfiguredError();
  if (!pool) {
    pool = new Pool({ connectionString: url, max: 10 });
    pool.on('error', (err) => console.error('[db] idle client error', err));
  }
  return pool;
}

const SCHEMA = `
CREATE TABLE IF NOT EXISTS users (
  id            uuid PRIMARY KEY,
  username      text UNIQUE NOT NULL,
  password_hash text NOT NULL,
  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS exam_sessions (
  id            uuid PRIMARY KEY,
  user_id       uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  mode          text NOT NULL CHECK (mode IN ('full','domain')),
  single_domain text,
  plan          jsonb NOT NULL,
  block_idx     int NOT NULL DEFAULT 0,
  q_idx         int NOT NULL DEFAULT 0,
  answers       jsonb NOT NULL DEFAULT '{}'::jsonb,
  started_at    bigint NOT NULL DEFAULT 0,
  finished      boolean NOT NULL DEFAULT false,
  score_correct int,
  score_total   int,
  score_per_domain jsonb,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS exam_blocks (
  session_id    uuid NOT NULL REFERENCES exam_sessions(id) ON DELETE CASCADE,
  block_index   int NOT NULL,
  domain        text NOT NULL,
  payload       jsonb NOT NULL,
  created_at    timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (session_id, block_index)
);

CREATE INDEX IF NOT EXISTS exam_sessions_user_idx
  ON exam_sessions (user_id, updated_at DESC);
`;

/** Ensures the schema exists exactly once per process. */
export function ensureSchema(): Promise<void> {
  if (!schemaReady) {
    schemaReady = getPool()
      .query(SCHEMA)
      .then(() => {
        console.info('[db] Schema ready.');
      })
      .catch((err) => {
        // Reset so a later request can retry (e.g. DB started after the app).
        schemaReady = null;
        throw err;
      });
  }
  return schemaReady;
}

/** Run a parameterized query, ensuring the schema exists first. */
export async function query<T extends QueryResultRow = QueryResultRow>(
  text: string,
  params: unknown[] = [],
): Promise<T[]> {
  await ensureSchema();
  const res = await getPool().query<T>(text, params as never[]);
  return res.rows;
}

/** Run several statements in a single transaction. */
export async function withTransaction<T>(fn: (client: PoolClient) => Promise<T>): Promise<T> {
  await ensureSchema();
  const client = await getPool().connect();
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}
