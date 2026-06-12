/**
 * Minimal username/password auth for a locally-run app.
 *
 * - Passwords are hashed with scrypt + a per-user random salt (no external deps).
 * - The session is a stateless, HMAC-signed cookie holding the user id + expiry.
 *
 * This is intentionally lightweight (no email verification, reset, or OAuth) —
 * just enough to scope exam sessions to a user. Server-only.
 */
import 'server-only';
import { createHmac, randomBytes, randomUUID, scryptSync, timingSafeEqual } from 'node:crypto';
import { cookies } from 'next/headers';

export const SESSION_COOKIE = 'cf_session';
const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days
const SCRYPT_KEYLEN = 64;

function authSecret(): string {
  const s = process.env.AUTH_SECRET?.trim();
  if (s) return s;
  console.warn(
    '[auth] AUTH_SECRET is not set — using an insecure development default. Set AUTH_SECRET in .env.local.',
  );
  return 'dev-insecure-secret-change-me';
}

// --- Password hashing (format: scrypt$<saltHex>$<hashHex>) ---

export function hashPassword(password: string): string {
  const salt = randomBytes(16);
  const derived = scryptSync(password, salt, SCRYPT_KEYLEN);
  return `scrypt$${salt.toString('hex')}$${derived.toString('hex')}`;
}

export function verifyPassword(password: string, stored: string): boolean {
  const parts = stored.split('$');
  if (parts.length !== 3 || parts[0] !== 'scrypt') return false;
  const salt = Buffer.from(parts[1], 'hex');
  const expected = Buffer.from(parts[2], 'hex');
  const derived = scryptSync(password, salt, expected.length);
  return expected.length === derived.length && timingSafeEqual(expected, derived);
}

// --- Signed session cookie ---

function base64url(buf: Buffer): string {
  return buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function sign(value: string): string {
  return base64url(createHmac('sha256', authSecret()).update(value).digest());
}

function makeToken(userId: string): string {
  const payload = base64url(Buffer.from(JSON.stringify({ uid: userId, exp: Date.now() + SESSION_TTL_MS })));
  return `${payload}.${sign(payload)}`;
}

function readToken(token: string | undefined): string | null {
  if (!token) return null;
  const [payload, sig] = token.split('.');
  if (!payload || !sig) return null;
  const expected = sign(payload);
  // Constant-time compare of equal-length signatures.
  if (sig.length !== expected.length) return null;
  if (!timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return null;
  try {
    const data = JSON.parse(Buffer.from(payload.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString());
    if (typeof data?.uid !== 'string' || typeof data?.exp !== 'number') return null;
    if (data.exp < Date.now()) return null;
    return data.uid;
  } catch {
    return null;
  }
}

export function newUserId(): string {
  return randomUUID();
}

/** Sets the session cookie for the given user (call from a route handler). */
export async function startSession(userId: string): Promise<void> {
  const store = await cookies();
  store.set(SESSION_COOKIE, makeToken(userId), {
    httpOnly: true,
    sameSite: 'lax',
    path: '/',
    secure: process.env.NODE_ENV === 'production',
    maxAge: Math.floor(SESSION_TTL_MS / 1000),
  });
}

export async function clearSession(): Promise<void> {
  const store = await cookies();
  store.delete(SESSION_COOKIE);
}

/** Returns the current user's id from the signed cookie, or null. */
export async function currentUserId(): Promise<string | null> {
  const store = await cookies();
  return readToken(store.get(SESSION_COOKIE)?.value);
}
