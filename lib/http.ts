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
        error: 'The database (COSMOS_ENDPOINT) is not configured on the server.',
        code: 'DB_NOT_CONFIGURED',
      },
      503,
    );
  }
  console.error('[api] Unexpected error', err);
  return json({ error: 'Unexpected server error.', code: 'INTERNAL' }, 500);
}
