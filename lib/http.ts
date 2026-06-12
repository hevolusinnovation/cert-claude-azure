/** Shared helpers for API route handlers. Server-only. */
import 'server-only';
import { NextResponse } from 'next/server';
import { DbNotConfiguredError } from './db';

export function json(body: unknown, status = 200, headers?: Record<string, string>) {
  return NextResponse.json(body, { status, headers });
}

/** Maps known errors to clean JSON responses; everything else → 500. */
export function errorResponse(err: unknown) {
  if (err instanceof DbNotConfiguredError) {
    return json(
      {
        error:
          'DATABASE_URL is not configured on the server. Start Postgres (docker compose up) and set DATABASE_URL.',
        code: 'DB_NOT_CONFIGURED',
      },
      503,
    );
  }
  console.error('[api] Unexpected error', err);
  return json({ error: 'Unexpected server error.', code: 'INTERNAL' }, 500);
}

/** True if a thrown DB error is a unique-constraint violation. */
export function isUniqueViolation(err: unknown): boolean {
  return typeof err === 'object' && err !== null && (err as { code?: string }).code === '23505';
}
