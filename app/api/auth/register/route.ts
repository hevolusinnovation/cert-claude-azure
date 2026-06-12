import { type NextRequest } from 'next/server';
import { hashPassword, startSession } from '@/lib/auth';
import { errorResponse, isUniqueViolation, json } from '@/lib/http';
import { createUser } from '@/lib/users';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const USERNAME_RE = /^[a-zA-Z0-9_.-]{3,32}$/;

export async function POST(req: NextRequest) {
  let body: { username?: unknown; password?: unknown };
  try {
    body = await req.json();
  } catch {
    return json({ error: 'Invalid JSON body.', code: 'BAD_REQUEST' }, 400);
  }

  const username = typeof body.username === 'string' ? body.username.trim() : '';
  const password = typeof body.password === 'string' ? body.password : '';

  if (!USERNAME_RE.test(username)) {
    return json(
      { error: 'Username must be 3–32 chars (letters, numbers, _ . -).', code: 'BAD_USERNAME' },
      400,
    );
  }
  if (password.length < 6 || password.length > 200) {
    return json({ error: 'Password must be 6–200 characters.', code: 'BAD_PASSWORD' }, 400);
  }

  try {
    const user = await createUser(username, hashPassword(password));
    await startSession(user.id);
    return json({ user }, 201);
  } catch (err) {
    if (isUniqueViolation(err)) {
      return json({ error: 'That username is already taken.', code: 'USERNAME_TAKEN' }, 409);
    }
    return errorResponse(err);
  }
}
