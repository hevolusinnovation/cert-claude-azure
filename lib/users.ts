/** User persistence. Server-only. */
import 'server-only';
import { newUserId } from './auth';
import { query } from './db';
import type { User } from './types';

interface UserRow {
  id: string;
  username: string;
  password_hash: string;
}

/** Creates a user. Throws on duplicate username (Postgres unique violation 23505). */
export async function createUser(username: string, passwordHash: string): Promise<User> {
  const id = newUserId();
  await query(
    'INSERT INTO users (id, username, password_hash) VALUES ($1, $2, $3)',
    [id, username, passwordHash],
  );
  return { id, username };
}

export async function findUserByUsername(
  username: string,
): Promise<{ id: string; username: string; passwordHash: string } | null> {
  const rows = await query<UserRow>(
    'SELECT id, username, password_hash FROM users WHERE lower(username) = lower($1) LIMIT 1',
    [username],
  );
  if (!rows[0]) return null;
  return { id: rows[0].id, username: rows[0].username, passwordHash: rows[0].password_hash };
}

export async function findUserById(id: string): Promise<User | null> {
  const rows = await query<UserRow>('SELECT id, username FROM users WHERE id = $1 LIMIT 1', [id]);
  return rows[0] ? { id: rows[0].id, username: rows[0].username } : null;
}
