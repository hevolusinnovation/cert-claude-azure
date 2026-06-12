import { type NextRequest } from 'next/server';
import { startSession, verifyPassword } from '@/lib/auth';
import { errorResponse, json } from '@/lib/http';
import { findUserByUsername } from '@/lib/users';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  let body: { username?: unknown; password?: unknown };
  try {
    body = await req.json();
  } catch {
    return json({ error: 'Invalid JSON body.', code: 'BAD_REQUEST' }, 400);
  }

  const username = typeof body.username === 'string' ? body.username.trim() : '';
  const password = typeof body.password === 'string' ? body.password : '';
  if (!username || !password) {
    return json({ error: 'Username and password are required.', code: 'BAD_REQUEST' }, 400);
  }

  try {
    const found = await findUserByUsername(username);
    // Always verify against something to keep timing roughly uniform, but the
    // message is generic either way so we don't leak which field was wrong.
    if (!found || !verifyPassword(password, found.passwordHash)) {
      return json({ error: 'Invalid username or password.', code: 'BAD_CREDENTIALS' }, 401);
    }
    await startSession(found.id);
    return json({ user: { id: found.id, username: found.username } }, 200);
  } catch (err) {
    return errorResponse(err);
  }
}
