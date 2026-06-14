import { cookies } from 'next/headers';
import { NextResponse, type NextRequest } from 'next/server';
import { startSession } from '@/lib/auth';
import { acquireIdentity, getEntraConfig } from '@/lib/entra';
import { upsertEntraUser } from '@/lib/users';
import { NEXT_COOKIE, STATE_COOKIE } from '../login/route';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Sends the user back to the login page with a short error code. */
function fail(req: NextRequest, code: string): NextResponse {
  const url = new URL('/login', req.nextUrl.origin);
  url.searchParams.set('error', code);
  return NextResponse.redirect(url);
}

/** Entra redirects here with ?code & ?state after the user authenticates. */
export async function GET(req: NextRequest) {
  const cfg = getEntraConfig();
  if (!cfg) return fail(req, 'not_configured');

  const params = req.nextUrl.searchParams;
  if (params.get('error')) return fail(req, params.get('error') || 'aad_error');

  const code = params.get('code');
  const state = params.get('state');
  if (!code || !state) return fail(req, 'missing_code');

  const store = await cookies();
  const expectedState = store.get(STATE_COOKIE)?.value;
  const next = store.get(NEXT_COOKIE)?.value || '/profile';
  // One-time use: clear the CSRF cookies regardless of outcome.
  store.delete(STATE_COOKIE);
  store.delete(NEXT_COOKIE);
  if (!expectedState || expectedState !== state) return fail(req, 'bad_state');

  try {
    const identity = await acquireIdentity(cfg, code);
    const user = await upsertEntraUser(identity.oid, identity.username);
    await startSession(user.id);
  } catch (err) {
    console.error('[auth/aad] callback failed', err);
    return fail(req, 'exchange_failed');
  }

  const dest = next.startsWith('/') && !next.startsWith('//') ? next : '/profile';
  return NextResponse.redirect(new URL(dest, req.nextUrl.origin));
}
